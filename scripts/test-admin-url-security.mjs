import assert from 'node:assert/strict';
import { createAdminOperationsDomain } from '../lib/api/domains/admin-operations.mjs';

const dependencies = new Proxy({
  HttpError: class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } },
  clean: (value) => String(value || '').trim(),
  json: (_res, status, payload) => ({ status, payload }),
  readBody: async (req) => req.body,
  adminGuard: async () => ({ ok: true, actor: { id: 'admin-1', role: 'owner' } }),
  requireAdminPermission: () => {},
  validUrl: (value) => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol); } catch { return false; } }
}, { get: (target, key) => target[key] ?? (() => null) });

const { handleAdminUpdate } = createAdminOperationsDomain(dependencies);
for (const dangerous of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd']) {
  await assert.rejects(
    () => handleAdminUpdate(
      { method: 'PATCH', body: { panel: 'obras', id: 'obra-1', fields: { main_image_url: dangerous } } },
      {}
    ),
    (error) => error.status === 400 && /URL inválida/.test(error.message)
  );
}
console.log('Admin URL contract: esquemas executáveis e locais rejeitados.');
