#!/usr/bin/env node
// Resumo da integração efêmera para o GITHUB_STEP_SUMMARY. Usa outcomes do
// workflow e relatórios sanitizados. Só declara B depois do cleanup e da
// publicação da evidência; o runner nunca comprova M3 hospedado.
import fs from 'node:fs';
import path from 'node:path';
import { assessDemoRehearsal } from '../../lib/demo-rehearsal-result.mjs';

const dir = process.env.CI_DEMO_REPORTS || 'reports/ci-demo';
const read = (name) => { try { return fs.readFileSync(path.join(dir, name), 'utf8'); } catch { return ''; } };
const label = (outcome) => ({ success: 'PASS', failure: 'FAIL', cancelled: 'NÃO EXECUTADA (cancelada)', skipped: 'NÃO EXECUTADA' })[outcome] || 'NÃO EXECUTADA';
const last = (text, pattern) => (text.match(pattern) || [])[0] || '—';
const playwright = (text) => ['passed', 'failed', 'skipped', 'flaky'].map((word) => last(text, new RegExp(`\\d+ ${word}`))).filter((value) => value !== '—').join(', ') || '—';
const assessment = assessDemoRehearsal(process.env);

const phases = [
  ['Node.js runtime', 'NODE', '24 (workflow)'],
  ['Identidade do commit executado', 'TESTED_COMMIT', assessment.testedSha || 'NÃO IDENTIFICADO'],
  ['Preflight de memória, disco e ferramentas', 'PREFLIGHT', last(read('preflight.txt'), /memória disponível.*/)],
  ['Bloqueio de projetos Supabase hospedados conhecidos', 'BLOCK_HOSTED', 'refs conhecidos bloqueados no runner'],
  ['Instalação pelo lockfile', 'INSTALL', ''],
  ['Build do produto', 'BUILD', ''],
  ['Imagens fixadas (tag + digest)', 'IMAGES', read('images.env').trim().split('\n').filter(Boolean).length + ' imagem(ns)'],
  ['Supabase + migrations + app demo', 'UP', ''],
  ['Smoke: banco, Auth, PostgREST, Storage, API, RLS', 'SMOKE', last(read('smoke.txt'), /\d+\/\d+ verificações PASS\./)],
  ['Seed oficial da Vitta Foods', 'SEED', last(read('seed.txt'), /\d+\/\d+ checagens OK\./)],
  ['Sanidade do seed (releitura)', 'CHECK', last(read('seed-check.txt'), /\d+\/\d+ checagens OK\./)],
  ['Versão do Playwright', 'PLAYWRIGHT_VERSION', ''],
  ['Instalação de Chromium', 'INSTALL_CHROMIUM', ''],
  ['E2E Chromium desktop', 'E2E_DESKTOP', playwright(read('e2e-desktop.txt'))],
  ['E2E Chromium mobile', 'E2E_MOBILE', playwright(read('e2e-mobile.txt'))],
  ['Jornada real + ataques (Auth, RLS, RFQ, propostas, aprovação, provedor)', 'JOURNEY', last(read('journey-tail.txt'), /\d+ passos, \d+ ataques, \d+ falhas\./)],
  ['Sondas adversariais (sessão, entre tenants, concorrência, ciclo de renovação)', 'ADVERSARIAL', last(read('adversarial.txt'), /\d+ sondas, .*SKIPPED\./)],
  ['Recovery: banco + binários do Storage em destino isolado', 'RECOVERY', last(read('recovery.txt'), /resultado: \w+/) + ' · ' + last(read('recovery.txt'), /recovery [A-Z_]+/)],
  ['Coleta e sanitização das evidências', 'EVIDENCE', ''],
  ['Teardown e verificação de recursos temporários', 'TEARDOWN', last(read('teardown.txt'), /containers restantes.*/)],
  ['Arquivamento das evidências sanitizadas', 'EVIDENCE_UPLOAD', '']
];
const resultLabel = assessment.result === 'B_LOCAL_DEMO_VALIDATED'
  ? 'B — DEMO CANÔNICA VALIDADA EM LABORATÓRIO EFÊMERO'
  : 'C — NO-GO';
const lines = [
  '## Ensaio da Demo canônica em infraestrutura efêmera', '',
  `Decisão: **${resultLabel}**`,
  `Maturidade hospedada: **${assessment.hostedStatus}** · resultado deste ensaio: **${assessment.maturity}**`, '',
  `SHA executado (checkout): \`${assessment.testedSha || 'NÃO IDENTIFICADO'}\``,
  `SHA da PR/evento (referência): \`${assessment.eventHeadSha || 'NÃO IDENTIFICADO'}\``, '',
  '| Fase | Resultado | Evidência |', '| --- | --- | --- |',
  ...phases.map(([name, key, evidence]) => `| ${name} | ${label(process.env[key])} | ${evidence || ''} |`), ''
];
if (assessment.pending.length) lines.push('### Bloqueadores do ensaio', '',
  ...assessment.pending.map(({ label: name, outcome }) => `- ${name}: ${outcome}.`), '');
lines.push('Este resultado cobre somente o runner efêmero e dados sintéticos. Um B local/CI nunca promove M3: Demo hospedada, datasource, schema e recovery hospedados exigem doctor, canário e evidência de release no ambiente correto.', '');
const images = read('images.env').trim();
if (images) lines.push('### Imagens', '', '```', images, '```', '');
const resources = read('resources-final.txt').trim();
if (resources) lines.push('### Recursos no fim da execução', '', '```', resources, '```', '');
const seed = read('seed-check.txt').split('\n').filter((line) => /^\s+(OK|FAIL)\s/.test(line));
const probes = read('adversarial.txt').split('\n').filter((line) => /^\| [A-Z]+-\d/.test(line));
if (probes.length) lines.push('<details><summary>Sondas adversariais</summary>', '', '| ID | Sonda | Status | Evidência |', '| --- | --- | --- | --- |', ...probes, '</details>', '');
const drill = read('recovery.txt').split('\n').filter((line) => /^(OK  |FAIL) /.test(line));
if (drill.length) lines.push('<details><summary>Ensaio de recovery</summary>', '', '```', ...drill, '```', '</details>', '');
if (seed.length) lines.push('<details><summary>Checagens de sanidade do seed</summary>', '', '```', ...seed, '```', '</details>', '');
console.log(lines.join('\n'));
