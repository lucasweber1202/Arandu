import { HttpError, json, readBody, clean, limited, safeObject, validEmail } from '../../api-core.mjs';
import { userSupabaseRequest, adminSupabaseRpc } from '../../supabase.mjs';
import { createDocumentStorage, downloadName, signedUrlTtl, DOCUMENT_MIME_TYPES, DOCUMENT_MAX_BYTES, DOCUMENT_UPLOAD_WINDOW_SECONDS } from '../../finance/document-storage.mjs';
import { PRODUCT_IDS, PRODUCTS, normalizeDemand, normalizeProposal, normalize, demandFields, proposalFields } from '../../finance/products.mjs';
import { validateCnpj } from '../../finance/cnpj.mjs';
import { buildComparison, applyUserWeights, comparableFields, NEUTRAL_RANKING_NOTICE } from '../../finance/comparison.mjs';
import { nextStates, canTransition, RFQ_STATES, CONTRACT_STATES } from '../../finance/workflow.mjs';
import { createOpsMfa, requireFinanceOps, OpsAccessError } from '../../finance/ops-access.mjs';
import { buildPassport, resolvePassportRows, validatePassportValue, validatePassportUsage, catalogField, WRITABLE_SOURCES, MIN_REVIEW_DAYS, MAX_REVIEW_DAYS } from '../../finance/passport.mjs';
import { requireUuid, query, rest, rpc, upstream, memberOrganization, loadRfq, INVITE_INVALID_MESSAGE } from './finance-core.mjs';
import { handleFinanceEnterprise } from './finance-enterprise.mjs';
import { validateAssignments, cleanDeclaredFacts, STEP_REASON_CODES } from '../../finance/policy.mjs';

// Domínio de API do Arandu Financial Procurement.
//
// Três invariantes são mantidas aqui, e repetidas no banco:
//   1. Nenhum campo financeiro entra sem estar declarado em lib/finance/products.mjs.
//   2. organization_id / provider_organization_id vêm sempre da sessão ou da
//      linha do banco — nunca de um valor arbitrário do corpo da requisição.
//   3. Transições de estado só existem na máquina declarada; strings livres
//      são recusadas antes de chegar ao Postgres.

const TOKEN = /^[0-9a-f]{64}$/;
const DOCUMENT_ENTITIES = ['rfq', 'proposal', 'contract', 'profile', 'provider'];
const PROFILE_COLUMNS = 'legal_entity_id,id,field_key,field_value,source,status,valid_until,review_after_days,document_id,updated_at,updated_by,verified_at,verified_by';
const CLIENT_EVENTS = [
  'invite_opened', 'proposal_started', 'comparison_viewed', 'weights_applied',
  'onboarding_step_completed', 'export_generated'
];

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

export async function handleFinance(req, res, path, { requireUser, enforceRateLimit, documentStorage = null, adminRpc = adminSupabaseRpc, env = process.env, opsMfa = null }) {
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

  // Fundação enterprise (multi-entity): módulo próprio, mesmas garantias.
  if (await handleFinanceEnterprise(req, res, { resource, sub, token, session, headers })) return;

  // ------------------------------------------------------------ organizações
  if (resource === 'organizations') {
    if (req.method === 'GET') {
      const rows = await rest(token, 'fin_organizations?select=id,legal_name,trade_name,kind,country,sector,revenue_band,created_at&order=created_at.desc&limit=100');
      // O ambiente de demonstração é o produto real com outro banco: a única
      // diferença visível é o selo "dados fictícios", decidido por configuração.
      const environment = clean(env.ARANDU_ENV).toLowerCase() === 'demo' ? 'demo' : null;
      return json(res, 200, { ok: true, rows, environment }, headers);
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
    // Membros da própria organização (empresa ou provedor): o RLS só devolve a
    // organização de quem pergunta, e a resposta nunca traz e-mail.
    const organization = await memberOrganization(token, query(req).get('organization_id'));
    // Nome e cargo, nunca e-mail: é o que aprovações, comentários e tarefas precisam.
    const members = await rest(token, `fin_members?select=user_id,role,entity_scope,created_at,display_name,job_title&organization_id=eq.${organization.id}&order=created_at.asc&limit=100`);
    const rows = (members || []).map(({ job_title: title, ...row }) => ({ ...row, title: title || null }));
    return json(res, 200, { ok: true, rows, viewer_id: session.user.id }, headers);
  }

  if (resource === 'members' && sub === 'me' && req.method === 'PATCH') {
    const body = await readBody(req);
    const organization = await memberOrganization(token, body.organization_id);
    const displayName = limited(body.display_name, 120);
    const jobTitle = limited(body.title, 80);
    if (displayName && (displayName.length < 2 || /[<>@]/.test(displayName))) throw new HttpError(400, 'Use seu nome, com pelo menos 2 caracteres e sem e-mail.', 'invalid_display_name');
    if (jobTitle && (jobTitle.length < 2 || /[<>]/.test(jobTitle))) throw new HttpError(400, 'Informe um cargo com pelo menos 2 caracteres.', 'invalid_job_title');
    await upstream(rpc(token, 'fin_update_my_member_profile', { p_org: organization.id, p_display_name: displayName || null, p_job_title: jobTitle || null }));
    return json(res, 200, { ok: true }, headers);
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

  async function passportContext(organization, raw) {
    const id = clean(raw) && raw !== 'group' ? requireUuid(raw, 'legal_entity_id') : null;
    if (!id) return null;
    const rows = await rest(token, `fin_legal_entities?select=id,legal_name,tax_identifier,kind,status&organization_id=eq.${organization.id}&id=eq.${id}&limit=1`);
    if (!rows?.length || rows[0].kind !== 'legal_entity') throw new HttpError(404, 'Entidade indisponível.', 'entity_not_found');
    return rows[0];
  }
  // -------------------------------------------------------- perfil financeiro
  // Financial Passport: o perfil reutilizável da empresa compradora. Leitura só
  // de membros da compradora (RLS); escrita só pelas RPCs, que validam papel,
  // origem e documento no banco. O provedor nunca alcança estas rotas com dado.
  if (resource === 'profile' && !sub && req.method === 'GET') {
    const organization = await memberOrganization(token, query(req).get('organization_id'), ['BUYER']);
    const org = organization.id;
    const entity = await passportContext(organization, query(req).get('legal_entity_id'));
    const scopeFilter = entity ? `&or=(legal_entity_id.is.null,legal_entity_id.eq.${entity.id})` : '&legal_entity_id=is.null';
    const [rows, identity, documents, members] = await Promise.all([
      rest(token, `fin_company_profiles?select=${PROFILE_COLUMNS}&organization_id=eq.${org}${scopeFilter}&order=field_key.asc&limit=200`),
      rest(token, `fin_organizations?select=legal_name,tax_identifier,sector,revenue_band&id=eq.${org}&limit=1`),
      rest(token, `fin_private_documents?select=id,title,current_version,removed_at&organization_id=eq.${org}&entity_type=eq.profile&entity_id=eq.${entity?.id || org}&removed_at=is.null&order=created_at.desc&limit=100`),
      rest(token, `fin_members?select=user_id,display_name&organization_id=eq.${org}&limit=200`)
    ]);
    const names = new Map((members || []).map((row) => [row.user_id, row.display_name]));
    const passport = buildPassport({ organization: { ...organization, ...(identity?.[0] || {}) }, rows: rows || [], legalEntityId: entity?.id || null, entity, documents: documents || [], members: names });
    return json(res, 200, { ok: true, rows: resolvePassportRows(rows || [], entity?.id || null), legal_entity_id: entity?.id || null, passport, documents: (documents || []).map(({ removed_at: _removed, ...doc }) => doc) }, headers);
  }

  if (resource === 'profile' && sub === 'search' && req.method === 'GET') {
    const organization = await memberOrganization(token, query(req).get('organization_id'), ['BUYER']);
    const entity = await passportContext(organization, query(req).get('legal_entity_id'));
    const text = clean(query(req).get('q'));
    const limit = Number(query(req).get('limit') || 20), offset = Number(query(req).get('offset') || 0);
    if (text.length < 2 || text.length > 100 || !Number.isInteger(limit) || limit < 1 || limit > 50 || !Number.isInteger(offset) || offset < 0 || offset > 1000) throw new HttpError(400, 'Busca inválida.', 'invalid_search');
    const rows = await rpc(token, 'fin_search_passport', { p_org: organization.id, p_entity: entity?.id || null, p_query: text, p_limit: limit, p_offset: offset });
    return json(res, 200, { ok: true, rows: rows || [], limit, offset }, headers);
  }

  if (resource === 'profile' && !sub && req.method === 'POST') {
    const body = await readBody(req);
    const organization = await memberOrganization(token, body.organization_id, ['BUYER']);
    const fieldKey = clean(body.field_key).toLowerCase();
    if (!/^[a-z][a-z0-9_]{1,48}$/.test(fieldKey)) throw new HttpError(400, 'Identificador de campo inválido.', 'invalid_field_key');
    const checked = validatePassportValue(fieldKey, body.field_value);
    if (!checked.ok) throw new HttpError(400, checked.error, 'invalid_field_value');
    const source = clean(body.source) || 'declarado_pela_empresa';
    if (!WRITABLE_SOURCES.includes(source)) throw new HttpError(400, 'Origem do dado inválida.', 'invalid_source');
    const documentId = clean(body.document_id) ? requireUuid(body.document_id, 'document_id') : null;
    if (catalogField(fieldKey)?.type === 'document' && !documentId) throw new HttpError(400, 'Vincule o arquivo do documento antes de salvar este campo.', 'document_required');
    const validUntil = clean(body.valid_until);
    if (validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) throw new HttpError(400, 'Informe a validade no formato AAAA-MM-DD.', 'invalid_valid_until');
    const reviewRaw = body.review_after_days;
    const reviewDays = reviewRaw === undefined || reviewRaw === null || reviewRaw === '' ? catalogField(fieldKey)?.review_days ?? null : Number(reviewRaw);
    if (reviewDays !== null && (!Number.isInteger(reviewDays) || reviewDays < MIN_REVIEW_DAYS || reviewDays > MAX_REVIEW_DAYS)) {
      throw new HttpError(400, `O período de revisão precisa ficar entre ${MIN_REVIEW_DAYS} e ${MAX_REVIEW_DAYS} dias.`, 'invalid_review_period');
    }
    // Upsert por (organization_id, field_key): o histórico de cada gravação
    // fica em fin_company_profile_history, escrito pelo banco.
    const entity = await passportContext(organization, body.legal_entity_id);
    const id = await rpc(token, entity ? 'fin_passport_set_scoped_field' : 'fin_passport_set_field', {
      ...(entity ? { p_entity: entity.id } : {}),
      p_org: organization.id, p_key: fieldKey, p_value: checked.value, p_source: source,
      p_document_id: documentId, p_valid_until: validUntil || null, p_review_after_days: reviewDays
    });
    return json(res, 201, { ok: true, id }, headers);
  }

  if (resource === 'profile' && sub === 'confirm' && req.method === 'POST') {
    const body = await readBody(req);
    const organization = await memberOrganization(token, body.organization_id, ['BUYER']);
    const fieldKey = clean(body.field_key).toLowerCase();
    if (!/^[a-z][a-z0-9_]{1,48}$/.test(fieldKey)) throw new HttpError(400, 'Identificador de campo inválido.', 'invalid_field_key');
    const entity = await passportContext(organization, body.legal_entity_id);
    const verifiedAt = await rpc(token, entity ? 'fin_passport_confirm_scoped_field' : 'fin_passport_confirm_field', { p_org: organization.id, p_key: fieldKey, ...(entity ? { p_entity: entity.id } : {}) });
    return json(res, 200, { ok: true, verified_at: verifiedAt }, headers);
  }

  if (resource === 'profile' && sub === 'history' && req.method === 'GET') {
    const organization = await memberOrganization(token, query(req).get('organization_id'), ['BUYER']);
    const fieldKey = clean(query(req).get('field_key')).toLowerCase();
    if (!/^[a-z][a-z0-9_]{1,48}$/.test(fieldKey)) throw new HttpError(400, 'Identificador de campo inválido.', 'invalid_field_key');
    const entity = await passportContext(organization, query(req).get('legal_entity_id'));
    const historyScope = entity ? `&legal_entity_id=eq.${entity.id}` : '&legal_entity_id=is.null';
    const [rows, members] = await Promise.all([
      rest(token, `fin_company_profile_history?select=change_type,previous_value,new_value,previous_source,new_source,document_id,valid_until,review_after_days,changed_by,changed_at&organization_id=eq.${organization.id}&field_key=eq.${fieldKey}${historyScope}&order=changed_at.desc&limit=50`),
      rest(token, `fin_members?select=user_id,display_name&organization_id=eq.${organization.id}&limit=200`)
    ]);
    const names = new Map((members || []).map((row) => [row.user_id, row.display_name]));
    return json(res, 200, { ok: true, rows: (rows || []).map(({ changed_by: by, ...row }) => ({ ...row, changed_by_name: names.get(by) || null })) }, headers);
  }

  if (resource === 'rfq-passport' && req.method === 'GET') {
    const organization = await memberOrganization(token, query(req).get('organization_id'), ['BUYER']);
    const rfqId = requireUuid(query(req).get('rfq_id'), 'rfq_id');
    const rows = await rest(token, `fin_rfq_profile_snapshots?select=legal_entity_id,source_legal_entity_id,original_scope,vintage,profile_updated_by,field_key,demand_key,field_value,source,profile_updated_at,verified_at,review_due_on,freshness,used_as_is,captured_at&organization_id=eq.${organization.id}&rfq_id=eq.${rfqId}&order=demand_key.asc&limit=20`);
    return json(res, 200, { ok: true, rows: rows || [] }, headers);
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
      // O convite de um provedor com contato só pode ser aceito por esse e-mail
      // exato: um contato digitado errado deixaria o convite inutilizável.
      const contactEmail = clean(body.contact_email).toLowerCase();
      if (contactEmail && !validEmail(contactEmail)) throw new HttpError(400, 'Informe um e-mail de contato válido — só ele poderá aceitar o convite.', 'invalid_contact_email');
      // `verification_state` nunca vem do cliente: afirmar que um provedor é
      // regulado exige evidência registrada por um caminho administrativo.
      const payload = {
        organization_id: organization.id,
        name: limited(body.name, 200),
        kind,
        website: website || null,
        contact_name: limited(body.contact_name, 200) || null,
        contact_email: limited(contactEmail, 254) || null,
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
      // Filtro por entidade é conveniência de tela; quem limita o que volta é o RLS.
      const entityFilter = clean(query(req).get('legal_entity_id'));
      const scopeFilter = !entityFilter ? '' : entityFilter === 'group' ? '&legal_entity_id=is.null' : `&legal_entity_id=eq.${requireUuid(entityFilter, 'legal_entity_id')}`;
      const rows = await rest(token, `fin_rfqs?select=*&organization_id=eq.${organization.id}${scopeFilter}&order=created_at.desc&limit=100`);
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
      const usage = validatePassportUsage(product, body.passport_fields);
      if (usage === null) throw new HttpError(400, 'Campos do Passport inválidos para este produto.', 'invalid_passport_usage');
      // Só fotografa o que está na demanda enviada: campo apagado pela pessoa
      // antes de criar não entra no snapshot.
      const used = usage.filter((item) => demand[item.demand_key] !== undefined);
      const base = {
        p_org: organization.id, p_product: product, p_title: title,
        p_description: limited(body.description, 4000) || null,
        p_demand: demand, p_deadline: clean(body.response_deadline) || null
      };
      // Com entidade, a RFQ nasce nela (o banco confere se a pessoa a alcança).
      const entityId = clean(body.legal_entity_id) ? requireUuid(body.legal_entity_id, 'legal_entity_id') : null;
      const id = entityId
        ? await rpc(token, 'fin_create_rfq_in_entity', { ...base, p_entity: entityId, p_usage: used.length ? used : null })
        : used.length
          ? await rpc(token, 'fin_create_rfq_from_passport', { ...base, p_usage: used })
          : await rpc(token, 'fin_create_rfq', base);
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
      rest(token, `fin_rfq_invites?select=id,provider_id,provider_organization_id,status,expires_at,accepted_at,created_at,recipient_mode&rfq_id=eq.${rfq.id}&order=created_at.asc&limit=100`),
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
    // exact_email: só a conta com o e-mail do contato cadastrado aceita.
    // organization_open: sem contato, qualquer conta provedora com o link aceita.
    const provider = (await rest(token, `fin_providers?select=contact_email&id=eq.${providerId}&limit=1`))?.[0];
    const recipientMode = clean(provider?.contact_email) ? 'exact_email' : 'organization_open';
    return json(res, 201, { ok: true, invitationToken, recipient_mode: recipientMode }, headers);
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
    // O banco devolve null quando recusa por destinatário ou vínculo (e registra
    // o motivo só para o console operacional): mesma resposta de token inválido.
    if (!inviteId) throw new HttpError(409, INVITE_INVALID_MESSAGE, 'invite_invalid');
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
  // Pedidos com policy (docs/FINANCIAL_POLICY_ENGINE.md) trazem etapas,
  // exceções e a avaliação gravada; `viewer_can_act` diz se a pessoa tem uma
  // etapa ativa (própria ou por delegação vigente) — o banco reconfere no voto.
  if (resource === 'approvals') {
    if (req.method === 'GET') {
      const organization = await memberOrganization(token, query(req).get('organization_id'), ['BUYER']);
      const rfqId = query(req).get('rfq_id');
      const filter = rfqId ? `&rfq_id=eq.${requireUuid(rfqId, 'rfq_id')}` : '';
      const viewer = requireUuid(session.user.id, 'user_id');
      const requests = await rest(token, `fin_approval_requests?select=id,organization_id,rfq_id,proposal_id,proposal_version,requested_by,requested_at,status,rationale,resolved_at,snapshot,policy_snapshot,policy_version_ids,evaluated_at,justification,declared_facts,expires_at,resolution_note&organization_id=eq.${organization.id}${filter}&order=requested_at.desc&limit=100`);
      const ids = (requests || []).map((row) => row.id);
      const [steps, stages, exceptions, delegations] = ids.length ? await Promise.all([
        rest(token, `fin_approval_steps?select=id,request_id,position,approver_id,status,comment,acted_at,stage_id,acted_by,delegation_id,reason_code&request_id=in.(${ids.join(',')})&order=position.asc&limit=1000`),
        rest(token, `fin_approval_stages?select=id,request_id,stage_key,label,sequence,roles,scope,min_approvals,due_hours,allow_delegation,sources,status,opened_at,due_at,escalated_at,completed_at,waived_by&request_id=in.(${ids.join(',')})&order=sequence.asc&limit=400`),
        rest(token, `fin_policy_exceptions?select=id,request_id,policy_version_id,rule_id,requested_by,reason_code,reason,evidence,status,decided_by,decided_at,decision_comment,created_at&request_id=in.(${ids.join(',')})&order=created_at.asc&limit=400`),
        rest(token, `fin_approval_delegations?select=delegator_id,starts_at,ends_at&organization_id=eq.${organization.id}&delegate_id=eq.${viewer}&revoked_at=is.null&limit=50`)
      ]) : [[], [], [], []];
      const now = Date.now();
      const delegators = new Set((delegations || []).filter((row) => Date.parse(row.starts_at) <= now && Date.parse(row.ends_at) > now).map((row) => row.delegator_id));
      return json(res, 200, { ok: true, viewer_id: viewer, rows: (requests || []).map((row) => {
        const ownSteps = (steps || []).filter((step) => step.request_id === row.id);
        const ownStages = (stages || []).filter((stage) => stage.request_id === row.id);
        const active = new Set(ownStages.filter((stage) => stage.status === 'active').map((stage) => stage.id));
        const firstPending = ownSteps.filter((step) => step.status === 'pending').sort((a, b) => a.position - b.position)[0];
        const canAct = row.status === 'pending' && row.requested_by !== viewer && (row.policy_snapshot
          ? ownSteps.some((step) => step.status === 'pending' && active.has(step.stage_id) && (step.approver_id === viewer
              || (delegators.has(step.approver_id) && ownStages.find((stage) => stage.id === step.stage_id)?.allow_delegation)))
          : firstPending?.approver_id === viewer);
        return { ...row, engine: row.policy_snapshot ? 'policy' : 'manual', viewer_can_act: Boolean(canAct), steps: ownSteps, stages: ownStages,
          exceptions: (exceptions || []).filter((item) => item.request_id === row.id) };
      }) }, headers);
    }
    if (req.method === 'POST' && sub === 'request') {
      const body = await readBody(req);
      const rfq = requireUuid(body.rfq_id, 'rfq_id');
      const proposal = requireUuid(body.proposal_id, 'proposal_id');
      const rationale = limited(body.rationale, 4000);
      // Com plano da policy: indicações por etapa. Sem plano: aprovadores em ordem.
      if (body.assignments !== undefined) {
        const checked = validateAssignments(body.assignments);
        if (!checked.ok) throw new HttpError(400, checked.error, 'invalid_approvers');
        const id = await rpc(token, 'fin_request_policy_approval', {
          p_rfq: rfq, p_proposal: proposal, p_assignments: body.assignments, p_rationale: rationale,
          p_justification: body.justification ? limited(body.justification, 2000) : null, p_declared: cleanDeclaredFacts(body.declared)
        });
        return json(res, 201, { ok: true, id, engine: 'policy' }, headers);
      }
      const approvers = Array.isArray(body.approver_ids) ? body.approver_ids : [];
      if (approvers.length < 1 || approvers.length > 5) throw new HttpError(400, 'Escolha de um a cinco aprovadores.', 'invalid_approvers');
      const id = await rpc(token, 'fin_request_approval', {
        p_rfq: rfq, p_proposal: proposal,
        p_approvers: approvers.map((value) => requireUuid(value, 'approver_id')),
        p_rationale: rationale
      });
      return json(res, 201, { ok: true, id, engine: 'manual' }, headers);
    }
    if (req.method === 'POST' && sub === 'act') {
      const body = await readBody(req);
      const action = clean(body.action);
      if (!['approved', 'rejected', 'changes_requested'].includes(action)) throw new HttpError(400, 'Ação de aprovação inválida.', 'invalid_action');
      const reasonCode = clean(body.reason_code) || null;
      if (reasonCode && !Object.hasOwn(STEP_REASON_CODES, reasonCode)) throw new HttpError(400, 'Motivo inválido.', 'invalid_action');
      const status = await rpc(token, 'fin_act_on_approval_v2', {
        p_request: requireUuid(body.request_id, 'request_id'), p_action: action,
        p_comment: limited(body.comment, 2000) || null, p_reason_code: reasonCode
      }).catch((error) => {
        // Aqui "sem permissão" tem um motivo concreto: não é a vez desta pessoa.
        if (error?.code === 'forbidden') throw new HttpError(403, 'Você não tem permissão para decidir esta etapa. Só um aprovador da etapa ativa (ou quem o substitui por delegação vigente) pode aprovar, devolver ou rejeitar.', 'not_your_step');
        throw error;
      });
      return json(res, 200, { ok: true, status }, headers);
    }
    if (req.method === 'POST' && sub === 'cancel') {
      const body = await readBody(req);
      await rpc(token, 'fin_cancel_approval', { p_request: requireUuid(body.request_id, 'request_id') });
      return json(res, 200, { ok: true }, headers);
    }
    if (req.method === 'POST' && sub === 'supersede') {
      const body = await readBody(req);
      const reason = limited(body.reason, 1000);
      if (!reason || reason.length < 3) throw new HttpError(400, 'Informe por que o pedido será substituído.', 'comment_required');
      await rpc(token, 'fin_supersede_approval', { p_request: requireUuid(body.request_id, 'request_id'), p_reason: reason });
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
      const [rows, providers] = await Promise.all([
        rest(token, `fin_contracts?select=*&organization_id=eq.${organization.id}&order=ends_on.asc&limit=100`),
        rest(token, `fin_providers?select=id,name&organization_id=eq.${organization.id}&limit=200`)
      ]);
      const names = new Map((providers || []).map((row) => [row.id, row.name]));
      return json(res, 200, { ok: true, rows: (rows || []).map((row) => withRenewalWindow({ ...row, provider_name: names.get(row.provider_id) || 'Provedor' })) }, headers);
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
      // Nome e instituição de quem escreveu, só para comentários que a pessoa já lê.
      const authors = new Map(((await rpc(token, 'fin_comment_authors', { p_type: objectType, p_id: objectId }).catch(() => [])) || [])
        .map((row) => [row.author_id, row]));
      const named = (rows || []).map((row) => {
        const author = authors.get(row.author_id);
        return { ...row, author_name: author?.display_name || null, author_org: author?.organization_name || null, author_is_provider: author?.organization_kind === 'PROVIDER' };
      });
      return json(res, 200, { ok: true, rows: named, has_more: named.length === 50 }, headers);
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
    const [rfqs, providers, contracts, profile, tasks, terms, invites, members, pendingApprovals, decisions] = await Promise.all([
      rest(token, `fin_rfqs?select=*&organization_id=eq.${org}&order=created_at.desc&limit=200`),
      rest(token, `fin_providers?select=*&organization_id=eq.${org}&order=name.asc&limit=200`),
      rest(token, `fin_contracts?select=*&organization_id=eq.${org}&order=ends_on.asc&limit=200`),
      rest(token, `fin_company_profiles?select=${PROFILE_COLUMNS}&organization_id=eq.${org}&order=field_key.asc&limit=200`),
      rest(token, `fin_tasks?select=id,title,due_on,status,related_type,related_id&organization_id=eq.${org}&status=eq.open&order=due_on.asc.nullslast&limit=100`),
      rest(token, `fin_terms_acceptances?select=terms_version,context,accepted_at&organization_id=eq.${org}&order=accepted_at.desc&limit=10`),
      rest(token, `fin_rfq_invites?select=id,rfq_id,provider_id,status,created_at,accepted_at&buyer_organization_id=eq.${org}&order=created_at.asc&limit=1000`),
      rest(token, `fin_members?select=user_id,display_name&organization_id=eq.${org}&limit=200`),
      rest(token, `fin_approval_requests?select=rfq_id&organization_id=eq.${org}&status=eq.pending&limit=200`),
      rest(token, `fin_decisions?select=id,rfq_id&organization_id=eq.${org}&limit=200`)
    ]);
    const proposals = await loadProposalsWithTerms(token, (rfqs || []).map((row) => row.id));
    const byRfq = new Map();
    for (const proposal of proposals) {
      if (!byRfq.has(proposal.rfq_id)) byRfq.set(proposal.rfq_id, []);
      byRfq.get(proposal.rfq_id).push(proposal);
    }
    // Contexto que as telas exibem: quem foi convidado e respondeu, quem é o
    // responsável, se há aprovação em curso ou decisão registrada. Tudo da
    // própria organização, lido com o token do usuário (RLS).
    const providerName = new Map((providers || []).map((row) => [row.id, row.name]));
    const memberName = new Map((members || []).map((row) => [row.user_id, row.display_name]));
    const pendingRfqs = new Set((pendingApprovals || []).map((row) => row.rfq_id));
    const decisionByRfq = new Map((decisions || []).map((row) => [row.rfq_id, row.id]));
    const decorated = (rfqs || []).map((rfq) => {
      const rfqProposals = byRfq.get(rfq.id) || [];
      const rfqInvites = (invites || []).filter((row) => row.rfq_id === rfq.id).map((row) => ({
        ...row, provider_name: providerName.get(row.provider_id) || 'Provedor',
        responded: rfqProposals.some((proposal) => proposal.provider_id === row.provider_id)
      }));
      return {
        ...rfq,
        proposals: rfqProposals,
        invites: rfqInvites,
        invites_count: rfqInvites.length,
        owner_name: memberName.get(rfq.owner_id) || null,
        pending_approval: pendingRfqs.has(rfq.id),
        decision_id: decisionByRfq.get(rfq.id) || null,
        next_states: nextStates('rfq', rfq.status)
      };
    });
    return json(res, 200, {
      ok: true,
      organization,
      rfqs: decorated,
      providers: providers || [],
      contracts: (contracts || []).map((row) => withRenewalWindow({ ...row, provider_name: providerName.get(row.provider_id) || 'Provedor' })),
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

  // --------------------------------------------------- documentos privados
  // Autorização e trilha ficam no banco (RPC com o token do usuário). O servidor
  // só usa o service role depois disso, para assinar URLs curtas que não são
  // gravadas em lugar nenhum.
  if (resource === 'private-documents') {
    const storage = () => documentStorage || createDocumentStorage({ env });
    if (req.method === 'GET') {
      await memberOrganization(token, query(req).get('organization_id'));
      const entityType = clean(query(req).get('entity_type'));
      if (!['rfq', 'proposal', 'contract', 'profile'].includes(entityType)) throw new HttpError(400, 'Tipo de entidade inválido.', 'invalid_entity_type');
      const entityId = requireUuid(query(req).get('entity_id'), 'entity_id');
      const documents = await rest(token, `fin_private_documents?select=id,organization_id,buyer_organization_id,entity_type,entity_id,title,visibility,current_version,created_by,created_at&entity_type=eq.${entityType}&entity_id=eq.${entityId}&removed_at=is.null&order=created_at.desc&limit=100`);
      const ids = (documents || []).map((row) => row.id);
      const versions = ids.length
        ? await rest(token, `fin_document_versions?select=document_id,version,mime_type,size_bytes,uploaded_by,completed_at&document_id=in.(${ids.join(',')})&order=version.desc&limit=500`)
        : [];
      const rows = (documents || []).map((row) => ({ ...row, versions: (versions || []).filter((version) => version.document_id === row.id) }));
      return json(res, 200, { ok: true, rows, limits: { max_bytes: DOCUMENT_MAX_BYTES, mime_types: Object.keys(DOCUMENT_MIME_TYPES) } }, headers);
    }
    if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.', 'method_not_allowed');
    const body = await readBody(req);
    await enforceRateLimit(req, 'finance-documents', 40, 600000, session.user.id);
    if (sub === 'upload') {
      const organization = await memberOrganization(token, body.organization_id);
      const mime = clean(body.mime_type).toLowerCase();
      const size = Number(body.size);
      if (!DOCUMENT_MIME_TYPES[mime]) throw new HttpError(400, 'Tipo de arquivo não aceito. Envie PDF, JPG, PNG, XLSX ou DOCX.', 'document_type_not_allowed');
      if (!Number.isInteger(size) || size < 1 || size > DOCUMENT_MAX_BYTES) throw new HttpError(413, 'O arquivo passa de 10 MB. Reduza o tamanho ou divida em partes.', 'document_too_large');
      const sha = clean(body.sha256).toLowerCase();
      const [slot] = await upstream(rpc(token, 'fin_document_begin_upload', {
        p_org: organization.id, p_entity_type: clean(body.entity_type), p_entity_id: requireUuid(body.entity_id, 'entity_id'),
        p_title: limited(body.title, 200), p_visibility: clean(body.visibility) || 'internal', p_mime: mime, p_size: size,
        p_sha256: /^[0-9a-f]{64}$/.test(sha) ? sha : null, p_document_id: clean(body.document_id) ? requireUuid(body.document_id, 'document_id') : null
      })) || [];
      if (!slot?.path) throw new HttpError(409, 'Não foi possível reservar o envio do documento.', 'document_slot_failed');
      const uploadUrl = await storage().signUpload(slot.path).catch(() => { throw new HttpError(503, 'O armazenamento de documentos está indisponível. Tente novamente em instantes.', 'storage_unavailable'); });
      // `expires_in` é o prazo que o Storage de fato deu à URL; `complete_within` é o
      // limite que o banco impõe à reserva, qualquer que seja esse prazo.
      return json(res, 201, { ok: true, document_id: slot.document_id, version: slot.version, upload_url: uploadUrl, expires_in: signedUrlTtl(uploadUrl), complete_within: DOCUMENT_UPLOAD_WINDOW_SECONDS }, headers);
    }
    if (sub === 'complete') {
      const documentId = requireUuid(body.document_id, 'document_id');
      const version = Number(body.version);
      if (!Number.isInteger(version) || version < 1) throw new HttpError(400, 'Versão inválida.', 'invalid_version');
      const [pending] = await upstream(rpc(token, 'fin_document_pending_upload', { p_document: documentId, p_version: version })) || [];
      if (!pending?.path) throw new HttpError(404, 'Este envio não está pendente ou não pertence à sua conta.', 'upload_not_pending');
      const object = await storage().inspect(pending.path).catch(() => null);
      if (!object) throw new HttpError(409, 'O arquivo ainda não chegou ao armazenamento. Envie de novo.', 'upload_missing');
      const status = await adminRpc('fin_document_finalize_upload', { p_document: documentId, p_version: version, p_size: object.size, p_mime: object.mime });
      if (status !== 'available') throw new HttpError(409, 'O arquivo recebido não confere com o que foi declarado (tipo ou tamanho). Envie de novo.', 'upload_mismatch');
      return json(res, 200, { ok: true, document_id: documentId, version, status }, headers);
    }
    if (sub === 'download') {
      const documentId = requireUuid(body.document_id, 'document_id');
      const version = body.version === undefined || body.version === null ? null : Number(body.version);
      if (version !== null && (!Number.isInteger(version) || version < 1)) throw new HttpError(400, 'Versão inválida.', 'invalid_version');
      const [grant] = await upstream(rpc(token, 'fin_document_authorize_download', { p_document: documentId, p_version: version })) || [];
      if (!grant?.path) throw new HttpError(404, 'Documento não encontrado ou já removido.', 'document_not_found');
      const url = await storage().signDownload(grant.path, downloadName(grant.title, grant.mime_type, grant.version))
        .catch(() => { throw new HttpError(503, 'O armazenamento de documentos está indisponível. Tente novamente em instantes.', 'storage_unavailable'); });
      return json(res, 200, { ok: true, url, version: grant.version, expires_in: signedUrlTtl(url) }, headers);
    }
    if (sub === 'remove') {
      await upstream(rpc(token, 'fin_document_remove', { p_document: requireUuid(body.document_id, 'document_id') }));
      return json(res, 200, { ok: true }, headers);
    }
    throw new HttpError(404, 'Operação de documento desconhecida.', 'not_found');
  }

  // ---------------------------------------------------- console operacional
  // Operadores da plataforma, com MFA. Nada de conteúdo de clientes: o banco
  // devolve só contagens, estados e identificadores.
  if (resource === 'ops') {
    try {
      // Segundo fator do finance_ops: papel exigido, aal2 ainda não.
      if (sub === 'mfa' && req.method === 'POST') {
        const body = await readBody(req);
        await enforceRateLimit(req, 'finance-ops-mfa', 10, 600000, session.user.id);
        const mfa = opsMfa || createOpsMfa({ env });
        if (clean(body.step) === 'challenge') return json(res, 201, { ok: true, ...(await mfa.challenge(token)) }, headers);
        if (clean(body.step) === 'verify') {
          const { cookie } = await mfa.verify(token, body);
          return json(res, 200, { ok: true, mfa_verified: true }, { ...headers, 'Set-Cookie': cookie });
        }
        throw new HttpError(400, 'Etapa de verificação inválida.', 'invalid_step');
      }
      requireFinanceOps(token);
    } catch (error) {
      if (error instanceof OpsAccessError) throw new HttpError(error.status, error.message, error.code);
      throw error;
    }
    if (sub === 'overview' && req.method === 'GET') {
      const overview = await upstream(rpc(token, 'fin_ops_overview', {}));
      const health = {
        database_configured: Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY),
        server_key_configured: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
        cron_secret_configured: String(env.CRON_SECRET || '').length >= 32,
        email_provider_configured: Boolean(env.RESEND_API_KEY),
        dependencies: [
          { name: 'Supabase REST', state: env.SUPABASE_URL && env.SUPABASE_ANON_KEY ? 'configured' : 'unconfigured' },
          { name: 'Jobs', state: env.SUPABASE_SERVICE_ROLE_KEY && String(env.CRON_SECRET || '').length >= 32 ? 'configured' : 'unconfigured' },
          { name: 'E-mail', state: env.RESEND_API_KEY ? 'configured' : 'unconfigured' },
          { name: 'SSO broker', state: env.ARANDU_SSO_BROKER === 'supabase' && String(env.ARANDU_SSO_STATE_SECRET || '').length >= 32 ? 'configured' : 'unconfigured' }
        ],
        dependency_evidence: 'configuration_only',
        deployment: String(env.VERCEL_ENV || 'local').replace(/[^a-z]/g, '').slice(0, 20),
        commit: String(env.VERCEL_GIT_COMMIT_SHA || '').replace(/[^0-9a-f]/g, '').slice(0, 12) || null
      };
      return json(res, 200, { ok: true, overview, health }, headers);
    }
    if (sub === 'trace' && req.method === 'GET') {
      const requestId = clean(query(req).get('request_id'));
      const entityId = clean(query(req).get('entity_id'));
      if (!requestId && !entityId) throw new HttpError(400, 'Informe um request ID ou um identificador de entidade válido.', 'invalid_lookup');
      if (requestId && !/^[A-Za-z0-9-]{1,80}$/.test(requestId)) throw new HttpError(400, 'Informe um request ID ou um identificador de entidade válido.', 'invalid_lookup');
      const trace = await upstream(rpc(token, 'fin_ops_trace', { p_request_id: requestId || null, p_entity_id: entityId ? requireUuid(entityId, 'entity_id') : null }));
      return json(res, 200, { ok: true, trace }, headers);
    }
    throw new HttpError(404, 'Recurso não encontrado.', 'not_found');
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
