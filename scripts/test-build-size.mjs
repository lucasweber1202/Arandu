#!/usr/bin/env node
// Budgets do build: produto com hard limit inalterado em todo build, sandbox
// legado congelado e limite por rota (união de fechamentos, sem dupla contagem).
import assert from 'node:assert/strict';
import { assessBuildSize, routeSizes, sandboxChunk, LIMITS } from './build-size.mjs';

assert.equal(LIMITS.javascript, 800000, 'hard limit de JS do produto não muda');
assert.equal(LIMITS.largestJavascript, 100000);
assert.equal(LIMITS.sandboxJavascript, 330000, 'sandbox congelado no tamanho medido');

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
assert.match(assessBuildSize({ files: filesOf(p), profile: p }).problems.join(), /javascript: \d+ > 800000/, 'produto acima do hard limit falha mesmo sem sandbox');
p = grow('assets/engine.js', 330001);
assert.match(assessBuildSize({ files: filesOf(p), profile: p }).problems.join(), /sandboxJavascript/, 'sandbox não cresce');
p = { chunks: [...profile.chunks, chunk('assets/policy.js', 99000, ['finance/src/views/policy.js'], ['assets/company.js'])] };
assert.match(assessBuildSize({ files: filesOf(p), profile: p }).problems.join(), /largestRouteJavascript/, 'rota que puxa capability alheia estoura o limite por rota');
assert.match(assessBuildSize({ files, profile: null }).problems.join(), /ausente/, 'sem perfil o check falha fechado');
const near = grow('assets/company.js', 700000);
assert.ok(assessBuildSize({ files: filesOf(near), profile: near }).warnings.some((line) => line.startsWith('javascript')), 'envelope saudável avisa antes do hard limit');

console.log('Build size: product hard limit unchanged in every build, frozen sandbox layer, per-route union budget, healthy-envelope warning and fail-closed profile passed.');
