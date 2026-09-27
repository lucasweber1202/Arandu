import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ADMIN_RBAC_MATRIX,
  hasAdminPermission,
  permissionsForRole,
  requireAdminPermission
} from '../lib/admin-rbac.mjs';

assert.equal(hasAdminPermission({ role: 'admin' }, 'diagnostics', 'read'), true);
assert.equal(hasAdminPermission({ role: 'admin' }, 'roles', 'update'), true);

assert.equal(hasAdminPermission({ role: 'operator' }, 'leads', 'read'), true);
assert.equal(hasAdminPermission({ role: 'operator' }, 'reservations', 'expire'), true);
assert.equal(hasAdminPermission({ role: 'operator' }, 'artworks', 'publish'), false);
assert.equal(hasAdminPermission({ role: 'operator' }, 'roles', 'update'), false);

assert.equal(hasAdminPermission({ role: 'curator' }, 'artworks', 'publish'), true);
assert.equal(hasAdminPermission({ role: 'curator' }, 'artists', 'review'), true);
assert.equal(hasAdminPermission({ role: 'curator' }, 'leads', 'read'), false);
assert.equal(hasAdminPermission({ role: 'curator' }, 'commercial', 'read'), false);
assert.equal(hasAdminPermission({ role: 'curator' }, 'dashboard', 'read'), false);
assert.equal(hasAdminPermission({ role: 'curator' }, 'diagnostics', 'read'), false);

assert.equal(hasAdminPermission({ role: 'viewer' }, 'artworks', 'read'), false);
assert.throws(
  () => requireAdminPermission({ role: 'operator' }, 'artworks', 'publish'),
  (error) => error.status === 403 && error.code === 'admin_permission_denied'
);

const operator = permissionsForRole('operator');
assert.deepEqual(operator.proposals, ['create', 'read', 'update']);
assert.equal(Object.isFrozen(ADMIN_RBAC_MATRIX), true);

// finance_ops é papel de plataforma financeira (lib/finance/ops-access.mjs):
// não é papel administrativo legado nem tem permissão em recurso de arte.
assert.equal(ADMIN_RBAC_MATRIX.finance_ops, undefined);
const legacyResources = [...new Set(Object.values(ADMIN_RBAC_MATRIX).flatMap((perms) => Object.keys(perms)).filter((key) => key !== '*'))];
for (const resource of [...legacyResources, 'orders', 'catalog', 'diagnostics']) {
  for (const action of ['read', 'create', 'update', 'delete', 'publish']) {
    assert.equal(hasAdminPermission({ role: 'finance_ops' }, resource, action), false, `finance_ops em ${resource}:${action}`);
  }
}
const adminRolesLine = fs.readFileSync('lib/admin-auth.mjs', 'utf8').match(/const ADMIN_ROLES = new Set\(\[([^\]]*)\]\)/)?.[1] || '';
assert.ok(adminRolesLine.includes("'admin'"), 'ADMIN_ROLES não encontrado');
assert.doesNotMatch(adminRolesLine, /finance/, 'finance_ops não pode ser papel administrativo legado');

console.log('Arandu Admin RBAC Tests');
console.log('16 cenários aprovados (finance_ops fora do admin legado).');
