import assert from 'node:assert/strict';
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

console.log('Arandu Admin RBAC Tests');
console.log('15 cenários aprovados.');
