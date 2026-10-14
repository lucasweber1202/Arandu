#!/usr/bin/env node
// Resumo da integração efêmera para o GITHUB_STEP_SUMMARY. Usa o resultado de
// cada etapa (outcome) e os relatórios já sanitizados de reports/ci-demo.
// Etapa pulada ou cancelada aparece como NÃO EXECUTADA, nunca como PASS.
import fs from 'node:fs';
import path from 'node:path';

const dir = process.env.CI_DEMO_REPORTS || 'reports/ci-demo';
const read = (name) => { try { return fs.readFileSync(path.join(dir, name), 'utf8'); } catch { return ''; } };
const label = (outcome) => ({ success: 'PASS', failure: 'FAIL', cancelled: 'NÃO EXECUTADA (cancelada)', skipped: 'NÃO EXECUTADA' })[outcome] || 'NÃO EXECUTADA';
const last = (text, pattern) => (text.match(pattern) || [])[0] || '—';
const playwright = (text) => ['passed', 'failed', 'skipped', 'flaky'].map((word) => last(text, new RegExp(`\\d+ ${word}`))).filter((value) => value !== '—').join(', ') || '—';

const phases = [
  ['Preflight de memória e disco', 'PREFLIGHT', last(read('preflight.txt'), /memória disponível.*/)],
  ['Imagens fixadas (tag + digest)', 'IMAGES', read('images.env').trim().split('\n').filter(Boolean).length + ' imagem(ns)'],
  ['Supabase + migrations + app demo', 'UP', ''],
  ['Smoke: banco, Auth, PostgREST, Storage, API, RLS', 'SMOKE', last(read('smoke.txt'), /\d+\/\d+ verificações PASS\./)],
  ['Seed oficial da Vitta Foods', 'SEED', last(read('seed.txt'), /\d+\/\d+ checagens OK\./)],
  ['Sanidade do seed (releitura)', 'CHECK', last(read('seed-check.txt'), /\d+\/\d+ checagens OK\./)],
  ['E2E Chromium desktop', 'E2E_DESKTOP', playwright(read('e2e-desktop.txt'))],
  ['E2E Chromium mobile', 'E2E_MOBILE', playwright(read('e2e-mobile.txt'))],
  ['Jornada real + ataques (Auth, RLS, RFQ, propostas, aprovação, provedor)', 'JOURNEY', last(read('journey-tail.txt'), /\d+ passos, \d+ ataques, \d+ falhas\./)]
];
const lines = ['## Integração efêmera da Demo canônica', '', `SHA testado: \`${process.env.HEAD_SHA || process.env.GITHUB_SHA || '?'}\``, '',
  '| Fase | Resultado | Evidência |', '| --- | --- | --- |',
  ...phases.map(([name, key, evidence]) => `| ${name} | ${label(process.env[key])} | ${evidence || ''} |`), ''];
const images = read('images.env').trim();
if (images) lines.push('### Imagens', '', '```', images, '```', '');
const resources = read('resources-final.txt').trim();
if (resources) lines.push('### Recursos no fim da execução', '', '```', resources, '```', '');
const seed = read('seed-check.txt').split('\n').filter((line) => /^\s+(OK|FAIL)\s/.test(line));
if (seed.length) lines.push('<details><summary>Checagens de sanidade do seed</summary>', '', '```', ...seed, '```', '</details>', '');
console.log(lines.join('\n'));
