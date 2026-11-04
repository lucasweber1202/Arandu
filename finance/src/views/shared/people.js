// Nome e cargo de membros da organização.
// Extraído de views/shared.js (v7.0): dependências específicas, sem barrel.

import { ROLE_LABELS } from '../../core.js';

export function memberName(members, id) {
  const member = (members || []).find((row) => row.user_id === id);
  if (member?.display_name) return member.display_name;
  if (member) return ROLE_LABELS[member.role] || 'Membro';
  return 'Membro';
}

export function memberTitle(members, id) {
  const member = (members || []).find((row) => row.user_id === id);
  return member?.title || ROLE_LABELS[member?.role] || '';
}
