#!/usr/bin/env node
// Proteção de regressão por jornada (lógica pura de scripts/perf/journey-budget.mjs).
import assert from 'node:assert/strict';
import { compareToBaseline, executedBytes, summarizeJourney, baselineFrom, TOLERANCE } from './perf/journey-budget.mjs';
import { JOURNEYS } from './perf/journey-fixtures.mjs';
import fs from 'node:fs';

// Cobertura V8: blocos internos com count 0 descontam do bloco externo executado.
assert.equal(executedBytes([{ source: 'x'.repeat(100), functions: [{ ranges: [{ startOffset: 0, endOffset: 100, count: 1 }, { startOffset: 20, endOffset: 50, count: 0 }] }, { ranges: [{ startOffset: 90, endOffset: 100, count: 0 }] }] }]), 60);

const sizes = { '/a.js': 1000, '/b.js': 500, '/lazy.js': 300 };
const step = (urls, extra = {}) => ({ urls, requests: urls.length, fromCache: 0, transferBytes: 400 * urls.length, scriptMs: 5, taskMs: 9, lcpMs: 100, cls: 0, ...extra });
const cold = { steps: [step(['/a.js', '/b.js']), step(['/a.js', '/b.js', '/lazy.js'])], executedBytes: 900 };
const warm = { steps: [step(['/a.js', '/b.js'], { transferBytes: 0 }), step(['/a.js', '/b.js', '/lazy.js'], { transferBytes: 0 })], executedBytes: 900 };
const s = summarizeJourney({ id: 'j', label: 'J', steps: [{ url: '/1' }, { url: '/2' }] }, cold, warm, (u) => sizes[u]);
assert.equal(s.cold.initial.decodedBytes, 1500);
assert.equal(s.cold.cumulative.decodedBytes, 1800, 'acumulado conta chunk compartilhado uma vez e inclui o import dinâmico');
assert.equal(s.cold.cumulative.requests, 5);
assert.equal(s.cold.unusedRatio, 0.5);
assert.deepEqual(s.cold.steps.map((x) => x.loadedBytes), [1500, 1800]);

assert.throws(() => baselineFrom({ journeys: [s] }, 'curto'), /Justificativa/);
const base = baselineFrom({ journeys: [s] }, 'Baseline de teste com justificativa suficiente.', null, '2026-11-05');
assert.equal(base.history.length, 1);
assert.deepEqual(compareToBaseline({ journeys: [s] }, base).problems, []);

// Code splitting não esconde peso: mover bytes para chunk lazy carregado na jornada
// ainda conta no acumulado.
const hidden = summarizeJourney({ id: 'j', label: 'J', steps: [] }, { ...cold, steps: [cold.steps[0], step(['/a.js', '/b.js', '/lazy.js', '/heavy.js'])] }, warm, (u) => ({ ...sizes, '/heavy.js': 400 })[u]);
assert.match(compareToBaseline({ journeys: [hidden] }, base).problems.join(), /acumulado 2200 B > baseline 1800/);
// Dentro da tolerância proporcional passa; requisições a mais acima de +10% falham.
const near = structuredClone(s); near.cold.cumulative.decodedBytes = Math.floor(1800 * (1 + TOLERANCE.bytes));
assert.deepEqual(compareToBaseline({ journeys: [near] }, base).problems, []);
const chatty = structuredClone(s); chatty.cold.cumulative.requests = 7;
assert.match(compareToBaseline({ journeys: [chatty] }, base).problems.join(), /requisições/);
// Cache quente que volta à rede é regressão; jornada nova ou sumida exige baseline.
const uncached = structuredClone(s); uncached.warm.cumulative.transferBytes = 10;
assert.match(compareToBaseline({ journeys: [uncached] }, base).problems.join(), /cache quente/);
assert.match(compareToBaseline({ journeys: [{ ...s, id: 'novo' }] }, base).problems.join(), /novo: jornada sem baseline/);
assert.match(compareToBaseline({ journeys: [] }, base).problems.join(), /não foi medida/);
const heavyScreen = structuredClone(s); heavyScreen.cold.steps[1].loadedBytes = 250001; heavyScreen.cold.steps[1].url = '/2';
assert.match(compareToBaseline({ journeys: [heavyScreen] }, base).problems.join(), /tela \/2 carregou 250001 B/, 'limite por rota vale para JS real da tela');
const smaller = structuredClone(s); smaller.cold.cumulative.decodedBytes = 1000;
assert.match(compareToBaseline({ journeys: [smaller] }, base).notes.join(), /caiu/);

// Baseline versionada cobre todas as jornadas exigidas e tem histórico justificado.
const committed = JSON.parse(fs.readFileSync('docs/perf/journey-js-baseline.json', 'utf8'));
for (const id of ['buyer', 'institution', 'portfolio', 'contract360', 'relationship360', 'obligations', 'renewal']) {
  assert.ok(JOURNEYS.some((j) => j.id === id), `jornada ${id} medida`);
  assert.ok(committed.journeys.some((j) => j.id === id), `jornada ${id} na baseline`);
}
assert.ok(committed.history.every((h) => h.reason.length >= 20 && /^\d{4}-\d{2}-\d{2}$/.test(h.date)));
console.log('journey-budget: ok');
