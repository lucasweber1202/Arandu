// Capabilities da UI espelham papéis do banco; nunca concedem autorização.
// RLS e RPCs continuam validando tenant, entidade e estado em cada ação.
const MANAGEMENT = Object.freeze(['admin', 'finance_manager']);
export const UI_PERMISSION_ROLES = Object.freeze({
  admin: Object.freeze(['admin']),
  create_rfq: MANAGEMENT,
  edit_profile: Object.freeze([...MANAGEMENT, 'analyst']),
  upload_document: Object.freeze([...MANAGEMENT, 'analyst', 'provider_user'])
});

export function canRole(role, permission) {
  return Boolean(UI_PERMISSION_ROLES[permission]?.includes(role));
}
