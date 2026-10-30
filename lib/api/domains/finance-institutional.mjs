import { HttpError, json, readBody } from '../../api-core.mjs';
import { memberOrganization, rpc, INVITE_INVALID_MESSAGE } from './finance-core.mjs';

export async function handleFinanceInstitutional(req, res, { resource, sub, token, headers }) {
  if (resource !== 'invites' || sub !== 'decline') return false;
  if (req.method !== 'POST') throw new HttpError(405, 'Use POST para recusar o convite.', 'method_not_allowed');
  const b = await readBody(req);
  if (Object.keys(b).some(k => !['token', 'provider_organization_id', 'expected_status', 'confirmed', 'reason'].includes(k)) || typeof b.token !== 'string' || !/^[0-9a-f]{64}$/.test(b.token) || b.expected_status !== 'invited' || b.confirmed !== true || b.reason != null && !['not_offered', 'capacity', 'deadline', 'other'].includes(b.reason)) throw new HttpError(400, 'Confira o convite e confirme a recusa.', 'invalid_invite_decline');
  const org = await memberOrganization(token, b.provider_organization_id, ['PROVIDER']);
  const result = await rpc(token, 'fin_decline_provider_invite', { p_token: b.token, p_provider_org: org.id, p_expected: 'invited', p_confirmed: true, p_reason: b.reason ?? null });
  if (!result) throw new HttpError(409, INVITE_INVALID_MESSAGE, 'invite_invalid');
  json(res, 200, { ok: true, ...result }, headers); return true;
}
