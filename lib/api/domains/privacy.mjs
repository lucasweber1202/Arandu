export function createPrivacyDomain(dependencies) {
  const { CONVERSION_EVENT_TYPES, PRIVACY_REQUEST_TYPES, CONSENT_VERSION, HttpError, clean, json, limited, readBody, safeObject, userSupabaseRequest, requireDataConfig, enforceRateLimit, dataRequest, firstRecord, requireUser, optionalUser, writeAudit, consentVersionConfigured, validPilotSessionId } = dependencies;

async function handlePrivacy(req, res, action) {
  const session = await requireUser(req);
  requireDataConfig();
  const userId = encodeURIComponent(session.user.id);
  if (action === 'export') {
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    await enforceRateLimit(req, 'privacy-export', 5, 60 * 60 * 1000);
    // Direito de acesso: o titular precisa receber o que existe sobre ele hoje —
    // pedidos e propostas foram acrescentados. Cada consulta continua com lista
    // explícita de campos e sob RLS pela sessão do próprio titular; nada de
    // segredos, hashes internos, tokens ou dados de terceiros entra aqui.
    const [profile, selections, reservations, leads, briefs, requests, orders, proposals] = await Promise.all([
      userSupabaseRequest(session.accessToken, `profiles?id=eq.${userId}&select=id,email,full_name,phone,profile_type,created_at,updated_at&limit=1`, { method: 'GET', prefer: '' }),
      userSupabaseRequest(session.accessToken, `saved_selections?user_id=eq.${userId}&select=id,status,items,briefing,created_at,updated_at&limit=1000`, { method: 'GET', prefer: '' }),
      userSupabaseRequest(session.accessToken, `reservations?user_id=eq.${userId}&select=id,artwork_id,status,deadline,notes,created_at,updated_at&limit=1000`, { method: 'GET', prefer: '' }),
      userSupabaseRequest(session.accessToken, `leads?user_id=eq.${userId}&select=id,status,source_page,created_at,updated_at&limit=1000`, { method: 'GET', prefer: '' }),
      userSupabaseRequest(session.accessToken, `company_briefs?user_id=eq.${userId}&select=id,status,created_at,updated_at&limit=1000`, { method: 'GET', prefer: '' }),
      userSupabaseRequest(session.accessToken, `privacy_requests?user_id=eq.${userId}&select=id,request_type,status,due_at,completed_at,created_at&limit=1000`, { method: 'GET', prefer: '' }),
      userSupabaseRequest(session.accessToken, `orders?user_id=eq.${userId}&select=id,order_number,artwork_id,artist_id,reservation_id,price_snapshot,currency,status,payment_status,fulfillment_status,certificate_status,tracking_code,shipping_provider,created_at,updated_at,paid_at,completed_at,cancelled_at,shipping_updated_at&order=created_at.desc&limit=1000`, { method: 'GET', prefer: '' }).catch(() => []),
      userSupabaseRequest(session.accessToken, `proposals?user_id=eq.${userId}&select=id,status,client,space,goal,budget,deadline,created_at,updated_at&order=created_at.desc&limit=1000`, { method: 'GET', prefer: '' }).catch(() => [])
    ]);
    await writeAudit({ actorType: 'user', actorRef: session.user.id, action: 'privacy.export', entityType: 'user', entityId: session.user.id });
    const exportData = { profile: firstRecord(profile), selections, reservations, orders, proposals, leads, companyBriefs: briefs, privacyRequests: requests };
    const counts = Object.fromEntries(Object.entries(exportData).map(([key, value]) => [key, Array.isArray(value) ? value.length : value ? 1 : 0]));
    return json(res, 200, {
      ok: true,
      exportVersion: '2026-08-17.1',
      exportedAt: new Date().toISOString(),
      subject: { id: session.user.id, email: session.user.email },
      counts,
      data: exportData
    }, { ...session.headers, 'Content-Disposition': 'attachment; filename="arandu-dados.json"' });
  }
  if (action === 'request') {
    if (req.method === 'GET') {
      const requests = await userSupabaseRequest(
        session.accessToken,
        `privacy_requests?user_id=eq.${userId}&select=id,request_type,status,due_at,completed_at,created_at&order=created_at.desc&limit=50`,
        { method: 'GET', prefer: '' }
      );
      return json(res, 200, { ok: true, requests }, session.headers);
    }
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    await enforceRateLimit(req, 'privacy-request', 5, 24 * 60 * 60 * 1000);
    const body = await readBody(req);
    const requestType = clean(body.requestType || body.request_type);
    if (!PRIVACY_REQUEST_TYPES.has(requestType)) throw new HttpError(400, 'Tipo de solicitação LGPD inválido.');
    const record = firstRecord(await dataRequest('privacy_requests', { method: 'POST', body: JSON.stringify({ user_id: session.user.id, request_type: requestType, details: { message: limited(body.message, 1000) || null } }) }));
    await writeAudit({ actorType: 'user', actorRef: session.user.id, action: `privacy.${requestType}.requested`, entityType: 'privacy_request', entityId: record?.id || null });
    return json(res, 201, { ok: true, request: record ? { id: record.id, requestType: record.request_type, status: record.status, dueAt: record.due_at, createdAt: record.created_at } : null }, session.headers);
  }
  return json(res, 404, { ok: false, error: 'Rota de privacidade não encontrada.' });
}

// Rótulo de campanha, não texto livre: poda o que vier do browser antes de
// gravar. A atribuição é o mínimo para saber que o tráfego veio do TikTok, e
// guarda só o host do referrer — nunca a URL de origem completa.
function campaignTag(value) {
  return String(value ?? '').trim().slice(0, 80).replace(/[^\w .\-|/]+/g, '');
}

function conversionPayload(value) {
  const source = safeObject(value);
  const result = {};
  ['artworkId','collectionId','source','target','form_type'].forEach((key) => { if (source[key] !== undefined) result[key] = limited(source[key], 160); });
  ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','referrer_host'].forEach((key) => { const tag = campaignTag(source[key]); if (tag) result[key] = tag; });
  if (source.landing_page !== undefined) { const landing = limited(source.landing_page, 240); if (landing) result.landing_page = landing; }
  ['resultCount','queryLength'].forEach((key) => { const number = Number(source[key]); if (Number.isFinite(number)) result[key] = Math.max(0, Math.min(10000, Math.round(number))); });
  return result;
}

async function handleConversionEvents(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
  await enforceRateLimit(req, 'conversion-events', 180, 10 * 60 * 1000);
  const body = await readBody(req);
  const eventType = clean(body.eventType || body.event_type);
  const anonymousId = clean(body.anonymousId || body.anonymous_id);
  const consentVersion = clean(body.consentVersion || body.consent_version);
  if (!consentVersionConfigured()) {
    throw new HttpError(503, 'A versão de consentimento analítico não foi configurada no servidor.', 'analytics_consent_unconfigured');
  }
  if (!CONVERSION_EVENT_TYPES.has(eventType)) throw new HttpError(400, 'Evento de conversão inválido.');
  if (!validPilotSessionId(anonymousId)) throw new HttpError(400, 'Identificador anônimo inválido.');
  if (consentVersion !== CONSENT_VERSION) throw new HttpError(403, 'Consentimento de métricas ausente ou desatualizado.', 'analytics_consent_required');
  const { user } = await optionalUser(req);
  requireDataConfig();
  await dataRequest('conversion_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ anonymous_id: anonymousId, user_id: user?.id || null, event_type: eventType, path: limited(body.path, 240) || '/', payload: conversionPayload(body.payload), consent_version: CONSENT_VERSION }) });
  return json(res, 201, { ok: true, stored: true });
}


  return { handlePrivacy, handleConversionEvents };
}
