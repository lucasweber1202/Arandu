// Multi-entity: regras puras de entrada e de consolidação.
//
// O grupo econômico é a organização compradora; entidades legais e unidades
// vivem em fin_legal_entities. Quem decide o que cada pessoa enxerga é o banco
// (RLS + fin_entity_visible). Este módulo só:
//   * valida o que a API manda para as RPCs (o banco valida de novo);
//   * consolida linhas que o RLS JÁ filtrou — um agregado nunca inclui entidade
//     que a pessoa não lê, porque a linha nem chegou aqui;
//   * nunca soma valores de moedas diferentes: moeda é contexto, não câmbio.

import { validateCnpj } from './cnpj.mjs';

export const ENTITY_KINDS = /* @__PURE__ */ Object.freeze(['legal_entity', 'business_unit']);
export const ENTITY_SCOPES = /* @__PURE__ */ Object.freeze(['group', 'entities']);
export const GROUP_BUCKET = 'group';
const CURRENCY = /^[A-Z]{3}$/;
const COUNTRY = /^[A-Z]{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const text = (value, max) => String(value ?? '').trim().slice(0, max);

/** Entrada de criação de entidade. Devolve `{ ok, values }` ou `{ ok: false, error }`. */
export function validateEntityInput(body = {}) {
  const kind = text(body.kind, 20) || 'legal_entity';
  if (!ENTITY_KINDS.includes(kind)) return { ok: false, error: 'Tipo de entidade inválido.' };
  const legalName = text(body.legal_name, 200);
  if (legalName.length < 2 || /[<>]/.test(legalName)) return { ok: false, error: 'Informe a razão social ou o nome da unidade (2 a 200 caracteres, sem HTML).' };
  const shortName = text(body.short_name, 60);
  if (/[<>]/.test(shortName)) return { ok: false, error: 'Nome curto sem HTML.' };
  const country = text(body.country || 'BR', 10).toUpperCase();
  if (!COUNTRY.test(country)) return { ok: false, error: 'País inválido (código ISO de duas letras).' };
  const currency = text(body.currency || 'BRL', 10).toUpperCase();
  if (!CURRENCY.test(currency)) return { ok: false, error: 'Moeda inválida (código ISO de três letras).' };
  let taxIdentifier = null;
  if (text(body.tax_identifier, 30)) {
    if (country !== 'BR') return { ok: false, error: 'CNPJ só se aplica a entidade brasileira; deixe em branco para outro país.' };
    const check = validateCnpj(body.tax_identifier);
    if (!check.format_valid) return { ok: false, error: check.reason };
    taxIdentifier = check.digits;
  }
  const parentId = text(body.parent_id, 36) || null;
  if (kind === 'business_unit' && (!parentId || !UUID.test(parentId))) return { ok: false, error: 'Unidade de negócio precisa de uma entidade legal acima dela.' };
  if (kind === 'legal_entity' && parentId) return { ok: false, error: 'Entidade legal não fica abaixo de outra entidade.' };
  return { ok: true, values: { kind, legal_name: legalName, short_name: shortName || null, tax_identifier: taxIdentifier, country, currency, parent_id: parentId } };
}

/** Entrada de escopo de membro. */
export function validateScopeInput(body = {}) {
  const scope = text(body.scope, 20);
  if (!ENTITY_SCOPES.includes(scope)) return { ok: false, error: 'Escopo inválido.' };
  const ids = Array.isArray(body.entity_ids) ? [...new Set(body.entity_ids.map((id) => text(id, 36)))] : [];
  if (ids.some((id) => !UUID.test(id))) return { ok: false, error: 'Entidade inválida.' };
  if (scope === 'entities' && !ids.length) return { ok: false, error: 'Escolha ao menos uma entidade para o escopo restrito.' };
  if (ids.length > 200) return { ok: false, error: 'Escolha no máximo 200 entidades.' };
  return { ok: true, values: { scope, entity_ids: scope === 'entities' ? ids : [] } };
}

export function isCurrency(value) {
  return CURRENCY.test(String(value ?? ''));
}

/** Rótulo curto de uma entidade, com a unidade sob a entidade legal. */
export function entityLabel(entity, byId = new Map()) {
  if (!entity) return 'Nível de grupo';
  const own = entity.short_name || entity.legal_name;
  const parent = entity.parent_id ? byId.get(entity.parent_id) : null;
  return parent ? `${parent.short_name || parent.legal_name} › ${own}` : own;
}

/** Hierarquia ordenada: entidade legal seguida das unidades abaixo dela. */
export function entityTree(entities = []) {
  const byParent = new Map();
  for (const row of entities) {
    const key = row.parent_id || '';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(row);
  }
  const sort = (rows) => [...rows].sort((a, b) => (a.short_name || a.legal_name).localeCompare(b.short_name || b.legal_name, 'pt-BR'));
  const ordered = [];
  const visited = new Set();
  for (const root of sort(byParent.get('') || [])) {
    ordered.push({ ...root, depth: 0 });
    visited.add(root.id);
    for (const child of sort(byParent.get(root.id) || [])) { ordered.push({ ...child, depth: 1 }); visited.add(child.id); }
  }
  // Unidade cuja entidade-mãe a pessoa não enxerga (concessão só da unidade).
  for (const row of sort(entities.filter((item) => !visited.has(item.id)))) ordered.push({ ...row, depth: 0 });
  return ordered;
}

const OPEN_RFQ = new Set(['draft', 'open', 'collecting', 'comparing']);
const ACTIVE_CONTRACT = new Set(['active', 'renewing']);
const day = (value) => (value ? String(value).slice(0, 10) : null);
function addDays(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Consolidado por entidade a partir de linhas já autorizadas.
 *
 * `group` aparece só quando a pessoa enxerga algum objeto sem entidade — o
 * que, pelo RLS, só acontece com escopo de grupo. Contagens apenas: nenhuma
 * soma de valores atravessa moedas, e nada aqui é nota, risco ou ranking.
 */
export function consolidateByEntity({ entities = [], rfqs = [], contracts = [], today = new Date().toISOString().slice(0, 10) } = {}) {
  const byId = new Map(entities.map((row) => [row.id, row]));
  const buckets = new Map();
  const bucket = (entityId) => {
    const key = entityId && byId.has(entityId) ? entityId : (entityId ? `unknown:${entityId}` : GROUP_BUCKET);
    if (!buckets.has(key)) {
      const entity = byId.get(entityId) || null;
      buckets.set(key, {
        key,
        legal_entity_id: entity?.id || null,
        label: entity ? entityLabel(entity, byId) : GROUP_BUCKET === key ? 'Nível de grupo' : 'Entidade sem acesso de leitura',
        kind: entity?.kind || null,
        currency: entity?.currency || null,
        status: entity?.status || null,
        rfqs_open: 0, rfqs_decided: 0, rfqs_total: 0,
        contracts_active: 0, contracts_notice_due: 0, next_contract_end: null
      });
    }
    return buckets.get(key);
  };
  for (const entity of entities) bucket(entity.id);
  for (const rfq of rfqs) {
    const row = bucket(rfq.legal_entity_id || null);
    row.rfqs_total += 1;
    if (OPEN_RFQ.has(rfq.status)) row.rfqs_open += 1;
    if (['decided', 'contracted'].includes(rfq.status)) row.rfqs_decided += 1;
  }
  for (const contract of contracts) {
    if (!ACTIVE_CONTRACT.has(contract.status)) continue;
    const row = bucket(contract.legal_entity_id || null);
    row.contracts_active += 1;
    const ends = day(contract.ends_on);
    if (ends) {
      const notice = addDays(ends, -Number(contract.renewal_notice_days || 0));
      if (notice <= addDays(today, 30)) row.contracts_notice_due += 1;
      if (!row.next_contract_end || ends < row.next_contract_end) row.next_contract_end = ends;
    }
  }
  const ordered = entityTree(entities).map((entity) => ({ ...buckets.get(entity.id), depth: entity.depth }));
  const rest = [...buckets.values()].filter((row) => !row.legal_entity_id);
  return [...ordered, ...rest.map((row) => ({ ...row, depth: 0 }))];
}
