import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { presentExecutive } from '../lib/finance/executive-presenter.mjs';
import { handleFinance } from '../lib/api/domains/finance.mjs';

const ORG = '00000000-0000-4000-8000-0000000000a1';
const ENT = '00000000-0000-4000-8000-0000000000b1';
const filters = { start: '2026-01-01', end: '2026-12-31', entity: ENT };
const value = [
  { kind: 'NEGOTIATED_SAVINGS', currency: 'BRL', records: 2, comparable: 2, value_amount: 300 },
  { kind: 'REALIZED_SAVINGS', currency: 'BRL', records: 1, comparable: 1, value_amount: 120 },
  { kind: 'COST_AVOIDANCE', currency: 'BRL', records: 1, comparable: 1, value_amount: 50 },
  { kind: 'NEGOTIATED_SAVINGS', currency: 'USD', records: 1, comparable: 0, value_amount: null }
];
const fees = [{ currency: 'BRL', observations: 4, verified: 2, comparable: 3, not_comparable: 1, missing_reference: 0, above: 2, below: 1, equal: 0,
  above_total: 30, below_total: -10, open_review: 1, under_review: 1, closed_review: 1, schedules: 3, schedules_observed: 2 }];
const opportunities = [{ status: 'open', opportunities: 3, due_30: 2, overdue: 1 }, { status: 'under_review', opportunities: 1, due_30: 0, overdue: 0 },
  { status: 'acted', opportunities: 4, due_30: 0, overdue: 0 }, { status: 'expired', opportunities: 9, due_30: 0, overdue: 9 }];
const out = presentExecutive({ value, fees, opportunities, filters, today: '2026-03-02' });
const [v, f, o] = out.cards;
const all = JSON.stringify(out);

// Moedas nunca somadas; tipos nunca somados entre si; custo evitado não é caixa.
assert.equal(v.lines.length, 2);
assert.match(v.lines[0], /^BRL: economia negociada R\$\s?300,00 \(2\/2 com cálculo\) · economia realizada R\$\s?120,00 \(1\/1 com cálculo\) · custo evitado R\$\s?50,00/);
assert.match(v.lines[1], /^USD: economia negociada sem cálculo defensável \(0\/1 com cálculo\) · economia realizada — · custo evitado —$/);
assert.doesNotMatch(all, /470|420|350/, 'no cross-kind sum may appear');
assert.match(v.note, /Cobertura: 4\/5 registros ativos com cálculo defensável; 1 realizações verificadas/);
assert.match(v.note, /custo evitado não é caixa/);
// Tarifas: diferença com sinal explícito, cobertura e revisão; sem economia.
assert.match(f.lines[0], /BRL: 2 acima da referência contratada \(diferença R\$\s?30,00\) · 1 abaixo \(diferença R\$\s?10,00\) · 1 não comparáveis · 0 sem referência/);
assert.match(f.lines[1], /1 com revisão necessária · 1 em revisão · 1 resolvidas ou descartadas/);
assert.match(f.note, /BRL 2\/3 tarifas contratadas com observação comparável, 50% das observações verificadas/);
assert.match(f.note, /Diferença não é economia nem acusação/);
// Oportunidades: só estados ativos contam como ativas; expiradas não entram.
assert.match(o.lines[0], /^4 ativas · 2 com prazo nos próximos 30 dias · 1 com prazo vencido$/);
assert.match(o.lines[1], /^4 com ação registrada por pessoa$/);
// Links de ação preservam escopo.
assert.ok(f.links[0].href.includes('review_status=new') && f.links[0].href.includes(`legal_entity_id=${ENT}`));
assert.ok(o.links[1].href.includes('due_before=2026-04-01'));
for (const card of out.cards) for (const link of card.links) assert.match(link.href, /^\/finance\/[a-z]+\.html\?/);
// Linguagem segura e sem recomendação.
assert.doesNotMatch(all, /recomend|melhor (banco|proposta|provedor)|cobran[çc]a indevida|erro do banco|fraude|ranking de/i);
// Sem dados: sem números inventados.
const empty = presentExecutive({ filters, today: '2026-03-02' });
assert.deepEqual(empty.cards[0].lines, ['Sem registros de valor no período.']);
assert.deepEqual(empty.cards[1].lines, ['Sem cobranças observadas no período.']);
assert.match(empty.cards[1].note, /Sem dado não é zero/);
assert.match(empty.cards[0].note, /Cobertura: 0\/0/);

// Painel carrega a seção sob demanda e só fora da demo.
const dash = readFileSync('finance/src/views/dashboard.js', 'utf8');
assert.match(dash, /ctx\.mode === 'demo' \? null : await import\('\.\/executive\.js'\)/);
assert.doesNotMatch(dash, /^import .*executive/m);

// API: só JWT de quem chama, três resumos existentes, sem RPC de escrita; período validado.
process.env.SUPABASE_URL = 'https://fixture.example.invalid';
process.env.SUPABASE_ANON_KEY = 'fixture-public';
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
let sent = [];
globalThis.fetch = async (url, options = {}) => {
  const u = new URL(url);
  sent.push({ url: u.pathname, headers: options.headers, payload: options.body ? JSON.parse(options.body) : null });
  if (u.pathname.endsWith('/fin_organizations')) return new Response(JSON.stringify([{ id: ORG, kind: 'BUYER' }]));
  if (u.pathname.endsWith('/fin_value_totals')) return new Response(JSON.stringify(value));
  if (u.pathname.endsWith('/fin_fee_summary')) return new Response(JSON.stringify(fees));
  if (u.pathname.endsWith('/fin_opportunity_summary')) return new Response(JSON.stringify(opportunities));
  return new Response('[]');
};
const deps = { requireUser: async () => ({ user: { id: ORG }, accessToken: 'caller-jwt', headers: {} }), enforceRateLimit: async () => {} };
async function call(method, path) {
  const req = Object.assign(Readable.from([]), { method, url: `/api/finance/${path}`, headers: {} });
  const res = { setHeader() {}, end(raw) { this.payload = JSON.parse(raw); } };
  await handleFinance(req, res, path.split('?')[0], deps);
  return res.payload;
}
const data = await call('GET', `executive?organization_id=${ORG}&start=2026-01-01&end=2026-06-30&legal_entity_id=${ENT}`);
assert.equal(data.cards.length, 3);
assert.deepEqual(data.filters, { start: '2026-01-01', end: '2026-06-30', entity: ENT });
const rpcs = sent.filter((s) => s.url.includes('/rpc/')).map((s) => s.url.split('/').at(-1)).sort();
assert.deepEqual(rpcs, ['fin_fee_summary', 'fin_opportunity_summary', 'fin_value_totals']);
assert.equal(sent.find((s) => s.url.endsWith('fin_value_totals')).payload.p_entity, ENT);
for (const s of sent) assert.equal(s.headers.Authorization, 'Bearer caller-jwt');
sent = [];
for (const bad of ['start=2026-02-31', 'start=2026-07-01&end=2026-01-01', 'start=2020-01-01&end=2026-12-31', 'legal_entity_id=x']) {
  await assert.rejects(() => call('GET', `executive?organization_id=${ORG}&${bad}`), (e) => e.status === 400, bad);
}
assert.ok(!sent.some((s) => s.url.includes('/rpc/')), 'invalid filters reached an RPC');
await assert.rejects(() => call('POST', `executive?organization_id=${ORG}`), (e) => e.status === 405);
console.log('Value intelligence executive: per-currency and per-kind separation, coverage, safe language, scoped action links, lazy dashboard section and JWT-only read API passed.');
