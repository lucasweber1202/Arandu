import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { commandItems, searchCommandItems, SEARCH_KINDS, SEARCH_KIND_LABELS } from '../lib/finance/command-center.mjs';

const data = {
  rfqs: [{
    id: 'a?b', title: 'Crédito expansão', status: 'open',
    proposals: [{ provider_name: 'Banco Árvore' }]
  }],
  providers: [{ name: 'Instituição Litoral', region: 'Rio' }],
  contracts: [{ provider_name: 'Banco Horizonte', ends_on: '2027-02-01' }],
  tasks: [{ title: 'Revisar garantias', due_on: '2026-10-01' }]
};
const items = commandItems(data);
assert.equal(searchCommandItems(items, '')[0].title, 'Criar solicitação');
assert.equal(searchCommandItems(items, 'credito expansao')[0].href, '/finance/rfq.html?id=a%3Fb');
assert.equal(searchCommandItems(items, 'arvore')[0].kind, 'Proposta');
assert.equal(searchCommandItems(items, 'litoral')[0].kind, 'Provedor');
assert.equal(searchCommandItems(items, '2027-02')[0].kind, 'Contrato');
assert.equal(searchCommandItems(items, 'garantias')[0].kind, 'Tarefa');
assert.deepEqual(searchCommandItems(commandItems({ rfqs: [] }), 'crédito'), []);
assert.equal(searchCommandItems(items, 'banco', 1).length, 1);

// Regressão: a API recusava type=performance|spend, aceitos por fin_search.
// Banco (última definição do manifesto), API e rótulos usam o mesmo conjunto.
const manifest = JSON.parse(readFileSync('docs/supabase-migrations.json', 'utf8'));
const searchSql = manifest.cleanInstall.map((file) => readFileSync(file, 'utf8')).filter((sql) => sql.includes('create or replace function public.fin_search(')).at(-1);
const sqlKinds = /p_kind not in \(([^)]*)\)/.exec(searchSql.slice(searchSql.lastIndexOf('create or replace function public.fin_search(')))[1].match(/'([a-z]+)'/g).map((v) => v.slice(1, -1));
assert.deepEqual([...sqlKinds].sort(), [...SEARCH_KINDS].sort(), 'tipos de busca divergentes entre SQL e API');
for (const kind of SEARCH_KINDS) assert.ok(SEARCH_KIND_LABELS[kind], `rótulo ausente: ${kind}`);
{
  const ORG = '00000000-0000-4000-8000-0000000000c1';
  const { handleFinance } = await import('../lib/api/domains/finance.mjs');
  process.env.SUPABASE_URL = 'https://fixture.example.invalid'; process.env.SUPABASE_ANON_KEY = 'fixture-public'; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const rpcs = [];
  globalThis.fetch = async (url, options = {}) => { const u = new URL(url); if (u.pathname.includes('/rpc/')) rpcs.push(JSON.parse(options.body)); return new Response(u.pathname.endsWith('/fin_organizations') ? JSON.stringify([{ id: ORG, kind: 'BUYER' }]) : '[]'); };
  const deps = { requireUser: async () => ({ user: { id: ORG }, accessToken: 'caller-jwt', headers: {} }), enforceRateLimit: async () => {} };
  const call = async (path) => { const req = Object.assign(Readable.from([]), { method: 'GET', url: `/api/finance/${path}`, headers: {} }); const res = { setHeader() {}, end(raw) { this.payload = JSON.parse(raw); } }; await handleFinance(req, res, path.split('?')[0], deps); return res.payload; };
  for (const kind of SEARCH_KINDS) assert.equal((await call(`search?organization_id=${ORG}&q=giro&type=${kind}`)).ok, true, `tipo recusado: ${kind}`);
  assert.deepEqual(rpcs.map((body) => body.p_kind), SEARCH_KINDS);
  await assert.rejects(() => call(`search?organization_id=${ORG}&q=giro&type=artwork`), (e) => e.status === 400);
}

// Menu: fonte única (lib/finance/navigation.mjs) para a casca estática e o
// runtime; nenhuma rota do menu anterior se perde na reorganização em áreas.
{
  const { COMPANY_AREAS, PROVIDER_AREAS, areasFor, navItems, locate } = await import('../lib/finance/navigation.mjs');
  const generator = readFileSync('scripts/generate-finance-pages.mjs', 'utf8');
  const shell = readFileSync('finance/src/shell.js', 'utf8');
  assert.match(generator, /from '\.\.\/lib\/finance\/navigation\.mjs'/);
  assert.match(shell, /from '\.\.\/\.\.\/lib\/finance\/navigation\.mjs'/);
  assert.doesNotMatch(generator, /const COMPANY_NAV/);
  assert.doesNotMatch(shell, /const COMPANY_NAV/);
  assert.deepEqual(COMPANY_AREAS.map((area) => area.label), ['Meu trabalho', 'Contratações', 'Portfólio financeiro', 'Relacionamentos', 'Governança']);
  // Todas as rotas do menu plano de 21 itens (até a #158) continuam no menu.
  const previous = ['dashboard', 'rfqs', 'approvals', 'proposals', 'implementations', 'spend', 'performance', 'covenants', 'extractions', 'contracts', 'portfolio', 'value', 'fees', 'opportunities', 'providers', 'qualifications', 'passport', 'tasks', 'notifications', 'settings'];
  const paths = navItems('company').map((item) => item.path);
  for (const key of previous) assert.ok(paths.includes(`/finance/${key}.html`), `rota perdida: ${key}`);
  assert.equal(new Set(paths).size, paths.length, 'rota duplicada no menu');
  // Sandbox legado /demo continua sem as páginas excluídas.
  assert.ok(navItems('company', 'demo').every((item) => !item.sandboxExcluded));
  assert.ok(navItems('company', 'demo').length < navItems('company').length);
  assert.ok(areasFor('company', 'demo').every((area) => area.items.length));
  // Views internas ficam na área certa (deep links mantêm o contexto).
  assert.equal(locate('company', 'rfq').area, 'sourcing');
  assert.equal(locate('company', 'newRfq').key, 'rfqs');
  assert.equal(locate('company', 'home').key, 'dashboard');
  assert.equal(locate('provider', 'providerProposal').key, 'providerRfqs');
  assert.equal(PROVIDER_AREAS.flatMap((area) => area.items).some((item) => item.path.startsWith('/finance/')), false, 'provedor não recebe rota da empresa');
}
// Intake por objetivo: só fluxos existentes, permissão respeitada e ação da URL de lista fechada.
{
  const { INTENTS, intentsFor, requestedAction, INTENT_ACTIONS } = await import('../lib/finance/intents.mjs');
  const { PAGES } = await import('./generate-finance-pages.mjs');
  const pages = new Set(PAGES.map((page) => `/${page.path}`));
  for (const intent of INTENTS) assert.ok(pages.has(intent.path.split('?')[0]), `intenção sem página existente: ${intent.key}`);
  const { canRole } = await import('../lib/finance/permissions.mjs');
  const viewer = intentsFor((permission) => canRole('viewer', permission));
  assert.ok(viewer.every((intent) => !intent.permission), 'leitor recebeu ação de criação');
  assert.ok(viewer.some((intent) => intent.key === 'compare'));
  assert.equal(intentsFor(() => true).length, INTENTS.length);
  for (const role of ['admin', 'finance_manager', 'analyst', 'approver', 'viewer', 'provider_user', null, 'unknown']) {
    const keys = intentsFor((permission) => canRole(role, permission)).map((intent) => intent.key);
    assert.equal(keys.includes('facility'), ['admin', 'finance_manager', 'analyst'].includes(role), `facility: ${role}`);
    for (const key of ['credit', 'acquiring', 'renew', 'contract', 'institution', 'fees']) {
      assert.equal(keys.includes(key), ['admin', 'finance_manager'].includes(role), `${key}: ${role}`);
    }
    assert.equal(canRole(role, 'unknown_permission'), false, 'permissão desconhecida falha fechada');
  }
  assert.equal(canRole(null, 'create_rfq'), false, 'sem papel confirmado não oferece escrita');
  assert.equal(requestedAction('?acao=registrar-contrato'), 'registrar-contrato');
  for (const bad of ['?acao=logout', '?acao=%5Bdata-intent%5D', '?acao=', '']) assert.equal(requestedAction(bad), null, bad);
  const sources = ['finance/src/views/contract-center.js', 'finance/src/views/company.js', 'finance/src/views/portfolio.js'].map((file) => readFileSync(file, 'utf8')).join('\n');
  for (const action of INTENT_ACTIONS) assert.ok(sources.includes(`'data-intent': '${action}'`), `sem botão para ${action}`);
  for (const intent of INTENTS.filter((item) => item.path.includes('acao='))) assert.ok(INTENT_ACTIONS.includes(new URLSearchParams(intent.path.split('?')[1]).get('acao')));
}
console.log('Financial command center: OK (search kinds SQL/API/labels and static/runtime navigation parity)');
