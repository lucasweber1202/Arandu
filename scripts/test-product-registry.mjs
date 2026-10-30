import assert from 'node:assert/strict';
import { productRegistry, supportStates, getModality, SUPPORT_STATES, FAMILIES } from '../lib/finance/product-registry.mjs';
import { CONTRACT_CATEGORIES } from '../lib/finance/contract-terms.mjs';
import { handleFinance } from '../lib/api/domains/finance.mjs';

const reg = productRegistry();
assert.ok(reg.modalities.length >= 30, 'dozens of modalities');
assert.equal(FAMILIES.length, 10);
const codes = reg.modalities.map((m) => m.code);
assert.equal(new Set(codes).size, codes.length, 'stable unique codes');
for (const m of reg.modalities) {
  assert.ok(/^[a-z][a-z0-9_]+$/.test(m.code));
  assert.ok(FAMILIES.some((f) => f.code === m.family), `family of ${m.code}`);
  assert.ok(CONTRACT_CATEGORIES[m.contract_category], `canonical category for ${m.code}`);
  assert.ok(m.support.every((s) => SUPPORT_STATES.includes(s)));
  assert.equal(m.support[0], 'CATALOG_ONLY');
  assert.ok(!m.support.includes('INTEGRATION_SUPPORTED'), 'no connector exists: never declared');
  if (m.support.includes('ECONOMICS_ENABLED')) assert.ok(m.support.includes('RFQ_ENABLED') && m.economics?.method);
  if (!m.support.includes('RFQ_ENABLED')) assert.equal(m.rfq_product, null);
  if (m.support.includes('STRUCTURED')) assert.ok(m.term_fields.length > 0);
}
// Honest support: only credit and acquiring negotiate; guarantees/FX/hedge are structured only.
assert.deepEqual(new Set(reg.modalities.filter((m) => m.support.includes('RFQ_ENABLED')).map((m) => m.rfq_product)), new Set(['credit', 'acquiring']));
for (const code of ['bank_guarantee', 'ndf', 'swap', 'fx_spot', 'cdb', 'leasing']) assert.deepEqual(getModality(code).support, ['CATALOG_ONLY', 'STRUCTURED'], code);
assert.equal(getModality('card_acquiring').economics.method, 'acquiring-processing-cost-v2');
assert.deepEqual(supportStates('unknown', 'unknown'), ['CATALOG_ONLY']);
assert.equal(getModality('nope'), null);
// Families with typed terms: >= 3 distinct.
assert.ok(new Set(reg.modalities.filter((m) => m.support.includes('STRUCTURED')).map((m) => m.contract_category)).size >= 3);
// API: public metadata, rate-limited, no session, no org data.
let limited = 0; const res = { headers: {}, statusCode: 0, body: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, writeHead(s, h = {}) { this.statusCode = s; Object.assign(this.headers, h); }, end(b) { this.body = b; } };
await handleFinance({ method: 'GET', headers: {}, url: '/api/finance/product-registry' }, res, 'product-registry', { requireUser: async () => { throw new Error('no session needed'); }, enforceRateLimit: async () => { limited += 1; } });
const body = JSON.parse(res.body);
assert.equal(limited, 1);
assert.equal(body.ok, true);
assert.equal(body.version, 'financial-product-registry-1');
assert.ok(!/organization_id/.test(res.body));
console.log(`Product registry: ${reg.modalities.length} modalidades em ${FAMILIES.length} famílias; suporte derivado do código; RFQ só crédito/adquirência; nenhum conector declarado; API pública limitada.`);
