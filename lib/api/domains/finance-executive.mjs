import { HttpError, json } from '../../api-core.mjs';
import { requireUuid, query, rpc, memberOrganization } from './finance-core.mjs';
import { presentCovenantSummary } from '../../finance/covenant-presenter.mjs';
import { presentExecutive } from '../../finance/executive-presenter.mjs';

// Value Intelligence executivo: agrega no servidor, sob o RLS de quem chama,
// os resumos já existentes de valor, tarifas e oportunidades. Sem SoR novo.
const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

export async function handleFinanceExecutive(req, res, { resource, sub, token, headers }) {
  if (resource !== 'executive') return false;
  if (req.method !== 'GET' || sub) throw new HttpError(405, 'Método indisponível.', 'method_not_allowed');
  const q = query(req);
  const org = await memberOrganization(token, q.get('organization_id'), ['BUYER']);
  const year = new Date().getUTCFullYear();
  const filters = { start: q.get('start') || `${year}-01-01`, end: q.get('end') || `${year}-12-31`, entity: q.get('legal_entity_id') ? requireUuid(q.get('legal_entity_id'), 'legal_entity_id') : null };
  let valid = false;
  try { valid = isDay(filters.start) && isDay(filters.end) && filters.start <= filters.end && Date.parse(filters.end) - Date.parse(filters.start) <= 366 * 5 * 86400000; } catch { valid = false; }
  if (!valid) throw new HttpError(400, 'Período inválido; intervalo máximo de cinco anos.', 'invalid_executive_filters');
  const today = new Date().toISOString().slice(0, 10);
  const [value, fees, opportunities, obligations] = await Promise.all([
    rpc(token, 'fin_value_totals', { p_org: org.id, p_start: filters.start, p_end: filters.end, p_entity: filters.entity }),
    rpc(token, 'fin_fee_summary', { p_org: org.id, p_start: filters.start, p_end: filters.end, p_entity: filters.entity }),
    rpc(token, 'fin_opportunity_summary', { p_org: org.id, p_entity: filters.entity, p_day: today }),
    rpc(token, 'fin_obligation_summary', { p_org: org.id, p_entity: filters.entity })
  ]);
  const page=presentExecutive({value:value || [],fees:fees || [],opportunities:opportunities || [],filters,today});
  page.cards.push(presentCovenantSummary(obligations,filters.entity));
  json(res,200,{ok:true,filters,...page},headers);
  return true;
}
