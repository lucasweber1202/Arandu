// Carteira de contratos (Portfolio Control Tower): exceções e filtros sobre as
// linhas que a visão geral já carrega (`overview.contracts`). Puro, testado em
// Node. Exceção é um fato que impede uma decisão específica — nunca nota de
// risco: campo não informado não é irregularidade, só "não sabemos".

export const CONTRACT_EXCEPTIONS = Object.freeze({
  past_notice: { label: 'Aviso prévio vencido', hint: 'O prazo para avisar a não renovação passou; o contrato ainda está vigente.' },
  window: { label: 'Janela de renovação aberta', hint: 'Decida renovar, renegociar ou encerrar antes do aviso prévio.' },
  expired: { label: 'Vigência encerrada sem atualização', hint: 'A data de fim passou e o contrato segue como vigente.' },
  no_end: { label: 'Sem fim de vigência', hint: 'Sem a data de fim não há marcos de renovação.' },
  no_notice: { label: 'Aviso prévio não informado', hint: 'A data-limite para avisar a não renovação é desconhecida.' },
  no_owner: { label: 'Sem responsável', hint: 'Ninguém recebe os avisos de renovação deste contrato.' },
  no_terms: { label: 'Termos não estruturados', hint: 'Sem termos versionados não há comparação de tarifas nem diff entre versões.' },
  no_document: { label: 'Sem referência de documento', hint: 'As condições registradas não têm evidência vinculada.' }
});
const ORDER = Object.keys(CONTRACT_EXCEPTIONS);
const LIVE = new Set(['active', 'renewing']);
const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);
const DAY = 86400000;
const at = (iso) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);

/**
 * Estágio de renovação com a mesma regra do resto do produto (renewalStage em
 * core.js): janela abre no menor de (aviso − 30 dias) e (fim − 90 dias).
 * Sem aviso prévio registrado, a data-limite é desconhecida (não presumimos 0).
 */
export function renewalPosition(contract, today) {
  if (!LIVE.has(contract?.status) || !isDay(contract.ends_on)) return { stage: 'none' };
  const end = at(contract.ends_on);
  const now = at(today);
  if (now > end) return { stage: 'expired' };
  const notice = Number.isInteger(contract.renewal_notice_days) && contract.renewal_notice_days >= 0 ? contract.renewal_notice_days : null;
  if (notice === null) return { stage: 'unknown_notice', daysToEnd: Math.round((end - now) / DAY) };
  const deadline = end - notice * DAY;
  const opens = Math.min(deadline - 30 * DAY, end - 90 * DAY);
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  if (now > deadline) return { stage: 'past_notice', deadline: iso(deadline), daysToEnd: Math.round((end - now) / DAY) };
  if (now >= opens) return { stage: 'window', deadline: iso(deadline), daysToDeadline: Math.round((deadline - now) / DAY) };
  return { stage: 'upcoming', deadline: iso(deadline), opensAt: iso(opens) };
}

/** Exceções de um contrato, na ordem fixa de prioridade. Só contratos vigentes. */
export function contractExceptions(contract, today) {
  if (!isDay(today)) throw new Error('today inválido');
  if (!LIVE.has(contract?.status)) return [];
  const out = [];
  const pos = renewalPosition(contract, today);
  if (pos.stage === 'past_notice') out.push('past_notice');
  if (pos.stage === 'window') out.push('window');
  if (pos.stage === 'expired') out.push('expired');
  if (!isDay(contract.ends_on)) out.push('no_end');
  if (pos.stage === 'unknown_notice') out.push('no_notice');
  if (!contract.owner_id) out.push('no_owner');
  if (!contract.current_version) out.push('no_terms');
  if (!contract.document_reference) out.push('no_document');
  return out.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
}

export const PORTFOLIO_FILTERS = Object.freeze(['provider_id', 'product', 'status', 'owner', 'excecao', 'q']);

/** Lê filtros da URL; valores fora do domínio são descartados (nunca chegam à tela). */
export function readPortfolioFilters(search, { providers = [], products = [], members = [] } = {}) {
  const p = new URLSearchParams(search);
  const pick = (key, ok) => { const v = p.get(key); return v && ok(v) ? v : ''; };
  return {
    provider_id: pick('provider_id', (v) => providers.some((row) => row.id === v)),
    product: pick('product', (v) => products.includes(v)),
    status: pick('status', (v) => ['live', 'active', 'renewing', 'ended'].includes(v)),
    owner: pick('owner', (v) => v === 'none' || members.some((m) => m.user_id === v)),
    excecao: pick('excecao', (v) => v === 'any' || Object.hasOwn(CONTRACT_EXCEPTIONS, v)),
    q: (p.get('q') || '').slice(0, 80)
  };
}

export function writePortfolioFilters(filters) {
  const p = new URLSearchParams();
  for (const key of PORTFOLIO_FILTERS) if (filters[key]) p.set(key, filters[key]);
  return p.toString();
}

const fold = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Aplica filtros. `exceptions` é o mapa id → lista já calculado (sem recálculo por filtro). */
export function filterContracts(rows, filters, exceptions) {
  const q = fold(filters.q).trim();
  return rows.filter((c) => (!filters.provider_id || c.provider_id === filters.provider_id)
    && (!filters.product || c.product === filters.product)
    && (!filters.status || (filters.status === 'live' ? LIVE.has(c.status) : filters.status === 'ended' ? !LIVE.has(c.status) : c.status === filters.status))
    && (!filters.owner || (filters.owner === 'none' ? !c.owner_id : c.owner_id === filters.owner))
    && (!filters.excecao || (filters.excecao === 'any' ? exceptions.get(c.id).length > 0 : exceptions.get(c.id).includes(filters.excecao)))
    && (!q || fold(`${c.title || ''} ${c.provider_name || ''}`).includes(q)));
}

/** Contagem por exceção sobre o recorte atual (sem o próprio filtro de exceção), na ordem fixa. */
export function exceptionCounts(rows, exceptions) {
  const counts = Object.fromEntries(ORDER.map((k) => [k, 0]));
  let any = 0;
  for (const c of rows) { const list = exceptions.get(c.id); if (list.length) any += 1; for (const k of list) counts[k] += 1; }
  return { any, items: ORDER.filter((k) => counts[k]).map((k) => ({ key: k, label: CONTRACT_EXCEPTIONS[k].label, hint: CONTRACT_EXCEPTIONS[k].hint, count: counts[k] })) };
}

/** Resumo por instituição (contratos vigentes e com exceção), sem score. */
export function institutionSummary(rows, exceptions) {
  const by = new Map();
  for (const c of rows) {
    if (!c.provider_id) continue;
    const r = by.get(c.provider_id) || { providerId: c.provider_id, name: c.provider_name || 'Instituição', live: 0, withExceptions: 0, products: new Set() };
    if (LIVE.has(c.status)) r.live += 1;
    if (exceptions.get(c.id).length) r.withExceptions += 1;
    r.products.add(c.product);
    by.set(c.provider_id, r);
  }
  return [...by.values()].map((r) => ({ ...r, products: [...r.products] })).sort((a, b) => b.withExceptions - a.withExceptions || b.live - a.live || a.name.localeCompare(b.name, 'pt-BR'));
}
