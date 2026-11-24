#!/usr/bin/env node
// Transição real do schema financial-arandu-10-1 para demo-pool-integrity-1 na
// stack local (Supabase Auth + PostgREST + Storage + app, PostgreSQL 17), na
// ordem que a Demo hospedada precisa seguir (auditoria pós-#367):
//   1. schema arandu-10-1 montado pelo código 11.3 (ARANDU_OLD_WORKTREE)
//   2. provisioning legado órfão (seed antigo interrompido) + um recente
//   3. reconciliação canônica sob lease (workspaces.mjs cleanup) respeitando 6 h
//   4. plan  5. rehearse  6. apply das 2 migrations (decisão + release-migrations)
//   7. manutenção do pool  8. três ready  9. baseline e visitante válido intactos
// Nada hospedado. A preservação usa ciphertext age real enviado a um servidor
// local que imita a API do GitHub (repositório privado), não ao GitHub.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { makeExec, disposablePostgres } from '../recovery/orchestrate.mjs';
import { plan, rehearse, preserve } from '../demo/remote-release.mjs';
import { decideDemoRelease, PATHS } from '../../lib/demo-recovery-policy.mjs';
import { DEMO_REF } from '../../lib/release-migration-guard.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const old = process.env.ARANDU_OLD_WORKTREE;
assert(old && fs.existsSync(path.join(old, 'scripts/demo/seed.mjs')), 'ARANDU_OLD_WORKTREE (checkout 11.3) obrigatório');
const state = path.join(root, 'scripts/pilot-local/.state');
const env0 = Object.fromEntries(fs.readFileSync(path.join(state, '.env'), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const demoEnv = Object.fromEntries(fs.readFileSync(path.join(state, 'demo.env'), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const pgEnvLocal = { PGHOST: '127.0.0.1', PGPORT: '54322', PGUSER: 'postgres', PGPASSWORD: env0.PGPW, PGDATABASE: 'postgres', PGSSLMODE: 'disable' };
const toolEnv = { ...process.env, ARANDU_ENV: 'demo', ARANDU_DEMO_CONFIRM: 'local', SUPABASE_URL: 'https://localhost:8443', SUPABASE_ANON_KEY: env0.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: env0.SERVICE_KEY, ARANDU_DEMO_APP_URL: 'https://localhost:4443', CRON_SECRET: env0.CRON_SECRET, NODE_EXTRA_CA_CERTS: path.join(state, 'cert.pem'),
  ARANDU_DEMO_PASSWORD: demoEnv.ARANDU_DEMO_PASSWORD };
const exec = makeExec({ cwd: root, secrets: [env0.PGPW, env0.SERVICE_KEY], log: (l) => process.env.DEBUG && console.error(l) });
const q = (sql) => exec('q', 'psql', ['-XAtc', sql], { env: pgEnvLocal }).stdout.trim();
const step = (s) => console.log(`== ${s}`);
const tool = (cwd, args, extra = {}) => spawnSync(process.execPath, args, { cwd, env: { ...toolEnv, ...extra }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const wsOrgs = (slug) => `select o.id from fin_organizations o join auth.users u on u.id=o.created_by where u.email ~ '\\+ws-${slug}@'`;

// Digest do que precisa sobreviver: baseline (contas sem +ws) e o visitante válido.
const protectedDigest = (slug) => q(`select md5(concat_ws('|',
  (select md5(coalesce(string_agg(x::text, ',' order by x::text), '')) from (select id,email from auth.users where email !~ '\\+ws-') x),
  (select md5(coalesce(string_agg(x::text, ',' order by x::text), '')) from (select o.id,o.legal_name,o.kind from fin_organizations o join auth.users u on u.id=o.created_by where u.email !~ '\\+ws-' or u.email ~ '\\+ws-${slug}@') x),
  (select md5(coalesce(string_agg(x::text, ',' order by x::text), '')) from (select id,organization_id,title,status from fin_rfqs where organization_id in (${wsOrgs(slug)}) or organization_id in (select o.id from fin_organizations o join auth.users u on u.id=o.created_by where u.email !~ '\\+ws-')) x),
  (select md5(coalesce(string_agg(x::text, ',' order by x::text), '')) from (select id,organization_id,title,ends_on from fin_contracts where organization_id in (${wsOrgs(slug)}) or organization_id in (select o.id from fin_organizations o join auth.users u on u.id=o.created_by where u.email !~ '\\+ws-')) x),
  (select md5(coalesce(string_agg(x::text, ',' order by x::text), '')) from (select bucket_id,name from storage.objects where split_part(name,'/',1) in (
     select o.id::text from fin_organizations o join auth.users u on u.id=o.created_by where u.email !~ '\\+ws-' or u.email ~ '\\+ws-${slug}@')) x),
  (select md5(concat_ws(':', slug, status, claim_token_hash, expires_at, idle_expires_at, buyer_organization_id)) from fin_demo_workspaces where slug='${slug}')))`);

try {
  step('1. schema anterior');
  assert.equal(q("select value from fin_settings where key='schema_version'"), 'financial-arandu-10-1');
  assert.equal(q("select count(*) from information_schema.columns where table_name='fin_demo_workspaces' and column_name in ('heartbeat_at','failed_at')"), '0');

  step('2. pool pelo código antigo: 2 workspaces, 1 reivindicado por visitante');
  let r = tool(old, ['scripts/demo/workspaces.mjs', 'provision', '--count=2', '--concurrency=2']);
  assert.equal(r.status, 0, r.stderr.slice(-800));
  const tokenHash = createHash('sha256').update('visitor-transition').digest('hex');
  q(`select public.fin_demo_workspace_claim('${tokenHash}', 240, 1440, 25)`);
  const visitor = q("select slug from fin_demo_workspaces where status='claimed'");
  assert.match(visitor, /^[a-f0-9]{10}$/);

  step('2b. provisioning legado interrompido (seed antigo morto no meio) x2');
  const interrupt = (slug) => new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/demo/seed.mjs', '--quiet'], { cwd: old, env: { ...toolEnv, ARANDU_DEMO_WORKSPACE: slug }, stdio: 'ignore' });
    const t = setInterval(() => { if (q(`select count(*) from auth.users where email ~ '\\+ws-${slug}@'`) !== '0') { clearInterval(t); setTimeout(() => child.kill('SIGKILL'), 15000); } }, 2000);
    child.on('close', resolve);
  });
  await interrupt('a1a1a1a1a1'); await interrupt('b2b2b2b2b2');
  assert.equal(q("select string_agg(status, ',' order by slug) from fin_demo_workspaces where slug in ('a1a1a1a1a1','b2b2b2b2b2')"), 'provisioning,provisioning');
  // O órfão hospedado foi criado às 17:56 UTC; aqui o tempo passa por fixture.
  q("update fin_demo_workspaces set created_at = now() - interval '7 hours' where slug='a1a1a1a1a1'");
  const before = protectedDigest(visitor);

  step('3. reconciliação canônica (código novo, schema antigo)');
  const inv0 = plan({ exec, sourceEnv: pgEnvLocal, declaredEnvironment: 'demo', connectionRef: DEMO_REF }).inventory;
  assert(decideDemoRelease({ declaredEnvironment: 'demo', connectionRef: DEMO_REF, inventory: inv0 }).nogo.some((n) => n.code === 'POOL_PROVISIONING_ACTIVE'), 'provisioning bloqueia o apply');
  r = tool(root, ['scripts/demo/workspaces.mjs', 'cleanup', '--dry-run']);
  const dry = JSON.parse(r.stdout.trim().split('\n').at(-1));
  assert.equal(dry.schema, 'legacy'); assert.deepEqual(dry.cleanup, ['a1a1a1a1a1'], 'só o órfão > 6 h; recente e reivindicado ficam');
  q("select public.fin_demo_pool_lease('pool-othercontroller', 120)");
  r = tool(root, ['scripts/demo/workspaces.mjs', 'cleanup']); assert.match(r.stdout, /skipped/, 'sem lease, não limpa');
  q('delete from fin_demo_pool_leases');
  r = tool(root, ['scripts/demo/workspaces.mjs', 'cleanup']); assert.equal(r.status, 0, r.stderr.slice(-800));
  assert.equal(q("select count(*) from fin_demo_workspaces where slug='a1a1a1a1a1'"), '0');
  assert.equal(q("select count(*) from auth.users where email ~ '\\+ws-a1a1a1a1a1@'"), '0', 'escopo parcial removido');
  assert.equal(q("select status from fin_demo_workspaces where slug='b2b2b2b2b2'"), 'provisioning', 'recente (< 6 h) preservado');
  q("update fin_demo_workspaces set created_at = now() - interval '7 hours' where slug='b2b2b2b2b2'");
  r = tool(root, ['scripts/demo/workspaces.mjs', 'cleanup']); assert.equal(r.status, 0);
  assert.equal(q("select count(*) from fin_demo_workspaces where status='provisioning'"), '0');
  assert.equal(protectedDigest(visitor), before, 'reconciliação não toca baseline nem visitante');

  step('4. plan  5. rehearse');
  const planned = plan({ exec, sourceEnv: pgEnvLocal, declaredEnvironment: 'demo', connectionRef: DEMO_REF });
  assert.equal(planned.path, PATHS.demo); assert.equal(planned.classification.fictitious, true, JSON.stringify(planned.classification));
  assert.deepEqual(planned.pending.map((p) => p.file), ['docs/supabase-financial-invite-integrity.sql', 'docs/supabase-financial-demo-pool-integrity.sql']);
  const work = fs.mkdtempSync(path.join(os.homedir(), '.arandu-transition-'));
  const holder = 'release-transition-1';
  assert.equal(q(`select public.fin_demo_pool_lease('${holder}', 3600)`), 't', 'lease antes do snapshot');
  const evidence = rehearse({ exec, sourceEnv: pgEnvLocal, planned, workDir: work, postgres: disposablePostgres });
  assert(Object.values(evidence.checks).every((v) => v === 'PASS'), JSON.stringify(evidence.checks));
  // Com o lease do release, o controlador não entra (snapshot -> apply protegido).
  r = tool(root, ['scripts/demo/workspaces.mjs', 'maintain']); assert.match(r.stdout, /skipped/);

  step('6. preservação (sessão válida) + decisão + apply');
  const keyDir = fs.mkdtempSync(path.join(os.homedir(), '.arandu-transition-key-')); fs.chmodSync(keyDir, 0o700);
  spawnSync('age-keygen', ['-o', path.join(keyDir, 'id.age')]);
  const recipient = spawnSync('age-keygen', ['-y', path.join(keyDir, 'id.age')], { encoding: 'utf8' }).stdout.trim();
  const assets = new Map();
  const fake = async (url, init = {}) => { // API do GitHub simulada: repositório privado
    const u = new URL(url); const json = (v) => ({ json: async () => v, arrayBuffer: async () => v });
    if (u.pathname === '/repos/owner/private-snapshots') return json({ private: true });
    if (u.pathname.endsWith('/releases') && init.method === 'POST') return json({ id: 1 });
    if (u.pathname.endsWith('/assets') && init.method === 'POST') { assets.set(7, Buffer.from(init.body)); return json({ id: 7 }); }
    if (u.pathname.endsWith('/assets/7')) return json(assets.get(7));
    throw new Error(`rota inesperada ${u.pathname}`);
  };
  const preservation = await preserve({ exec, evidence, recipient, repository: 'owner/private-snapshots', token: 'test-token', fetchImpl: fake, workDir: work });
  assert.equal(preservation.ciphertext_sha256, preservation.uploaded_sha256);
  const back = spawnSync('age', ['--decrypt', '-i', path.join(keyDir, 'id.age')], { input: assets.get(7) });
  assert.equal(createHash('sha256').update(back.stdout).digest('hex'), evidence.snapshot_sha256, 'ciphertext decifra para o snapshot ensaiado (fora de CI)');
  const inventory = plan({ exec, sourceEnv: pgEnvLocal, declaredEnvironment: 'demo', connectionRef: DEMO_REF }).inventory;
  const decision = decideDemoRelease({ declaredEnvironment: 'demo', connectionRef: DEMO_REF, inventory, evidence, preservation, lock: { held: true, holder_matches: true }, authorization: 'issue-366-transition-test' });
  assert.deepEqual(decision.nogo, []);
  const url = `postgresql://postgres:${env0.PGPW}@127.0.0.1:54322/postgres`;
  r = spawnSync(process.execPath, ['scripts/release-migrations.mjs', '--environment=staging', '--flow=existingDatabase', '--after-schema=financial-arandu-10-1', '--operator=demo-transition-test',
    `--backup-reference=${evidence.release_gate.backup_reference}`, `--restore-reference=${evidence.release_gate.restore_reference}`, '--restore-evidence=reports/backup-restore-verification.json', '--apply'],
    { cwd: root, encoding: 'utf8', env: { PATH: process.env.PATH, ARANDU_DATABASE_URL: url, ARANDU_STAGING_DATABASE_URL: url, ARANDU_BACKUP_PATH: evidence.snapshot_file, PGSSLMODE: 'disable' } });
  assert.equal(r.status, 0, (r.stdout + r.stderr).replaceAll(env0.PGPW, '***').slice(-1500));
  q(`select public.fin_demo_pool_release('${holder}')`);
  assert.equal(q("select value from fin_settings where key='schema_version'"), 'financial-demo-pool-integrity-1');
  assert.equal(protectedDigest(visitor), before, 'apply preserva baseline e visitante');

  step('7. app com o código novo (deploy) + manutenção do pool  8. três ready');
  r = spawnSync('bash', ['scripts/demo/local.sh', 'app'], { cwd: root, encoding: 'utf8' }); assert.equal(r.status, 0, r.stdout + r.stderr);
  r = tool(root, ['scripts/demo/workspaces.mjs', 'maintain']);
  const summary = JSON.parse(r.stdout.trim().split('\n').at(-1));
  assert.equal(r.status, 0, r.stderr.slice(-1500)); assert.equal(summary.after.ready, 3); assert.equal(summary.ready_deficit, 0);
  assert.equal(q("select count(*) from fin_demo_workspaces where status='ready'"), '3');

  step('9. preservação integral');
  assert.equal(protectedDigest(visitor), before, 'baseline e visitante válido intactos após todo o fluxo');
  assert.equal(q(`select status from fin_demo_workspaces where slug='${visitor}'`), 'claimed');
  fs.rmSync(work, { recursive: true, force: true }); fs.rmSync(keyDir, { recursive: true, force: true });
  console.log(`Transição real OK: órfão legado reconciliado sob lease (recente preservado até 6 h), plan/rehearse ${Object.keys(evidence.checks).length}/6, apply das 2 migrations com ciphertext verificado, maintain -> 3 ready (seed ${summary.seed_seconds.join('/')} s), baseline e visitante ${visitor} intactos.`);
} catch (error) { console.error(error.stack || error); process.exitCode = 1; }
