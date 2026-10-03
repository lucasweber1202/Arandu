import { HttpError, json, readBody, clean, limited, validEmail } from '../../api-core.mjs';
import { requireUuid, query, rest, rpc, memberOrganization } from './finance-core.mjs';
import { FACILITY_KINDS, GUARANTEE_KINDS, portfolioViews, relationshipMetrics, relationshipMap } from '../../finance/portfolio.mjs';
import { INDEXERS, AMORTIZATION } from '../../finance/contract-terms.mjs';

// Relationship & Portfolio: memória institucional do provedor e visão de
// dívida/limites/garantias. Leituras sob RLS (entidade incluída); escrita só
// por RPC. Visões calculadas aqui sobre linhas já autorizadas, por moeda.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CATEGORIES = ['credit', 'acquiring', 'cash_management', 'guarantee', 'fx', 'insurance', 'investment', 'other'];

function date(value, label, { optional = true } = {}) {
  const day = clean(value);
  if (!day && optional) return null;
  if (!DATE.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) throw new HttpError(400, `${label}: data no formato AAAA-MM-DD.`, 'invalid_date');
  return day;
}
function amount(value, label, { min = 0, max = 1e15 } = {}) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new HttpError(400, `${label}: valor fora do intervalo aceito.`, 'invalid_amount');
  return Math.round(number * 100) / 100;
}
function optionalUuid(value, label) {
  return clean(value) ? requireUuid(value, label) : null;
}
function text(value, max, label, { min = 0 } = {}) {
  const out = limited(value, max);
  if (out && (out.length < min || /[<>]/.test(out))) throw new HttpError(400, `${label}: ${min ? `${min} a ` : 'até '}${max} caracteres, sem HTML.`, 'invalid_text');
  return out || null;
}
const inList = (ids) => `(${ids.join(',')})`;

/**
 * @returns {Promise<boolean>} true quando a rota foi tratada aqui.
 */
export async function handleFinancePortfolio(req, res, { resource, sub, token, headers }) {
  // ------------------------------------------- relacionamento com provedor
  if (resource === 'provider-relationship' && req.method === 'GET') {
    const organization = await memberOrganization(token, query(req).get('organization_id'), ['BUYER']);
    const org = organization.id;
    const providerId = requireUuid(query(req).get('provider_id'), 'provider_id');
    const providerRows = await rest(token, `fin_providers?select=id,name,kind,website,region,status,verification_state,regulator_checked_at,products,created_at&organization_id=eq.${org}&id=eq.${providerId}&limit=1`);
    const provider = providerRows?.[0];
    if (!provider) throw new HttpError(404, 'Provedor não encontrado nesta organização.', 'provider_not_found');
    const [contacts, relationships, issues, reviews, templates, invites, proposals, contracts, facilities, events] = await Promise.all([
      rest(token, `fin_provider_contacts?select=id,legal_entity_id,name,title,email,phone,is_primary,created_at&organization_id=eq.${org}&provider_id=eq.${providerId}&archived_at=is.null&order=is_primary.desc,name.asc&limit=100`),
      rest(token, `fin_provider_relationships?select=id,legal_entity_id,status,owner_id,categories,since_on,notes,updated_at&organization_id=eq.${org}&provider_id=eq.${providerId}&limit=200`),
      rest(token, `fin_provider_issues?select=id,legal_entity_id,contract_id,title,description,category,severity,status,opened_on,due_on,resolved_at,resolution,owner_id,created_at&organization_id=eq.${org}&provider_id=eq.${providerId}&order=created_at.desc&limit=200`),
      rest(token, `fin_provider_reviews?select=id,template_id,legal_entity_id,period_start,period_end,scores,weighted_result,answered_weight,comment,reviewer_id,created_at&organization_id=eq.${org}&provider_id=eq.${providerId}&order=period_end.desc&limit=50`),
      rest(token, `fin_scorecard_templates?select=id,template_key,version,name,criteria,status&organization_id=eq.${org}&order=template_key.asc,version.desc&limit=100`),
      rest(token, `fin_rfq_invites?select=id,rfq_id,status,created_at&buyer_organization_id=eq.${org}&provider_id=eq.${providerId}&order=created_at.desc&limit=500`),
      rest(token, `fin_proposals?select=id,invite_id,rfq_id,status,current_version,updated_at&buyer_organization_id=eq.${org}&provider_id=eq.${providerId}&limit=500`),
      rest(token, `fin_contracts?select=id,legal_entity_id,product,status,starts_on,ends_on,title,origin&organization_id=eq.${org}&provider_id=eq.${providerId}&limit=200`),
      rest(token, `fin_facilities?select=id,legal_entity_id,name,kind,currency,approved_limit,status,maturity_on&organization_id=eq.${org}&provider_id=eq.${providerId}&limit=200`),
      rest(token, `fin_events?select=event_type,happened_at,legal_entity_id&organization_id=eq.${org}&entity_type=eq.provider&entity_id=eq.${providerId}&order=happened_at.desc&limit=50`)
    ]);
    const proposalIds = (proposals || []).filter((row) => row.current_version > 0).map((row) => row.id);
    const facilityIds = (facilities || []).map((row) => row.id);
    const [firstVersions, balances] = await Promise.all([
      proposalIds.length ? rest(token, `fin_proposal_versions?select=proposal_id,submitted_at&proposal_id=in.${inList(proposalIds)}&version=eq.1&limit=500`) : [],
      facilityIds.length ? rest(token, `fin_facility_balances?select=facility_id,as_of,recorded_at,used_limit_amount,outstanding_amount&facility_id=in.${inList(facilityIds)}&order=as_of.desc&limit=2000`) : []
    ]);
    const timeline = [
      ...(invites || []).map((row) => ({ at: row.created_at, kind: 'invite', text: 'Convidado para uma solicitação', ref: row.rfq_id })),
      ...(contracts || []).map((row) => ({ at: row.starts_on, kind: 'contract', text: `Contrato ${row.title || row.product} iniciado`, ref: row.id })),
      ...(issues || []).map((row) => ({ at: row.created_at, kind: 'issue', text: `Issue aberta: ${row.title}`, ref: row.id })),
      ...(issues || []).filter((row) => row.resolved_at).map((row) => ({ at: row.resolved_at, kind: 'issue_closed', text: `Issue ${row.status === 'resolved' ? 'resolvida' : 'cancelada'}: ${row.title}`, ref: row.id })),
      ...(reviews || []).map((row) => ({ at: row.created_at, kind: 'review', text: 'Avaliação registrada pela empresa', ref: row.id })),
      ...(events || []).filter((row) => /contact|relationship/.test(row.event_type)).map((row) => ({ at: row.happened_at, kind: 'event', text: row.event_type, ref: null }))
    ].filter((row) => row.at).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 60);
    json(res, 200, {
      ok: true,
      provider,
      contacts: contacts || [],
      relationships: relationships || [],
      issues: issues || [],
      reviews: reviews || [],
      templates: (templates || []).filter((row) => row.status === 'active'),
      contracts: contracts || [],
      facilities: facilities || [],
      metrics: relationshipMetrics({ invites: invites || [], proposals: proposals || [], firstVersions: firstVersions || [], contracts: contracts || [], facilities: facilities || [], issues: issues || [], reviews: reviews || [] }),
      map: relationshipMap({ contracts: contracts || [], facilities: facilities || [], balances: balances || [], relationships: relationships || [] }),
      timeline,
      neutrality: 'Fatos do histórico da sua empresa e avaliações definidas por ela. O Arandu não classifica nem recomenda instituições.'
    }, headers);
    return true;
  }

  if (resource === 'provider-contacts' && req.method === 'POST') {
    const body = await readBody(req);
    const organization = await memberOrganization(token, body.organization_id, ['BUYER']);
    const name = text(body.name, 120, 'Nome', { min: 2 });
    if (!name || /@/.test(name)) throw new HttpError(400, 'Informe o nome do contato (sem e-mail no nome).', 'invalid_contact');
    const email = clean(body.email).toLowerCase();
    if (email && !validEmail(email)) throw new HttpError(400, 'E-mail de contato inválido.', 'invalid_contact');
    const phone = clean(body.phone);
    if (phone && !/^[0-9+() .-]{6,40}$/.test(phone)) throw new HttpError(400, 'Telefone inválido.', 'invalid_contact');
    const id = await rpc(token, 'fin_add_provider_contact', {
      p_org: organization.id, p_provider: requireUuid(body.provider_id, 'provider_id'), p_name: name, p_title: text(body.title, 120, 'Cargo'),
      p_email: email || null, p_phone: phone || null, p_entity: optionalUuid(body.legal_entity_id, 'legal_entity_id'), p_primary: body.is_primary === true
    });
    json(res, 201, { ok: true, id }, headers);
    return true;
  }
  if (resource === 'provider-contacts' && req.method === 'DELETE') {
    const body = await readBody(req);
    await rpc(token, 'fin_archive_provider_contact', { p_contact: requireUuid(body.contact_id, 'contact_id') });
    json(res, 200, { ok: true }, headers);
    return true;
  }

  if (resource === 'provider-relationships' && req.method === 'POST') {
    const body = await readBody(req);
    const organization = await memberOrganization(token, body.organization_id, ['BUYER']);
    const status = clean(body.status) || 'active';
    if (!['prospect', 'active', 'inactive'].includes(status)) throw new HttpError(400, 'Estado de relacionamento inválido.', 'invalid_relationship');
    const categories = Array.isArray(body.categories) ? [...new Set(body.categories.map((item) => clean(item)))] : [];
    if (categories.some((item) => !CATEGORIES.includes(item)) || categories.length > 10) throw new HttpError(400, 'Categoria de relacionamento inválida.', 'invalid_relationship');
    const id = await rpc(token, 'fin_set_provider_relationship', {
      p_org: organization.id, p_provider: requireUuid(body.provider_id, 'provider_id'), p_entity: requireUuid(body.legal_entity_id, 'legal_entity_id'),
      p_status: status, p_owner: optionalUuid(body.owner_id, 'owner_id'), p_categories: categories,
      p_since: date(body.since_on, 'Início do relacionamento'), p_notes: text(body.notes, 2000, 'Notas')
    });
    json(res, 200, { ok: true, id }, headers);
    return true;
  }

  if (resource === 'provider-issues' && req.method === 'POST') {
    const body = await readBody(req);
    const organization = await memberOrganization(token, body.organization_id, ['BUYER']);
    const category = clean(body.category) || 'service';
    const severity = clean(body.severity) || 'medium';
    if (!['service', 'billing', 'implementation', 'compliance', 'documentation', 'other'].includes(category) || !['low', 'medium', 'high'].includes(severity)) {
      throw new HttpError(400, 'Categoria ou severidade inválida.', 'invalid_issue');
    }
    const title = text(body.title, 200, 'Título', { min: 3 });
    if (!title) throw new HttpError(400, 'Dê um título à issue.', 'invalid_issue');
    const id = await rpc(token, 'fin_open_provider_issue', {
      p_org: organization.id, p_provider: requireUuid(body.provider_id, 'provider_id'), p_title: title, p_category: category, p_severity: severity,
      p_description: text(body.description, 4000, 'Descrição'), p_entity: optionalUuid(body.legal_entity_id, 'legal_entity_id'),
      p_contract: optionalUuid(body.contract_id, 'contract_id'), p_due: date(body.due_on, 'Prazo'), p_owner: optionalUuid(body.owner_id, 'owner_id')
    });
    json(res, 201, { ok: true, id }, headers);
    return true;
  }
  if (resource === 'provider-issues' && req.method === 'PATCH') {
    const body = await readBody(req);
    const status = clean(body.status);
    if (!['in_progress', 'resolved', 'cancelled'].includes(status)) throw new HttpError(400, 'Estado de issue inválido.', 'invalid_issue');
    await rpc(token, 'fin_update_provider_issue', { p_issue: requireUuid(body.issue_id, 'issue_id'), p_status: status, p_resolution: text(body.resolution, 2000, 'Resolução') });
    json(res, 200, { ok: true }, headers);
    return true;
  }

  if (resource === 'scorecard-templates' && req.method === 'GET') {
    const organization = await memberOrganization(token, query(req).get('organization_id'), ['BUYER']);
    const rows = await rest(token, `fin_scorecard_templates?select=id,template_key,version,name,criteria,status,created_at&organization_id=eq.${organization.id}&order=template_key.asc,version.desc&limit=200`);
    json(res, 200, { ok: true, rows: rows || [], notice: 'Critérios e pesos são da sua empresa. O Arandu não fornece score padrão de instituições.' }, headers);
    return true;
  }
  if (resource === 'scorecard-templates' && req.method === 'POST') {
    const body = await readBody(req);
    const organization = await memberOrganization(token, body.organization_id, ['BUYER']);
    const key = clean(body.template_key);
    if (!/^[a-z][a-z0-9_]{1,40}$/.test(key)) throw new HttpError(400, 'Identificador do scorecard inválido.', 'invalid_scorecard');
    const criteria = Array.isArray(body.criteria) ? body.criteria.slice(0, 21).map((item) => ({
      key: clean(item?.key), label: limited(item?.label, 120), weight: Number(item?.weight), scale_max: Number(item?.scale_max || 5)
    })) : [];
    if (!criteria.length || criteria.length > 20 || criteria.some((item) => !/^[a-z][a-z0-9_]{1,40}$/.test(item.key) || item.label.length < 2 || /[<>]/.test(item.label)
      || !(item.weight > 0 && item.weight <= 100) || ![5, 10, 100].includes(item.scale_max))) {
      throw new HttpError(400, 'Cada critério precisa de identificador, rótulo, peso entre 0 e 100 e escala 5, 10 ou 100.', 'invalid_scorecard');
    }
    const id = await rpc(token, 'fin_create_scorecard_template', { p_org: organization.id, p_key: key, p_name: text(body.name, 120, 'Nome', { min: 2 }), p_criteria: criteria });
    json(res, 201, { ok: true, id }, headers);
    return true;
  }

  if (resource === 'provider-reviews' && req.method === 'POST') {
    const body = await readBody(req);
    const organization = await memberOrganization(token, body.organization_id, ['BUYER']);
    const scores = {};
    for (const [key, value] of Object.entries(body.scores && typeof body.scores === 'object' ? body.scores : {}).slice(0, 20)) {
      if (!/^[a-z][a-z0-9_]{1,40}$/.test(key) || value === '' || value === null) continue;
      const number = Number(value);
      if (!Number.isFinite(number) || number < 0) throw new HttpError(400, 'Nota inválida.', 'invalid_review');
      scores[key] = number;
    }
    if (!Object.keys(scores).length) throw new HttpError(400, 'Responda ao menos um critério.', 'invalid_review');
    const start = date(body.period_start, 'Início do período', { optional: false });
    const end = date(body.period_end, 'Fim do período', { optional: false });
    if (end < start) throw new HttpError(400, 'O período termina antes de começar.', 'invalid_period');
    const id = await rpc(token, 'fin_record_provider_review', {
      p_org: organization.id, p_provider: requireUuid(body.provider_id, 'provider_id'), p_template: requireUuid(body.template_id, 'template_id'),
      p_period_start: start, p_period_end: end, p_scores: scores, p_entity: optionalUuid(body.legal_entity_id, 'legal_entity_id'),
      p_comment: text(body.comment, 2000, 'Comentário')
    });
    json(res, 201, { ok: true, id }, headers);
    return true;
  }

  // ------------------------------------------------------------ portfólio
  if (resource === 'portfolio' && req.method === 'GET') {
    const organization = await memberOrganization(token, query(req).get('organization_id'), ['BUYER']);
    const org = organization.id;
    const horizon = Number(query(req).get('horizon_months') || 12);
    if (![3, 6, 12, 18, 24, 36].includes(horizon)) throw new HttpError(400, 'Horizonte inválido.', 'invalid_horizon');
    const [facilities, guarantees, providers] = await Promise.all([
      rest(token, `fin_facilities?select=*&organization_id=eq.${org}&order=maturity_on.asc.nullslast&limit=2000`),
      rest(token, `fin_guarantees?select=*&organization_id=eq.${org}&order=created_at.desc&limit=2000`),
      rest(token, `fin_providers?select=id,name&organization_id=eq.${org}&limit=500`)
    ]);
    const ids = (facilities || []).map((row) => row.id);
    const [balances, repayments] = ids.length ? await Promise.all([
      rest(token, `fin_facility_balances?select=facility_id,as_of,recorded_at,outstanding_amount,used_limit_amount,source,source_reference&facility_id=in.${inList(ids)}&order=as_of.desc&limit=10000`),
      rest(token, `fin_facility_repayments?select=facility_id,schedule_version,due_on,principal_amount&facility_id=in.${inList(ids)}&order=due_on.asc&limit=20000`)
    ]) : [[], []];
    const names = new Map((providers || []).map((row) => [row.id, row.name]));
    json(res, 200, {
      ok: true,
      facilities: (facilities || []).map((row) => ({ ...row, provider_name: names.get(row.provider_id) || 'Provedor' })),
      guarantees: (guarantees || []).map((row) => ({ ...row, provider_name: row.provider_id ? names.get(row.provider_id) || 'Provedor' : null })),
      balances: balances || [],
      views: portfolioViews({ facilities: facilities || [], balances: balances || [], repayments: repayments || [], guarantees: guarantees || [], providers: providers || [], horizonMonths: horizon }),
      boundary: 'Visão de procurement e relacionamento. Saldos e cronogramas são os registrados pela empresa; o Arandu não calcula juros nem substitui contabilidade ou TMS.'
    }, headers);
    return true;
  }

  if (resource === 'facilities' && !sub && req.method === 'POST') {
    const body = await readBody(req);
    const organization = await memberOrganization(token, body.organization_id, ['BUYER']);
    const kind = clean(body.kind);
    if (!FACILITY_KINDS[kind]) throw new HttpError(400, 'Tipo de facility inválido.', 'invalid_facility');
    const currency = clean(body.currency || 'BRL').toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new HttpError(400, 'Moeda inválida.', 'invalid_currency');
    const indexer = clean(body.indexer) || null;
    if (indexer && !INDEXERS.includes(indexer)) throw new HttpError(400, 'Indexador inválido.', 'invalid_facility');
    const amortization = clean(body.amortization) || null;
    if (amortization && !AMORTIZATION.includes(amortization)) throw new HttpError(400, 'Amortização inválida.', 'invalid_facility');
    const status = clean(body.status) || 'active';
    if (!['prospective', 'active', 'matured', 'cancelled'].includes(status)) throw new HttpError(400, 'Estado inválido.', 'invalid_facility');
    const source = clean(body.source) || 'declared';
    if (!['declared', 'contract', 'import', 'integration'].includes(source)) throw new HttpError(400, 'Origem inválida.', 'invalid_facility');
    const name = text(body.name, 200, 'Nome', { min: 2 });
    if (!name) throw new HttpError(400, 'Dê um nome à facility.', 'invalid_facility');
    const approved = amount(body.approved_limit, 'Limite aprovado');
    const principal = amount(body.principal_amount, 'Principal');
    if (approved === null && principal === null) throw new HttpError(400, 'Informe o limite aprovado ou o principal contratado.', 'invalid_facility');
    const review = body.review_after_days === undefined || body.review_after_days === '' ? 90 : Number(body.review_after_days);
    if (!Number.isInteger(review) || review < 7 || review > 1825) throw new HttpError(400, 'Período de revisão entre 7 e 1825 dias.', 'invalid_facility');
    const id = await rpc(token, 'fin_save_facility', {
      p_org: organization.id, p_facility: optionalUuid(body.facility_id, 'facility_id'), p_entity: optionalUuid(body.legal_entity_id, 'legal_entity_id'),
      p_provider: requireUuid(body.provider_id, 'provider_id'), p_kind: kind, p_name: name, p_currency: currency,
      p_approved_limit: approved, p_principal: principal, p_indexer: indexer,
      p_spread: amount(body.spread_pct_year, 'Spread', { min: -100, max: 100 }), p_rate: amount(body.rate_pct_year, 'Taxa', { max: 1000 }),
      p_amortization: amortization, p_starts: date(body.starts_on, 'Início'), p_maturity: date(body.maturity_on, 'Vencimento'), p_status: status,
      p_contract: optionalUuid(body.contract_id, 'contract_id'), p_source: source, p_source_reference: text(body.source_reference, 300, 'Referência'),
      p_review_days: review, p_notes: text(body.notes, 2000, 'Notas'), p_owner: optionalUuid(body.owner_id, 'owner_id')
    });
    json(res, body.facility_id ? 200 : 201, { ok: true, id }, headers);
    return true;
  }
  if (resource === 'facilities' && sub === 'confirm' && req.method === 'POST') {
    const body = await readBody(req);
    const verifiedAt = await rpc(token, 'fin_confirm_facility', { p_facility: requireUuid(body.facility_id, 'facility_id') });
    json(res, 200, { ok: true, verified_at: verifiedAt }, headers);
    return true;
  }
  if (resource === 'facility-balances' && req.method === 'POST') {
    const body = await readBody(req);
    const source = clean(body.source) || 'declared';
    if (!['declared', 'statement', 'import', 'integration'].includes(source)) throw new HttpError(400, 'Origem inválida.', 'invalid_balance');
    const outstanding = amount(body.outstanding_amount, 'Saldo devedor');
    const used = amount(body.used_limit_amount, 'Uso do limite');
    if (outstanding === null && used === null) throw new HttpError(400, 'Informe saldo devedor ou uso do limite.', 'invalid_balance');
    const id = await rpc(token, 'fin_record_facility_balance', {
      p_facility: requireUuid(body.facility_id, 'facility_id'), p_as_of: date(body.as_of, 'Data de referência', { optional: false }),
      p_outstanding: outstanding, p_used_limit: used, p_source: source, p_source_reference: text(body.source_reference, 300, 'Referência')
    });
    json(res, 201, { ok: true, id }, headers);
    return true;
  }
  if (resource === 'facility-schedule' && req.method === 'POST') {
    const body = await readBody(req);
    const items = Array.isArray(body.items) ? body.items.slice(0, 601).map((item) => ({ due_on: date(item?.due_on, 'Vencimento da parcela', { optional: false }), principal_amount: amount(item?.principal_amount, 'Principal da parcela') })) : [];
    if (!items.length || items.length > 600 || items.some((item) => item.principal_amount === null)) throw new HttpError(400, 'Informe de 1 a 600 parcelas com data e principal.', 'invalid_schedule');
    const expected = Number(body.expected_version);
    if (!Number.isInteger(expected) || expected < 0) throw new HttpError(400, 'Informe a versão atual do cronograma.', 'invalid_version');
    const version = await rpc(token, 'fin_record_facility_schedule', { p_facility: requireUuid(body.facility_id, 'facility_id'), p_items: items, p_expected: expected });
    json(res, 201, { ok: true, version }, headers);
    return true;
  }
  if (resource === 'guarantees' && req.method === 'POST') {
    const body = await readBody(req);
    const organization = await memberOrganization(token, body.organization_id, ['BUYER']);
    const kind = clean(body.kind);
    if (!GUARANTEE_KINDS[kind]) throw new HttpError(400, 'Tipo de garantia inválido.', 'invalid_guarantee');
    const status = clean(body.status) || 'active';
    if (!['active', 'released', 'expired'].includes(status)) throw new HttpError(400, 'Estado inválido.', 'invalid_guarantee');
    const currency = clean(body.currency || 'BRL').toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new HttpError(400, 'Moeda inválida.', 'invalid_currency');
    const description = text(body.description, 500, 'Descrição', { min: 3 });
    if (!description) throw new HttpError(400, 'Descreva a garantia.', 'invalid_guarantee');
    const id = await rpc(token, 'fin_save_guarantee', {
      p_org: organization.id, p_guarantee: optionalUuid(body.guarantee_id, 'guarantee_id'), p_entity: optionalUuid(body.legal_entity_id, 'legal_entity_id'),
      p_kind: kind, p_description: description, p_currency: currency, p_committed: amount(body.committed_amount, 'Valor comprometido'),
      p_facility: optionalUuid(body.facility_id, 'facility_id'), p_contract: optionalUuid(body.contract_id, 'contract_id'),
      p_provider: optionalUuid(body.provider_id, 'provider_id'), p_starts: date(body.starts_on, 'Início'), p_ends: date(body.ends_on, 'Fim'),
      p_status: status, p_source: ['declared', 'contract', 'import', 'integration'].includes(clean(body.source)) ? clean(body.source) : 'declared'
    });
    json(res, body.guarantee_id ? 200 : 201, { ok: true, id }, headers);
    return true;
  }

  return false;
}
