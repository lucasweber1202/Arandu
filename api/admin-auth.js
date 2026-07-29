import { randomUUID } from 'node:crypto';
import {
  AdminAuthError,
  applyAdminResponseHeaders,
  beginAdminMfa,
  requireAdmin,
  verifyAdminMfa
} from '../lib/admin-auth.mjs';
import { applyApiSecurityHeaders, crossOriginRejection } from '../lib/http-security.mjs';

const MAX_BODY_BYTES = 16 * 1024;

function json(res, status, payload, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  applyApiSecurityHeaders(res);
  applyAdminResponseHeaders(res, headers);
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw new AdminAuthError(413, 'Solicitação muito grande.', 'payload_too_large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new AdminAuthError(400, 'JSON inválido.', 'invalid_json');
  }
}

export default async function handler(req, res) {
  const requestId = String(req.headers?.['x-request-id'] || randomUUID()).slice(0, 80);
  res.setHeader('X-Request-ID', requestId);
  try {
    const rejection = crossOriginRejection(req);
    if (rejection) return json(res, rejection.status, { ok: false, error: rejection.error, code: rejection.code, requestId });
    const url = new URL(req.url, 'http://localhost');
    const action = String(url.searchParams.get('action') || 'session');

    if (action === 'session') {
      if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido.', requestId });
      const admin = await requireAdmin(req, { requireMfa: false });
      return json(res, 200, {
        ok: true,
        authenticated: true,
        authorized: true,
        mfaVerified: admin.actor.aal === 'aal2',
        actor: admin.actor
      }, admin.headers);
    }

    if (action === 'challenge') {
      if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.', requestId });
      const challenge = await beginAdminMfa(req);
      return json(res, 201, {
        ok: true,
        factorId: challenge.factorId,
        challengeId: challenge.challengeId,
        expiresAt: challenge.expiresAt
      }, challenge.headers);
    }

    if (action === 'verify') {
      if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.', requestId });
      const result = await verifyAdminMfa(req, await readBody(req));
      return json(res, 200, { ok: true, authenticated: true, authorized: true, mfaVerified: true }, result.headers);
    }

    return json(res, 404, { ok: false, error: 'Ação administrativa não encontrada.', requestId });
  } catch (error) {
    const status = Number(error?.status) || 500;
    if (status >= 500) {
      console.error(JSON.stringify({
        level: 'error',
        service: 'arandu-admin-auth',
        requestId,
        status,
        code: error?.code || null,
        message: String(error?.message || 'Erro desconhecido').slice(0, 180)
      }));
    }
    return json(res, status, {
      ok: false,
      error: status < 500 ? error.message : 'Não foi possível validar a sessão administrativa.',
      code: error?.code || 'admin_auth_error',
      requestId
    });
  }
}
