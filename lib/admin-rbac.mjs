import { AdminAuthError } from './admin-auth.mjs';

const ADMIN_PERMISSIONS = Object.freeze({
  admin: Object.freeze({ '*': Object.freeze(['*']) }),
  operator: Object.freeze({
    dashboard: Object.freeze(['read']),
    leads: Object.freeze(['create', 'read', 'update']),
    briefs: Object.freeze(['create', 'read', 'update']),
    proposals: Object.freeze(['create', 'read', 'update']),
    reservations: Object.freeze(['create', 'read', 'update', 'expire']),
    commercial: Object.freeze(['create', 'read', 'update']),
    tasks: Object.freeze(['create', 'read', 'update']),
    notes: Object.freeze(['create', 'read']),
    'status-history': Object.freeze(['read']),
    pilot: Object.freeze(['read', 'update'])
  }),
  curator: Object.freeze({
    artists: Object.freeze(['create', 'read', 'update', 'review', 'publish']),
    artworks: Object.freeze(['create', 'read', 'update', 'review', 'publish']),
    collections: Object.freeze(['create', 'read', 'update', 'publish']),
    submissions: Object.freeze(['read', 'update', 'review']),
    certificates: Object.freeze(['create', 'read', 'update', 'issue', 'revoke']),
    media: Object.freeze(['create', 'read', 'update', 'delete']),
    'status-history': Object.freeze(['read'])
  })
});

function clean(value) {
  return String(value || '').trim().toLowerCase();
}

export function hasAdminPermission(actor, resource, action) {
  const role = clean(actor?.role);
  const normalizedResource = clean(resource);
  const normalizedAction = clean(action);
  const rolePermissions = ADMIN_PERMISSIONS[role];
  if (!rolePermissions || !normalizedResource || !normalizedAction) return false;
  if (rolePermissions['*']?.includes('*')) return true;
  const actions = rolePermissions[normalizedResource] || [];
  return actions.includes('*') || actions.includes(normalizedAction);
}

export function requireAdminPermission(actor, resource, action) {
  if (!hasAdminPermission(actor, resource, action)) {
    throw new AdminAuthError(
      403,
      'Seu papel administrativo não permite esta operação.',
      'admin_permission_denied'
    );
  }
  return actor;
}

export function permissionsForRole(role) {
  const permissions = ADMIN_PERMISSIONS[clean(role)] || {};
  return Object.fromEntries(
    Object.entries(permissions).map(([resource, actions]) => [resource, [...actions]])
  );
}

export const ADMIN_RBAC_MATRIX = ADMIN_PERMISSIONS;
