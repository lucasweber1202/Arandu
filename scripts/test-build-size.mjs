#!/usr/bin/env node
// Budgets do build: produto com hard limit inalterado em todo build, sandbox
// legado congelado e limite por rota (união de fechamentos, sem dupla contagem).
import assert from 'node:assert/strict';
import { assessBuildSize, routeSizes, sandboxChunk, LIMITS, CAPACITY } from './build-size.mjs';

assert.equal(CAPACITY.javascript, 800000, 'indicador de capacidade de JS do produto não muda');
assert.equal(LIMITS.javascript, undefined, 'agregado não é mais hard limit');
assert.equal(LIMITS.largestRouteJavascript, 250000, 'limite por rota preservado');
assert.equal(LIMITS.css, 650000); assert.equal(LIMITS.largestCss, 170000); assert.equal(LIMITS.largestImage, 750000); assert.equal(LIMITS.total, 3000000);
assert.equal(LIMITS.largestJavascript, 100000);
assert.equal(LIMITS.sandboxJavascript, 382400, 'sandbox congelado no tamanho medido');

const chunk = (file, bytes, sources, imports = []) => ({ file, bytes, imports, modules: sources.map((source) => ({ source, renderedLength: bytes })) });
const profile = { chunks: [
  chunk('assets/app.js', 60000, ['finance/app.js', 'finance/src/shell.js'], ['assets/core.js']),
  chunk('assets/core.js', 20000, ['finance/src/core.js']),
  chunk('assets/company.js', 90000, ['finance/src/views/company.js'], ['assets/core.js']),
  chunk('assets/spend.js', 2000, ['finance/src/views/spend.js'], ['assets/core.js']),
  chunk('assets/engine.js', 50000, ['finance/demo/engine.js', 'finance/demo/seed.js']),
  chunk('assets/mixed.js', 1000, ['finance/demo/workspace/x.js', 'finance/src/ui.js'])
] };
const files = profile.chunks.map((item) => ({ name: item.file, size: item.bytes })).concat([{ name: 'financial-auth.js', size: 4000 }, { name: 'finance/style.css', size: 1000 }]);

assert.equal(sandboxChunk(profile.chunks[4]), true);
assert.equal(sandboxChunk(profile.chunks[5]), false, 'chunk com código de produto conta como produto');
const routes = routeSizes(profile);
assert.equal(routes.company, 60000 + 20000 + 90000, 'core compartilhado contado uma vez');
assert.equal(routes.spend, 60000 + 20000 + 2000);

const ok = assessBuildSize({ files, profile });
assert.equal(ok.ok, true, ok.problems.join('; '));
assert.equal(ok.metrics.sandboxJavascript, 50000);
assert.equal(ok.metrics.javascript, 60000 + 20000 + 90000 + 2000 + 1000 + 4000, 'asset copiado depois do Vite conta como produto');
assert.equal(ok.largestRoute, 'company');

const grow = (file, bytes) => ({ chunks: profile.chunks.map((item) => (item.file === file ? { ...item, bytes } : item)) });
const filesOf = (p) => p.chunks.map((item) => ({ name: item.file, size: item.bytes }));
let p = grow('assets/company.js', 801000);
// Agregado acima de 800.000: falha sem registro; passa (com aviso) só com entrada
// justificada, valor aceito >= medido e baseline de jornadas registrada.
const big = () => assessBuildSize({ files: filesOf(p), profile: p, growthLog: log, journeyBaseline: jb });
const jb = { history: [{ date: '2026-11-05', reason: 'baseline', cumulative: {} }] };
const reason = 'Portal institucional e histórico documental; peso por jornada medido e dentro da baseline.';
let log = null;
assert.match(big().problems.join(), /indicador de capacidade\) sem registro/, 'sem registro, agregado acima do indicador falha');
log = { entries: [{ date: '2026-11-05', accepted: 900000, reason, journeyBaseline: '2026-11-05' }] };
assert.match(big().problems.join(), /largestJavascript/, 'arquivo de 801 KB continua violando o hard limit por arquivo');
p = { chunks: [...profile.chunks, ...Array.from({ length: 9 }, (_, i) => chunk(`assets/lazy${i}.js`, 80000, [`finance/src/views/lazy${i}.js`]))] };
const total = assessBuildSize({ files: filesOf(p), profile: p }).metrics.javascript;
assert.ok(total > 800000);
log = null; assert.match(big().problems.join(), /sem registro/);
log = { entries: [{ date: '2026-11-05', accepted: total - 1, reason, journeyBaseline: '2026-11-05' }] };
assert.match(big().problems.join(), /acima do último valor aceito/, 'crescer além do aceito exige nova entrada');
log = { entries: [{ date: '2026-11-05', accepted: total, reason: 'curto', journeyBaseline: '2026-11-05' }] };
assert.match(big().problems.join(), /sem justificativa/);
log = { entries: [{ date: '2026-11-05', accepted: total, reason, journeyBaseline: '2026-10-01' }] };
assert.match(big().problems.join(), /baseline de jornadas registrada/, 'crescimento só com jornadas medidas');
log = { entries: [{ date: '2026-11-05', accepted: total, reason, journeyBaseline: '2026-11-05' }] };
const accepted = big();
assert.equal(accepted.ok, true, accepted.problems.join('; '));
assert.ok(accepted.warnings.some((w) => /indicador de capacidade/.test(w) && w.includes(reason)), 'aceito continua visível como aviso com a justificativa');
p = grow('assets/engine.js', LIMITS.sandboxJavascript + 1);
assert.match(assessBuildSize({ files: filesOf(p), profile: p }).problems.join(), /sandboxJavascript/, 'sandbox não cresce');
p = { chunks: [...profile.chunks, chunk('assets/policy.js', 99000, ['finance/src/views/policy.js'], ['assets/company.js'])] };
assert.match(assessBuildSize({ files: filesOf(p), profile: p }).problems.join(), /largestRouteJavascript/, 'rota que puxa capability alheia estoura o limite por rota');
assert.match(assessBuildSize({ files, profile: null }).problems.join(), /ausente/, 'sem perfil o check falha fechado');
const near = grow('assets/company.js', 700000);
assert.ok(assessBuildSize({ files: filesOf(near), profile: near }).warnings.some((line) => line.startsWith('javascript')), 'envelope saudável avisa antes do hard limit');

console.log('Build size: product aggregate as justified capacity indicator, hard route/file/CSS/image limits, frozen sandbox layer, per-route union budget, healthy-envelope warning and fail-closed profile passed.');
