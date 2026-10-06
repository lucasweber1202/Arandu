import { HttpError, json, readBody } from '../../api-core.mjs';
import { requireUuid, query, rest, rpc, memberOrganization } from './finance-core.mjs';
import { validateFeeSchedule, validateFeeVersion, validateFeeObservation, validateFeeReview, feeFilters, REVIEW_STATUS } from '../../finance/fee-intelligence.mjs';
import { presentFeePage, presentFeeDetail, providerLines, parseTiers } from '../../finance/fee-presenter.mjs';

// Bank Fee Intelligence. Toda leitura e escrita usa o JWT de quem chama; o
// cálculo e a comparabilidade acontecem no banco e ficam congelados. A tela é
// composta aqui (server aggregation), com linguagem segura.
const optionalUuid = (q, key) => (q.get(key) ? requireUuid(q.get(key), key) : null);
const versionInput = (b) => {
  const { schedule: _s, schedule_id: _i, expected_version: _e, organization_id: _o, ...input } = b;
  if (input.pricing_model === 'tiered_per_unit') { input.tiers = parseTiers(input.tiers); delete input.rate; } else delete input.tiers;
  return input;
};

export async function handleFinanceFees(req, res, { resource, sub, token, headers }) {
  if (resource !== 'fees') return false;
  const q = query(req);
  if (req.method === 'GET' && (!sub || sub === 'summary')) {
    const org = await memberOrganization(token, q.get('organization_id'), ['BUYER']);
    let f;
    try { f = feeFilters(q); } catch (e) { throw new HttpError(400, e.message, 'invalid_fee_filters'); }
    const scope = { p_entity: optionalUuid(q, 'legal_entity_id'), p_provider: optionalUuid(q, 'provider_id'), p_category: f.category, p_contract: optionalUuid(q, 'contract_id') };
    const common = { p_org: org.id, p_start: f.start, p_end: f.end, ...scope, p_currency: f.currency };
    if (sub === 'summary') {
      const summary = await rpc(token, 'fin_fee_summary', common);
      json(res, 200, { ok: true, summary, lines: providerLines(summary) }, headers);
      return true;
    }
    const filter = [`organization_id=eq.${org.id}`, ...['legal_entity_id', 'provider_id', 'contract_id', 'category'].filter((k) => q.get(k)).map((k) => `${k}=eq.${k === 'category' ? f.category : requireUuid(q.get(k), k)}`)];
    const [rows, summary, schedules, contracts] = await Promise.all([
      rpc(token, 'fin_list_fee_variances', { ...common, p_review: f.review, p_comparison: f.comparison, p_after: optionalUuid(q, 'after'), p_limit: f.limit }),
      rpc(token, 'fin_fee_summary', common),
      rest(token, `fin_fee_schedules?select=*,versions:fin_fee_schedule_versions(*)&${filter.join('&')}&order=created_at.desc&limit=100`),
      rest(token, `fin_contracts?select=id,title&organization_id=eq.${org.id}&order=title.asc&limit=200`)
    ]);
    const page = rows.slice(0, f.limit);
    json(res, 200, { ok: true, ...presentFeePage({ rows: page, summary, next: rows.length > f.limit ? page.at(-1).id : null, schedules, contracts }), filters: f }, headers);
    return true;
  }
  if (req.method === 'GET' && sub === 'detail') {
    const id = requireUuid(q.get('id'), 'id');
    const rows = await rest(token, `fin_fee_variances?select=*&id=eq.${id}&limit=1`);
    const v = rows?.[0];
    if (!v) throw new HttpError(404, 'Registro indisponível para sua conta.', 'fee_not_found');
    const [observation, reviews, entity] = await Promise.all([
      rest(token, `fin_fee_observations?select=*&id=eq.${v.observation_id}&limit=1`),
      rest(token, `fin_fee_reviews?select=*&variance_id=eq.${id}&order=reviewed_at.asc&limit=100`),
      v.legal_entity_id ? rest(token, `fin_legal_entities?select=legal_name&id=eq.${v.legal_entity_id}&limit=1`) : []
    ]);
    json(res, 200, { ok: true, ...presentFeeDetail({ variance: v, observation: observation?.[0] || {}, reviews, entity: entity?.[0]?.legal_name }) }, headers);
    return true;
  }
  if (req.method !== 'POST') throw new HttpError(405, 'Método indisponível.', 'method_not_allowed');
  const b = await readBody(req);
  let error = null;
  let call;
  if (sub === 'schedules') {
    const org = await memberOrganization(token, b.organization_id, ['BUYER']);
    const input = versionInput(b);
    delete input.contract_id;
    error = validateFeeSchedule(input);
    call = () => rpc(token, 'fin_create_fee_schedule', { p_org: org.id, p_contract: requireUuid(b.contract_id, 'contract_id'), p_input: input });
  } else if (sub === 'version') {
    // `schedule` = "<id>|<versão vista>" (formulário) ou schedule_id + expected_version (API).
    const [scheduleId, seen] = typeof b.schedule === 'string' ? b.schedule.split('|') : [b.schedule_id, b.expected_version];
    const id = requireUuid(scheduleId, 'schedule_id');
    const expected = Number(seen);
    const found = await rest(token, `fin_fee_schedules?select=charging_unit&id=eq.${id}&limit=1`);
    if (!found?.[0]) throw new HttpError(404, 'Tarifa contratada indisponível para sua conta.', 'fee_not_found');
    const input = versionInput(b);
    error = validateFeeVersion(found[0].charging_unit, input) || (Number.isInteger(expected) && expected > 0 ? null : 'Versão esperada inválida.') || (typeof input.reason === 'string' && input.reason.trim().length >= 3 ? null : 'Justifique a nova versão.');
    call = () => rpc(token, 'fin_version_fee_schedule', { p_schedule: id, p_expected: expected, p_input: input });
  } else if (sub === 'observe') {
    const org = await memberOrganization(token, b.organization_id, ['BUYER']);
    const { organization_id: _o, contract_id: contract, ...input } = b;
    error = validateFeeObservation(input);
    call = () => rpc(token, 'fin_record_fee_observation', { p_org: org.id, p_contract: requireUuid(contract, 'contract_id'), p_input: input });
  } else if (sub === 'verify') {
    error = ['verified', 'rejected'].includes(b.status) && typeof b.reason === 'string' && b.reason.trim().length >= 3 && b.reason.length <= 1000 && !/[<>]/.test(b.reason) ? null : 'Informe verificação (verificada/rejeitada) e justificativa.';
    call = () => rpc(token, 'fin_verify_fee_observation', { p_observation: requireUuid(b.observation_id, 'observation_id'), p_input: { status: b.status, reason: b.reason } });
  } else if (sub === 'review') {
    const { variance_id: variance, expected_status: expected, organization_id: _o, ...input } = b;
    error = REVIEW_STATUS[expected] ? validateFeeReview(expected, input) : 'Estado atual inválido.';
    call = () => rpc(token, 'fin_review_fee_variance', { p_variance: requireUuid(variance, 'variance_id'), p_expected: expected, p_input: input });
  } else throw new HttpError(404, 'Recurso indisponível.', 'not_found');
  if (error) throw new HttpError(400, error, 'invalid_fee_input');
  json(res, 201, { ok: true, id: await call() }, headers);
  return true;
}
