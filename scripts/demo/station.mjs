#!/usr/bin/env node
// Preflight da ESTAÇÃO de apresentação (Plano B) e congelamento de versão.
//
//   bash scripts/demo/local.sh station              # classifica: READY | PREPARED | BLOCKED | UNSAFE
//   bash scripts/demo/local.sh station --fast       # sem a checagem do seed (≈ 1 min a menos)
//   bash scripts/demo/local.sh freeze --station     # grava SHA, lockfile, Node e máquina como a versão da apresentação
//
// Só LÊ (exceto o freeze, que grava scripts/pilot-local/.state/freeze.json, fora
// do git). Nunca reseta, nunca semeia, nunca fala com ambiente hospedado. READY
// só sai na máquina declarada pelo freeze, no SHA congelado, com prontidão
// recente — nunca num executor efêmero. Saída e relatório sem senha, chave,
// cookie ou token. Código de saída: 0 READY, 10 PREPARED, 20 BLOCKED, 30 UNSAFE.
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { classifyStation, REQUIREMENTS } from './station-lib.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const state = path.join(root, 'scripts/pilot-local/.state');
const freezeFile = path.join(state, 'freeze.json');
const OUT = process.env.DEMO_STATION_DIR || path.join(root, 'reports/demo-station');
const args = process.argv.slice(2);
const DB = 'arandu-pilot-local-db-1';

const run = (cmd, argv, opts = {}) => {
  const r = spawnSync(cmd, argv, { cwd: root, encoding: 'utf8', timeout: opts.timeout || 20000, env: opts.env || process.env });
  return { ok: r.status === 0, out: String(r.stdout || '').trim(), err: String(r.stderr || '').trim() };
};
const sha256File = (file) => (fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null);
const local = (value) => { try { return ['localhost', '127.0.0.1', '::1'].includes(new URL(value).hostname); } catch { return false; } };

function gitFacts() {
  const sha = run('git', ['rev-parse', 'HEAD']).out || null;
  const status = run('git', ['status', '--porcelain']).out;
  const dirty = status ? status.split('\n').length : 0;
  return { sha, clean: Boolean(sha) && dirty === 0, dirty, lockSha256: sha256File(path.join(root, 'package-lock.json')) };
}

function hostFacts() {
  const version = fs.existsSync('/proc/version') ? fs.readFileSync('/proc/version', 'utf8') : '';
  const signals = ['CI', 'GITHUB_ACTIONS', 'CLAUDE_CODE_REMOTE', 'CODESPACES', 'GITPOD_WORKSPACE_ID'].filter((key) => process.env[key]);
  let diskFreeGiB = null;
  try { const s = fs.statfsSync(root); diskFreeGiB = Math.floor((s.bavail * s.bsize) / 2 ** 30); } catch { /* sem statfs */ }
  return { name: os.hostname(), platform: `${os.type()} ${os.release()}`, arch: os.arch(), wsl: /microsoft/i.test(version),
    cpus: os.cpus().length, memoryGiB: Math.floor(os.totalmem() / 2 ** 30), diskFreeGiB, ephemeral: signals.join(', ') || null };
}

function envFacts() {
  const keys = ['SUPABASE_URL', 'ARANDU_DEMO_APP_URL', 'ARANDU_SITE_URL', 'PILOT_DB_URL', 'DATABASE_URL', 'ARANDU_DATABASE_URL'];
  return { nonLocalTargets: keys.filter((key) => process.env[key] && !local(process.env[key])), vercelEnv: process.env.VERCEL_ENV || null, aranduEnv: process.env.ARANDU_ENV || null };
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    const done = (open) => { socket.destroy(); resolve(open); };
    socket.setTimeout(1500, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}
const pidAlive = (file) => { try { process.kill(Number(fs.readFileSync(file, 'utf8')), 0); return true; } catch { return false; } };

async function portFacts(docker) {
  const published = docker ? run('docker', ['ps', '--filter', 'name=arandu-pilot-local', '--format', '{{.Ports}}']).out : '';
  const ours = (port) => published.includes(`:${port}->`) || (port === 8443 && pidAlive(path.join(state, 'gateway.pid'))) || (port === 4443 && pidAlive(path.join(state, 'app.pid')));
  const result = [];
  for (const port of REQUIREMENTS.ports) {
    const open = await portOpen(port);
    result.push({ port, state: !open ? 'free' : ours(port) ? 'demo' : 'foreign' });
  }
  return result;
}

async function probe(url, accept = (status) => status >= 200 && status < 300) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const text = await response.text();
    return { ok: accept(response.status), detail: `HTTP ${response.status}`, body: text };
  } catch (error) { return { ok: false, detail: error.cause?.code || error.name || 'sem resposta' }; }
}

// HTTPS local: confia só no certificado autoassinado desta estação (nunca desliga a verificação).
function probeHttps(url) {
  let ca;
  try { ca = fs.readFileSync(path.join(state, 'cert.pem')); } catch { return Promise.resolve({ ok: false, detail: 'certificado local ausente' }); }
  return new Promise((resolve) => {
    const request = https.get(url, { ca, timeout: 5000 }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { if (body.length < 4096) body += chunk; });
      response.on('end', () => resolve({ ok: response.statusCode >= 200 && response.statusCode < 300, detail: `HTTP ${response.statusCode}`, body }));
    });
    request.on('timeout', () => request.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
    request.on('error', (error) => resolve({ ok: false, detail: error.code || 'sem resposta' }));
  });
}

function sql(query) {
  const r = run('docker', ['exec', DB, 'psql', '-U', 'postgres', '-Atc', query]);
  return r.ok ? r.out : null;
}

async function collect({ fast }) {
  const npm = run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version']);
  const engine = run('docker', ['version', '--format', '{{.Server.Version}}']);
  const compose = run('docker', ['compose', 'version', '--short']);
  const docker = engine.ok ? `Docker ${engine.out}` : null;
  const deps = fs.existsSync(path.join(root, 'node_modules/.package-lock.json'))
    ? (run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ls', '--depth=0', '--include=optional'], { timeout: 60000 }).ok ? { ok: true, detail: 'npm ls sem pendências' } : { ok: false, detail: 'npm ls aponta dependências faltando ou divergentes' })
    : { ok: false, detail: 'node_modules ausente' };

  let browser = { ok: false, detail: 'Playwright ausente' };
  try {
    const { chromium } = await import('@playwright/test');
    const exe = chromium.executablePath();
    browser = fs.existsSync(exe) ? { ok: true, detail: path.basename(path.dirname(path.dirname(exe))) } : { ok: false, detail: 'navegador da versão do lockfile não instalado' };
  } catch { /* sem dependências */ }

  let cert = { ok: false, detail: 'scripts/pilot-local/.state/cert.pem ausente' };
  try {
    const x509 = new crypto.X509Certificate(fs.readFileSync(path.join(state, 'cert.pem')));
    const days = Math.floor((Date.parse(x509.validTo) - Date.now()) / 86400000);
    cert = { ok: days >= 2, detail: days >= 2 ? `válido por mais ${days} dia(s)` : `expira em ${days} dia(s)` };
  } catch { /* ausente ou ilegível */ }

  const services = {};
  const health = docker ? run('docker', ['inspect', '-f', '{{.State.Health.Status}}', DB]).out : '';
  services.db = { ok: health === 'healthy', detail: health || 'contêiner ausente' };
  services.auth = await probe('http://localhost:9999/health');
  services.rest = await probe('http://localhost:3000/');
  services.storage = await probe('http://localhost:5000/status');
  services.gateway = await probeHttps('https://localhost:8443/auth/v1/health');
  const app = await probeHttps('https://localhost:4443/api/health');
  let environment = null;
  try { environment = JSON.parse(app.body || '{}').release?.environment || null; } catch { /* não JSON */ }
  services.app = { ok: app.ok, detail: app.ok ? `${app.detail} · ARANDU_ENV=${environment || '?'}` : app.detail };

  const marker = services.db.ok ? sql("select value from public.fin_settings where key = 'deployment_environment'") : null;
  const orgs = services.db.ok ? Number(sql('select count(*) from public.fin_organizations') || 0) : 0;
  const pool = {};
  for (const line of String(services.db.ok ? sql('select status, count(*) from public.fin_demo_workspaces group by 1') || '' : '').split('\n').filter(Boolean)) {
    const [status, count] = line.split('|'); pool[status] = Number(count);
  }

  let seed = { ok: false, skipped: fast, detail: fast ? 'não verificado (--fast)' : 'não verificado' };
  if (!fast && services.app.ok && services.db.ok) {
    const r = run('bash', [path.join(root, 'scripts/demo/local.sh'), 'check'], { timeout: 300000 });
    const line = `${r.out}\n${r.err}`.match(/(\d+)\/(\d+) checagens OK/);
    seed = line && line[1] === line[2] && r.ok ? { ok: true, detail: `${line[1]}/${line[2]} checagens` } : { ok: false, detail: line ? `${line[1]}/${line[2]} checagens` : 'checagem falhou' };
  }

  let readiness = null;
  const report = path.join(root, 'reports/demo-readiness/readiness.md');
  if (fs.existsSync(report)) {
    const text = fs.readFileSync(report, 'utf8');
    readiness = { ageMinutes: Math.floor((Date.now() - fs.statSync(report).mtimeMs) / 60000),
      readMode: text.match(/Modo leitura:\s*\**\s*(PRONTO|NÃO PRONTO)/)?.[1] || null,
      interactiveMode: text.match(/Modo interativo:\s*\**\s*(PRONTO|NÃO PRONTO)/)?.[1] || null };
  }

  let freeze = null;
  try { freeze = JSON.parse(fs.readFileSync(freezeFile, 'utf8')); } catch { /* sem congelamento */ }

  return {
    host: hostFacts(), env: envFacts(), git: gitFacts(), node: { version: process.version }, npm: { version: npm.ok ? npm.out : null }, deps,
    docker: { engine: docker, compose: compose.ok ? `Compose ${compose.out}` : null }, browser, cert, services,
    ports: await portFacts(Boolean(docker)),
    db: { reachable: services.db.ok, marker, container: services.db.ok ? (orgs > 0 ? 'original' : 'contêiner sem os dados da Demo') : (health ? `banco ${health}` : 'contêiner ausente') },
    app: { reachable: services.app.ok, environment },
    pool: { ready: pool.ready || 0, claimed: pool.claimed || 0 }, seed, readiness, freeze
  };
}

function render(facts, result) {
  const lines = [
    `# Estação de apresentação — ${result.status}`, '',
    `- Data: ${new Date().toISOString()}`,
    `- Commit: ${facts.git.sha || '?'}${facts.git.clean ? ' (árvore limpa)' : ` (${facts.git.dirty} alteração(ões) locais)`}`,
    `- Congelado: ${facts.freeze?.sha || 'não'}${facts.freeze?.station ? ` · estação declarada: ${facts.freeze.host} em ${facts.freeze.at}` : ''}`,
    `- Máquina: ${facts.host.name} · ${facts.host.platform} ${facts.host.arch} · ${facts.host.cpus} CPU · ${facts.host.memoryGiB} GiB · ${facts.host.diskFreeGiB} GiB livres`,
    '', '| Item | Status | Detalhe | Ação |', '| --- | --- | --- | --- |',
    ...result.checks.map((c) => `| ${c.label} | ${c.status} | ${String(c.detail).replace(/\|/g, '/')} | ${c.status === 'PASS' ? '' : (c.fix || '')} |`),
    '', `**${result.status}**${result.reasons.length ? `: ${result.reasons.join(' · ')}` : ' — estação declarada, congelada, verificada e com prontidão recente.'}`, '',
    'Significados: READY = esta máquina, no SHA congelado, pronta agora · PREPARED = tudo verde, falta provar a estação definitiva · BLOCKED = requisito ausente · UNSAFE = alvo errado; não apresente.'
  ];
  return lines.join('\n');
}

const command = args[0] === 'freeze' ? 'freeze' : 'check';
const facts = await collect({ fast: args.includes('--fast') || command === 'freeze' });

if (command === 'freeze') {
  const result = classifyStation({ ...facts, freeze: null, readiness: { readMode: 'PRONTO', ageMinutes: 0 } });
  const hard = result.checks.filter((c) => ['BLOCKED', 'UNSAFE'].includes(c.status) && !['seed', 'pool'].includes(c.id));
  if (!facts.git.clean) { console.error('Congelamento recusado: a árvore Git tem alterações locais. Faça commit, stash ou volte ao SHA aprovado.'); process.exit(20); }
  if (hard.length) { console.error('Congelamento recusado — corrija antes:'); for (const c of hard) console.error(`  ${c.status}  ${c.label}: ${c.detail}${c.fix ? ` → ${c.fix}` : ''}`); process.exit(20); }
  const record = { sha: facts.git.sha, lockSha256: facts.git.lockSha256, node: process.version, at: new Date().toISOString(),
    host: facts.host.name, station: args.includes('--station') && !facts.host.ephemeral };
  fs.mkdirSync(state, { recursive: true });
  fs.writeFileSync(freezeFile, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  console.log(`Versão congelada: ${record.sha} (Node ${record.node}) em ${record.host}${record.station ? ' — declarada estação da apresentação' : facts.host.ephemeral ? ` — NÃO declarada estação: executor efêmero (${facts.host.ephemeral})` : ' — sem --station: não vale como estação'}.`);
  console.log('A partir daqui, qualquer checkout, pull ou npm install faz o preflight cair para PREPARED.');
  process.exit(0);
}

const result = classifyStation(facts);
fs.mkdirSync(OUT, { recursive: true });
const report = render(facts, result);
fs.writeFileSync(path.join(OUT, 'station.md'), `${report}\n`);
fs.writeFileSync(path.join(OUT, 'station.json'), `${JSON.stringify({ status: result.status, sha: facts.git.sha, at: new Date().toISOString(), checks: result.checks }, null, 2)}\n`);
for (const c of result.checks) console.log(`  ${c.status.padEnd(8)} ${c.label.padEnd(48)} ${c.detail}${c.status !== 'PASS' && c.fix ? `\n           → ${c.fix}` : ''}`);
console.log(`\nEstação: ${result.status}${result.reasons.length ? ` — ${result.reasons.join(' · ')}` : ''}`);
console.log(`Relatório: ${path.relative(root, path.join(OUT, 'station.md'))}`);
process.exit({ READY: 0, PREPARED: 10, BLOCKED: 20, UNSAFE: 30 }[result.status]);
