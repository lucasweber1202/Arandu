#!/usr/bin/env node
// Classificação da estação de apresentação (scripts/demo/station-lib.mjs):
// READY só na máquina declarada, no SHA congelado, com prontidão recente; nunca
// num executor efêmero; alvo fora de localhost é UNSAFE mesmo com tudo verde.
import assert from 'node:assert/strict';
import { classifyStation, readinessFacts, stationPoolFacts } from './demo/station-lib.mjs';
import { demoWorkspaceFixture } from './fixtures/demo-workspace.mjs';

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
  db: { reachable: true, marker: 'demo', schema: 'current', expectedSchema: 'current', container: 'original' }, app: { reachable: true, environment: 'demo', datasource: 'supabase', misconfigured: false, commit: SHA },
  pool: { ready: 4, claimed: 0, status: 'ok' }, seed: { ok: true, passed: 39, total: 39, detail: '39/39' },
  readiness: { readMode: 'PRONTO', interactiveMode: 'PRONTO', ageMinutes: 15, commit: SHA, host: 'estacao-29-10', lockSha256: LOCK, clean: true, smoke: true },
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
expect('HEAD diferente do congelado', (f) => { f.git.sha = 'c'.repeat(40); f.app.commit = f.git.sha; }, 'PREPARED', '≠ congelado');
expect('lockfile mudou depois do congelamento', (f) => { f.git.lockSha256 = 'd'.repeat(64); }, 'PREPARED', 'package-lock.json mudou');
expect('congelado em outra máquina', (f) => { f.host.name = 'notebook-dev'; }, 'PREPARED', 'declarada em estacao-29-10');
expect('freeze sem --station', (f) => { f.freeze.station = false; }, 'PREPARED', 'não declarada');
expect('árvore suja', (f) => { f.git.clean = false; f.git.dirty = 2; }, 'PREPARED', '2 arquivo(s)');
expect('prontidão velha', (f) => { f.readiness.ageMinutes = 300; }, 'PREPARED', 'há 300 min');
expect('sem prontidão', (f) => { f.readiness = null; }, 'PREPARED', 'sem relatório');
for (const [key, value] of [['commit', 'c'.repeat(40)], ['host', 'outra-estacao'], ['lockSha256', 'd'.repeat(64)], ['clean', false], ['smoke', false], ['ageMinutes', -1], ['ageMinutes', NaN]]) {
  expect(`readiness não vinculada: ${key}=${value}`, f => { f.readiness[key] = value; }, 'PREPARED');
}
const observation = { generated_at: '2026-10-21T12:00:00Z', commit: SHA, smoke: true,
  station_evidence: { schema: 1, host: 'estacao-29-10', lockSha256: LOCK, clean: true },
  modes: [{ mode: 'leitura', ready: true, failed: [], skipped: [] }, { mode: 'interativo', ready: false, failed: [], skipped: [] }],
  sections: [{ checks: [{ name: 'Auth', status: 'PASS', modes: ['leitura', 'interativo'] }] }] };
const observedAt = Date.parse(observation.generated_at);
expect('JSON novo da mesma estação', f => { f.readiness = readinessFacts(observation, observedAt + 60000); }, 'READY');
expect('JSON copiado/touch não renova observação', f => { f.readiness = readinessFacts(observation, observedAt + 121 * 60000); }, 'PREPARED');
expect('JSON de data futura', f => { f.readiness = readinessFacts(observation, observedAt - 1); }, 'PREPARED');
expect('JSON com data inválida', f => { f.readiness = readinessFacts({ ...observation, generated_at: 'invalid' }); }, 'PREPARED');
expect('JSON com smoke não executado', f => { f.readiness = readinessFacts({ ...observation, smoke: false }, observedAt); }, 'PREPARED');
expect('JSON com leitura incompleta', f => { f.readiness = readinessFacts({ ...observation, modes: [{ mode: 'leitura', ready: true, skipped: ['smoke'] }] }, observedAt); }, 'PREPARED');
assert.equal(readinessFacts({}), null, 'formato antigo não certifica estação');
expect('prontidão diz leitura NÃO PRONTO', (f) => { f.readiness.readMode = 'NÃO PRONTO'; }, 'PREPARED');
expect('seed não verificado (--fast)', (f) => { f.seed = { ok: false, skipped: true, detail: 'não verificado (--fast)' }; }, 'PREPARED', 'não verificado');
// Requisitos ausentes bloqueiam, mesmo congelado.
expect('Node 22', (f) => { f.node.version = 'v22.22.0'; }, 'BLOCKED', 'v22.22.0');
expect('Docker parado', (f) => { f.docker.engine = null; f.services.db = { ok: false, detail: 'contêiner ausente' }; }, 'BLOCKED', 'daemon indisponível');
expect('Chromium do lockfile ausente', (f) => { f.browser = { ok: false, detail: 'navegador da versão do lockfile não instalado' }; }, 'BLOCKED', 'lockfile não instalado');
expect('porta tomada por outro processo', (f) => { f.ports.push({ port: 3000, state: 'foreign' }); }, 'BLOCKED', '3000');
expect('Storage fora', (f) => { f.services.storage = { ok: false, detail: 'ECONNREFUSED' }; }, 'BLOCKED', 'ECONNREFUSED');
expect('health sem identidade', f => { f.app = { reachable: true }; }, 'BLOCKED');
expect('sandbox responde health 200', f => { f.app.datasource = 'synthetic-fixtures'; }, 'BLOCKED');
expect('runtime mal configurado', f => { f.app.misconfigured = true; }, 'BLOCKED');
expect('schema antigo', f => { f.db.schema = 'previous'; }, 'BLOCKED', 'previous');
expect('schema não verificado', f => { delete f.db.schema; }, 'BLOCKED', 'ausente');
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

expect('app antigo, checkout e freeze novos', f => { f.app.commit = 'c'.repeat(40); }, 'BLOCKED', 'SHA do processo');
expect('app sem SHA observado', f => { delete f.app.commit; }, 'BLOCKED');
expect('pool somente por contagem', f => { delete f.pool.status; }, 'BLOCKED');
for (const status of ['incompatible', 'inconclusive', 'capacity_unavailable']) {
  expect(`pool ${status}`, f => { f.pool.status = status; }, 'BLOCKED');
}
expect('seed reduzido mas autoconsistente', f => { f.seed = { ok: true, passed: 37, total: 37 }; }, 'BLOCKED');
expect('seed booleano sem denominador', f => { f.seed = { ok: true }; }, 'BLOCKED');
expect('lockfile ausente nos dois lados', f => { f.git.lockSha256 = null; f.freeze.lockSha256 = null; f.readiness.lockSha256 = null; }, 'PREPARED');
for (const status of ['FAIL', 'SKIP', 'UNKNOWN']) {
  const report = structuredClone(observation);
  report.sections[0].checks[0].status = status;
  expect(`resumo pronto contradiz ${status}`, f => { f.readiness = readinessFacts(report, observedAt); }, 'PREPARED');
}
for (const failed of [[{ name: 'Auth' }], undefined]) {
  const report = structuredClone(observation);
  report.modes[0].failed = failed;
  expect('resumo pronto com failed ou formato incompleto', f => { f.readiness = readinessFacts(report, observedAt); }, 'PREPARED');
}
expect('resumo sem observações', f => { f.readiness = readinessFacts({ ...observation, sections: [] }, observedAt); }, 'PREPARED');
expect('modo duplicado', f => { f.readiness = readinessFacts({ ...observation, modes: [...observation.modes, observation.modes[0]] }, observedAt); }, 'PREPARED');
const poolNow = Date.parse('2026-10-22T12:00:00Z');
const validPool = [demoWorkspaceFixture(1), demoWorkspaceFixture(2)];
assert.equal(stationPoolFacts(validPool, poolNow).status, 'ok');
for (const mutate of [
  rows => { rows[0].baseline_version = 'obsolete'; },
  rows => { rows[1].user_ids = rows[0].user_ids; },
  rows => { rows[1].buyer_organization_id = rows[0].buyer_organization_id; },
  rows => { rows[1].personas = {}; }
]) {
  const rows = structuredClone(validPool); mutate(rows);
  expect('pool incompatível/sem isolamento', f => { f.pool = stationPoolFacts(rows, poolNow); }, 'BLOCKED');
}
const fullPool = [...validPool, ...Array.from({ length: 25 }, (_, i) => demoWorkspaceFixture(i + 3, {
  status: 'claimed', expires_at: '2026-10-23T12:00:00Z', idle_expires_at: '2026-10-22T16:00:00Z'
}))];
expect('25 claims ativos apesar de 2 ready', f => { f.pool = stationPoolFacts(fullPool, poolNow); }, 'BLOCKED');
expect('snapshot ausente', f => { f.pool = stationPoolFacts(null, poolNow); }, 'BLOCKED');
