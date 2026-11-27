// Inteligência de dívida sobre o portfólio declarado: custo médio ponderado e
// sensibilidade a choque de indexador. Puro, por moeda, nunca soma moedas.
//
// Definições (todas sobre o saldo devedor da fotografia mais recente):
//   * Taxa prefixada média = Σ(saldo_i × taxa_i) / Σ saldo_i, só facilities
//     'pre' com taxa anual declarada (rate_pct_year).
//   * Spread médio por indexador X = Σ(saldo_i × spread_i) / Σ saldo_i, só
//     facilities indexadas a X com spread declarado (spread_pct_year).
//   * Impacto anual estimado de +Δ p.p. no indexador X = Σ saldo_i(X) × Δ/100.
//     Aproximação linear de primeira ordem: saldo estático por 12 meses, sem
//     amortização, sem capitalização composta (ex.: CDI × spread) e sem
//     defasagem de repactuação. É estimativa, não projeção contábil.
// Facility sem saldo, sem taxa/spread ou sem indexador é contada como
// cobertura ausente — nunca entra como zero.

export const DEBT_INTELLIGENCE_DEFINITIONS = /* @__PURE__ */ Object.freeze({
  fixed_rate_avg: 'Taxa prefixada média ponderada pelo saldo devedor conhecido, só facilities prefixadas com taxa anual declarada.',
  spread_avg: 'Spread médio ponderado pelo saldo devedor conhecido, por indexador, só facilities com spread declarado.',
  sensitivity: 'Estimativa linear: saldo indexado × variação em pontos percentuais, por 12 meses, sem amortização nem capitalização. Não é projeção contábil.'
});

const FLOATING = new Set(['cdi', 'selic', 'ipca', 'tr', 'tjlp', 'sofr', 'usd']);
const round = (v, d = 2) => { const f = 10 ** d; return Math.round(v * f) / f; };
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

function latestOutstanding(balances) {
  const latest = new Map();
  for (const row of balances) {
    const cur = latest.get(row.facility_id);
    if (!cur || row.as_of > cur.as_of || (row.as_of === cur.as_of && String(row.recorded_at) > String(cur.recorded_at))) latest.set(row.facility_id, row);
  }
  return latest;
}

/**
 * @param {{facilities:object[], balances:object[], shocks?:Record<string, number>}} input
 * shocks: variação em p.p. por indexador (ex.: { cdi: 1 }). Indexador fora da
 * lista flutuante é ignorado; valores não finitos ou |Δ|>50 são rejeitados.
 */
export function debtIntelligence({ facilities = [], balances = [], shocks = {} } = {}) {
  for (const [key, value] of Object.entries(shocks)) {
    if (!FLOATING.has(key)) throw new Error(`indexador sem choque suportado: ${key}`);
    if (!Number.isFinite(value) || Math.abs(value) > 50) throw new Error('choque inválido');
  }
  const latest = latestOutstanding(balances);
  const byCurrency = new Map();
  for (const f of facilities.filter((row) => row.status === 'active')) {
    if (!byCurrency.has(f.currency)) byCurrency.set(f.currency, { currency: f.currency, fixed: { w: 0, base: 0, missing: 0 }, spreads: new Map(), exposure: new Map(), no_balance: 0, no_indexer: 0 });
    const v = byCurrency.get(f.currency);
    const out = num(latest.get(f.id)?.outstanding_amount);
    if (out === null) { v.no_balance += 1; continue; }
    const indexer = f.indexer || null;
    if (!indexer || indexer === 'other') { v.no_indexer += 1; continue; }
    if (indexer === 'pre') {
      const rate = num(f.rate_pct_year);
      if (rate === null) v.fixed.missing += 1; else { v.fixed.w += out * rate; v.fixed.base += out; }
      continue;
    }
    v.exposure.set(indexer, (v.exposure.get(indexer) || 0) + out);
    if (!v.spreads.has(indexer)) v.spreads.set(indexer, { w: 0, base: 0, missing: 0 });
    const s = v.spreads.get(indexer);
    const spread = num(f.spread_pct_year);
    if (spread === null) s.missing += 1; else { s.w += out * spread; s.base += out; }
  }
  return {
    shocks: { ...shocks },
    currencies: [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency)).map((v) => ({
      currency: v.currency,
      fixed_rate_avg: v.fixed.base ? { pct_year: round(v.fixed.w / v.fixed.base, 4), covered_outstanding: round(v.fixed.base), facilities_missing_rate: v.fixed.missing } : (v.fixed.missing ? { pct_year: null, covered_outstanding: 0, facilities_missing_rate: v.fixed.missing } : null),
      spread_avg: [...v.spreads.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([indexer, s]) => ({ indexer, pct_year: s.base ? round(s.w / s.base, 4) : null, covered_outstanding: round(s.base), facilities_missing_spread: s.missing })),
      sensitivity: [...v.exposure.entries()].sort((a, b) => b[1] - a[1]).map(([indexer, exposed]) => ({
        indexer, exposed_outstanding: round(exposed), shock_pp: shocks[indexer] ?? null,
        annual_impact_estimate: shocks[indexer] === undefined ? null : round(exposed * shocks[indexer] / 100),
        per_1pp_estimate: round(exposed / 100)
      })),
      facilities_without_balance: v.no_balance,
      facilities_without_indexer: v.no_indexer
    })),
    definitions: DEBT_INTELLIGENCE_DEFINITIONS
  };
}
