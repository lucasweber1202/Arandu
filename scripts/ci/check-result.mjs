// Verifica, para o SHA candidato, que a classificação existe e que cada
// caminho exigido pela classe terminou em success e cada caminho não aplicável
// foi explicitamente skipped. Falha, cancelamento e ausência não passam.
const e = process.env;
const EXPECT = {
  A: { FAST_RESULT: 'success', BACKEND_RESULT: 'skipped', FULL_RESULT: 'skipped', DEMO_RESULT: 'skipped' },
  B: { FAST_RESULT: 'success', BACKEND_RESULT: 'skipped', FULL_RESULT: 'skipped', DEMO_RESULT: 'skipped' },
  C: { FAST_RESULT: 'success', BACKEND_RESULT: 'success', FULL_RESULT: 'skipped', DEMO_RESULT: 'skipped' },
  D: { FAST_RESULT: 'skipped', BACKEND_RESULT: 'skipped', FULL_RESULT: 'success', DEMO_RESULT: 'success' },
};
if (e.CLASSIFY_RESULT !== 'success' || !EXPECT[e.RISK]) throw Error('Classification failed or missing');
if (!/^[a-f0-9]{40}$/.test(e.ANALYZED_SHA || '') || e.ANALYZED_SHA !== e.GITHUB_SHA) throw Error('Wrong candidate SHA');
if (e.DEEP !== String(e.RISK === 'D')) throw Error('Inconsistent policy');
const wrong = Object.entries(EXPECT[e.RISK]).filter(([name, state]) => e[name] !== state);
if (wrong.length) throw Error(`Class ${e.RISK}: ${wrong.map(([n, s]) => `${n}=${e[n] || 'missing'} (expected ${s})`).join(', ')}`);
console.log(`${e.RISK}: required paths succeeded on ${e.ANALYZED_SHA}; non-applicable paths explicitly skipped`);
