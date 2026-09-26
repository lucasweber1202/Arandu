import { HttpError, json, readBody, clean, limited, safeObject } from '../../api-core.mjs';
import { userSupabaseRequest } from '../../supabase.mjs';
import { PRODUCT_IDS, PRODUCTS, normalizeDemand, normalizeProposal, normalize, demandFields, proposalFields } from '../../finance/products.mjs';
import { validateCnpj } from '../../finance/cnpj.mjs';
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
const DOCUMENT_ENTITIES = ['rfq', 'proposal', 'contract', 'profile', 'provider'];
const CLIENT_EVENTS = [
  'invite_opened', 'proposal_started', 'comparison_viewed', 'weights_applied',
  'onboarding_step_completed', 'export_generated'
];

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
  return upstream(userSupabaseRequest(token, `rpc/${name}`, { method: 'POST', body }));
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

/**
 * Traduz as exceções nomeadas das funções do banco em mensagens que ajudam
 * quem está usando o portal.
 *
 * Sem isto, o roteador redige tudo para "Operação inválida ou sem permissão." —
 * seguro, mas inútil para quem só quer saber que o convite expirou. O que NÃO
 * atravessa daqui é qualquer coisa que não esteja nesta tabela: mensagem de
 * Postgres, nome de tabela, constraint ou a existência de registro alheio.
 */
const UPSTREAM_MESSAGES = [
  [/invalid invitation/i, 409, 'Este convite não é válido: ele pode ter expirado, já ter sido usado ou ter sido revogado.', 'invite_invalid'],
  [/provider organization required/i, 400, 'Para aceitar um convite é preciso estar em uma organização do tipo provedor.', 'provider_org_required'],
  [/rfq is not receiving proposals/i, 409, 'Esta solicitação não está mais recebendo propostas.', 'rfq_closed'],
  [/invalid parent/i, 400, 'Só é possível responder a um comentário de primeiro nível que você consegue ler.', 'invalid_parent'],
  [/invalid mention/i, 400, 'Mencione somente membros desta organização.', 'invalid_mention'],
  [/invalid visibility/i, 400, 'Escolha uma visibilidade permitida para este objeto.', 'invalid_visibility'],
  [/invalid comment/i, 400, 'Escreva texto simples sem HTML, entre 1 e 4.000 caracteres.', 'invalid_comment'],
  [/comment conflict/i, 409, 'Este comentário já foi registrado com outra autoria ou objeto.', 'comment_conflict'],
  [/rfq revision conflict/i, 409, 'A RFQ mudou em outra sessão. Recarregue a versão atual antes de publicar.', 'rfq_revision_conflict'],
  [/rfq draft conflict/i, 409, 'Esta solicitação foi alterada em outra aba. Recarregue o rascunho antes de salvar.', 'rfq_draft_conflict'],
  [/invalid editor draft/i, 400, 'Rascunho inválido. Confira os campos da solicitação.', 'invalid_editor_draft'],
  [/draft conflict/i, 409, 'Este rascunho mudou em outra aba ou a proposta foi enviada. Atualize a página antes de continuar.', 'draft_conflict'],
  [/approval pending/i, 409, 'Já há uma aprovação em andamento para esta RFQ.', 'approval_pending'],
  [/approval required or stale|approval stale/i, 409, 'A aprovação está pendente ou ficou desatualizada após uma alteração. Solicite uma nova aprovação.', 'approval_stale'],
  [/approval not pending/i, 409, 'Esta aprovação já foi concluída.', 'approval_closed'],
  [/invalid approver|duplicate approver/i, 400, 'Escolha membros distintos desta organização, diferentes do solicitante.', 'invalid_approver'],
  [/approval comment required/i, 400, 'Informe um motivo ao rejeitar ou solicitar alterações.', 'comment_required'],
  [/decision already recorded/i, 409, 'Esta solicitação já tem uma decisão registrada.', 'decision_exists'],
  [/contract already registered/i, 409, 'Esta decisão já gerou um contrato.', 'contract_exists'],
  [/proposal not eligible/i, 409, 'Esta proposta não pode ser escolhida: ela precisa estar enviada e pertencer a esta solicitação.', 'proposal_not_eligible'],
  [/decided proposal/i, 409, 'Esta proposta não pode ser retirada porque já foi escolhida em uma decisão.', 'proposal_decided'],
  [/invalid transition/i, 409, 'Esta mudança de estado não é permitida a partir do estado atual.', 'invalid_transition'],
  [/invalid state/i, 409, 'A operação não é permitida no estado atual desta solicitação.', 'invalid_state'],
  [/invalid tax identifier/i, 400, 'O CNPJ informado não está em um formato aceito.', 'invalid_cnpj'],
  [/invalid revenue band/i, 400, 'A faixa de faturamento informada não é uma das opções aceitas.', 'invalid_revenue_band'],
  [/evidence url must use https/i, 400, 'A evidência regulatória precisa de um endereço https.', 'invalid_evidence_url'],
  [/authority and registry are required/i, 400, 'Informe a autoridade e o número de registro da evidência.', 'evidence_incomplete'],
  [/invalid check date/i, 400, 'A data de consulta da evidência não pode estar no futuro.', 'invalid_check_date'],
  [/invalid email/i, 400, 'Informe um e-mail válido para o convite.', 'invalid_email'],
  [/invalid role/i, 400, 'O papel informado não é um dos papéis aceitos.', 'invalid_role'],
  [/provider not found/i, 404, 'Provedor não encontrado nesta organização.', 'provider_not_found'],
  [/forbidden/i, 403, 'Sua conta não tem permissão para esta operação nesta organização.', 'forbidden']
];

async function upstream(promise) {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const raw = String(error?.details?.message || error?.message || '');
    for (const [pattern, status, message, code] of UPSTREAM_MESSAGES) {
      if (pattern.test(raw)) throw new HttpError(status, message, code);
    }
    throw error;
  }
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
 * Propostas com a versão corrente resolvida, para uma ou várias RFQs.
 *
 * O número de consultas é fixo (propostas, versões, provedores) mesmo com
 * dezenas de RFQs: a versão anterior fazia uma rodada por RFQ, e o portal
 * fazia uma chamada de API por RFQ em cima disso.
 *
 * O que a empresa compara é sempre a última versão enviada; as anteriores
 * continuam no histórico e não são sobrescritas.
 */
async function loadProposalsWithTerms(token, rfqIds) {
  const ids = (Array.isArray(rfqIds) ? rfqIds : [rfqIds]).filter(Boolean);
  if (!ids.length) return [];
  const proposals = await rest(token, `fin_proposals?select=id,rfq_id,provider_id,provider_organization_id,status,current_version,updated_at&rfq_id=in.(${ids.join(',')})&order=created_at.asc&limit=500`);
  const active = (proposals || []).filter((row) => row.current_version > 0 && row.status !== 'withdrawn');
  if (!active.length) return [];
  const providerIds = [...new Set(active.map((row) => row.provider_id))];
  const [versions, providers] = await Promise.all([
    rest(token, `fin_proposal_versions?select=proposal_id,version,terms,submitted_at,note,rfq_revision&proposal_id=in.(${active.map((row) => row.id).join(',')})&order=version.desc&limit=2000`),
    rest(token, `fin_providers?select=id,name,kind,verification_state&id=in.(${providerIds.join(',')})&limit=500`)
  ]);
  const providerById = new Map((providers || []).map((row) => [row.id, row]));
  const currentByProposal = new Map();
  for (const version of versions || []) {
    const proposal = active.find((row) => row.id === version.proposal_id);
    if (proposal && version.version === proposal.current_version) currentByProposal.set(version.proposal_id, version);
  }
  return active.map((proposal) => {
    const version = currentByProposal.get(proposal.id);
    const provider = providerById.get(proposal.provider_id);
    return {
      id: proposal.id,
      rfq_id: proposal.rfq_id,
      provider_id: proposal.provider_id,
      provider_name: provider?.name || 'Provedor',
      provider_kind: provider?.kind || null,
      provider_verification: provider?.verification_state || 'NAO_VERIFICADO',
      status: proposal.status,
      version: proposal.current_version,
      versions_count: (versions || []).filter((row) => row.proposal_id === proposal.id).length,
      submitted_at: version?.submitted_at || null,
      note: version?.note || null,
      rfq_revision: version?.rfq_revision ?? null,
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
    if (req.method === 'PATCH') {
      // Completar o cadastro depois de criado: sem isto a organização nascia
      // só com a razão social e o onboarding não tinha como terminar.
      const body = await readBody(req);
      const organization = await memberOrganization(token, body.organization_id);
      let cnpj = null;
      if (clean(body.tax_identifier)) {
        const check = validateCnpj(body.tax_identifier);
        // Dígitos conferidos aqui; existência, não. A resposta diz as duas coisas.
        if (!check.format_valid) throw new HttpError(400, check.reason, 'invalid_cnpj');
        cnpj = check.digits;
      }
      const band = clean(body.revenue_band);
      if (band && !['ate_360k', '360k_4_8m', '4_8m_30m', '30m_300m', 'acima_300m'].includes(band)) {
        throw new HttpError(400, 'Faixa de faturamento inválida.', 'invalid_revenue_band');
      }
      await rpc(token, 'fin_update_organization', {
        p_org: organization.id,
        p_trade_name: limited(body.trade_name, 200) || null,
        p_tax_identifier: cnpj,
        p_sector: limited(body.sector, 120) || null,
        p_revenue_band: band || null
      });
      return json(res, 200, {
        ok: true,
        tax_identifier: cnpj ? { format_valid: true, externally_verified: false } : null
      }, headers);
    }
  }

  if (resource === 'members' && req.method === 'GET') {
    const organization = await memberOrganization(token, query(req).get('organization_id'), ['BUYER']);
    const rows = await rest(token, `fin_members?select=user_id,role,created_at&organization_id=eq.${organization.id}&order=created_at.asc&limit=100`);
    return json(res, 200, { ok: true, rows, viewer_id: session.user.id }, headers);
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

  if (resource === 'providers' && sub === 'evidence' && req.method === 'POST') {
    const body = await readBody(req);
    const evidenceUrl = clean(body.regulator_evidence_url);
    if (!/^https:\/\//.test(evidenceUrl)) throw new HttpError(400, 'A evidência regulatória precisa de um endereço https.', 'invalid_evidence_url');
    const checkedAt = clean(body.regulator_checked_at);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(checkedAt)) throw new HttpError(400, 'Informe a data de consulta no formato AAAA-MM-DD.', 'invalid_check_date');
    await rpc(token, 'fin_record_provider_evidence', {
      p_provider: requireUuid(body.provider_id, 'provider_id'),
      p_authority: limited(body.regulator_authority, 200),
      p_registry: limited(body.regulator_registry, 120),
      p_evidence_url: evidenceUrl,
      p_checked_at: checkedAt
    });
    // O estado diz que uma evidência foi registrada, com fonte e data. Ele não
    // diz que o provedor é regulado, aprovado, seguro ou recomendado.
    return json(res, 200, { ok: true, verification_state: 'EVIDENCIA_REGISTRADA' }, headers);
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
      const normalized = normalizeDemand(product, body.demand);
      const demand = rejectInvalid(normalized);
      const id = await rpc(token, 'fin_create_rfq', {
        p_org: organization.id, p_product: product, p_title: title,
        p_description: limited(body.description, 4000) || null,
        p_demand: demand, p_deadline: clean(body.response_deadline) || null
      });
      // Um mix que não fecha 100% não é erro fatal, mas some se não for dito.
      return json(res, 201, { ok: true, id, warnings: normalized.warnings }, headers);
    }
    if (req.method === 'PATCH') {
      const body = await readBody(req);
      const rfq = await loadRfq(token, body.rfq_id);
      const normalized = normalizeDemand(rfq.product, body.demand);
      const demand = rejectInvalid(normalized);
      const expectedRevision = Number(body.expected_revision);
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new HttpError(400, 'Informe a revisão atual da RFQ.', 'invalid_revision');
      const revision = await rpc(token, 'fin_revise_rfq', {
        p_rfq: rfq.id, p_expected: expectedRevision, p_title: limited(body.title, 200) || rfq.title,
        p_description: limited(body.description, 4000) || null,
        p_demand: demand, p_deadline: clean(body.response_deadline) || null
      });
      return json(res, 200, { ok: true, revision, warnings: normalized.warnings }, headers);
    }
  }

  if (resource === 'rfq' && sub && req.method === 'GET') {
    const rfq = await loadRfq(token, sub);
    const [invites, proposals] = await Promise.all([
      rest(token, `fin_rfq_invites?select=id,provider_id,provider_organization_id,status,expires_at,accepted_at,created_at&rfq_id=eq.${rfq.id}&order=created_at.asc&limit=100`),
      loadProposalsWithTerms(token, [rfq.id])
    ]);
    return json(res, 200, {
      ok: true, rfq, invites, proposals,
      next_states: nextStates('rfq', rfq.status),
      notice: NEUTRAL_RANKING_NOTICE
    }, headers);
  }

  if (resource === 'rfq-revisions' && req.method === 'GET') {
    const organization = await memberOrganization(token, query(req).get('organization_id'));
    const rfqId = requireUuid(query(req).get('rfq_id'), 'rfq_id');
    const rows = await rest(token, `fin_rfq_revisions?select=revision,snapshot,changed_by,published_at&rfq_id=eq.${rfqId}&order=revision.desc&limit=20`);
    // The RLS policy allows an accepted provider to inspect only the RFQ
    // versions it can already see; buyer membership is not inferred from ID.
    return json(res, 200, { ok: true, rows }, headers);
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
        return json(res, 200, { ok: true, rows: await loadProposalsWithTerms(token, [rfq.id]) }, headers);
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

  if (resource === 'proposal-draft') {
    const proposalId = req.method === 'GET'
      ? requireUuid(query(req).get('proposal_id'), 'proposal_id')
      : null;
    if (req.method === 'GET') {
      const proposals = await rest(token, `fin_proposals?select=id,provider_organization_id,current_version&id=eq.${proposalId}&limit=1`);
      const proposal = proposals?.[0];
      if (!proposal) throw new HttpError(404, 'Proposta não encontrada.', 'proposal_not_found');
      await memberOrganization(token, proposal.provider_organization_id, ['PROVIDER']);
      const rows = await rest(token, `fin_proposal_drafts?select=proposal_id,base_version,revision,terms,updated_at&proposal_id=eq.${proposalId}&limit=1`);
      const draft = rows?.[0];
      return json(res, 200, { ok: true, draft: draft?.base_version === proposal.current_version ? draft : null }, headers);
    }
    if (req.method === 'PATCH') {
      const body = await readBody(req);
      const id = requireUuid(body.proposal_id, 'proposal_id');
      const proposals = await rest(token, `fin_proposals?select=id,product,provider_organization_id&id=eq.${id}&limit=1`);
      const proposal = proposals?.[0];
      if (!proposal) throw new HttpError(404, 'Proposta não encontrada.', 'proposal_not_found');
      const terms = rejectInvalid(normalize(proposalFields(proposal.product).map((field) => ({ ...field, required: false })), body.terms));
      const expected = Number(body.expected_revision);
      const base = Number(body.base_version);
      if (!Number.isSafeInteger(expected) || expected < 0 || !Number.isSafeInteger(base) || base < 0) {
        throw new HttpError(400, 'Versão do rascunho inválida.', 'invalid_revision');
      }
      const revision = await rpc(token, 'fin_save_proposal_draft', {
        p_proposal: id, p_terms: terms, p_expected_revision: expected, p_base_version: base
      });
      return json(res, 200, { ok: true, revision }, headers);
    }
  }

  if (resource === 'rfq-editor') {
    if (req.method === 'GET') {
      const organization = await memberOrganization(token, query(req).get('organization_id'), ['BUYER']);
      const rows = await rest(token, `fin_rfq_editor_drafts?select=payload,revision,updated_at&organization_id=eq.${organization.id}&user_id=eq.${session.user.id}&limit=1`);
      return json(res, 200, { ok: true, draft: rows?.[0] ?? null }, headers);
    }
    if (req.method === 'PATCH') {
      const body = await readBody(req);
      const organization = await memberOrganization(token, body.organization_id, ['BUYER']);
      const product = requireProduct(body.product);
      const expected = Number(body.expected_revision);
      if (!Number.isSafeInteger(expected) || expected < 0) throw new HttpError(400, 'Revisão inválida.', 'invalid_revision');
      const demand = rejectInvalid(normalize(demandFields(product).map((field) => ({ ...field, required: false })), body.demand));
      const payload = {
        product, title: limited(body.title, 200),
        response_deadline: clean(body.response_deadline) || null, demand
      };
      const rows = await rpc(token, 'fin_save_rfq_editor', { p_org: organization.id, p_payload: payload, p_expected: expected });
      return json(res, 200, { ok: true, revision: rows?.[0]?.revision, updated_at: rows?.[0]?.updated_at }, headers);
    }
    if (req.method === 'DELETE') {
      const body = await readBody(req);
      const organization = await memberOrganization(token, body.organization_id, ['BUYER']);
      await rpc(token, 'fin_clear_rfq_editor', { p_org: organization.id, p_expected: Number(body.expected_revision) });
      return json(res, 200, { ok: true }, headers);
    }
  }

  // -------------------------------------------------------------- comparação
  if (resource === 'comparison' && req.method === 'POST') {
    const body = await readBody(req);
    const rfq = await loadRfq(token, body.rfq_id);
    // A comparação é da empresa compradora. O RLS já devolveria ao provedor
    // apenas a própria proposta, mas a rota é fechada aqui também: o provedor
    // não tem por que ver a tela de comparação nem os pesos do comprador.
    await memberOrganization(token, rfq.organization_id, ['BUYER']);
    const proposals = await loadProposalsWithTerms(token, [rfq.id]);
    const comparison = buildComparison(rfq.product, proposals, safeObject(rfq.demand));
    // A ponderação só existe quando a própria empresa envia pesos. Sem pesos,
    // a resposta é estritamente factual — o Arandu não ordena por conta própria.
    const weighted = body.weights && Object.keys(safeObject(body.weights)).length
      ? applyUserWeights(rfq.product, proposals, safeObject(body.weights))
      : { applied: false, notice: NEUTRAL_RANKING_NOTICE, criteria: [], results: [] };
    return json(res, 200, { ok: true, comparison, weighted, criteria: comparableFields(rfq.product) }, headers);
  }

  if (resource === 'approval-policy') {
    if (req.method === 'GET') {
      const organization = await memberOrganization(token, query(req).get('organization_id'), ['BUYER']);
      const rows = await rest(token, `fin_approval_policies?select=required_for_decision,updated_at,updated_by&organization_id=eq.${organization.id}&limit=1`);
      return json(res, 200, { ok: true, required_for_decision: rows?.[0]?.required_for_decision ?? false,
        updated_at: rows?.[0]?.updated_at ?? null }, headers);
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const organization = await memberOrganization(token, body.organization_id, ['BUYER']);
      if (typeof body.required_for_decision !== 'boolean') throw new HttpError(400, 'Política inválida.', 'invalid_policy');
      await rpc(token, 'fin_set_approval_policy', { p_org: organization.id, p_required: body.required_for_decision });
      return json(res, 200, { ok: true }, headers);
    }
  }

  // Approval requests are the only path for assigned members to vote. SQL RPCs
  // serialize on the RFQ and recheck proposal version and request ownership.
  if (resource === 'approvals') {
    if (req.method === 'GET') {
      const organization = await memberOrganization(token, query(req).get('organization_id'), ['BUYER']);
      const rfqId = query(req).get('rfq_id');
      const filter = rfqId ? `&rfq_id=eq.${requireUuid(rfqId, 'rfq_id')}` : '';
      const requests = await rest(token, `fin_approval_requests?select=id,organization_id,rfq_id,proposal_id,proposal_version,requested_by,requested_at,status,rationale,resolved_at,snapshot&organization_id=eq.${organization.id}${filter}&order=requested_at.desc&limit=100`);
      const ids = (requests || []).map((row) => row.id);
      const steps = ids.length ? await rest(token, `fin_approval_steps?select=id,request_id,position,approver_id,status,comment,acted_at&request_id=in.(${ids.join(',')})&order=position.asc&limit=500`) : [];
      return json(res, 200, { ok: true, rows: (requests || []).map((row) => ({
        ...row, steps: (steps || []).filter((step) => step.request_id === row.id)
      })) }, headers);
    }
    if (req.method === 'POST' && sub === 'request') {
      const body = await readBody(req);
      const approvers = Array.isArray(body.approver_ids) ? body.approver_ids : [];
      if (approvers.length < 1 || approvers.length > 5) throw new HttpError(400, 'Escolha de um a cinco aprovadores.', 'invalid_approvers');
      const id = await rpc(token, 'fin_request_approval', {
        p_rfq: requireUuid(body.rfq_id, 'rfq_id'),
        p_proposal: requireUuid(body.proposal_id, 'proposal_id'),
        p_approvers: approvers.map((value) => requireUuid(value, 'approver_id')),
        p_rationale: limited(body.rationale, 4000)
      });
      return json(res, 201, { ok: true, id }, headers);
    }
    if (req.method === 'POST' && sub === 'act') {
      const body = await readBody(req);
      const action = clean(body.action);
      if (!['approved', 'rejected', 'changes_requested'].includes(action)) throw new HttpError(400, 'Ação de aprovação inválida.', 'invalid_action');
      const status = await rpc(token, 'fin_act_on_approval', {
        p_request: requireUuid(body.request_id, 'request_id'), p_action: action,
        p_comment: limited(body.comment, 2000) || null
      });
      return json(res, 200, { ok: true, status }, headers);
    }
    if (req.method === 'POST' && sub === 'cancel') {
      const body = await readBody(req);
      await rpc(token, 'fin_cancel_approval', { p_request: requireUuid(body.request_id, 'request_id') });
      return json(res, 200, { ok: true }, headers);
    }
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

  // Search is evaluated inside a tenant-authorized SQL function. The response
  // contains navigation metadata only; never terms, notes or other tenants.
  if (resource === 'search' && req.method === 'GET') {
    const organization = await memberOrganization(token, query(req).get('organization_id'), ['BUYER']);
    const term = clean(query(req).get('q'));
    const kind = clean(query(req).get('type')) || null;
    const offset = Number(query(req).get('offset') || 0);
    if (term.length < 2 || term.length > 100 || !Number.isInteger(offset) || offset < 0 || offset > 1000
      || (kind && !['rfq','proposal','provider','contract','task'].includes(kind))) {
      throw new HttpError(400, 'Informe uma busca de 2 a 100 caracteres e um filtro válido.', 'invalid_search');
    }
    const rows = await rpc(token, 'fin_search', { p_org: organization.id, p_query: term, p_kind: kind, p_limit: 21, p_offset: offset });
    return json(res, 200, { ok: true, rows: (rows || []).slice(0,20), has_more: (rows || []).length > 20 }, headers);
  }

  if (resource === 'renewals' && req.method === 'POST') {
    const body = await readBody(req);
    const organization = await memberOrganization(token, body.organization_id, ['BUYER']);
    const count = await rpc(token, 'fin_process_renewals', { p_org: organization.id });
    return json(res, 200, { ok: true, tasks_created: count }, headers);
  }
  if (resource === 'contract-renewal-rfq' && req.method === 'POST') {
    const body = await readBody(req);
    const organization = await memberOrganization(token, body.organization_id, ['BUYER']);
    const contractId = requireUuid(body.contract_id, 'contract_id');
    const existing = await rest(token, `fin_contracts?select=id&organization_id=eq.${organization.id}&id=eq.${contractId}&limit=1`);
    if (!existing?.length) throw new HttpError(404, 'Contrato não encontrado.', 'not_found');
    const id = await rpc(token, 'fin_start_contract_rfq', { p_contract: contractId });
    return json(res, 201, { ok: true, id }, headers);
  }

  // Contextual collaboration: object ownership, provider visibility and actor
  // identity are rechecked by the SQL RPC, never accepted from the body.
  if (resource === 'comments') {
    if (req.method === 'GET') {
      const organization = await memberOrganization(token, query(req).get('organization_id'));
      const objectType = clean(query(req).get('object_type'));
      if (!['rfq','proposal','approval','decision','contract','task'].includes(objectType)) throw new HttpError(400, 'Objeto inválido.', 'invalid_object');
      const objectId = requireUuid(query(req).get('object_id'), 'object_id');
      const offset = Number(query(req).get('offset') || 0);
      if (!Number.isInteger(offset) || offset < 0 || offset > 1000) throw new HttpError(400, 'Página inválida.', 'invalid_page');
      const filter = organization.kind === 'BUYER' ? `&organization_id=eq.${organization.id}` : '';
      const rows = await rest(token, `fin_comments?select=id,organization_id,object_type,object_id,author_id,visibility,body,created_at,parent_id&object_type=eq.${objectType}&object_id=eq.${objectId}${filter}&order=created_at.desc&limit=50&offset=${offset}`);
      return json(res, 200, { ok: true, rows, has_more: (rows || []).length === 50 }, headers);
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      await memberOrganization(token, body.organization_id);
      const mentionIds = Array.isArray(body.mention_ids) ? body.mention_ids.slice(0, 11).map((value) => requireUuid(value, 'mention_id')) : [];
      // Resposta: objeto e visibilidade vêm do comentário pai, no banco — nunca do corpo.
      if (clean(body.parent_id)) {
        const id = await rpc(token, 'fin_reply_comment', {
          p_parent: requireUuid(body.parent_id, 'parent_id'), p_body: limited(body.body, 4000),
          p_mention_ids: mentionIds, p_client_id: requireUuid(body.client_id, 'client_id')
        });
        return json(res, 201, { ok: true, id }, headers);
      }
      const id = await rpc(token, 'fin_add_comment', {
        p_type: clean(body.object_type), p_id: requireUuid(body.object_id, 'object_id'),
        p_visibility: clean(body.visibility), p_body: limited(body.body, 4000),
        p_mention_ids: mentionIds,
        p_client_id: requireUuid(body.client_id, 'client_id')
      });
      return json(res, 201, { ok: true, id }, headers);
    }
  }

  if (resource === 'notifications') {
    if (req.method === 'GET') {
      const organization = await memberOrganization(token, query(req).get('organization_id'));
      const offset = Number(query(req).get('offset') || 0);
      if (!Number.isInteger(offset) || offset < 0 || offset > 1000) throw new HttpError(400, 'Página inválida.', 'invalid_page');
      const rows = await rest(token, `fin_notifications?select=id,event_type,object_type,object_id,title,body,created_at,read_at&organization_id=eq.${organization.id}&user_id=eq.${session.user.id}&order=created_at.desc&limit=50&offset=${offset}`);
      return json(res, 200, { ok: true, rows, has_more: (rows || []).length === 50 }, headers);
    }
    if (req.method === 'PATCH') {
      const body = await readBody(req);
      const organization = await memberOrganization(token, body.organization_id);
      const ids = body.ids == null ? null : Array.isArray(body.ids) ? body.ids.map((value) => requireUuid(value, 'notification_id')) : [];
      const count = await rpc(token, 'fin_mark_notifications', { p_org: organization.id, p_ids: ids });
      return json(res, 200, { ok: true, count }, headers);
    }
  }

  if (resource === 'notification-preferences') {
    if (req.method === 'GET') {
      const organization = await memberOrganization(token, query(req).get('organization_id'));
      const rows = await rest(token, `fin_notification_preferences?select=event_type,in_app,email&organization_id=eq.${organization.id}&user_id=eq.${session.user.id}&limit=30`);
      return json(res, 200, { ok: true, rows }, headers);
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const organization = await memberOrganization(token, body.organization_id);
      if (typeof body.in_app !== 'boolean' || typeof body.email !== 'boolean') throw new HttpError(400, 'Preferência inválida.', 'invalid_preference');
      await rpc(token, 'fin_set_notification_preference', {
        p_org: organization.id, p_event: clean(body.event_type),
        p_in_app: body.in_app, p_email: body.email
      });
      return json(res, 200, { ok: true }, headers);
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

  // Uma chamada para montar o portal da empresa inteiro. Antes o navegador
  // fazia 4 chamadas mais uma por RFQ; com 40 RFQs eram 44 requisições em
  // série só para abrir o painel.
  if (resource === 'overview' && req.method === 'GET') {
    const organization = await memberOrganization(token, query(req).get('organization_id'));
    const org = organization.id;
    const [rfqs, providers, contracts, profile, tasks, terms] = await Promise.all([
      rest(token, `fin_rfqs?select=*&organization_id=eq.${org}&order=created_at.desc&limit=200`),
      rest(token, `fin_providers?select=*&organization_id=eq.${org}&order=name.asc&limit=200`),
      rest(token, `fin_contracts?select=*&organization_id=eq.${org}&order=ends_on.asc&limit=200`),
      rest(token, `fin_company_profiles?select=id,field_key,field_value,source,status,valid_until,updated_at&organization_id=eq.${org}&order=field_key.asc&limit=200`),
      rest(token, `fin_tasks?select=id,title,due_on,status,related_type,related_id&organization_id=eq.${org}&status=eq.open&order=due_on.asc.nullslast&limit=100`),
      rest(token, `fin_terms_acceptances?select=terms_version,context,accepted_at&organization_id=eq.${org}&order=accepted_at.desc&limit=10`)
    ]);
    const proposals = await loadProposalsWithTerms(token, (rfqs || []).map((row) => row.id));
    const byRfq = new Map();
    for (const proposal of proposals) {
      if (!byRfq.has(proposal.rfq_id)) byRfq.set(proposal.rfq_id, []);
      byRfq.get(proposal.rfq_id).push(proposal);
    }
    const decorated = (rfqs || []).map((rfq) => ({
      ...rfq,
      proposals: byRfq.get(rfq.id) || [],
      next_states: nextStates('rfq', rfq.status)
    }));
    return json(res, 200, {
      ok: true,
      organization,
      rfqs: decorated,
      providers: providers || [],
      contracts: (contracts || []).map(withRenewalWindow),
      profile: profile || [],
      tasks: tasks || [],
      terms: terms || [],
      summary: summarize({ rfqs: decorated, contracts: contracts || [], providers: providers || [], proposals })
    }, headers);
  }

  // Visão do provedor: RFQs atribuídas com a própria proposta resolvida, em um
  // número fixo de consultas.
  if (resource === 'assignments' && req.method === 'GET') {
    const organization = await memberOrganization(token, query(req).get('organization_id'), ['PROVIDER']);
    const proposals = await rest(token, `fin_proposals?select=id,rfq_id,product,status,current_version,updated_at&provider_organization_id=eq.${organization.id}&order=updated_at.desc&limit=200`);
    if (!proposals?.length) return json(res, 200, { ok: true, rows: [] }, headers);
    const [rfqs, versions] = await Promise.all([
      rest(token, `fin_rfqs?select=id,title,description,product,status,response_deadline,demand,revision&id=in.(${[...new Set(proposals.map((row) => row.rfq_id))].join(',')})&limit=200`),
      rest(token, `fin_proposal_versions?select=proposal_id,version,terms,submitted_at,note,rfq_revision&proposal_id=in.(${proposals.map((row) => row.id).join(',')})&order=version.desc&limit=1000`)
    ]);
    const rfqById = new Map((rfqs || []).map((row) => [row.id, row]));
    const rows = proposals.map((proposal) => {
      const rfq = rfqById.get(proposal.rfq_id);
      const history = (versions || []).filter((row) => row.proposal_id === proposal.id);
      return {
        proposal_id: proposal.id,
        rfq_id: proposal.rfq_id,
        product: proposal.product,
        status: proposal.status,
        version: proposal.current_version,
        title: rfq?.title || 'Solicitação',
        description: rfq?.description || null,
        rfq_status: rfq?.status || null,
        rfq_revision: rfq?.revision || 1,
        // Revisão que o provedor efetivamente viu ao enviar; null enquanto não houver envio.
        submitted_rfq_revision: history.find((row) => row.version === proposal.current_version)?.rfq_revision ?? null,
        response_deadline: rfq?.response_deadline || null,
        // O provedor precisa entender a necessidade para responder. O que ele
        // não recebe, aqui nem em lugar nenhum, é proposta de concorrente,
        // nota interna do comprador ou a comparação.
        demand: safeObject(rfq?.demand),
        terms: safeObject(history.find((row) => row.version === proposal.current_version)?.terms),
        history: history.map(({ version, submitted_at, note, rfq_revision }) => ({ version, submitted_at, note, rfq_revision }))
      };
    });
    return json(res, 200, { ok: true, rows }, headers);
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

  // Documentos são REFERÊNCIA (https), não upload. A decisão está registrada em
  // docs/FINANCIAL_MVP_RUNBOOK.md: upload seguro exige storage, assinatura,
  // política de acesso e retenção, e não improvisamos isso.
  if (resource === 'documents') {
    if (req.method === 'GET') {
      const organization = await memberOrganization(token, query(req).get('organization_id'));
      const entityType = clean(query(req).get('entity_type'));
      const entityId = clean(query(req).get('entity_id'));
      let filter = `organization_id=eq.${organization.id}`;
      if (entityType) {
        if (!DOCUMENT_ENTITIES.includes(entityType)) throw new HttpError(400, 'Tipo de entidade inválido.', 'invalid_entity_type');
        filter += `&entity_type=eq.${entityType}`;
      }
      if (entityId) filter += `&entity_id=eq.${requireUuid(entityId, 'entity_id')}`;
      const rows = await rest(token, `fin_documents?select=id,entity_type,entity_id,title,reference_url,note,created_at&${filter}&order=created_at.desc&limit=200`);
      return json(res, 200, { ok: true, rows, upload_supported: false }, headers);
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const organization = await memberOrganization(token, body.organization_id, ['BUYER']);
      const entityType = clean(body.entity_type);
      if (!DOCUMENT_ENTITIES.includes(entityType)) throw new HttpError(400, 'Tipo de entidade inválido.', 'invalid_entity_type');
      const referenceUrl = clean(body.reference_url);
      if (!/^https:\/\//.test(referenceUrl)) throw new HttpError(400, 'A referência documental precisa usar https.', 'invalid_reference');
      const title = limited(body.title, 200);
      if (title.length < 2) throw new HttpError(400, 'Informe um título para o documento.', 'invalid_title');
      const rows = await upstream(userSupabaseRequest(token, 'fin_documents', {
        method: 'POST',
        body: {
          organization_id: organization.id, entity_type: entityType,
          entity_id: requireUuid(body.entity_id, 'entity_id'),
          title, reference_url: referenceUrl, note: limited(body.note, 1000) || null,
          created_by: session.user.id
        }
      }));
      return json(res, 201, { ok: true, row: rows?.[0] ?? null }, headers);
    }
  }

  if (resource === 'tasks') {
    if (req.method === 'GET') {
      const organization = await memberOrganization(token, query(req).get('organization_id'));
      const rows = await rest(token, `fin_tasks?select=id,title,due_on,status,related_type,related_id,created_at&organization_id=eq.${organization.id}&order=due_on.asc.nullslast&limit=200`);
      return json(res, 200, { ok: true, rows }, headers);
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const organization = await memberOrganization(token, body.organization_id, ['BUYER']);
      const title = limited(body.title, 200);
      if (title.length < 2) throw new HttpError(400, 'Informe um título para a tarefa.', 'invalid_title');
      const dueOn = clean(body.due_on);
      if (dueOn && !/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) throw new HttpError(400, 'Data da tarefa inválida.', 'invalid_due_on');
      const rows = await upstream(userSupabaseRequest(token, 'fin_tasks', {
        method: 'POST',
        body: {
          organization_id: organization.id, title, due_on: dueOn || null,
          related_type: ['rfq', 'proposal', 'contract'].includes(clean(body.related_type)) ? clean(body.related_type) : null,
          related_id: clean(body.related_id) ? requireUuid(body.related_id, 'related_id') : null,
          created_by: session.user.id
        }
      }));
      return json(res, 201, { ok: true, row: rows?.[0] ?? null }, headers);
    }
    if (req.method === 'PATCH') {
      const body = await readBody(req);
      const organization = await memberOrganization(token, body.organization_id, ['BUYER']);
      const status = clean(body.status);
      if (!['open', 'done', 'cancelled'].includes(status)) throw new HttpError(400, 'Estado de tarefa inválido.', 'invalid_task_status');
      await upstream(userSupabaseRequest(token, `fin_tasks?id=eq.${requireUuid(body.task_id, 'task_id')}&organization_id=eq.${organization.id}`, {
        method: 'PATCH', body: { status }
      }));
      return json(res, 200, { ok: true }, headers);
    }
  }

  // Aceite de termos: registra versão, quem e quando. O CONTEÚDO dos termos
  // não vive aqui e continua LEGAL_REVIEW_REQUIRED — o produto não finge que
  // existe aceite válido de um texto que ninguém revisou.
  if (resource === 'terms') {
    if (req.method === 'GET') {
      const organization = await memberOrganization(token, query(req).get('organization_id'));
      const rows = await rest(token, `fin_terms_acceptances?select=id,user_id,terms_version,context,accepted_at&organization_id=eq.${organization.id}&order=accepted_at.desc&limit=100`);
      return json(res, 200, { ok: true, rows, legal_review_required: true }, headers);
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const organization = await memberOrganization(token, body.organization_id);
      const version = clean(body.terms_version);
      if (!/^\d{4}-\d{2}-\d{2}(-[a-z0-9-]{1,40})?$/.test(version)) {
        throw new HttpError(400, 'Versão de termos inválida.', 'invalid_terms_version');
      }
      const context = clean(body.context) || 'pilot';
      if (!['pilot', 'production', 'test'].includes(context)) throw new HttpError(400, 'Contexto inválido.', 'invalid_context');
      await rpc(token, 'fin_accept_terms', { p_org: organization.id, p_version: version, p_context: context });
      return json(res, 201, { ok: true, terms_version: version, legal_review_required: true }, headers);
    }
  }

  // Sinais que só existem no navegador. Vocabulário fechado no banco; aqui
  // repetido para recusar antes de gastar uma ida ao Postgres.
  if (resource === 'signals' && req.method === 'POST') {
    const body = await readBody(req);
    const organization = await memberOrganization(token, body.organization_id);
    const event = clean(body.event);
    if (!CLIENT_EVENTS.includes(event)) throw new HttpError(400, 'Evento desconhecido.', 'unknown_event');
    const entityType = clean(body.entity_type);
    if (!['rfq', 'proposal', 'contract', 'organization', 'invite'].includes(entityType)) {
      throw new HttpError(400, 'Entidade desconhecida.', 'unknown_entity');
    }
    await rpc(token, 'fin_record_client_event', {
      p_org: organization.id, p_entity_type: entityType,
      p_entity_id: requireUuid(body.entity_id, 'entity_id'), p_event: event
    });
    return json(res, 202, { ok: true }, headers);
  }

  // Exportação factual do processo: o que foi pedido, o que foi ofertado, o que
  // foi decidido e quando. Sem recomendação, sem parecer, sem ranking.
  if (resource === 'export' && req.method === 'GET') {
    const rfq = await loadRfq(token, query(req).get('rfq_id'));
    await memberOrganization(token, rfq.organization_id, ['BUYER']);
    const [proposals, decisions] = await Promise.all([
      loadProposalsWithTerms(token, [rfq.id]),
      rest(token, `fin_decisions?select=id,rfq_id,proposal_id,decided_by,decided_at,criteria,rationale,snapshot&rfq_id=eq.${rfq.id}&limit=1`)
    ]);
    const decision = decisions?.[0] ?? null;
    return json(res, 200, {
      ok: true,
      export: {
        generated_at: new Date().toISOString(),
        notice: NEUTRAL_RANKING_NOTICE,
        rfq: {
          id: rfq.id, product: rfq.product, title: rfq.title, description: rfq.description,
          status: rfq.status, response_deadline: rfq.response_deadline,
          demand: safeObject(rfq.demand), created_at: rfq.created_at
        },
        proposals: proposals.map((proposal) => ({
          id: proposal.id, provider_name: proposal.provider_name, status: proposal.status,
          version: proposal.version, submitted_at: proposal.submitted_at, terms: proposal.terms
        })),
        decision: decision && {
          id: decision.id, proposal_id: decision.proposal_id, decided_at: decision.decided_at,
          criteria: safeObject(decision.criteria), rationale: decision.rationale,
          snapshot: safeObject(decision.snapshot)
        },
        disclaimer: 'Registro factual do processo. O Arandu não emite recomendação, parecer nem classificação de instituições.'
      }
    }, headers);
  }

  // Métricas operacionais do próprio piloto. Contagens do que aconteceu nesta
  // organização — não é benchmark de mercado e não compara com ninguém.
  if (resource === 'pilot-metrics' && req.method === 'GET') {
    const organization = await memberOrganization(token, query(req).get('organization_id'));
    const rows = await rest(token, `fin_events?select=entity_type,entity_id,event_type,happened_at&organization_id=eq.${organization.id}&order=happened_at.asc&limit=2000`);
    return json(res, 200, { ok: true, metrics: pilotMetrics(rows || []) }, headers);
  }

  if (resource === 'events' && req.method === 'GET') {
    const organization = await memberOrganization(token, query(req).get('organization_id'));
    const type = clean(query(req).get('entity_type'));
    const id = clean(query(req).get('entity_id'));
    const offset = Number(query(req).get('offset') || 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 1000) throw new HttpError(400, 'Página inválida.', 'invalid_page');
    if (type && !['rfq','proposal','approval','decision','contract','task'].includes(type)) throw new HttpError(400, 'Objeto inválido.', 'invalid_object');
    const filter = type && id ? `&entity_type=eq.${type}&entity_id=eq.${requireUuid(id,'entity_id')}` : '';
    const rows = await rest(token, `fin_events?select=id,entity_type,entity_id,event_type,happened_at,metadata&organization_id=eq.${organization.id}${filter}&order=happened_at.desc&limit=50&offset=${offset}`);
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
 * Métricas operacionais do piloto, derivadas só da trilha de eventos.
 *
 * Toda linha é contagem ou diferença de tempo entre dois eventos que
 * aconteceram. Quando não houve tráfego, o valor é `null` — "sem dados" — e
 * nunca zero disfarçado de medição.
 */
export function pilotMetrics(events) {
  const list = Array.isArray(events) ? events : [];
  const count = (type) => list.filter((row) => row.event_type === type).length;
  const firstByEntity = (type) => {
    const map = new Map();
    for (const row of list) {
      if (row.event_type !== type) continue;
      const at = Date.parse(row.happened_at);
      if (!Number.isFinite(at)) continue;
      if (!map.has(row.entity_id) || at < map.get(row.entity_id)) map.set(row.entity_id, at);
    }
    return map;
  };
  const created = firstByEntity('rfq_created');
  const firstProposal = new Map();
  for (const row of list) {
    if (row.event_type !== 'proposal_submitted') continue;
    const at = Date.parse(row.happened_at);
    if (!Number.isFinite(at)) continue;
    if (!firstProposal.has(row.entity_id) || at < firstProposal.get(row.entity_id)) firstProposal.set(row.entity_id, at);
  }
  // `proposal_submitted` é registrado sobre a proposta, não sobre a RFQ, então
  // o tempo até a primeira resposta usa o primeiro envio de qualquer proposta
  // depois da criação da RFQ correspondente.
  const cycles = [];
  for (const [, createdAt] of created) {
    const candidates = [...firstProposal.values()].filter((at) => at >= createdAt);
    if (candidates.length) cycles.push((Math.min(...candidates) - createdAt) / 86400000);
  }
  const invited = count('provider_invited');
  const accepted = count('invite_accepted');
  const submitted = count('proposal_submitted');
  const rfqs = created.size;
  const average = (values) => (values.length
    ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
    : null);
  return {
    organizations_onboarded: count('buyer_onboarded') + count('provider_onboarded'),
    rfqs_created: rfqs,
    rfqs_opened: count('rfq_open'),
    invites_sent: invited,
    invites_opened: count('invite_opened'),
    invites_accepted: accepted,
    invite_acceptance_rate: invited ? Math.round((accepted / invited) * 100) / 100 : null,
    proposals_submitted: submitted,
    proposals_revised: count('proposal_revised'),
    proposals_per_rfq: rfqs ? Math.round((submitted / rfqs) * 100) / 100 : null,
    response_rate: invited ? Math.round((submitted / invited) * 100) / 100 : null,
    days_to_first_proposal: average(cycles),
    comparisons_viewed: count('comparison_viewed'),
    weights_applied: count('weights_applied'),
    decisions_recorded: count('decision_recorded'),
    contracts_registered: count('contract_registered'),
    renewal_tasks_created: count('contract_registered'),
    terms_accepted: count('terms_accepted'),
    note: 'Métricas operacionais deste piloto, contadas a partir da trilha de eventos. Não são benchmark de mercado e não comparam com nenhuma outra empresa.'
  };
}

/**
 * Números do painel. Todos são contagens ou somas de valores efetivamente
 * declarados. Nenhuma "economia gerada" é estimada: sem metodologia explícita,
 * o campo simplesmente não existe.
 */
export function summarize({ rfqs = [], contracts = [], decisions = [], providers = [], proposals = [] }) {
  const open = rfqs.filter((row) => ['open', 'collecting'].includes(row.status));
  const comparing = rfqs.filter((row) => row.status === 'comparing');
  const activeContracts = contracts.filter((row) => ['active', 'renewing'].includes(row.status)).map(withRenewalWindow);
  const today = new Date().toISOString().slice(0, 10);
  const requestedCredit = rfqs
    .filter((row) => row.product === 'credit')
    .reduce((total, row) => total + (Number(safeObject(row.demand).amount) || 0), 0);
  const awaitingResponse = open.filter((row) => !(row.proposals || []).length).length;
  return {
    rfqs_open: open.length,
    rfqs_comparing: comparing.length,
    rfqs_total: rfqs.length,
    rfqs_awaiting_first_proposal: awaitingResponse,
    proposals_total: proposals.length || rfqs.reduce((total, row) => total + (row.proposals?.length || 0), 0),
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
