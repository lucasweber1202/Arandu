export function createPilotDomain(dependencies) {
  const { createHash, timingSafeEqual, PILOT_COOKIE_NAME, PILOT_MAX_AGE, PILOT_EVENT_TYPES, PILOT_SEVERITIES, PILOT_BLOCKER_STATUSES, HttpError, clean, json, limited, readBody, requireDataConfig, enforceRateLimit, dataRequest, readCookie, adminGuard, trueFlag } = dependencies;

function constantTimeEqual(left, right) {
  const leftHash = createHash('sha256').update(String(left || '')).digest();
  const rightHash = createHash('sha256').update(String(right || '')).digest();
  return timingSafeEqual(leftHash, rightHash);
}
function pilotEnabled() { return trueFlag(process.env.ARANDU_PILOT_ENABLED); }
function pilotConfigured() {
  return pilotEnabled() && clean(process.env.ARANDU_PILOT_ACCESS_CODE).length >= 10 && clean(process.env.ARANDU_PILOT_SECRET).length >= 32;
}
function pilotToken() {
  if (!pilotConfigured()) return '';
  return createHash('sha256').update(`${process.env.ARANDU_PILOT_SECRET}:${process.env.ARANDU_PILOT_ACCESS_CODE}`).digest('base64url');
}
function pilotAuthenticated(req) {
  if (!pilotEnabled()) return false;
  const supplied = readCookie(req, PILOT_COOKIE_NAME);
  const expected = pilotToken();
  return Boolean(supplied && expected && constantTimeEqual(supplied, expected));
}
function requirePilotAccess(req) {
  if (!pilotEnabled()) throw new HttpError(403, 'O piloto fechado não está ativo.', 'pilot_disabled');
  if (!pilotConfigured()) throw new HttpError(503, 'O piloto ainda não foi configurado no servidor.', 'pilot_unconfigured');
  if (!pilotAuthenticated(req)) throw new HttpError(401, 'Código do piloto necessário.', 'pilot_access_required');
}
function pilotCookie() { return `${PILOT_COOKIE_NAME}=${encodeURIComponent(pilotToken())}; Path=/; HttpOnly; SameSite=Lax; Secure; Priority=High; Max-Age=${PILOT_MAX_AGE}`; }
function clearPilotCookie() { return `${PILOT_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`; }

function validPilotSessionId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}
function pilotEventPayload(payload) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const result = {};
  ['artworkId','formType','status','target'].forEach((field) => {
    if (source[field] !== undefined) result[field] = limited(source[field], 160);
  });
  ['resultCount','queryLength'].forEach((field) => {
    const number = Number(source[field]);
    if (Number.isFinite(number)) result[field] = Math.max(0, Math.min(10000, Math.round(number)));
  });
  return result;
}
async function handleEvents(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
  requirePilotAccess(req);
  requireDataConfig();
  await enforceRateLimit(req, 'pilot-events', 180, 10 * 60 * 1000);
  const body = await readBody(req);
  const sessionId = clean(body.sessionId || body.session_id);
  const eventType = clean(body.eventType || body.event_type);
  if (!validPilotSessionId(sessionId)) throw new HttpError(400, 'Sessão do piloto inválida.');
  if (!PILOT_EVENT_TYPES.has(eventType)) throw new HttpError(400, 'Evento do piloto inválido.');
  const record = {
    session_id: sessionId,
    event_type: eventType,
    path: limited(body.path, 240) || '/',
    payload: pilotEventPayload(body.payload)
  };
  await dataRequest('pilot_events', { method: 'POST', body: JSON.stringify(record), headers: { Prefer: 'return=minimal' } });
  return json(res, 201, { ok: true, stored: true });
}
async function handlePilot(req, res, action) {
  if (action === 'session') {
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    const enabled = pilotEnabled();
    return json(res, 200, { ok: true, enabled, configured: pilotConfigured(), authenticated: enabled && pilotAuthenticated(req) });
  }
  if (action === 'access') {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    await enforceRateLimit(req, 'pilot-access', 12, 10 * 60 * 1000);
    if (!pilotEnabled()) throw new HttpError(403, 'O piloto fechado não está ativo.', 'pilot_disabled');
    if (!pilotConfigured()) throw new HttpError(503, 'O piloto ainda não foi configurado no servidor.', 'pilot_unconfigured');
    const body = await readBody(req);
    if (clean(body.website)) return json(res, 202, { ok: true, authenticated: false });
    if (!constantTimeEqual(limited(body.code, 200), process.env.ARANDU_PILOT_ACCESS_CODE)) throw new HttpError(401, 'Código de convite inválido.', 'pilot_invalid_code');
    return json(res, 200, { ok: true, authenticated: true }, { 'Set-Cookie': pilotCookie() });
  }
  if (action === 'logout') {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    return json(res, 200, { ok: true, authenticated: false }, { 'Set-Cookie': clearPilotCookie() });
  }
  if (action === 'feedback') {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    requirePilotAccess(req);
    requireDataConfig();
    await enforceRateLimit(req, 'pilot-feedback', 20, 60 * 60 * 1000);
    const body = await readBody(req);
    const sessionId = clean(body.sessionId || body.session_id);
    const rating = Number(body.rating);
    const severity = clean(body.severity).toLowerCase() || 'info';
    const blockerStatus = clean(body.blockerStatus || body.blocker_status).toLowerCase() || 'not_applicable';
    if (!validPilotSessionId(sessionId)) throw new HttpError(400, 'Sessão do piloto inválida.');
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, 'Nota deve estar entre 1 e 5.');
    if (!PILOT_SEVERITIES.has(severity)) throw new HttpError(400, 'Severidade de feedback inválida.');
    if (!PILOT_BLOCKER_STATUSES.has(blockerStatus)) throw new HttpError(400, 'Situação do bloqueador inválida.');
    if (['high','critical'].includes(severity) && blockerStatus === 'not_applicable') {
      throw new HttpError(400, 'Feedback de alta severidade precisa de situação de bloqueador.');
    }
    const record = {
      session_id: sessionId,
      task: limited(body.task, 120) || null,
      rating,
      message: limited(body.message, 2000) || null,
      contact_allowed: body.contactAllowed === true || body.contact_allowed === true,
      category: limited(body.category, 80) || null,
      severity,
      blocker_status: blockerStatus,
      task_completed: body.taskCompleted === true || body.task_completed === true
    };
    await dataRequest('pilot_feedback', { method: 'POST', body: JSON.stringify(record), headers: { Prefer: 'return=minimal' } });
    return json(res, 201, { ok: true, stored: true });
  }
  if (action === 'metrics') {
    const guard = await adminGuard(req, res, 'pilot', 'read');
    if (!guard.ok) return json(res, guard.status, { ok: false, error: guard.error, code: guard.code });
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    const [events, feedback] = await Promise.all([
      dataRequest('pilot_events?select=session_id,event_type&order=created_at.desc&limit=5000', { method: 'GET', headers: { Prefer: '' } }),
      dataRequest('pilot_feedback?select=session_id,rating,severity,blocker_status,task_completed&order=created_at.desc&limit=1000', { method: 'GET', headers: { Prefer: '' } })
    ]);
    const eventRows = Array.isArray(events) ? events : [];
    const feedbackRows = Array.isArray(feedback) ? feedback : [];
    const metrics = {
      unique_sessions: new Set(eventRows.map((item) => item.session_id)).size,
      events_total: eventRows.length,
      feedback_total: feedbackRows.length,
      average_rating: feedbackRows.length ? Number((feedbackRows.reduce((sum, item) => sum + Number(item.rating || 0), 0) / feedbackRows.length).toFixed(2)) : 0
    };
    metrics.tasks_completed = feedbackRows.filter((item) => item.task_completed === true).length;
    metrics.critical_blockers_open = feedbackRows.filter((item) => item.severity === 'critical' && item.blocker_status === 'open').length;
    metrics.high_blockers_open = feedbackRows.filter((item) => item.severity === 'high' && item.blocker_status === 'open').length;
    for (const type of PILOT_EVENT_TYPES) metrics[`event_${type}`] = eventRows.filter((item) => item.event_type === type).length;
    return json(res, 200, { ok: true, metrics });
  }
  return json(res, 404, { ok: false, error: 'Rota do piloto não encontrada.' });
}

  return { handleEvents, handlePilot, pilotEnabled, pilotConfigured, pilotAuthenticated, validPilotSessionId };
}
