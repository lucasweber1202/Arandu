import { HttpError, json, readBody, clean, limited } from '../../api-core.mjs';
import { requireUuid, query, rest, rpc, memberOrganization } from './finance-core.mjs';
import { CONTRACT_CATEGORIES, MILESTONE_KINDS, RECURRENCES, normalizeContractTerms, diffContractTerms, effectiveTerms } from '../../finance/contract-terms.mjs';

// Contract & Renewal Center v2: contrato como objeto operacional.
// Escrita só por RPC (papel + escopo de entidade no banco); leitura sob RLS.
// Termos passam pelo catálogo (allowlist) antes do banco; o que não é do
// catálogo é recusado e devolvido em `rejected`, nunca guardado.

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function requireDate(value, label, { optional = false } = {}) {
  const day = clean(value);
  if (!day && optional) return null;
  if (!DATE.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) throw new HttpError(400, `${label}: informe a data no formato AAAA-MM-DD.`, 'invalid_date');
  return day;
}

function checkedTerms(category, raw) {
  const result = normalizeContractTerms(category, raw);
  if (result.errors.length) throw new HttpError(400, result.errors[0], 'invalid_contract_terms');
  if (result.rejected.length) throw new HttpError(400, `Campo fora do catálogo de termos: ${result.rejected.slice(0, 3).join(', ')}.`, 'unknown_contract_terms');
  return result.values;
}

function intOrNull(value, min, max, label) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new HttpError(400, `${label} fora do intervalo aceito.`, 'invalid_number');
  return number;
}

/**
 * @returns {Promise<boolean>} true quando a rota foi tratada aqui.
 */
export async function handleFinanceContracts(req, res, { resource, sub, token, headers }) {
  if (resource === 'contract-detail' && req.method === 'GET') {
    const contractId = requireUuid(query(req).get('id'), 'id');
    const rows = await rest(token, `fin_contracts?select=*&id=eq.${contractId}&limit=1`);
    const contract = rows?.[0];
    // Contrato de outra organização ou de outra entidade: o RLS devolve vazio.
    if (!contract) throw new HttpError(404, 'Contrato não encontrado ou sem acesso para a sua conta.', 'contract_not_found');
    const org = contract.organization_id;
    const [versions, amendments, milestones, renewals, children, providers] = await Promise.all([
      rest(token, `fin_contract_versions?select=version,effective_from,source,amendment_id,reason,terms,recorded_by,recorded_at&contract_id=eq.${contractId}&order=version.desc&limit=100`),
      rest(token, `fin_contract_amendments?select=id,number,title,signed_on,effective_from,summary,previous_ends_on,new_ends_on,previous_notice_days,new_notice_days,document_id,recorded_by,recorded_at&contract_id=eq.${contractId}&order=number.desc&limit=100`),
      rest(token, `fin_contract_milestones?select=id,kind,title,due_on,lead_days,recurrence,ends_after,owner_id,status,completed_at&contract_id=eq.${contractId}&order=status.desc,due_on.asc&limit=200`),
      rest(token, `fin_renewal_milestones?select=milestone,triggered_at,task_id&contract_id=eq.${contractId}&order=triggered_at.desc&limit=20`),
      rest(token, `fin_contracts?select=id,title,product,status,ends_on&organization_id=eq.${org}&parent_contract_id=eq.${contractId}&limit=50`),
      rest(token, `fin_providers?select=id,name&organization_id=eq.${org}&id=eq.${contract.provider_id}&limit=1`)
    ]);
    const ordered = versions || [];
    // Diff factual de cada versão contra a anterior (sem juízo de valor).
    const withDiff = ordered.map((version, index) => ({
      ...version,
      changes: index + 1 < ordered.length ? diffContractTerms(contract.product, ordered[index + 1].terms, version.terms) : []
    }));
    json(res, 200, {
      ok: true,
      contract: { ...contract, provider_name: providers?.[0]?.name || 'Provedor' },
      effective: effectiveTerms(ordered),
      versions: withDiff,
      amendments: amendments || [],
      milestones: milestones || [],
      renewal_milestones: renewals || [],
      children: children || []
    }, headers);
    return true;
  }

  if (resource === 'contract-import' && req.method === 'POST') {
    const body = await readBody(req);
    const organization = await memberOrganization(token, body.organization_id, ['BUYER']);
    const product = clean(body.product);
    if (!CONTRACT_CATEGORIES[product]) throw new HttpError(400, 'Categoria de contrato inválida.', 'invalid_product');
    const title = limited(body.title, 200);
    if (title.length < 2 || /[<>]/.test(title)) throw new HttpError(400, 'Dê um título ao contrato (2 a 200 caracteres, sem HTML).', 'invalid_title');
    const starts = requireDate(body.starts_on, 'Início');
    const ends = requireDate(body.ends_on, 'Fim');
    if (ends < starts) throw new HttpError(400, 'O fim do contrato não pode anteceder o início.', 'invalid_period');
    const notice = intOrNull(body.renewal_notice_days ?? 60, 0, 3650, 'Aviso prévio');
    const currency = clean(body.currency).toUpperCase() || null;
    if (currency && !/^[A-Z]{3}$/.test(currency)) throw new HttpError(400, 'Moeda inválida (código ISO de três letras).', 'invalid_currency');
    const terms = checkedTerms(product, body.terms || {});
    const id = await rpc(token, 'fin_import_contract', {
      p_org: organization.id,
      p_entity: clean(body.legal_entity_id) ? requireUuid(body.legal_entity_id, 'legal_entity_id') : null,
      p_provider: requireUuid(body.provider_id, 'provider_id'),
      p_product: product, p_title: title, p_starts: starts, p_ends: ends, p_notice: notice,
      p_auto_renew: body.auto_renew === true, p_currency: currency, p_terms: terms,
      p_parent: clean(body.parent_contract_id) ? requireUuid(body.parent_contract_id, 'parent_contract_id') : null
    });
    json(res, 201, { ok: true, id }, headers);
    return true;
  }

  if (resource === 'contract-terms' && req.method === 'POST') {
    const body = await readBody(req);
    const contractId = requireUuid(body.contract_id, 'contract_id');
    const rows = await rest(token, `fin_contracts?select=id,product&id=eq.${contractId}&limit=1`);
    if (!rows?.[0]) throw new HttpError(404, 'Contrato não encontrado ou sem acesso para a sua conta.', 'contract_not_found');
    const expected = intOrNull(body.expected_version, 0, 100000, 'Versão esperada');
    if (expected === null) throw new HttpError(400, 'Informe a versão atual dos termos.', 'invalid_version');
    const reason = limited(body.reason, 1000);
    if (reason && /[<>]/.test(reason)) throw new HttpError(400, 'Justificativa sem HTML.', 'invalid_reason');
    const version = await rpc(token, 'fin_record_contract_terms', {
      p_contract: contractId, p_terms: checkedTerms(rows[0].product, body.terms || {}), p_expected: expected,
      p_reason: reason || null, p_effective_from: requireDate(body.effective_from, 'Vigência dos termos', { optional: true })
    });
    json(res, 201, { ok: true, version }, headers);
    return true;
  }

  if (resource === 'contract-amendments' && req.method === 'POST') {
    const body = await readBody(req);
    const contractId = requireUuid(body.contract_id, 'contract_id');
    const rows = await rest(token, `fin_contracts?select=id,product&id=eq.${contractId}&limit=1`);
    if (!rows?.[0]) throw new HttpError(404, 'Contrato não encontrado ou sem acesso para a sua conta.', 'contract_not_found');
    const title = limited(body.title, 200);
    if (title.length < 2 || /[<>]/.test(title)) throw new HttpError(400, 'Dê um título ao aditivo.', 'invalid_title');
    const summary = limited(body.summary, 4000);
    if (/[<>]/.test(summary)) throw new HttpError(400, 'Resumo sem HTML.', 'invalid_summary');
    const hasTerms = body.terms && typeof body.terms === 'object';
    const id = await rpc(token, 'fin_record_contract_amendment', {
      p_contract: contractId, p_title: title,
      p_effective_from: requireDate(body.effective_from, 'Vigência do aditivo'),
      p_signed_on: requireDate(body.signed_on, 'Assinatura', { optional: true }),
      p_summary: summary || null,
      p_terms: hasTerms ? checkedTerms(rows[0].product, body.terms) : null,
      p_new_ends_on: requireDate(body.new_ends_on, 'Novo fim', { optional: true }),
      p_new_notice_days: intOrNull(body.new_notice_days, 0, 3650, 'Novo aviso prévio'),
      p_document: clean(body.document_id) ? requireUuid(body.document_id, 'document_id') : null,
      p_expected: hasTerms ? intOrNull(body.expected_version, 0, 100000, 'Versão esperada') : null
    });
    json(res, 201, { ok: true, id }, headers);
    return true;
  }

  if (resource === 'contract-milestones' && !sub && req.method === 'POST') {
    const body = await readBody(req);
    const kind = clean(body.kind);
    if (!MILESTONE_KINDS[kind]) throw new HttpError(400, 'Tipo de marco inválido.', 'invalid_milestone');
    const recurrence = clean(body.recurrence) || 'none';
    if (!RECURRENCES[recurrence]) throw new HttpError(400, 'Recorrência inválida.', 'invalid_milestone');
    const title = limited(body.title, 200);
    if (title.length < 2 || /[<>]/.test(title)) throw new HttpError(400, 'Dê um título ao marco.', 'invalid_title');
    const id = await rpc(token, 'fin_create_contract_milestone', {
      p_contract: requireUuid(body.contract_id, 'contract_id'), p_kind: kind, p_title: title,
      p_due_on: requireDate(body.due_on, 'Data do marco'),
      p_lead_days: intOrNull(body.lead_days ?? 30, 0, 365, 'Antecedência'),
      p_recurrence: recurrence,
      p_ends_after: requireDate(body.ends_after, 'Fim da recorrência', { optional: true }),
      p_owner: clean(body.owner_id) ? requireUuid(body.owner_id, 'owner_id') : null
    });
    json(res, 201, { ok: true, id }, headers);
    return true;
  }

  if (resource === 'contract-milestones' && !sub && req.method === 'PATCH') {
    const body = await readBody(req);
    const action = clean(body.action);
    if (!['done', 'cancelled'].includes(action)) throw new HttpError(400, 'Ação de marco inválida.', 'invalid_milestone');
    const status = await rpc(token, 'fin_settle_contract_milestone', { p_milestone: requireUuid(body.milestone_id, 'milestone_id'), p_action: action });
    json(res, 200, { ok: true, status }, headers);
    return true;
  }

  if (resource === 'contract-milestones' && sub === 'process' && req.method === 'POST') {
    const body = await readBody(req);
    const organization = await memberOrganization(token, body.organization_id, ['BUYER']);
    const created = await rpc(token, 'fin_process_contract_milestones', { p_org: organization.id, p_day: new Date().toISOString().slice(0, 10) });
    json(res, 200, { ok: true, tasks_created: Number(created) || 0 }, headers);
    return true;
  }

  return false;
}
