// API simulada para medir peso de JavaScript por jornada. Não é validação de
// backend: só garante que cada tela renderize o mesmo caminho de código que a
// sessão real percorreria, para os bytes carregados serem representativos.
export const ORG = '00000000-0000-4000-8000-0000000000a1';
export const PROVIDER_ORG = '00000000-0000-4000-8000-0000000000c1';
export const PA = '00000000-0000-4000-8000-0000000000b1';
export const PROPOSAL = '00000000-0000-4000-8000-0000000000d1';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const FIXED = Date.parse('2026-11-05T12:00:00Z');
const day = (o) => new Date(FIXED + o * 86400000).toISOString().slice(0, 10);
const contract = (n, over = {}) => ({ id: id(n), organization_id: ORG, provider_id: PA, provider_name: 'Atlas Bank', product: 'credit', origin: 'imported', title: `Contrato ${n}`, status: 'active',
  starts_on: day(-400), ends_on: day(700), renewal_notice_days: 60, review_from: day(640), current_version: 1, document_reference: 'CCB 1', owner_id: 'u1', currency: 'BRL', legal_entity_id: null, ...over });
export const OK = contract(1, { title: 'Giro em dia' });
export const RENEWAL = contract(2, { title: 'Giro em renovação', ends_on: day(40) });
const CONTRACTS = [OK, RENEWAL, contract(3, { owner_id: null, document_reference: null })];
const covenant = { id: id(901), title: 'Covenant 1', kind_label: 'Covenant financeiro', status: 'awaiting_data', status_label: 'Aguardando dados', has_data: false, due_on: day(10), contract_id: OK.id, provider_id: PA, legal_entity_id: null, owner_id: 'u1', cells: [] };
const ASSIGNMENT = { proposal_id: PROPOSAL, rfq_id: id(700), title: 'Capital de giro 2027', product: 'credit', rfq_status: 'open', rfq_revision: 1, response_deadline: '2027-12-01',
  buyer_name: 'Empresa compradora', demand: { amount: 1000000, purpose: 'capital_de_giro', term_months: 24 }, version: null, terms: {}, has_draft: false };

/** Resposta da API simulada para (persona, caminho, query). */
export function fixture(persona, path, q) {
  if (persona === 'provider') {
    if (path === 'organizations') return { ok: true, rows: [{ id: PROVIDER_ORG, kind: 'PROVIDER', legal_name: 'Banco Atlas S.A.' }] };
    if (path === 'assignments') return { ok: true, rows: [ASSIGNMENT] };
    if (path === 'members') return { ok: true, rows: [], viewer_id: 'u1' };
    if (path === 'proposal-draft') return { ok: true, draft: null };
    return { ok: true, rows: [] };
  }
  if (path === 'organizations') return { ok: true, rows: [{ id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }] };
  if (path === 'overview') return { ok: true, organization: { id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta', sector: 'industry' }, providers: [{ id: PA, name: 'Atlas Bank', status: 'active' }], contracts: CONTRACTS, rfqs: [], tasks: [] };
  if (path === 'members') return { ok: true, rows: [{ user_id: 'u1', role: 'admin', display_name: 'Paula Nogueira' }], viewer_id: 'u1' };
  if (path === 'entities') return { ok: true, rows: [], scope: 'group', can_admin: true };
  if (path === 'contracts' && q.get('paged') === '1') return { ok: true, rows: CONTRACTS, next: null, limit: 100 };
  if (path === 'contract-detail') {
    const c = CONTRACTS.find((r) => r.id === q.get('id'));
    return c ? { ok: true, contract: c, effective: null, versions: [], amendments: [], milestones: [], children: [], documents: [], events: [], renewal_milestones: [],
      next_actions: [{ code: 'renewal_review', reason: 'Janela de renovação aberta.', source: 'contract', state: 'open', permission: 'edit', action: 'renewal' }] } : { ok: false };
  }
  if (path === 'covenants') return { ok: true, rows: [covenant], next: null, columns: [], cards: [] };
  if (path === 'provider-relationship') return { ok: true, provider: { id: PA, name: 'Atlas Bank' }, neutrality: 'Fatos.', contracts: [OK, RENEWAL], tasks: [], facilities: [], rfqs: [], invites: [], proposals: [], balances: [], contacts: [], issues: [], relationships: [], map: [], timeline: [], reviews: [], templates: [],
    metrics: { invited: 0, responded: 0, response_rate: null, median_response_days: null, active_contracts: 2, open_issues: 0, median_resolution_days: null, definitions: {} } };
  return { ok: true, rows: [] };
}

/**
 * Jornadas medidas. Cada passo é uma navegação completa (como a pessoa abre a
 * tela) e espera um seletor de conteúdo pronto; `click` abre o que é carregado
 * sob demanda (import dinâmico), para o acumulado incluir esses chunks.
 */
export const JOURNEYS = [
  { id: 'buyer', label: 'Comprador: painel → tarefas', persona: 'buyer', steps: [
    { url: '/finance/dashboard.html', ready: 'main h1' }, { url: '/finance/tasks.html', ready: 'main h1' }] },
  { id: 'institution', label: 'Instituição: portal → proposta', persona: 'provider', steps: [
    { url: '/provider/index.html', ready: 'main h1' }, { url: `/provider/proposal.html?proposal=${PROPOSAL}`, ready: 'main h1' }] },
  { id: 'portfolio', label: 'Portfolio: carteira de contratos', persona: 'buyer', steps: [
    { url: '/finance/contracts.html', ready: `#contract-${OK.id}` }] },
  { id: 'contract360', label: 'Contract 360: contrato aberto', persona: 'buyer', steps: [
    { url: `/finance/contracts.html?abrir=contrato#contract-${OK.id}`, ready: '.contract-obligations' }] },
  { id: 'relationship360', label: 'Relationship 360: instituição', persona: 'buyer', steps: [
    { url: `/finance/providers.html?provider_id=${PA}`, ready: '.context-signals' }] },
  { id: 'obligations', label: 'Obrigações: radar → registro de covenants', persona: 'buyer', steps: [
    { url: '/finance/tasks.html#deadline-radar', ready: 'main h1' }, { url: `/finance/covenants.html?contract_id=${OK.id}`, ready: 'main h1' }] },
  { id: 'renewal', label: 'Renovação: contrato em janela → negociações', persona: 'buyer', steps: [
    { url: `/finance/contracts.html?abrir=contrato#contract-${RENEWAL.id}`, ready: '.contract-obligations' }, { url: '/finance/rfqs.html', ready: 'main h1' }] }
];
