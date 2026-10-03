import { HttpError, json, readBody, clean, limited } from '../../api-core.mjs';
import { requireUuid, query, rest, rpc, memberOrganization } from './finance-core.mjs';
import { handleFinanceContracts } from './finance-contracts.mjs';
import { handleFinancePortfolio } from './finance-portfolio.mjs';
import { handleFinancePolicy } from './finance-policy.mjs';
import { validateEntityInput, validateScopeInput, isCurrency, consolidateByEntity, entityTree } from '../../finance/entities.mjs';

// Rotas enterprise do domínio financeiro: fundação multi-entity.
//
// Mesmo contrato de finance.mjs: sessão obrigatória, JWT do usuário em toda
// chamada (RLS decide o que volta), escrita só por RPC, organização sempre
// confirmada no banco antes do uso. O que é consolidado é calculado sobre as
// linhas que o RLS devolveu para quem pergunta.

const ENTITY_COLUMNS = 'id,organization_id,kind,parent_id,legal_name,short_name,tax_identifier,country,currency,status,created_at,archived_at';

/** Escopo do chamador: `group`, `entities` ou nulo (não membro). */
async function viewerScope(token, organizationId, userId) {
  const rows = await rest(token, `fin_members?select=role,entity_scope&organization_id=eq.${organizationId}&user_id=eq.${userId}&limit=1`);
  return rows?.[0] || null;
}

async function listEntities(token, organizationId) {
  return (await rest(token, `fin_legal_entities?select=${ENTITY_COLUMNS}&organization_id=eq.${organizationId}&order=legal_name.asc&limit=500`)) || [];
}

/**
 * @returns {Promise<boolean>} true quando a rota foi tratada aqui.
 */
export async function handleFinanceEnterprise(req, res, { resource, sub, token, session, headers }) {
  // ------------------------------------------------------------ entidades
  if (resource === 'entities' && !sub && req.method === 'GET') {
    const organization = await memberOrganization(token, query(req).get('organization_id'), ['BUYER']);
    const [entities, viewer, group] = await Promise.all([
      listEntities(token, organization.id),
      viewerScope(token, organization.id, session.user.id),
      rest(token, `fin_organizations?select=base_currency&id=eq.${organization.id}&limit=1`)
    ]);
    json(res, 200, {
      ok: true,
      rows: entityTree(entities),
      scope: viewer?.entity_scope || null,
      can_admin: viewer?.role === 'admin',
      base_currency: group?.[0]?.base_currency || null
    }, headers);
    return true;
  }

  if (resource === 'entities' && !sub && req.method === 'POST') {
    const body = await readBody(req);
    const organization = await memberOrganization(token, body.organization_id, ['BUYER']);
    const checked = validateEntityInput(body);
    if (!checked.ok) throw new HttpError(400, checked.error, 'invalid_legal_entity');
    const value = checked.values;
    const id = await rpc(token, 'fin_create_legal_entity', {
      p_org: organization.id, p_kind: value.kind, p_legal_name: value.legal_name, p_short_name: value.short_name,
      p_tax_identifier: value.tax_identifier, p_country: value.country, p_currency: value.currency, p_parent: value.parent_id
    });
    // Dígitos do CNPJ conferidos aqui; existência na Receita, não.
    json(res, 201, { ok: true, id, tax_identifier: value.tax_identifier ? { format_valid: true, externally_verified: false } : null }, headers);
    return true;
  }

  if (resource === 'entities' && !sub && req.method === 'PATCH') {
    const body = await readBody(req);
    const entityId = requireUuid(body.entity_id, 'entity_id');
    const status = clean(body.status) || null;
    if (status && !['active', 'archived'].includes(status)) throw new HttpError(400, 'Estado de entidade inválido.', 'invalid_legal_entity');
    const currency = clean(body.currency).toUpperCase() || null;
    if (currency && !isCurrency(currency)) throw new HttpError(400, 'Moeda inválida (código ISO de três letras).', 'invalid_currency');
    const legalName = limited(body.legal_name, 200);
    if (legalName && (legalName.length < 2 || /[<>]/.test(legalName))) throw new HttpError(400, 'Informe a razão social (2 a 200 caracteres, sem HTML).', 'invalid_legal_entity');
    const shortName = body.short_name === undefined ? null : limited(body.short_name, 60);
    if (shortName && /[<>]/.test(shortName)) throw new HttpError(400, 'Nome curto sem HTML.', 'invalid_legal_entity');
    await rpc(token, 'fin_update_legal_entity', {
      p_entity: entityId, p_legal_name: legalName || null, p_short_name: shortName, p_currency: currency, p_status: status
    });
    json(res, 200, { ok: true }, headers);
    return true;
  }

  if (resource === 'entities' && sub === 'currency' && req.method === 'POST') {
    const body = await readBody(req);
    const organization = await memberOrganization(token, body.organization_id, ['BUYER']);
    const currency = clean(body.base_currency).toUpperCase();
    if (!isCurrency(currency)) throw new HttpError(400, 'Moeda inválida (código ISO de três letras).', 'invalid_currency');
    await rpc(token, 'fin_set_base_currency', { p_org: organization.id, p_currency: currency });
    json(res, 200, { ok: true, base_currency: currency }, headers);
    return true;
  }

  // ------------------------------------------------- escopo dos membros
  if (resource === 'entity-scopes' && req.method === 'GET') {
    const organization = await memberOrganization(token, query(req).get('organization_id'), ['BUYER']);
    // O RLS só devolve concessões alheias a admin; para os demais, só as próprias.
    const [members, grants] = await Promise.all([
      rest(token, `fin_members?select=user_id,role,entity_scope,display_name,job_title&organization_id=eq.${organization.id}&order=created_at.asc&limit=500`),
      rest(token, `fin_member_entity_grants?select=user_id,entity_id,granted_at&organization_id=eq.${organization.id}&limit=5000`)
    ]);
    const byUser = new Map();
    for (const grant of grants || []) {
      if (!byUser.has(grant.user_id)) byUser.set(grant.user_id, []);
      byUser.get(grant.user_id).push(grant.entity_id);
    }
    json(res, 200, {
      ok: true,
      rows: (members || []).map(({ job_title: title, ...row }) => ({ ...row, title: title || null, entity_ids: byUser.get(row.user_id) || [] })),
      viewer_id: session.user.id
    }, headers);
    return true;
  }

  if (resource === 'entity-scopes' && (req.method === 'PUT' || req.method === 'POST')) {
    const body = await readBody(req);
    const organization = await memberOrganization(token, body.organization_id, ['BUYER']);
    const userId = requireUuid(body.user_id, 'user_id');
    const checked = validateScopeInput(body);
    if (!checked.ok) throw new HttpError(400, checked.error, 'invalid_scope');
    await rpc(token, 'fin_set_member_entity_scope', {
      p_org: organization.id, p_user: userId, p_scope: checked.values.scope, p_entities: checked.values.entity_ids
    });
    json(res, 200, { ok: true, scope: checked.values.scope, entities: checked.values.entity_ids.length }, headers);
    return true;
  }

  // ----------------------------------------------- consolidado por entidade
  if (resource === 'entity-summary' && req.method === 'GET') {
    const organization = await memberOrganization(token, query(req).get('organization_id'), ['BUYER']);
    const org = organization.id;
    // Três leituras paginadas pelo banco, todas sob o RLS de quem pergunta:
    // a consolidação nunca vê linha que a pessoa não poderia ler sozinha.
    const [entities, rfqs, contracts, group] = await Promise.all([
      listEntities(token, org),
      rest(token, `fin_rfqs?select=id,status,legal_entity_id&organization_id=eq.${org}&limit=5000`),
      rest(token, `fin_contracts?select=id,status,ends_on,renewal_notice_days,legal_entity_id&organization_id=eq.${org}&limit=5000`),
      rest(token, `fin_organizations?select=base_currency&id=eq.${org}&limit=1`)
    ]);
    json(res, 200, {
      ok: true,
      rows: consolidateByEntity({ entities, rfqs: rfqs || [], contracts: contracts || [] }),
      base_currency: group?.[0]?.base_currency || null,
      truncated: (rfqs || []).length >= 5000 || (contracts || []).length >= 5000,
      definition: 'Contagens de processos e contratos que você pode ler, por entidade. Sem soma de valores entre moedas, sem nota e sem ranking.'
    }, headers);
    return true;
  }

  // ------------------------------------------------ reatribuição auditada
  if (resource === 'rfq-entity' && req.method === 'POST') {
    const body = await readBody(req);
    const entity = body.legal_entity_id === null || body.legal_entity_id === '' ? null : requireUuid(body.legal_entity_id, 'legal_entity_id');
    await rpc(token, 'fin_set_rfq_entity', { p_rfq: requireUuid(body.rfq_id, 'rfq_id'), p_entity: entity });
    json(res, 200, { ok: true, legal_entity_id: entity }, headers);
    return true;
  }

  if (resource === 'contract-entity' && req.method === 'POST') {
    const body = await readBody(req);
    await rpc(token, 'fin_assign_contract_entity', {
      p_contract: requireUuid(body.contract_id, 'contract_id'), p_entity: requireUuid(body.legal_entity_id, 'legal_entity_id')
    });
    json(res, 200, { ok: true }, headers);
    return true;
  }

  // Contract & Renewal Center v2, Relationship & Portfolio e Policy Engine v2.
  const scoped = { resource, sub, token, headers };
  return (await handleFinanceContracts(req, res, scoped)) || (await handleFinancePortfolio(req, res, scoped)) || handleFinancePolicy(req, res, scoped);
}
