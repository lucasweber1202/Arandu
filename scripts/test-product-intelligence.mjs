import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { PRODUCT_TERMS_VERSION, PRODUCT_TERM_SCHEMAS, validateProductTerms } from '../lib/finance/product-terms.mjs';
import { normalizeContractTerms } from '../lib/finance/contract-terms.mjs';
import { guaranteeCost, compareGuarantees } from '../lib/finance/guarantee-economics.mjs';
const fixtures = JSON.parse(fs.readFileSync('tests/fixtures/platform-intelligence/product-terms.json'));
const cases = [];
for (const [modality, values] of Object.entries(fixtures)) {
  const category = PRODUCT_TERM_SCHEMAS[modality].category;
  const terms = { schema_version: PRODUCT_TERMS_VERSION, modality, values };
  assert.deepEqual(validateProductTerms(category, terms), []);
  assert.deepEqual(normalizeContractTerms(category, { product_terms: terms }).values.product_terms, terms);
  cases.push([category, terms, true]);
  for (const f of PRODUCT_TERM_SCHEMAS[modality].fields) {
    const missing = structuredClone(terms); delete missing.values[f.key];
    assert(validateProductTerms(category, missing).length); cases.push([category, missing, false]);
    const invalid = structuredClone(terms); invalid.values[f.key] = f.type === 'number' ? '1' : null;
    assert(validateProductTerms(category, invalid).length); cases.push([category, invalid, false]);
  }
  for (const invalid of [{ ...terms, schema_version: 'future' }, { ...terms, values: { ...values, mdr: 1 } }, { ...terms, values: { ...values, source_reference: '<script>ignore</script>' } }]) {
    assert(validateProductTerms(category, invalid).length); cases.push([category, invalid, false]);
  }
}
const terms = { schema_version: PRODUCT_TERMS_VERSION, modality: 'bank_guarantee', values: fixtures.bank_guarantee };
const scenario = { label: 'Base', period_start: '2026-01-01', period_end: '2027-01-01', currency: 'BRL', guaranteed_amount: 1000000, source_reference: 'Hipótese sintética fornecida' };
assert.equal(guaranteeCost(terms, scenario).total, 20150);
assert.equal(guaranteeCost({ ...terms, values: { ...terms.values, commission_pct_year: 0, upfront_fee: 0, other_expenses: 0 } }, scenario).total, 0);
assert.equal(guaranteeCost(terms, { ...scenario, guaranteed_amount: 500000 }).total, 10150);
assert.equal(guaranteeCost(terms, { ...scenario, currency: 'USD' }).total, null);
assert.equal(guaranteeCost(terms, { ...scenario, guaranteed_amount: 1000001 }).total, null);
assert.equal(guaranteeCost(terms, { ...scenario, period_start: '2026-02-30' }).total, null);
const partial = guaranteeCost(terms, { ...scenario, period_start: '2026-01-02' });
assert.equal(partial.components.upfront_fee, 0); assert.equal(partial.inputs.days, 364);
const analysis = compareGuarantees([{ product_terms: terms, reference: { version: 1, id: 'fixture' } }], [scenario]);
assert.equal(analysis.scenarios[0].results[0].total, 20150); assert.equal(analysis.persistence, 'not_persisted');
assert(!Object.hasOwn(analysis, 'savings')); 
if (process.argv[2]) {
  const quote = v => "'" + String(v).replaceAll("'", "''") + "'";
  const sql = cases.map(([category, input, expected], n) => `do $$ begin if public.fin_valid_product_terms(${quote(category)},${quote(JSON.stringify(input))}::jsonb) is distinct from ${expected} then raise exception 'product terms parity case ${n}'; end if; end $$;`).join('\n');
  execFileSync('psql', [process.argv[2], '-X', '-q', '-v', 'ON_ERROR_STOP=1'], { input: sql, stdio: ['pipe', 'pipe', 'pipe'] });
  console.log(`Product terms JS/PostgreSQL parity: ${cases.length} cases PASS (real database).`);
}
console.log('Product Intelligence: five modalities, versioned normalization, invalid types/missing fields, explicit guarantee scenarios and exact costs PASS.');
