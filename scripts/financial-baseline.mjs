#!/usr/bin/env node
// Compile only a freshly created, synthetic loopback database. Never dump an
// operator-supplied source database and never copy hosted settings or secrets.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { loopbackTarget } from '../lib/recovery-reconciliation.mjs';
import { SCHEMA_SQL } from '../lib/recovery-schema.mjs';

const root = process.cwd();
const connection = loopbackTarget(process.env.ARANDU_DATABASE_TEST_URL || 'postgresql://postgres:postgres@localhost:5432/postgres');
const env = { PATH: process.env.PATH, HOME: process.env.HOME, ...connection };
const manifest = JSON.parse(fs.readFileSync('docs/supabase-migrations.json', 'utf8'));
const descriptorPath = 'docs/baselines/financial-v1.json';
const outputPath = 'docs/baselines/financial-v1.sql';
const write = process.argv.includes('--write');
const descriptor = write ? null : JSON.parse(fs.readFileSync(descriptorPath, 'utf8'));
const files = write ? manifest.cleanInstall : manifest.cleanInstall.slice(0, descriptor.sources.length);
const sha = value => createHash('sha256').update(value).digest('hex');
const sources = files.map(file => ({ file, sha256: sha(fs.readFileSync(file)) }));
if (!write) assert.deepEqual(sources, descriptor.sources, 'Historical baseline sources changed');
const marker = [...fs.readFileSync(files.at(-1), 'utf8').matchAll(/\(\s*'schema_version'\s*,\s*'([^']+)'\s*\)/g)].at(-1)?.[1];
assert(marker, 'Final marker required');
const ids = ['source', 'target', 'guard'].map(label => `arandu_baseline_${label}_${randomBytes(6).toString('hex')}`);
const created = [];
const run = (bin, args, input, db = connection.PGDATABASE) => execFileSync(bin, args, {
  env: { ...env, PGDATABASE: db }, input, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  stdio: ['pipe', 'pipe', 'pipe']
});
const sql = (db, input) => run('psql', ['-XqAt', '-v', 'ON_ERROR_STOP=1'], input, db).trim();
const apply = (db, file) => sql(db, fs.readFileSync(file, 'utf8'));
const reject = (db, input, pattern) => {
  const r = spawnSync('psql', ['-XqAt', '-v', 'ON_ERROR_STOP=1'], {
    env: { ...env, PGDATABASE: db }, input, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024
  });
  assert.notEqual(r.status, 0, 'Expected fail-closed refusal');
  assert.match(r.stderr, pattern);
};
// Logical baseline comparison: ACL arrays are sets, and PostgreSQL flattens
// associative AND/OR nodes on dump/reparse. Its own pretty deparser preserves
// meaningful grouping. Recovery's stricter, versioned fingerprint is untouched.
const baselineSchemaSQL = SCHEMA_SQL.replace('pg_get_constraintdef(c.oid)', 'pg_get_constraintdef(c.oid,true)')
  .replace(/\b((?:p\.|d\.|a\.)?(?:relacl|proacl|nspacl|defaclacl|attacl))::text/g,
    (_, acl) => {
      const effective = acl === 'relacl' ? "coalesce(relacl,acldefault('r',relowner))" : acl;
      return `(select array_agg(baseline_acl::text order by baseline_acl::text)::text from unnest(${effective}) baseline_acl)`;
    });
const fingerprint = db => sql(db, `begin read only;\n${baselineSchemaSQL}\nrollback;`);
const assertSchema = (source, target) => {
  if (fingerprint(source) === fingerprint(target)) return;
  const projection = baselineSchemaSQL.replace(/^select encode\(sha256[\s\S]*$/m, "select jsonb_object_agg(kind||':'||name,value) from items;");
  const values = [source,target].map(db => JSON.parse(sql(db, `begin read only;\n${projection}\nrollback;`)));
  const differences = [...new Set(values.flatMap(Object.keys))].filter(key => JSON.stringify(values[0][key]) !== JSON.stringify(values[1][key]));
  // Source/target are generated synthetic schemas, never hosted records.
  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync('reports/baseline-schema-differences.json', JSON.stringify(differences.map(key => ({key,source:values[0][key],target:values[1][key]})),null,2));
  assert.fail(`Schema/RLS/ACL/constraints/triggers differ (${differences.length}): ${differences.slice(0,12).join(', ')}`);
};
const settings = db => sql(db, "select jsonb_object_agg(key,value order by key) from public.fin_settings where key not in ('invite_secret','legacy_art_decommission')");
const bucket = db => sql(db, "select jsonb_agg(jsonb_build_array(id,name,public,file_size_limit,allowed_mime_types) order by id) from storage.buckets");
try {
  for (const db of ids) { sql(connection.PGDATABASE, `create database ${db};`); created.push(db); apply(db, 'tests/database/bootstrap.sql'); }
  const [source, target] = ids;
  const started = performance.now();
  for (const file of files) apply(source, file);
  const historicalMs = performance.now() - started;
  // Only structural defaults may be compiled, never product/customer records.
  assert.equal(sql(source, "select coalesce(sum((xpath('/row/n/text()',query_to_xml(format('select count(*) n from public.%I',tablename),false,true,'')))[1]::text::bigint),0) from pg_tables where schemaname='public' and tablename<>'fin_settings'"), '0');
  let dump = run('pg_dump', ['--schema-only', '--schema=public'], undefined, source);
  dump = dump.replace(/^\\(?:un)?restrict .*\n/gm, '')
    .replace(/^-- Dumped (?:from|by).*\n/gm, '')
    .replace(/^SET transaction_timeout = 0;\n/gm, '') // PG15/16 supported by existing CI.
    .replace(/^CREATE SCHEMA public;$/m, 'CREATE SCHEMA IF NOT EXISTS public;');
  const seed = sql(source, "select string_agg(format('insert into public.fin_settings(key,value) values (%L,%L);',key,value),E'\n' order by key) from public.fin_settings where key not in ('invite_secret','legacy_art_decommission')");
  // pg_dump emits final default ACLs AFTER object creation. Supabase's initial
  // ALL defaults would otherwise leak anon grants into restored functions and
  // tables that intentionally revoked them in history. Start from PostgreSQL
  // defaults, then let the dump restore every final ACL and default ACL.
  const defaultAclReset = ['tables','functions','sequences'].map(kind =>
    `alter default privileges in schema public revoke all on ${kind} from anon, authenticated, service_role;`).join('\n');
  const candidate = `-- GENERATED by scripts/financial-baseline.mjs from synthetic history only.\n-- Financial baseline v1; hosted installation still requires approved conversion.\nbegin;\nDO $baseline_guard$ begin\n  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','S'))\n     or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e'))\n     or exists(select 1 from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal) then\n    raise exception 'financial baseline requires empty application schema and no Auth user triggers; use historical upgrade';\n  end if;\nend $baseline_guard$;\n${defaultAclReset}\n${dump}\n${seed}\n-- Each installation receives its own secret; no generated secret is versioned.\ninsert into public.fin_settings(key,value) values ('invite_secret',encode(extensions.gen_random_bytes(32),'hex'));\ninsert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values\n('fin-documents','fin-documents',false,10485760,array['application/pdf','image/jpeg','image/png','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.wordprocessingml.document']);\nalter role authenticator set pgrst.db_pre_request to 'public.fin_request_session_guard';\nnotify pgrst, 'reload config';\nnotify pgrst, 'reload schema';\ncommit;\n`;
  const baseline = write ? candidate : fs.readFileSync(outputPath, 'utf8');
  if (!write) assert.equal(sha(baseline), descriptor.sha256, 'Baseline SQL changed without descriptor');
  const installStarted = performance.now();
  sql(target, baseline);
  const baselineMs = performance.now() - installStarted;
  assertSchema(source, target);
  assert.equal(settings(source), settings(target), 'Structural settings differ');
  assert.equal(bucket(source), bucket(target), 'Private bucket contract differs');
  assert.notEqual(sql(source,"select value from fin_settings where key='invite_secret'"), sql(target,"select value from fin_settings where key='invite_secret'"));
  reject(target, baseline, /financial baseline requires empty/);
  assert.equal(fingerprint(source), fingerprint(target), 'Rejected reinstall changed schema');
  const guard = ids[2];
  // Existing records and user-defined Auth triggers are never overwritten.
  sql(guard, 'create table public.baseline_existing(id int); insert into public.baseline_existing values(42);');
  reject(guard, baseline, /financial baseline requires empty/);
  assert.equal(sql(guard,'select id from public.baseline_existing'), '42');
  sql(guard, 'drop table public.baseline_existing;');
  sql(guard, "create function auth.baseline_probe() returns trigger language plpgsql as 'begin return new; end'; create trigger baseline_probe after insert on auth.users for each row execute function auth.baseline_probe();");
  reject(guard, baseline, /financial baseline requires empty/);
  assert.equal(sql(guard,"select count(*) from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal"), '1');
  sql(guard,'drop trigger baseline_probe on auth.users; drop function auth.baseline_probe();');
  // Demonstrate why pg_dump cannot simply be pasted into Supabase defaults.
  sql(guard, baseline.replace(defaultAclReset, ''));
  assert.equal(sql(guard,"select has_function_privilege('anon','public.fin_member_default_name()','execute')"), 't');
  assert.notEqual(fingerprint(source), fingerprint(guard), 'Unexpected anon grant was not detected');
  const expectedFingerprint = fingerprint(target);
  for (const mutation of [
    'alter table public.fin_members disable row level security;',
    'grant execute on function public.fin_member_default_name() to anon;',
    "create or replace function public.fin_member_default_name() returns trigger language plpgsql security definer set search_path='' as 'begin return new; end';",
    'alter table public.fin_members drop constraint fin_members_role_check;'
  ]) {
    assert.notEqual(sql(target,`begin; ${mutation}\n${baselineSchemaSQL}\nrollback;`), expectedFingerprint, 'Catalog tampering escaped comparison');
    assert.equal(fingerprint(target), expectedFingerprint, 'Negative test changed committed catalog');
  }
  for (const file of manifest.cleanInstall.slice(files.length)) { apply(source, file); apply(target, file); }
  assert.equal(fingerprint(source), fingerprint(target), 'Baseline + future upgrades differ');
  apply(target, 'ops/sql/post-migration-probes.sql');
  apply(target, 'ops/sql/pilot-isolation-canary.sql');
  if (write) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, baseline);
    fs.writeFileSync(descriptorPath, JSON.stringify({ version: 1, marker, sql: outputPath, sha256: sha(baseline), sources, scope: 'public schema, structural settings, private bucket, PostgREST session hook', prerequisite: 'Supabase roles, auth.users, auth.uid, storage.buckets, extensions.pgcrypto; empty application schema', rollback: 'discard only a new isolated database; hosted recovery requires approved verified backup' }, null, 2) + '\n');
  }
  const result = { status: 'PASS_LOCAL', classification: 'synthetic_financial_baseline_equivalence', marker,
    migrations: { historical: files.length, baseline: 1 }, milliseconds: { historical: Math.round(historicalMs), baseline: Math.round(baselineMs) },
    bytes: { historical: files.reduce((n,f) => n + fs.statSync(f).size, 0), baseline: Buffer.byteLength(baseline) },
    schema: 'MATCH', settings: 'MATCH_EXCLUDING_PER_INSTALL_SECRET_AND_RETIREMENT_AUDIT', storage: 'PRIVATE_BUCKET_MATCH',
    canary: 'PASS_LOCAL', hosted: 'NOT_RUN' };
  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync('reports/financial-baseline.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally {
  for (const db of created.reverse()) sql(connection.PGDATABASE, `drop database ${db} with (force);`);
}
