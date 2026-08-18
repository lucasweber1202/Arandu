export function createIntakeDomain(dependencies) {
  const { CONSENT_VERSION, HttpError, clean, json, validEmail, readBody, normalizeFormPayload, normalizeReservation, normalizeProposal, optionalUser, requireDataConfig, requireCommercialReady, enforceRateLimit, firstRecord, dataRequest, operationIdentity, beginIdempotency, failIdempotency, adminSupabaseRpc } = dependencies;

async function handleForms(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
  await enforceRateLimit(req, 'forms', 30, 10 * 60 * 1000);
  const body = await readBody(req);
  if (clean(body.website || body.data?.website)) return json(res, 202, { ok: true, stored: false });
  const { table, record } = normalizeFormPayload(body, { consentVersion: CONSENT_VERSION });
  const { session, user } = await optionalUser(req);
  if (user && (table === 'leads' || table === 'company_briefs')) record.user_id = user.id;
  if (record.email && !validEmail(record.email)) throw new HttpError(400, 'Informe um e-mail válido.');
  if (table === 'newsletter_subscriptions' && !record.email) throw new HttpError(400, 'E-mail é obrigatório.');
  requireDataConfig();
  const saved = firstRecord(await dataRequest(table, { method: 'POST', body: JSON.stringify(record) }));
  return json(res, 201, {
    ok: true,
    mode: 'stored',
    stored: true,
    table,
    record: saved ? { id: saved.id, status: saved.status || 'received', created_at: saved.created_at || null } : null
  }, session.headers);
}

async function handleReservations(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
  requireCommercialReady();
  await enforceRateLimit(req, 'reservations', 20, 10 * 60 * 1000);
  const body = await readBody(req);
  if (clean(body.website)) return json(res, 202, { ok: true, stored: false });
  const record = normalizeReservation(body);
  if (!record.artwork_id) throw new HttpError(400, 'Obra é obrigatória.');
  if (!record.name) throw new HttpError(400, 'Nome é obrigatório.');
  if (!record.whatsapp || record.whatsapp.length < 10) throw new HttpError(400, 'Informe um WhatsApp válido com DDD.');
  const { session, user } = await optionalUser(req);
  requireDataConfig();
  const policy = requireCommercialReady();
  const identity = operationIdentity(req, user);
  const accepted = {
    artworkId: record.artwork_id,
    name: record.name,
    whatsapp: record.whatsapp,
    deadline: record.deadline,
    notes: record.notes,
    origin: record.origin
  };
  const idempotency = await beginIdempotency(req, 'reservation.create', accepted, identity);
  if (idempotency.replay) return json(res, idempotency.status, idempotency.payload, {
    ...session.headers,
    'Idempotency-Replayed': 'true'
  });
  try {
    const payload = firstRecord(await adminSupabaseRpc('create_reservation_atomic', {
      p_artwork_id: record.artwork_id,
      p_user_id: user?.id || null,
      p_visitor_ref: user ? null : identity.reference,
      p_name: record.name,
      p_whatsapp: record.whatsapp,
      p_deadline: record.deadline,
      p_notes: record.notes,
      p_expires_at: new Date(Date.now() + policy.reservationHours * 60 * 60 * 1000).toISOString(),
      p_currency: policy.currency,
      p_policy_version: policy.version,
      p_policy_snapshot: policy,
      p_origin: record.origin,
      p_actor_type: identity.actorType,
      p_actor_ref: identity.reference,
      p_request_id: req.aranduRequestId,
      p_idempotency_scope: idempotency.scope,
      p_idempotency_key_hash: idempotency.keyHash,
      p_identity_hash: idempotency.identityHash,
      p_request_hash: idempotency.requestHash
    }));
    return json(res, 201, payload, session.headers);
  } catch (error) {
    await failIdempotency(idempotency, error);
    throw error;
  }
}
async function handleProposals(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
  requireCommercialReady();
  await enforceRateLimit(req, 'proposals', 20, 10 * 60 * 1000);
  const body = await readBody(req);
  const proposal = normalizeProposal(body);
  if (!proposal.client) throw new HttpError(400, 'Cliente é obrigatório.');
  if (!proposal.artworkIds.length) throw new HttpError(400, 'A proposta precisa conter obras.');
  const { session, user } = await optionalUser(req);
  requireDataConfig();
  const policy = requireCommercialReady();
  const identity = operationIdentity(req, user);
  const idempotency = await beginIdempotency(req, 'proposal.create', proposal, identity);
  if (idempotency.replay) return json(res, idempotency.status, idempotency.payload, {
    ...session.headers,
    'Idempotency-Replayed': 'true'
  });
  try {
    const payload = firstRecord(await adminSupabaseRpc('create_proposal_atomic', {
      p_artwork_ids: proposal.artworkIds,
      p_user_id: user?.id || null,
      p_lead_id: proposal.leadId,
      p_company_brief_id: proposal.companyBriefId,
      p_client: proposal.client,
      p_space: proposal.space,
      p_goal: proposal.goal,
      p_budget: proposal.budget,
      p_deadline: proposal.deadline,
      p_notes: proposal.notes,
      p_currency: policy.currency,
      p_platform_fee_rate: policy.platformFeeRate,
      p_policy_version: policy.version,
      p_policy_snapshot: policy,
      p_actor_type: identity.actorType,
      p_actor_ref: identity.reference,
      p_request_id: req.aranduRequestId,
      p_idempotency_scope: idempotency.scope,
      p_idempotency_key_hash: idempotency.keyHash,
      p_identity_hash: idempotency.identityHash,
      p_request_hash: idempotency.requestHash
    }));
    return json(res, 201, payload, session.headers);
  } catch (error) {
    await failIdempotency(idempotency, error);
    throw error;
  }
}

  return { handleForms, handleReservations, handleProposals };
}
