import { HttpError, json, readBody, clean, limited, safeObject } from '../../api-core.mjs';
import { userSupabaseRequest } from '../../supabase.mjs';
import { PRODUCT_IDS, PRODUCTS, normalizeDemand, normalizeProposal, demandFields, proposalFields } from '../../finance/products.mjs';
import { buildComparison, applyUserWeights, comparableFields, NEUTRAL_RANKING_NOTICE } from '../../finance/comparison.mjs';
import { nextStates, canTransition, RFQ_STATES, CONTRACT_STATES } from '../../finance/workflow.mjs';

// Domínio de API do Arandu Financial Procurement.
//
// Três invariantes são mantidas aqui, e repetidas no banco:
//   1. Nenhum campo financeiro entra sem estar declarado em lib/finance/products.mjs.
//   2. organization_id / provider_organization_id vêm sempre da sessão ou da
//      linha do banco — nunca de um valor arbitrário do corpo da requisição.
//   3. Transições de estado só existem na máquina declarada; strings livres
//      são recusadas antes de chegar ao Postgres.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^[0-9a-f]{64}$/;

function requireUuid(value, label) {
  const id = clean(value);
  if (!UUID.test(id)) throw new HttpError(400, `${label} inválido.`, 'invalid_id');
  return id;
}

function query(req) {
  return new URL(req.url, 'http://localhost').searchParams;
}

function rest(token, resource) {
  return userSupabaseRequest(token, resource);
}

function rpc(token, name, body) {
  return userSupabaseRequest(token, `rpc/${name}`, { method: 'POST', body });
}

function requireProduct(value) {
  const product = clean(value);
  if (!PRODUCT_IDS.includes(product)) throw new HttpError(400, 'Produto financeiro inválido.', 'invalid_product');
  return product;
}

function rejectInvalid(result) {
  if (result.errors.length) throw new HttpError(400, result.errors[0], 'invalid_fields');
  return result.values;
}

/** Organização declarada pelo cliente só vale depois de confirmada no banco. */
async function memberOrganization(token, organizationId, kinds = null) {
  const id = requireUuid(organizationId, 'organization_id');
  const rows = await rest(token, `fin_organizations?select=id,legal_name,trade_name,kind,country,sector,revenue_band&id=eq.${id}&limit=1`);
  const organization = rows?.[0];
  // RLS já devolve vazio para organização de terceiro: nada a distinguir aqui.
  if (!organization) throw new HttpError(403, 'Organização não disponível para esta conta.', 'organization_forbidden');
  if (kinds && !kinds.includes(organization.kind)) throw new HttpError(400, 'Tipo de organização incompatível com a operação.', 'organization_kind');
  return organization;
}

async function loadRfq(token, rfqId) {
  const id = requireUuid(rfqId, 'rfq_id');
  const rows = await rest(token, `fin_rfqs?select=*&id=eq.${id}&limit=1`);
  if (!rows?.length) throw new HttpError(404, 'RFQ não encontrada.', 'rfq_not_found');
  return rows[0];
}

/**
 * Propostas de uma RFQ com a versão corrente resolvida. Usada pela comparação:
 * o que a empresa compara é sempre a última versão enviada, sem perder as
 * anteriores, que continuam no histórico.
 */
async function loadProposalsWithTerms(token, rfqId) {
  const proposals = await rest(token, `fin_proposals?select=id,provider_id,provider_organization_id,status,current_version,updated_at&rfq_id=eq.${rfqId}&order=created_at.asc&limit=200`);
  const active = (proposals || []).filter((row) => row.current_version > 0 && row.status !== 'withdrawn');
  if (!active.length) return [];
  const ids = active.map((row) => row.id).join(',');
  const versions = await rest(token, `fin_proposal_versions?select=proposal_id,version,terms,submitted_at,note&proposal_id=in.(${ids})&order=version.desc&limit=1000`);
  const providers = await rest(token, `fin_providers?select=id,name,kind&id=in.(${active.map((row) => row.provider_id).join(',')})&limit=200`);
  const providerById = new Map((providers || []).map((row) => [row.id, row]));
  return active.map((proposal) => {
    const version = (versions || []).find((row) => row.proposal_id === proposal.id && row.version === proposal.current_version);
    return {
      id: proposal.id,
      provider_id: proposal.provider_id,
      provider_name: providerById.get(proposal.provider_id)?.name || 'Provedor',
      provider_kind: providerById.get(proposal.provider_id)?.kind || null,
      status: proposal.status,
      version: proposal.current_version,
      submitted_at: version?.submitted_at || null,
      note: version?.note || null,
      terms: safeObject(version?.terms)
    };
  });
}

/** Catálogo público de produtos: alimenta formulários e documentação da UI. */
function productCatalog() {
  return PRODUCT_IDS.map((id) => ({
    id,
    label: PRODUCTS[id].label,
    summary: PRODUCTS[id].summary,
    demand_fields: demandFields(id),
    proposal_fields: proposalFields(id),
    comparable_fields: comparableFields(id)
  }));
}

export async function handleFinance(req, res, path, { requireUser, enforceRateLimit }) {
  const segments = String(path || '').split('/').filter(Boolean);
  const [resource, sub] = segments;

  // Metadados de produto não expõem dado de nenhuma organização.
  if (resource === 'products' && req.method === 'GET') {
    await enforceRateLimit(req, 'finance-products', 120, 600000);
    return json(res, 200, {
      ok: true,
      products: productCatalog(),
      states: { rfq: RFQ_STATES, contract: CONTRACT_STATES },
      notice: NEUTRAL_RANKING_NOTICE
    }, { 'Cache-Control': 'no-store' });
  }

  const session = await requireUser(req);
  const token = session.accessToken;
  const headers = { ...session.headers, 'Cache-Control': 'no-store' };
  await enforceRateLimit(req, 'finance-account', 240, 600000, session.user.id);
  const writing = req.method !== 'GET';
  if (writing) await enforceRateLimit(req, 'finance-write', 60, 600000, session.user.id);

  // ------------------------------------------------------------ organizações
  if (resource === 'organizations') {
    if (req.method === 'GET') {
      const rows = await rest(token, 'fin_organizations?select=id,legal_name,trade_name,kind,country,sector,revenue_band,created_at&order=created_at.desc&limit=100');
      return json(res, 200, { ok: true, rows }, headers);
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const kind = clean(body.kind).toUpperCase();
      if (!['BUYER', 'PROVIDER'].includes(kind)) throw new HttpError(400, 'Tipo de organização inválido.', 'invalid_kind');
      const country = clean(body.country || 'BR').toUpperCase();
      if (!/^[A-Z]{2}$/.test(country)) throw new HttpError(400, 'País inválido.', 'invalid_country');
      const id = await rpc(token, 'fin_create_organization', { p_name: limited(body.legal_name, 200), p_kind: kind, p_country: country });
      return json(res, 201, { ok: true, id }, headers);
    }
  }

  if (resource === 'members' && sub === 'invite' && req.method === 'POST') {
    const body = await readBody(req);
    const organization = await memberOrganization(token, body.organization_id);
    const invitationToken = await rpc(token, 'fin_invite_member', {
      p_org: organization.id, p_email: limited(body.email, 254), p_role: clean(body.role)
    });
    return json(res, 201, { ok: true, invitationToken }, headers);
  }

  if (resource === 'members' && sub === 'accept' && req.method === 'POST') {
    const body = await readBody(req);
    if (!TOKEN.test(clean(body.token))) throw new HttpError(400, 'Convite inválido.', 'invalid_token');
    const organizationId = await rpc(token, 'fin_accept_member_invitation', { p_token: clean(body.token) });
    return json(res, 200, { ok: true, organizationId }, headers);
  }

  // -------------------------------------------------------- perfil financeiro
  if (resource === 'profile') {
    if (req.method === 'GET') {
      const organization = await memberOrganization(token, query(req).get('organization_id'));
      const rows = await rest(token, `fin_company_profiles?select=id,field_key,field_value,source,status,valid_until,updated_at&organization_id=eq.${organization.id}&order=field_key.asc&limit=200`);
      return json(res, 200, { ok: true, rows }, headers);
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const organization = await memberOrganization(token, body.organization_id, ['BUYER']);
      const fieldKey = clean(body.field_key).toLowerCase();
      if (!/^[a-z][a-z0-9_]{1,48}$/.test(fieldKey)) throw new HttpError(400, 'Identificador de campo inválido.', 'invalid_field_key');
      const fieldValue = limited(body.field_value, 500);
      if (!fieldValue) throw new HttpError(400, 'Informe um valor para o campo.', 'invalid_field_value');
      const source = clean(body.source) || 'declarado_pela_empresa';
      if (!['declarado_pela_empresa', 'documento_interno', 'extrato', 'contrato_vigente', 'outro'].includes(source)) {
        throw new HttpError(400, 'Origem do dado inválida.', 'invalid_source');
      }
      // upsert por (organization_id, field_key): o perfil é reaproveitado entre
      // RFQs e o registro carrega sempre a última proveniência conhecida.
      const rows = await userSupabaseRequest(token, 'fin_company_profiles?on_conflict=organization_id,field_key', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=representation',
        body: {
          organization_id: organization.id, field_key: fieldKey, field_value: fieldValue,
          source, status: 'informado', updated_by: session.user.id, updated_at: new Date().toISOString()
        }
      });
      return json(res, 201, { ok: true, row: rows?.[0] ?? null }, headers);
    }
  }

  // --------------------------------------------------------------- provedores
  if (resource === 'providers') {
    if (req.method === 'GET') {
      const organization = await memberOrganization(token, query(req).get('organization_id'));
      const rows = await rest(token, `fin_providers?select=*&organization_id=eq.${organization.id}&order=name.asc&limit=200`);
      return json(res, 200, { ok: true, rows }, headers);
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const organization = await memberOrganization(token, body.organization_id, ['BUYER']);
      const kind = clean(body.kind);
      if (!['bank', 'fintech', 'acquirer', 'subacquirer', 'credit_provider', 'payment_provider', 'other'].includes(kind)) {
        throw new HttpError(400, 'Tipo de provedor inválido.', 'invalid_provider_kind');
      }
      const website = clean(body.website);
      if (website && !/^https:\/\//.test(website)) throw new HttpError(400, 'O site do provedor precisa usar https.', 'invalid_website');
      // `verification_state` nunca vem do cliente: afirmar que um provedor é
      // regulado exige evidência registrada por um caminho administrativo.
      const payload = {
        organization_id: organization.id,
        name: limited(body.name, 200),
        kind,
        website: website || null,
        contact_name: limited(body.contact_name, 200) || null,
        contact_email: limited(body.contact_email, 254) || null,
        contact_phone: limited(body.contact_phone, 40) || null,
        region: limited(body.region, 120) || null,
        notes: limited(body.notes, 1000) || null,
        products: Array.isArray(body.products) ? body.products.slice(0, 10).map((item) => limited(item, 60)).filter(Boolean) : [],
        created_by: session.user.id
      };
      if (payload.name.length < 2) throw new HttpError(400, 'Informe o nome do provedor.', 'invalid_provider_name');
      const rows = await userSupabaseRequest(token, 'fin_providers', { method: 'POST', body: payload });
      return json(res, 201, { ok: true, row: rows?.[0] ?? null }, headers);
    }
  }

  // --------------------------------------------------------------------- RFQ
  if (resource === 'rfqs') {
    if (req.method === 'GET') {
      const organization = await memberOrganization(token, query(req).get('organization_id'));
      const rows = await rest(token, `fin_rfqs?select=*&organization_id=eq.${organization.id}&order=created_at.desc&limit=100`);
      return json(res, 200, { ok: true, rows, next_states: Object.fromEntries((rows || []).map((row) => [row.id, nextStates('rfq', row.status)])) }, headers);
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const organization = await memberOrganization(token, body.organization_id, ['BUYER']);
      const product = requireProduct(body.product);
      const title = limited(body.title, 200);
      if (title.length < 3) throw new HttpError(400, 'Informe um título para a solicitação.', 'invalid_title');
      const demand = rejectInvalid(normalizeDemand(product, body.demand));
      const id = await rpc(token, 'fin_create_rfq', {
        p_org: organization.id, p_product: product, p_title: title,
        p_description: limited(body.description, 4000) || null,
        p_demand: demand, p_deadline: clean(body.response_deadline) || null
      });
      return json(res, 201, { ok: true, id }, headers);
    }
    if (req.method === 'PATCH') {
      const body = await readBody(req);
      const rfq = await loadRfq(token, body.rfq_id);
      const demand = rejectInvalid(normalizeDemand(rfq.product, body.demand));
      await rpc(token, 'fin_update_rfq_demand', {
        p_rfq: rfq.id, p_title: limited(body.title, 200) || null,
        p_description: limited(body.description, 4000) || null,
        p_demand: demand, p_deadline: clean(body.response_deadline) || null
      });
      return json(res, 200, { ok: true }, headers);
    }
  }

  if (resource === 'rfq' && sub && req.method === 'GET') {
    const rfq = await loadRfq(token, sub);
    const [invites, proposals] = await Promise.all([
      rest(token, `fin_rfq_invites?select=id,provider_id,provider_organization_id,status,expires_at,accepted_at,created_at&rfq_id=eq.${rfq.id}&order=created_at.asc&limit=100`),
      loadProposalsWithTerms(token, rfq.id)
    ]);
    return json(res, 200, {
      ok: true, rfq, invites, proposals,
      next_states: nextStates('rfq', rfq.status),
      notice: NEUTRAL_RANKING_NOTICE
    }, headers);
  }

  // ---------------------------------------------------------------- convites
  if (resource === 'invites' && sub === 'send' && req.method === 'POST') {
    const body = await readBody(req);
    const rfq = await loadRfq(token, body.rfq_id);
    const providerId = requireUuid(body.provider_id, 'provider_id');
    const invitationToken = await rpc(token, 'fin_invite_provider', { p_rfq: rfq.id, p_provider: providerId });
    return json(res, 201, { ok: true, invitationToken }, headers);
  }

  if (resource === 'invites' && sub === 'accept' && req.method === 'POST') {
    const body = await readBody(req);
    if (!TOKEN.test(clean(body.token))) throw new HttpError(400, 'Convite inválido.', 'invalid_token');
    // A organização provedora vem do corpo, mas o banco só aceita se o
    // chamador for membro dela: trocar de identidade é impossível.
    const organization = await memberOrganization(token, body.provider_organization_id, ['PROVIDER']);
    const inviteId = await rpc(token, 'fin_accept_provider_invite', {
      p_token: clean(body.token), p_provider_org: organization.id
    });
    return json(res, 200, { ok: true, inviteId }, headers);
  }

  if (resource === 'invites' && req.method === 'GET') {
    const organization = await memberOrganization(token, query(req).get('organization_id'));
    const rows = await rest(token, `fin_rfq_invites?select=id,rfq_id,provider_id,provider_organization_id,status,expires_at,accepted_at&or=(buyer_organization_id.eq.${organization.id},provider_organization_id.eq.${organization.id})&order=created_at.desc&limit=100`);
    return json(res, 200, { ok: true, rows }, headers);
  }

  // --------------------------------------------------------------- propostas
  if (resource === 'proposals') {
    if (req.method === 'GET') {
      const organization = await memberOrganization(token, query(req).get('organization_id'));
      const rfqId = query(req).get('rfq_id');
      if (rfqId) {
        const rfq = await loadRfq(token, rfqId);
        return json(res, 200, { ok: true, rows: await loadProposalsWithTerms(token, rfq.id) }, headers);
      }
      // Sem rfq_id, devolve as propostas da organização provedora: é a visão do
      // portal do provedor, que jamais alcança propostas de concorrentes.
      const rows = await rest(token, `fin_proposals?select=id,rfq_id,product,status,current_version,updated_at&provider_organization_id=eq.${organization.id}&order=updated_at.desc&limit=100`);
      const ids = (rows || []).map((row) => row.id);
      const versions = ids.length
        ? await rest(token, `fin_proposal_versions?select=proposal_id,version,terms,submitted_at,note&proposal_id=in.(${ids.join(',')})&order=version.desc&limit=500`)
        : [];
      return json(res, 200, {
        ok: true,
        rows: (rows || []).map((row) => ({
          ...row,
          terms: safeObject((versions || []).find((item) => item.proposal_id === row.id && item.version === row.current_version)?.terms),
          history: (versions || []).filter((item) => item.proposal_id === row.id).map(({ version, submitted_at, note }) => ({ version, submitted_at, note }))
        }))
      }, headers);
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const proposalId = requireUuid(body.proposal_id, 'proposal_id');
      // O produto vem da linha do banco, não do corpo: assim os campos aceitos
      // são sempre os da RFQ que originou o convite.
      const rows = await rest(token, `fin_proposals?select=id,product,status,provider_organization_id&id=eq.${proposalId}&limit=1`);
      if (!rows?.length) throw new HttpError(404, 'Proposta não encontrada.', 'proposal_not_found');
      const terms = rejectInvalid(normalizeProposal(rows[0].product, body.terms));
      const version = await rpc(token, 'fin_submit_proposal', {
        p_proposal: proposalId, p_terms: terms, p_note: limited(body.note, 1000) || null
      });
      return json(res, 201, { ok: true, version }, headers);
    }
    if (req.method === 'DELETE') {
      const body = await readBody(req);
      await rpc(token, 'fin_withdraw_proposal', { p_proposal: requireUuid(body.proposal_id, 'proposal_id') });
      return json(res, 200, { ok: true }, headers);
    }
  }

  // -------------------------------------------------------------- comparação
  if (resource === 'comparison' && req.method === 'POST') {
    const body = await readBody(req);
    const rfq = await loadRfq(token, body.rfq_id);
    const proposals = await loadProposalsWithTerms(token, rfq.id);
    const comparison = buildComparison(rfq.product, proposals, safeObject(rfq.demand));
    // A ponderação só existe quando a própria empresa envia pesos. Sem pesos,
    // a resposta é estritamente factual — o Arandu não ordena por conta própria.
    const weighted = body.weights && Object.keys(safeObject(body.weights)).length
      ? applyUserWeights(rfq.product, proposals, safeObject(body.weights))
      : { applied: false, notice: NEUTRAL_RANKING_NOTICE, criteria: [], results: [] };
    return json(res, 200, { ok: true, comparison, weighted, criteria: comparableFields(rfq.product) }, headers);
  }

  // ----------------------------------------------------- decisões e contratos
  if (resource === 'decisions') {
    if (req.method === 'GET') {
      const organization = await memberOrganization(token, query(req).get('organization_id'));
      const rows = await rest(token, `fin_decisions?select=id,rfq_id,proposal_id,decided_by,decided_at,criteria,rationale&organization_id=eq.${organization.id}&order=decided_at.desc&limit=100`);
      return json(res, 200, { ok: true, rows }, headers);
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const rfq = await loadRfq(token, body.rfq_id);
      const proposalId = requireUuid(body.proposal_id, 'proposal_id');
      const criteria = safeObject(body.criteria);
      const allowed = new Set(comparableFields(rfq.product).map((field) => field.key));
      const weights = {};
      for (const [key, value] of Object.entries(safeObject(criteria.weights))) {
        if (!allowed.has(key)) continue;
        const weight = Number(value);
        if (Number.isFinite(weight) && weight > 0 && weight <= 100) weights[key] = weight;
      }
      const id = await rpc(token, 'fin_record_decision', {
        p_rfq: rfq.id, p_proposal: proposalId,
        p_criteria: { weights, decided_by_human: true, source: Object.keys(weights).length ? 'user_weights' : 'manual' },
        p_rationale: limited(body.rationale, 4000) || null
      });
      return json(res, 201, { ok: true, id }, headers);
    }
  }

  if (resource === 'contracts') {
    if (req.method === 'GET') {
      const organization = await memberOrganization(token, query(req).get('organization_id'));
      const rows = await rest(token, `fin_contracts?select=*&organization_id=eq.${organization.id}&order=ends_on.asc&limit=100`);
      return json(res, 200, { ok: true, rows: (rows || []).map(withRenewalWindow) }, headers);
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const decisionId = requireUuid(body.decision_id, 'decision_id');
      const starts = clean(body.starts_on);
      const ends = clean(body.ends_on);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(starts) || !/^\d{4}-\d{2}-\d{2}$/.test(ends)) {
        throw new HttpError(400, 'Informe início e fim do contrato no formato AAAA-MM-DD.', 'invalid_dates');
      }
      if (ends < starts) throw new HttpError(400, 'O fim do contrato não pode anteceder o início.', 'invalid_period');
      const notice = Number(body.renewal_notice_days ?? 60);
      if (!Number.isInteger(notice) || notice < 0 || notice > 3650) throw new HttpError(400, 'Aviso prévio inválido.', 'invalid_notice');
      const reference = clean(body.document_reference);
      if (reference && !/^https:\/\//.test(reference)) throw new HttpError(400, 'A referência documental precisa usar https.', 'invalid_reference');
      const id = await rpc(token, 'fin_register_contract', {
        p_decision: decisionId, p_starts: starts, p_ends: ends, p_notice: notice,
        p_cost: limited(body.cost_summary, 1000) || null,
        p_conditions: limited(body.main_conditions, 4000) || null,
        p_reference: reference || null
      });
      return json(res, 201, { ok: true, id }, headers);
    }
  }

  // ------------------------------------------------------ transições e painel
  if (resource === 'transition' && req.method === 'POST') {
    const body = await readBody(req);
    const kind = clean(body.kind);
    const status = clean(body.status);
    const from = clean(body.from);
    if (!['rfq', 'contract'].includes(kind)) throw new HttpError(400, 'Transição inválida.', 'invalid_transition');
    // O par (estado atual, estado alvo) tem de existir na máquina declarada.
    // O banco repete a checagem, então uma corrida entre duas abas não
    // consegue atravessar um estado.
    if (!canTransition(kind, from, status)) {
      throw new HttpError(409, 'Transição não permitida a partir do estado atual.', 'invalid_transition');
    }
    await rpc(token, 'fin_transition', { p_kind: kind, p_id: requireUuid(body.id, 'id'), p_status: status });
    return json(res, 200, { ok: true }, headers);
  }

  if (resource === 'dashboard' && req.method === 'GET') {
    const organization = await memberOrganization(token, query(req).get('organization_id'));
    const [rfqs, contracts, decisions, providers] = await Promise.all([
      rest(token, `fin_rfqs?select=id,product,status,demand,created_at&organization_id=eq.${organization.id}&limit=200`),
      rest(token, `fin_contracts?select=id,product,status,starts_on,ends_on,renewal_notice_days&organization_id=eq.${organization.id}&limit=200`),
      rest(token, `fin_decisions?select=id,decided_at&organization_id=eq.${organization.id}&limit=200`),
      rest(token, `fin_providers?select=id,status&organization_id=eq.${organization.id}&limit=200`)
    ]);
    return json(res, 200, { ok: true, summary: summarize({ rfqs, contracts, decisions, providers }) }, headers);
  }

  if (resource === 'events' && req.method === 'GET') {
    const organization = await memberOrganization(token, query(req).get('organization_id'));
    const rows = await rest(token, `fin_events?select=id,entity_type,entity_id,event_type,happened_at,metadata&organization_id=eq.${organization.id}&order=happened_at.desc&limit=100`);
    return json(res, 200, { ok: true, rows }, headers);
  }

  throw new HttpError(404, 'Recurso financeiro não encontrado.', 'finance_route_not_found');
}

/** Janela em que a empresa precisa decidir sobre renovação ou repricing. */
export function withRenewalWindow(contract) {
  const ends = Date.parse(`${contract.ends_on}T00:00:00Z`);
  if (!Number.isFinite(ends)) return { ...contract, review_from: null, days_to_end: null };
  const notice = Number(contract.renewal_notice_days ?? 0);
  const reviewFrom = new Date(ends - notice * 86400000).toISOString().slice(0, 10);
  const days = Math.round((ends - Date.now()) / 86400000);
  return { ...contract, review_from: reviewFrom, days_to_end: days };
}

/**
 * Números do painel. Todos são contagens ou somas de valores efetivamente
 * declarados. Nenhuma "economia gerada" é estimada: sem metodologia explícita,
 * o campo simplesmente não existe.
 */
export function summarize({ rfqs = [], contracts = [], decisions = [], providers = [] }) {
  const open = rfqs.filter((row) => ['open', 'collecting'].includes(row.status));
  const comparing = rfqs.filter((row) => row.status === 'comparing');
  const activeContracts = contracts.filter((row) => ['active', 'renewing'].includes(row.status)).map(withRenewalWindow);
  const today = new Date().toISOString().slice(0, 10);
  const requestedCredit = rfqs
    .filter((row) => row.product === 'credit')
    .reduce((total, row) => total + (Number(safeObject(row.demand).amount) || 0), 0);
  return {
    rfqs_open: open.length,
    rfqs_comparing: comparing.length,
    rfqs_total: rfqs.length,
    decisions_total: decisions.length,
    contracts_active: activeContracts.length,
    contracts_expiring: activeContracts.filter((row) => row.review_from && row.review_from <= today).length,
    repricing_opportunities: activeContracts.filter((row) => row.product === 'acquiring' && row.review_from && row.review_from <= today).length,
    providers_active: providers.filter((row) => row.status === 'active').length,
    requested_credit_amount: Math.round(requestedCredit * 100) / 100,
    savings: null,
    savings_note: 'Economia só é exibida quando houver metodologia explícita e dados comparáveis; nesta fase o Arandu não estima economia.'
  };
}
