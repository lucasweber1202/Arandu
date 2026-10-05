import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { RULES, OPPORTUNITY_TYPES, OPPORTUNITY_ACTIONS, OPPORTUNITY_TRANSITIONS, whyText, presentOpportunityPage, presentOpportunityDetail, presentRules, sourceHref } from '../lib/finance/opportunity-presenter.mjs';
import { opportunityFilters, validateTransition, ruleInput } from '../lib/api/domains/finance-opportunities.mjs';
import { handleFinance } from '../lib/api/domains/finance.mjs';
import { graphHref, GRAPH_KINDS } from '../lib/finance/graph.mjs';
import { DATA_REGISTRY } from '../lib/finance/data-governance.mjs';

const ORG = '00000000-0000-4000-8000-0000000000a1';
const ID = '00000000-0000-4000-8000-0000000000b1';

// Catálogo JS = catálogo SQL; limiares financeiros sem padrão.
const sql = readFileSync('docs/supabase-financial-covenants.sql', 'utf8');
const sqlKeys = [...sql.matchAll(/^\s+\('([a-z_]+)', (?:'\{\}'::text\[\]|array\[)/gm)].map((m) => m[1]);
assert.deepEqual([...sqlKeys].sort(), Object.keys(RULES).sort(), 'rule catalog diverged between SQL and JS');
for (const key of ['proposal_count_below', 'provider_concentration', 'facility_utilization', 'approval_exception_frequency', 'contract_without_sourcing']) {
  assert.ok(Object.values(RULES[key]).includes(null), `${key} must have no financial default`);
  assert.match(sql, new RegExp(`\\('${key}', array\\[`), `${key} must declare required parameters in SQL`);
}
assert.deepEqual(Object.keys(OPPORTUNITY_TYPES).sort(), Object.keys(RULES).sort());

// "Por que disparou" existe para todo tipo e nunca recomenda nem decide.
const banned = /recomend|melhor (banco|proposta|provedor)|deve contratar|escolha |aprovad[oa] automaticamente|cobran[çc]a indevida|erro do banco|fraude|ranking/i;
for (const key of Object.keys(RULES)) {
  const text = whyText(key, { notice_date: '2026-03-16', ends_on: '2026-04-15', days_to_notice: 15, share_pct: 80, currency: 'BRL', proposals: 1, exceptions: 4, variance_amount: 20 }, { lead_days: 30, max_share_pct: 60, min_proposals: 3, window_days: 30, min_count: 3, lookback_months: 24, grace_days: 30 });
  assert.ok(text.length > 20 && text !== 'Fato registrado pela regra.', key);
  assert.doesNotMatch(text, banned, key);
}
for (const label of [...Object.values(OPPORTUNITY_TYPES), ...Object.values(OPPORTUNITY_ACTIONS)]) assert.doesNotMatch(label, banned, label);
// Nas fontes, "sem ranking" é negação legítima; fora isso vale a mesma regra.
const bannedSource = new RegExp(banned.source.replace('|ranking', ''), 'i');
for (const file of ['lib/finance/opportunity-presenter.mjs', 'lib/api/domains/finance-opportunities.mjs', 'finance/src/views/opportunities.js']) {
  assert.doesNotMatch(readFileSync(file, 'utf8').replace(/^\s*\/\/.*$/gm, ''), bannedSource, file);
}
// Nenhuma ação material automática no catálogo.
for (const action of Object.keys(OPPORTUNITY_ACTIONS)) assert.doesNotMatch(action, /select|approve|accept|pay|move|hedge|invest|sign/);
for (const terminal of ['acted', 'dismissed', 'expired']) assert.equal(OPPORTUNITY_TRANSITIONS[terminal], undefined);

assert.equal(validateTransition({ expected_status: 'open', to_status: 'acted', resolution: 'skip' }) !== null, true);
assert.ok(validateTransition({ expected_status: 'under_review', to_status: 'dismissed' }));
assert.equal(validateTransition({ expected_status: 'under_review', to_status: 'dismissed', dismissal_reason: 'already_handled' }), null);
assert.ok(validateTransition({ expected_status: 'acknowledged', to_status: 'acted', resolution: 'ok' }));
assert.equal(validateTransition({ expected_status: 'acknowledged', to_status: 'acted', resolution: 'Renewal RFQ sent by treasury' }), null);
assert.ok(validateTransition({ expected_status: 'open', to_status: 'acknowledged', note: '<b>' }));
assert.throws(() => opportunityFilters(new URLSearchParams('status=won')));
assert.throws(() => opportunityFilters(new URLSearchParams('due_before=2026-02-31x')));
assert.throws(() => opportunityFilters(new URLSearchParams('limit=51')));
assert.deepEqual(ruleInput({ rule: 'provider_concentration|2', enabled: 'true', max_share_pct: 60, lead_days: 30, reason: 'Board policy' }),
  { key: 'provider_concentration', expected: 2, input: { enabled: true, parameters: { max_share_pct: 60 }, reason: 'Board policy' } }, 'foreign parameters are dropped');
assert.ok(ruleInput({ rule: 'invented|0', enabled: 'true', reason: 'x' }).error);
assert.ok(ruleInput({ rule: 'contract_renewal|0', enabled: 'maybe', reason: 'Valid reason' }).error);

// Apresentação: regra não configurada mostra padrão operacional ou exige limiar da empresa.
const rulesText = presentRules([{ rule_key: 'contract_renewal', version: 2, enabled: true, parameters: { lead_days: 30 } }]).join('\n');
assert.match(rulesText, /Renovação de contrato se aproxima · v2 · ativa/);
assert.match(rulesText, /Concentração acima da política da sua empresa · não configurada \(limiar definido pela sua empresa\)/);
const opp = { id: ID, organization_id: ORG, opportunity_type: 'contract_renewal', status: 'open', rule_version: 1, rule_snapshot: { parameters: { lead_days: 30, cooldown_days: 10 } },
  facts_snapshot: { notice_date: '2026-03-16', ends_on: '2026-04-15', days_to_notice: 15 }, current_facts: { notice_date: '2026-03-16', ends_on: '2026-04-15', days_to_notice: 14 },
  source_object_type: 'contract', source_object_id: ID, discriminator: '', deadline: '2026-03-16', opened_at: '2026-03-01T00:00:00Z', last_seen_at: '2026-03-02T00:00:00Z', possible_action: 'open_sourcing', reopen_count: 0 };
const page = presentOpportunityPage({ rows: [opp], summary: [{ status: 'open', opportunities: 1, due_30: 1, overdue: 0 }], next: null, rules: [], today: '2026-03-02' });
assert.match(page.rows[0].cells[1], /Aviso prévio em 16\/03\/2026/);
assert.equal(page.cards[1].actions[0].post, 'opportunities/rules');
const detail = presentOpportunityDetail({ opportunity: opp, events: [], reviewers: [{ user_id: ID, display_name: 'Revisora' }] });
assert.deepEqual(detail.actions.map((a) => a.fixed.to_status || 'rfq'), ['acknowledged', 'under_review', 'dismissed', 'rfq']);
assert.equal(detail.actions.at(-1).fields[0][2], 'checkbox', 'RFQ draft requires explicit confirmation');
assert.equal(presentOpportunityDetail({ opportunity: { ...opp, source_object_type: 'facility' } }).actions.some((a) => a.post === 'opportunities/rfq'), false);
assert.equal(sourceHref({ source_object_type: 'fee_variance', source_object_id: ID }), `/finance/fees.html?id=${ID}`);
assert.ok(GRAPH_KINDS.includes('opportunity'));
assert.equal(graphHref({ object_type: 'opportunity', object_id: ID }), `/finance/opportunities.html?id=${ID}`);
assert.equal(graphHref({ object_type: 'opportunity', object_id: 'javascript:x' }), null);
for (const table of ['fin_opportunity_rules', 'fin_opportunities', 'fin_opportunity_events']) assert.ok(DATA_REGISTRY[table]?.export_dataset && DATA_REGISTRY[table].legal_hold_applicable, table);
assert.equal(DATA_REGISTRY.fin_opportunity_scans.exportable, false);

// Job: a cron diária executa o motor com lease próprio.
assert.match(readFileSync('lib/api/domains/finance-jobs.mjs', 'utf8'), /\['opportunities', 'fin_run_opportunity_engine'/);

process.env.SUPABASE_URL = 'https://fixture.example.invalid';
process.env.SUPABASE_ANON_KEY = 'fixture-public';
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
let sent = [];
globalThis.fetch = async (url, options = {}) => {
  const u = new URL(url);
  sent.push({ url: u.pathname, headers: options.headers, payload: options.body ? JSON.parse(options.body) : null });
  if (u.pathname.endsWith('/fin_organizations')) return new Response(JSON.stringify([{ id: ORG, kind: 'BUYER' }]));
  if (u.pathname.endsWith('/fin_list_opportunities')) return new Response(JSON.stringify([opp, { ...opp, id: ORG }]));
  if (u.pathname.endsWith('/fin_opportunity_summary')) return new Response(JSON.stringify([{ status: 'open', opportunities: 2, due_30: 1, overdue: 0 }]));
  if (u.pathname.endsWith('/fin_opportunities')) return new Response(JSON.stringify([]));
  if (u.pathname.includes('/rpc/fin_')) return new Response(JSON.stringify('acknowledged'));
  return new Response('[]');
};
const deps = { requireUser: async () => ({ user: { id: ORG }, accessToken: 'caller-jwt', headers: {} }), enforceRateLimit: async () => {} };
async function call(method, path, body = null) {
  const req = Object.assign(Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []), { method, url: `/api/finance/${path}`, headers: {} });
  const res = { setHeader() {}, end(raw) { this.payload = JSON.parse(raw); } };
  await handleFinance(req, res, path.split('?')[0], deps);
  return res.payload;
}
const data = await call('GET', `opportunities?organization_id=${ORG}&status=open&limit=1`);
assert.equal(data.rows.length, 1); assert.equal(data.next, ID);
assert.equal(sent.find((s) => s.url.endsWith('fin_list_opportunities')).payload.p_status, 'open');
for (const s of sent) assert.equal(s.headers.Authorization, 'Bearer caller-jwt');
assert.ok(!sent.some((s) => /fin_(evaluate|run)_opportun/.test(s.url)), 'a user request must never run the engine');
sent = [];
await assert.rejects(() => call('POST', 'opportunities/transition', { opportunity_id: ID, expected_status: 'open', to_status: 'acted', resolution: 'Skip' }), (e) => e.status === 400);
await assert.rejects(() => call('POST', 'opportunities/rfq', { opportunity_id: ID, confirmed: 'yes' }), (e) => e.status === 400);
await assert.rejects(() => call('POST', 'opportunities/rules', { organization_id: ORG, rule: 'invented|0', enabled: true, reason: 'Invalid rule' }), (e) => e.status === 400);
assert.ok(!sent.some((s) => s.url.includes('/rpc/')), 'invalid input reached a write RPC');
assert.equal((await call('POST', 'opportunities/transition', { opportunity_id: ID, expected_status: 'open', to_status: 'acknowledged' })).status, 'acknowledged');
await assert.rejects(() => call('GET', `opportunities/detail?id=${ID}`), (e) => e.status === 404);
console.log('Opportunity engine: SQL/JS catalog parity, no hidden financial thresholds, explained triggers, no recommendation language, closed transitions, confirmed RFQ draft, JWT-only API without engine scans passed.');
