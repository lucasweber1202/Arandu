#!/usr/bin/env node
// Carteira e obrigações em escala (#FOS8): filtros validados no servidor,
// keyset por id, escopo pela organização do chamador e JWT do chamador.
// HTTP simulado: confere a consulta PostgREST montada, não o banco real.
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { handleFinance, contractPageQuery } from '../lib/api/domains/finance.mjs';
import { obligationFilters } from '../lib/api/domains/finance-covenants.mjs';

const ORG = '00000000-0000-4000-8000-0000000000c1';
const P = '00000000-0000-4000-8000-0000000000d1';
const q = (s) => new URLSearchParams(s);

// Obrigações: estado, janela e responsável.
assert.equal(obligationFilters(q('status=open')), '&facts->>status=not.in.(compliant,waived,not_applicable)');
assert.equal(obligationFilters(q('status=awaiting_data,under_review')), '&facts->>status=in.(awaiting_data,under_review)');
assert.equal(obligationFilters(q('due_after=2026-11-01&due_before=2026-12-31')), '&due_on=gte.2026-11-01&due_on=lte.2026-12-31');
assert.equal(obligationFilters(q('owner_id=none&no_due=true')), '&owner_id=is.null&due_on=is.null');
for (const bad of ['status=oops', 'status=open,compliant', 'due_before=2026-02-30', 'due_after=2027-01-01&due_before=2026-01-01', 'owner_id=x', 'no_due=1'])
  assert.throws(() => obligationFilters(q(bad)), (e) => e.status === 400, bad);

// Carteira paginada: filtros e keyset.
assert.deepEqual(contractPageQuery(q('organization_id=x&paged=1'), ORG), { filter: `organization_id=eq.${ORG}`, limit: 100 });
const f = contractPageQuery(q(`paged=1&provider_id=${P}&status=ended&owner=none&product=credit&after=${P}&limit=25`), ORG).filter;
assert.equal(f, `organization_id=eq.${ORG}&id=gt.${P}&provider_id=eq.${P}&product=eq.credit&status=not.in.(active,renewing)&owner_id=is.null`);
assert.match(contractPageQuery(q('q=Capital de giro'), ORG).filter, /title=ilike\.\*Capital%20de%20giro\*$/);
for (const bad of ['unknown=1', 'limit=0', 'limit=101', 'status=x', 'q=a', 'q=%25', 'q=a*b', 'q=x,y', 'product=Credit', 'owner=1', 'after=abc'])
  assert.throws(() => contractPageQuery(q(bad), ORG), (e) => e.status === 400, bad);

// Rota: JWT do chamador, organização do servidor, próxima página só quando há mais.
const sent = [];
let contractRows = [];
globalThis.fetch = async (url, options = {}) => {
  const u = new URL(url);
  sent.push({ path: u.pathname, search: decodeURIComponent(u.search), auth: options.headers?.Authorization });
  if (u.pathname.endsWith('/fin_organizations')) return new Response(JSON.stringify([{ id: ORG, kind: 'BUYER' }]));
  if (u.pathname.endsWith('/fin_contracts')) return new Response(JSON.stringify(contractRows));
  if (u.pathname.endsWith('/fin_providers')) return new Response(JSON.stringify([{ id: P, name: 'Atlas Bank' }]));
  return new Response('[]');
};
process.env.SUPABASE_URL = 'https://fixture.example.invalid'; process.env.SUPABASE_ANON_KEY = 'fixture-public'; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const deps = { requireUser: async () => ({ user: { id: ORG }, accessToken: 'caller-jwt', headers: {} }), enforceRateLimit: async () => {} };
async function call(path) { const req = Object.assign(Readable.from([]), { method: 'GET', url: `/api/finance/${path}`, headers: {} }); const res = { setHeader() {}, end(raw) { this.payload = JSON.parse(raw); } }; await handleFinance(req, res, path.split('?')[0], deps); return res.payload; }

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
contractRows = Array.from({ length: 4 }, (_, i) => ({ id: id(i + 1), organization_id: ORG, provider_id: P, status: 'active', ends_on: '2027-01-01', renewal_notice_days: 60 }));
const first = await call(`contracts?organization_id=${ORG}&paged=1&limit=3&status=live`);
assert.equal(first.rows.length, 3); assert.equal(first.next, id(3)); assert.equal(first.rows[0].provider_name, 'Atlas Bank');
const read = sent.find((s) => s.path.endsWith('/fin_contracts'));
assert.match(read.search, new RegExp(`organization_id=eq\\.${ORG}&status=in\\.\\(active,renewing\\)&order=id\\.asc&limit=4`));
contractRows = contractRows.slice(0, 2);
assert.equal((await call(`contracts?organization_id=${ORG}&paged=1&limit=3`)).next, null, 'última página sem cursor');
await assert.rejects(() => call(`contracts?organization_id=${ORG}&paged=1&evil=1`), (e) => e.status === 400);
// Modo legado intocado: sem paged, mesma consulta de antes.
sent.length = 0; await call(`contracts?organization_id=${ORG}`);
assert.match(sent.find((s) => s.path.endsWith('/fin_contracts')).search, /order=ends_on\.asc&limit=100$/);
sent.length = 0; await call(`covenants?organization_id=${ORG}&status=open&due_before=2026-12-31`);
assert.match(sent.find((s) => s.path.endsWith('/fin_obligation_monitor')).search, /facts->>status=not\.in\.\(compliant,waived,not_applicable\)&due_on=lte\.2026-12-31&order=due_on\.asc/);
for (const s of sent) assert.equal(s.auth, 'Bearer caller-jwt');
console.log('portfolio-scale: ok');
