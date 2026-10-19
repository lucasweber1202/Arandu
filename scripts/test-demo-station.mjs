#!/usr/bin/env node
// Classificação da estação de apresentação (scripts/demo/station-lib.mjs):
// READY só na máquina declarada, no SHA congelado, com prontidão recente; nunca
// num executor efêmero; alvo fora de localhost é UNSAFE mesmo com tudo verde.
import assert from 'node:assert/strict';
import { classifyStation } from './demo/station-lib.mjs';

const SHA = 'a'.repeat(40);
const LOCK = 'b'.repeat(64);
const ok = { ok: true, detail: 'HTTP 200' };
const ready = () => ({
  host: { name: 'estacao-29-10', platform: 'Linux 6', arch: 'x64', cpus: 8, memoryGiB: 16, diskFreeGiB: 80, ephemeral: null },
  env: { nonLocalTargets: [], vercelEnv: null, aranduEnv: null },
  git: { sha: SHA, clean: true, dirty: 0, lockSha256: LOCK },
  node: { version: 'v24.11.0' }, npm: { version: '11.6.0' }, deps: { ok: true },
  docker: { engine: 'Docker 29', compose: 'Compose 5' }, browser: { ok: true }, cert: { ok: true },
  services: { db: ok, auth: ok, rest: ok, storage: ok, gateway: ok, app: ok },
  ports: [{ port: 4443, state: 'demo' }, { port: 54322, state: 'demo' }],
  db: { reachable: true, marker: 'demo', container: 'original' }, app: { reachable: true, environment: 'demo' },
  pool: { ready: 4, claimed: 0 }, seed: { ok: true, detail: '39/39' },
  readiness: { readMode: 'PRONTO', interactiveMode: 'PRONTO', ageMinutes: 15 },
  freeze: { sha: SHA, lockSha256: LOCK, station: true, host: 'estacao-29-10' },
  repo: { path: '/home/op/Arandu', onWindowsDrive: false, crlfFiles: [] }, toolchain: { windows: null },
  nativeDeps: { ok: true, detail: 'rolldown e lightningcss carregam' }, tools: { missing: [] }
});
const status = (mutate) => { const facts = ready(); mutate(facts); return classifyStation(facts); };
const expect = (name, mutate, expected, needle) => {
  const result = status(mutate);
  assert.equal(result.status, expected, `${name}: esperado ${expected}, veio ${result.status} (${result.reasons.join(' · ')})`);
  if (needle) assert(result.reasons.join(' · ').includes(needle), `${name}: motivo deveria citar "${needle}" — ${result.reasons.join(' · ')}`);
};

expect('estação declarada, congelada e verificada', () => {}, 'READY');
// Nenhum verde em executor efêmero vira READY.
expect('executor efêmero', (f) => { f.host.ephemeral = 'CLAUDE_CODE_REMOTE'; }, 'PREPARED', 'executor efêmero');
expect('sem congelamento', (f) => { f.freeze = null; }, 'PREPARED', 'nenhum congelamento');
expect('HEAD diferente do congelado', (f) => { f.git.sha = 'c'.repeat(40); }, 'PREPARED', '≠ congelado');
expect('lockfile mudou depois do congelamento', (f) => { f.git.lockSha256 = 'd'.repeat(64); }, 'PREPARED', 'package-lock.json mudou');
expect('congelado em outra máquina', (f) => { f.host.name = 'notebook-dev'; }, 'PREPARED', 'declarada em estacao-29-10');
expect('freeze sem --station', (f) => { f.freeze.station = false; }, 'PREPARED', 'não declarada');
expect('árvore suja', (f) => { f.git.clean = false; f.git.dirty = 2; }, 'PREPARED', '2 arquivo(s)');
expect('prontidão velha', (f) => { f.readiness.ageMinutes = 300; }, 'PREPARED', 'há 300 min');
expect('sem prontidão', (f) => { f.readiness = null; }, 'PREPARED', 'sem relatório');
expect('prontidão diz leitura NÃO PRONTO', (f) => { f.readiness.readMode = 'NÃO PRONTO'; }, 'PREPARED');
expect('seed não verificado (--fast)', (f) => { f.seed = { ok: false, skipped: true, detail: 'não verificado (--fast)' }; }, 'PREPARED', 'não verificado');
// Requisitos ausentes bloqueiam, mesmo congelado.
expect('Node 22', (f) => { f.node.version = 'v22.22.0'; }, 'BLOCKED', 'v22.22.0');
expect('Docker parado', (f) => { f.docker.engine = null; f.services.db = { ok: false, detail: 'contêiner ausente' }; }, 'BLOCKED', 'daemon indisponível');
expect('Chromium do lockfile ausente', (f) => { f.browser = { ok: false, detail: 'navegador da versão do lockfile não instalado' }; }, 'BLOCKED', 'lockfile não instalado');
expect('porta tomada por outro processo', (f) => { f.ports.push({ port: 3000, state: 'foreign' }); }, 'BLOCKED', '3000');
expect('Storage fora', (f) => { f.services.storage = { ok: false, detail: 'ECONNREFUSED' }; }, 'BLOCKED', 'ECONNREFUSED');
expect('banco recriado sem os dados', (f) => { f.db.container = 'contêiner sem os dados da Demo'; }, 'BLOCKED');
expect('seed quebrado', (f) => { f.seed = { ok: false, detail: '37/39 checagens' }; }, 'BLOCKED', '37/39');
expect('pool com 1 pronto', (f) => { f.pool.ready = 1; }, 'BLOCKED', '1 pronto');
expect('certificado vencendo', (f) => { f.cert = { ok: false, detail: 'expira em 1 dia(s)' }; }, 'BLOCKED', 'expira');
expect('memória curta', (f) => { f.host.memoryGiB = 4; }, 'BLOCKED', '4 GiB');
expect('fato ausente nunca vira PASS', (f) => { delete f.services.gateway; }, 'BLOCKED', 'sem resposta');
// Windows/WSL2 e node_modules de outro sistema.
expect('WSL2 com tudo no disco Linux', (f) => { f.host.wsl = true; }, 'READY');
expect('WSL2 com repositório em /mnt/c', (f) => { f.host.wsl = true; f.repo.onWindowsDrive = true; f.repo.path = '/mnt/c/Users/op/Arandu'; }, 'BLOCKED', '/mnt/c/Users/op/Arandu');
expect('WSL2 usando o npm do Windows', (f) => { f.host.wsl = true; f.toolchain.windows = '/mnt/c/Program Files/nodejs/npm'; }, 'BLOCKED', 'Program Files');
expect('/mnt/c fora do WSL não é checado como WSL', (f) => { f.repo.onWindowsDrive = true; }, 'READY');
expect('máquina nova sem psql', (f) => { f.tools.missing = ['psql']; }, 'BLOCKED', 'psql');
expect('script com CRLF', (f) => { f.repo.crlfFiles = ['scripts/demo/local.sh']; }, 'BLOCKED', 'local.sh');
expect('binário nativo de outro sistema', (f) => { f.nativeDeps = { ok: false, detail: "Cannot find module '@rolldown/binding-linux-x64-gnu'" }; }, 'BLOCKED', 'binding-linux');
expect('módulos nativos não verificados', (f) => { delete f.nativeDeps; }, 'BLOCKED', 'não verificado');
// Alvo errado é UNSAFE e vence todo o resto.
expect('SUPABASE_URL hospedado no terminal', (f) => { f.env.nonLocalTargets = ['SUPABASE_URL']; }, 'UNSAFE', 'SUPABASE_URL');
expect('VERCEL_ENV no terminal', (f) => { f.env.vercelEnv = 'production'; }, 'UNSAFE', 'VERCEL_ENV=production');
expect('ARANDU_ENV=production no terminal', (f) => { f.env.aranduEnv = 'production'; }, 'UNSAFE');
expect('banco sem a marca de demo', (f) => { f.db.marker = 'pilot'; }, 'UNSAFE', 'pilot');
expect('app fora de demo', (f) => { f.app.environment = 'production'; }, 'UNSAFE', 'production');
expect('UNSAFE vence BLOCKED e PREPARED', (f) => { f.node.version = 'v20.0.0'; f.freeze = null; f.env.nonLocalTargets = ['DATABASE_URL']; }, 'UNSAFE', 'DATABASE_URL');
assert.equal(classifyStation(undefined).status, 'BLOCKED', 'sem fatos não há estação');
console.log('Estação da Demo: READY só na máquina declarada e congelada; efêmero/sem freeze/SHA ou lockfile divergente = PREPARED; requisito ausente = BLOCKED; alvo fora de localhost = UNSAFE; WSL2 com repositório em /mnt/c, npm do Windows, CRLF ou node_modules de outro sistema = BLOCKED.');
