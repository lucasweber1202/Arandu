// Integração REAL do release remoto da Demo (issue #366) em Supabase descartável:
// PostgreSQL 17 Supabase + GoTrue `auth migrate` + Storage-API (migrations),
// todos locais e efêmeros. Monta uma "Demo" fictícia no marcador
// financial-arandu-10-1 com baseline, visitante com sessão válida e Storage.
// Ensaio sintético: NÃO é recovery hospedado.
//   Requer: docker, pg_dump/pg_restore/psql 17 no PATH.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { makeExec, disposablePostgres, pgEnv } from './recovery/orchestrate.mjs';
import { plan, rehearse } from './demo/remote-release.mjs';
import { decideDemoRelease, reconstructionEligibility, PATHS } from '../lib/demo-recovery-policy.mjs';
import { DEMO_REF } from '../lib/release-migration-guard.mjs';

const root = process.cwd();
const logs = [];
const exec = makeExec({ cwd: root, log: (l) => { logs.push(l); if (process.env.DEBUG) console.error(l); } });
const containers = [];
const pg = (e, o) => { const c = disposablePostgres(e, o); containers.push(c); return c; };
const work = fs.mkdtempSync(path.join(os.homedir(), '.arandu-demo-release-real-'));
const auxiliary = [];
const id = (n) => `00000000-0000-4000-8000-0000002d${String(n).padStart(4, '0')}`;

/** Supabase descartável completo: Auth e Storage migrados pelos serviços oficiais. */
function supabase(label) {
  const db = pg(exec, { label });
  const env = { ...pgEnv(db.url), PGSSLMODE: 'disable' };
  const pw = new URL(db.url).password; const port = new URL(db.url).port;
  exec('supabase', 'psql', ['-X', '-q', '-c', `alter user supabase_auth_admin with password '${pw}'; alter user supabase_storage_admin with password '${pw}'; alter user postgres with password '${pw}';`], { env });
  exec('supabase', 'docker', ['run', '--rm', '--network', 'host', '-e', 'GOTRUE_DB_DRIVER=postgres', '-e', `GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:${pw}@127.0.0.1:${port}/postgres`,
    '-e', 'GOTRUE_SITE_URL=http://localhost', '-e', `GOTRUE_JWT_SECRET=${randomBytes(32).toString('hex')}`, '-e', 'API_EXTERNAL_URL=http://localhost', 'public.ecr.aws/supabase/gotrue:v2.181.0', 'auth', 'migrate']);
  const name = `arandu-release-storage-${randomBytes(4).toString('hex')}`;
  const storagePort = 56000 + Math.floor(Math.random() * 3000);
  exec('supabase', 'docker', ['run', '-d', '--name', name, '--network', 'host', '-e', `SERVER_PORT=${storagePort}`, '-e', `PORT=${storagePort}`, '-e', 'ANON_KEY=x', '-e', 'SERVICE_KEY=x',
    '-e', `PGRST_JWT_SECRET=${'s'.repeat(32)}`, '-e', `AUTH_JWT_SECRET=${'s'.repeat(32)}`, '-e', `DATABASE_URL=postgres://supabase_storage_admin:${pw}@127.0.0.1:${port}/postgres`,
    '-e', 'POSTGREST_URL=http://127.0.0.1:1', '-e', 'FILE_SIZE_LIMIT=52428800', '-e', 'STORAGE_BACKEND=file', '-e', 'FILE_STORAGE_BACKEND_PATH=/tmp/storage',
    '-e', 'TENANT_ID=stub', '-e', 'REGION=stub', '-e', 'GLOBAL_S3_BUCKET=stub', '-e', 'ENABLE_IMAGE_TRANSFORMATION=false', 'public.ecr.aws/supabase/storage-api:v1.25.3']);
  auxiliary.push(name);
  for (let i = 0; i < 60; i += 1) {
    if (exec('supabase', 'psql', ['-XAtc', "select count(*) from information_schema.columns where table_schema='storage' and table_name='buckets' and column_name='allowed_mime_types'"], { env, allowFail: true }).stdout.trim() === '1') break;
    spawnSync('sleep', ['2']);
  }
  exec('supabase', 'docker', ['rm', '-f', name], { allowFail: true });
  return { ...db, env };
}
const sql = (env, text) => exec('fixture', 'psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', text], { env });
const val = (env, text) => exec('fixture', 'psql', ['-XAtc', text], { env }).stdout.trim();
const digest = (env, where) => val(env, `select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from (${where}) t`);

try {
  // ---------------------------------------------------- Demo fictícia (origem)
  const demo = supabase('source');
  const manifest = JSON.parse(fs.readFileSync('docs/supabase-migrations.json', 'utf8')).cleanInstall;
  const until = manifest.indexOf('docs/supabase-financial-arandu-10.sql');
  for (const file of manifest.slice(0, until + 1)) exec('fixture', 'psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', file], { env: demo.env });
  assert.equal(val(demo.env, "select value from fin_settings where key='schema_version'"), 'financial-arandu-10-1');
  sql(demo.env, `
    insert into fin_settings(key,value) values('deployment_environment','demo') on conflict(key) do update set value='demo';
    insert into auth.users(id,email,aud,role) values
      ('${id(1)}','helena.duarte@vittafoods.example','authenticated','authenticated'),
      ('${id(2)}','ana@atlasbank.example','authenticated','authenticated'),
      ('${id(3)}','helena.duarte+ws-aaaaaaaaaa@vittafoods.example','authenticated','authenticated');
    insert into fin_organizations(id,legal_name,kind,created_by) values ('${id(100)}','Vitta Foods (baseline)','BUYER','${id(1)}'),('${id(101)}','Atlas (baseline)','PROVIDER','${id(2)}'),('${id(102)}','Vitta Foods (visitante)','BUYER','${id(3)}');
    insert into fin_members(organization_id,user_id,role) values ('${id(100)}','${id(1)}','admin'),('${id(101)}','${id(2)}','provider_user'),('${id(102)}','${id(3)}','admin');
    insert into fin_demo_workspaces(slug,baseline_version,status,buyer_organization_id,user_ids,claim_token_hash,claimed_at,expires_at,idle_expires_at)
      values ('aaaaaaaaaa','vitta-2026-10','claimed','${id(102)}',array['${id(3)}'::uuid],repeat('a',64),now()-interval '1 hour',now()+interval '20 hours',now()+interval '3 hours');
    insert into fin_events(organization_id,entity_type,entity_id,event_type,actor_id) values ('${id(102)}','organization','${id(102)}','visitor_activity','${id(3)}');
    insert into storage.buckets(id,name,public) values ('fin-documents','fin-documents',false) on conflict do nothing;
    insert into storage.objects(bucket_id,name,metadata) values ('fin-documents','${id(100)}/doc-1/v1','{"size":10}'),('fin-documents','${id(102)}/doc-2/v1','{"size":12}');`);
  const visitorRows = `select * from fin_demo_workspaces where slug='aaaaaaaaaa' union all select null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null where false`;
  const protectedDigest = () => [digest(demo.env, 'select id,legal_name,kind,created_by from fin_organizations'), digest(demo.env, 'select id,email from auth.users'),
    digest(demo.env, "select slug,status,claim_token_hash,expires_at,idle_expires_at,buyer_organization_id from fin_demo_workspaces"), digest(demo.env, 'select bucket_id,name from storage.objects'),
    digest(demo.env, 'select organization_id,event_type,actor_id from fin_events')].join(':');
  const before = protectedDigest();

  // ---------------------------------------------------- plan (somente leitura)
  const planned = plan({ exec, sourceEnv: demo.env, declaredEnvironment: 'demo', connectionRef: DEMO_REF });
  assert.equal(planned.path, PATHS.demo);
  assert.equal(planned.classification.fictitious, true, JSON.stringify(planned.classification));
  assert.deepEqual(planned.pending.map((p) => p.file), ['docs/supabase-financial-invite-integrity.sql', 'docs/supabase-financial-demo-pool-integrity.sql']);
  assert.equal(planned.non_regenerable.present, true); assert.equal(planned.non_regenerable.claimed_valid, 1);
  assert.equal(planned.inventory.storage.objects, 2); assert.equal(planned.inventory.users.workspace_accounts, 1);
  assert.equal(plan({ exec, sourceEnv: demo.env, declaredEnvironment: 'production', connectionRef: DEMO_REF }).path, PATHS.full);
  assert.equal(plan({ exec, sourceEnv: demo.env, declaredEnvironment: 'demo', connectionRef: 'igacnfjeuqhxcmfyepgj' }).path, PATHS.full);

  // ---------------------------------------------------- ensaio na cópia
  const evidence = rehearse({ exec, sourceEnv: demo.env, planned, workDir: path.join(work, 'run'), postgres: pg });
  assert.deepEqual(evidence.checks, { restore: 'PASS', migrations_applied: 'PASS', post_migration_probes: 'PASS', isolation_canary: 'PASS', rollback: 'PASS', reapply: 'PASS' });
  assert.equal(evidence.restore.backup_sha256, evidence.snapshot_sha256);
  assert.equal(val(demo.env, "select value from fin_settings where key='schema_version'"), 'financial-arandu-10-1', 'origem só lida');
  assert.equal(protectedDigest(), before, 'ensaio não altera a origem');
  assert(!logs.join('\n').includes(new URL(demo.url).password), 'senha fora dos logs');

  // ---------------------------------------------------- decisões
  const holder = 'release-test-0001';
  const lease = (h) => val(demo.env, `select public.fin_demo_pool_lease('${h}', 600)`) === 't';
  const base = { declaredEnvironment: 'demo', connectionRef: DEMO_REF, evidence, authorization: 'issue-366-owner-approval-0001' };
  const inv = () => plan({ exec, sourceEnv: demo.env, declaredEnvironment: 'demo', connectionRef: DEMO_REF }).inventory;
  // Outro controlador segura o lease: perda de lock.
  assert(lease('pool-othercontroller'));
  let d = decideDemoRelease({ ...base, inventory: inv(), lock: { held: lease(holder), holder_matches: false } });
  assert(d.nogo.some((n) => n.code === 'LOCK_NOT_HELD'));
  sql(demo.env, "delete from fin_demo_pool_leases");
  assert(lease(holder));
  const locked = { held: true, holder_matches: true };
  // Sessão válida sem destino de preservação: NO-GO específico (não reset, não bypass).
  d = decideDemoRelease({ ...base, inventory: inv(), lock: locked });
  assert.deepEqual(d.nogo.map((n) => n.code), ['PRESERVATION_DESTINATION_MISSING']);
  assert.equal(reconstructionEligibility({ inventory: inv(), ownerApproval: 'issue-366-window-0001' }).eligible, false, 'reconstrução bloqueada com sessão válida');
  // Destino aprovado mas transferência divergente / snapshot trocado.
  const pres = { destination_approved: true, plaintext_sha256: evidence.snapshot_sha256, ciphertext_sha256: 'a'.repeat(64), uploaded_sha256: 'a'.repeat(64) };
  assert.equal(decideDemoRelease({ ...base, inventory: inv(), lock: locked, preservation: pres }).go, true, 'GO com ciphertext verificado');
  assert(decideDemoRelease({ ...base, inventory: inv(), lock: locked, preservation: { ...pres, uploaded_sha256: 'b'.repeat(64) } }).nogo.some((n) => n.code === 'PRESERVATION_TRANSFER_UNVERIFIED'));
  assert(decideDemoRelease({ ...base, inventory: inv(), lock: locked, preservation: { ...pres, plaintext_sha256: 'c'.repeat(64) } }).nogo.some((n) => n.code === 'PRESERVATION_SNAPSHOT_MISMATCH'));
  // Evidência falsa/vencida/trocada/incompleta e migration não autorizada.
  const codes = (over) => decideDemoRelease({ ...base, inventory: inv(), lock: locked, preservation: pres, ...over }).nogo.map((n) => n.code);
  assert(codes({ evidence: { ...evidence, generated_at: new Date(Date.now() - 7 * 3600000).toISOString() } }).includes('EVIDENCE_STALE'));
  assert(codes({ evidence: { ...evidence, restore: { backup_sha256: 'f'.repeat(64) } } }).includes('EVIDENCE_HASH_MISMATCH'));
  assert(codes({ evidence: { ...evidence, source_schema: 'financial-crm-1' } }).includes('EVIDENCE_SOURCE_MISMATCH'));
  assert(codes({ evidence: { ...evidence, checks: { ...evidence.checks, rollback: 'FAIL' } } }).includes('REHEARSAL_INCOMPLETE'));
  assert(codes({ evidence: { ...evidence, result: 'failed' } }).includes('REHEARSAL_MISSING'));
  assert(codes({ authorization: 'ok' }).includes('AUTHORIZATION_MISSING'));
  assert(codes({ declaredEnvironment: 'staging' }).includes('FULL_RECOVERY_REQUIRED'));
  // Dados desconhecidos: uma conta real-like bloqueia a política proporcional.
  sql(demo.env, `insert into auth.users(id,email,aud,role) values ('${id(9)}','someone@gmail.com','authenticated','authenticated')`);
  assert(codes({}).includes('DATA_UNCLASSIFIED_USERS'));
  sql(demo.env, `delete from auth.users where id='${id(9)}'`);
  // Ambiente do banco errado: caminho integral, sempre.
  sql(demo.env, "update fin_settings set value='production' where key='deployment_environment'");
  assert.deepEqual(codes({}), ['FULL_RECOVERY_REQUIRED']);
  sql(demo.env, "update fin_settings set value='demo' where key='deployment_environment'");
  // Sem sessão válida: estado não regenerável ausente -> GO sem ciphertext; reconstrução elegível com aprovação.
  const originalExpiry = val(demo.env, "select expires_at::text from fin_demo_workspaces where slug='aaaaaaaaaa'");
  sql(demo.env, "update fin_demo_workspaces set expires_at=now()-interval '1 minute' where slug='aaaaaaaaaa'");
  assert.deepEqual(codes({ preservation: undefined }), []);
  assert.equal(reconstructionEligibility({ inventory: inv(), ownerApproval: 'issue-366-window-0001' }).eligible, true);
  sql(demo.env, `update fin_demo_workspaces set expires_at='${originalExpiry}' where slug='aaaaaaaaaa'`);
  assert.equal(protectedDigest(), before, 'fixture restaurada exatamente antes do apply');

  // ---------------------------------------------------- apply real (release-migrations)
  // O guard da Demo recusa loopback (correto); o caminho staging do MESMO executor
  // aplica com o mesmo backup e evidência, provando o --apply ponta a ponta.
  // Mesmo papel dono do schema (na Demo hospedada, o mesmo usuário que aplicou as migrations).
  const url = demo.url;
  const applied = spawnSync(process.execPath, ['scripts/release-migrations.mjs', '--environment=staging', '--flow=existingDatabase', '--after-schema=financial-arandu-10-1',
    '--operator=demo-release-test', `--backup-reference=${evidence.release_gate.backup_reference}`, `--restore-reference=${evidence.release_gate.restore_reference}`,
    '--restore-evidence=reports/backup-restore-verification.json', '--apply'], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: os.homedir(),
    ARANDU_DATABASE_URL: url, ARANDU_STAGING_DATABASE_URL: url, ARANDU_BACKUP_PATH: evidence.snapshot_file, PGSSLMODE: 'disable' } });
  assert.equal(applied.status, 0, (applied.stdout + applied.stderr).replaceAll(new URL(demo.url).password, '***').slice(-1500));
  assert.equal(val(demo.env, "select value from fin_settings where key='schema_version'"), 'financial-demo-pool-integrity-1');
  { const after = protectedDigest(); assert.equal(after, before, `baseline, visitante, Storage e sessão válida intactos após o apply: ${['orgs','users','workspaces','storage','events'].filter((_, i) => after.split(':')[i] !== before.split(':')[i])}`); }
  // O --apply recusa evidência de outro backup (hash trocado) e vencida.
  fs.appendFileSync(evidence.snapshot_file, 'x');
  const swapped = spawnSync(process.execPath, ['scripts/release-migrations.mjs', '--environment=staging', '--flow=existingDatabase', '--after-schema=financial-demo-pool-integrity-1',
    '--operator=demo-release-test', `--backup-reference=${evidence.release_gate.backup_reference}`, `--restore-reference=${evidence.release_gate.restore_reference}`, '--apply'],
    { encoding: 'utf8', env: { PATH: process.env.PATH, ARANDU_DATABASE_URL: url, ARANDU_STAGING_DATABASE_URL: url, ARANDU_BACKUP_PATH: evidence.snapshot_file, PGSSLMODE: 'disable' } });
  assert.notEqual(swapped.status, 0);
  console.log(`Demo remote release (real, Supabase PG17 + GoTrue + Storage descartáveis): plan DEMO_PROPORTIONAL com 2 pendentes; ensaio ${Object.keys(evidence.checks).length}/6 PASS sem tocar a origem; NO-GO específico para sessão válida sem destino, lock alheio, evidência vencida/trocada/incompleta, dados desconhecidos, ambiente não Demo e autorização ausente; --apply real com o mesmo backup aplicou as 2 migrations preservando baseline, visitante, sessão e Storage; hash trocado recusado.`);
} finally {
  for (const name of auxiliary) spawnSync('docker', ['rm', '-f', name]);
  for (const c of containers) c.close();
  fs.rmSync(work, { recursive: true, force: true });
}
