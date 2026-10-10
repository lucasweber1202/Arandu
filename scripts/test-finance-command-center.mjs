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

// Regressão: o menu montado em JS omitia módulos que a casca estática lista,
// deixando-os sem entrada no menu depois do boot. Toda entrada estática existe
// no menu de runtime, com a mesma exclusão do sandbox legado /demo.
{
  const generator = readFileSync('scripts/generate-finance-pages.mjs', 'utf8');
  const staticBlock = generator.slice(generator.indexOf('const COMPANY_NAV'), generator.indexOf('const PROVIDER_NAV'));
  const staticNav = [...staticBlock.matchAll(/\['[^']+', '([^']+)'(, 'sandboxExcluded')?\]/g)].map((m) => ({ path: m[1], excluded: Boolean(m[2]) }));
  const shell = readFileSync('finance/src/shell.js', 'utf8');
  const runtimeBlock = shell.slice(shell.indexOf('const COMPANY_NAV'), shell.indexOf('const PROVIDER_NAV'));
  const runtime = new Map([...runtimeBlock.matchAll(/\{[^}]*path: '([^']+)'[^}]*\}/g)].map((m) => [m[1], /sandboxExcluded: true/.test(m[0])]));
  assert.ok(staticNav.length > 10);
  for (const item of staticNav) {
    assert.ok(runtime.has(item.path), `menu de runtime sem ${item.path}`);
    assert.equal(runtime.get(item.path), item.excluded, `exclusão do sandbox divergente em ${item.path}`);
  }
  assert.match(shell, /mode === 'demo' \? COMPANY_NAV\.filter\(\(item\) => !item\.sandboxExcluded\)/);
}
console.log('Financial command center: OK (search kinds SQL/API/labels and static/runtime navigation parity)');
