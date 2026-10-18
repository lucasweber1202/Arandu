// Rehearse the observed Pilot marker using the real manifest, never hosted SQL.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const base = process.argv[2];
assert(base && ['localhost','127.0.0.1'].includes(new URL(base).hostname), 'Disposable loopback database required');
const db = 'arandu_codex_pilot_upgrade_test';
const restoredDb = 'arandu_codex_pilot_restore_test';
const target = new URL(base); target.pathname = `/${db}`;
const restored = new URL(base); restored.pathname = `/${restoredDb}`;
const psql = (url, query) => execFileSync('psql',[String(url),'-XAtq','-v','ON_ERROR_STOP=1','-f','-'],{input:query,encoding:'utf8',maxBuffer:16*1024*1024});
const apply = file => execFileSync('psql',[String(target),'-XAtq','-v','ON_ERROR_STOP=1','-f',file],{encoding:'utf8',maxBuffer:16*1024*1024});
const manifest = JSON.parse(readFileSync('docs/supabase-migrations.json','utf8'));
const split = manifest.cleanInstall.indexOf('docs/supabase-financial-pilot-surface-hardening.sql');
assert(split>0);
psql(base,`create database ${db};`);
try {
 apply('tests/database/bootstrap.sql');
 for(const file of manifest.cleanInstall.slice(0,split+1)) apply(file);
 assert.equal(psql(target,"select value from public.fin_settings where key='schema_version';").trim(),'financial-surface-hardening-1');
 apply('tests/database/financial-procurement.sql');
 const fingerprint = () => psql(target,"select json_agg(row_to_json(p) order by id) from public.fin_proposal_versions p;").trim();
 const preserved = fingerprint();
 // Preserve the complete synthetic Pilot before crossing the destructive
 // legacy boundary; prove a restore, never bypass that boundary with a guess.
 const dump = execFileSync('pg_dump',['-Fc','--dbname',String(target)],{maxBuffer:32*1024*1024});
 const dumpSha = createHash('sha256').update(dump).digest('hex');
 psql(base,`create database ${restoredDb};`);
 execFileSync('pg_restore',['--exit-on-error','--single-transaction','--dbname',String(restored)],{input:dump,maxBuffer:16*1024*1024});
 assert.equal(psql(restored,"select json_agg(row_to_json(p) order by id) from public.fin_proposal_versions p;").trim(),preserved);
 assert.equal(psql(restored,'select count(*) from auth.users;'),psql(target,'select count(*) from auth.users;'));
 const suffix = manifest.cleanInstall.slice(split+1);
 // Baseline evidence on the restored copy: an error after the function but
 // before the marker leaves committed DDL hidden behind the previous marker.
 const oldFunction = psql(restored,"select pg_get_functiondef('public.fin_notify_event()'::regprocedure);");
 const rawFirst = readFileSync(suffix[0],'utf8');
 const partial = rawFirst.replace('insert into public.fin_settings','select 1/0;\ninsert into public.fin_settings');
 assert.notEqual(partial,rawFirst);
 const unsafe = spawnSync('psql',[String(restored),'-XAtq','-v','ON_ERROR_STOP=1','-f','-'],{
  input:partial,encoding:'utf8'
 });
 assert.notEqual(unsafe.status,0); assert.match(unsafe.stderr,/division by zero/);
 assert.equal(psql(restored,"select value from public.fin_settings where key='schema_version';").trim(),'financial-surface-hardening-1');
 assert.notEqual(psql(restored,"select pg_get_functiondef('public.fin_notify_event()'::regprocedure);"),oldFunction,'Baseline partial DDL not reproduced');
 const generated = execFileSync(process.execPath,['scripts/build-supabase-migration-bundle.mjs','--flow=existingDatabase','--after-schema=financial-surface-hardening-1','--stdout'],{encoding:'utf8',maxBuffer:8*1024*1024});
 for(const file of suffix) assert(generated.includes(readFileSync(file,'utf8').trim()));
 // Interrupt the first real migration after its statements, before COMMIT.
 const first = execFileSync(process.execPath,['scripts/build-supabase-migration-bundle.mjs','--flow=existingDatabase','--after-schema=financial-surface-hardening-1',`--stop-before=${suffix[1]}`,'--stdout'],{encoding:'utf8'});
 const safeFunction = psql(target,"select pg_get_functiondef('public.fin_notify_event()'::regprocedure);");
 const interrupted = first.replace(/^commit;\s*$/mi,'select 1/0;\ncommit;');
 assert.notEqual(first,interrupted);
 const failure = spawnSync('psql',[String(target),'-XAtq','-v','ON_ERROR_STOP=1','-f','-'],{input:interrupted,encoding:'utf8'});
 assert.notEqual(failure.status,0); assert.match(failure.stderr,/division by zero/);
 assert.equal(psql(target,"select value from public.fin_settings where key='schema_version';").trim(),'financial-surface-hardening-1');
 assert.equal(fingerprint(),preserved,'Interrupted migration changed proposal history');
 assert.equal(psql(target,"select pg_get_functiondef('public.fin_notify_event()'::regprocedure);"),safeFunction,'Interrupted migration left partial DDL');
 // Execute the actual generated bundle, not a hand-picked final migration.
 const blocked = spawnSync('psql',[String(target),'-XAtq','-v','ON_ERROR_STOP=1','-f','-'],{input:generated,encoding:'utf8',maxBuffer:16*1024*1024});
 assert.notEqual(blocked.status,0);assert.match(blocked.stderr,/legacy art data present/);
 const resumeMarker=psql(target,"select value from public.fin_settings where key='schema_version';").trim();
 assert.equal(resumeMarker,'financial-data-governance-1');
 const resume=execFileSync(process.execPath,['scripts/build-supabase-migration-bundle.mjs','--flow=existingDatabase',`--after-schema=${resumeMarker}`,'--stdout'],{encoding:'utf8',maxBuffer:8*1024*1024});
 psql(target,`set arandu.legacy_art_decommission_ack='export-verified:synthetic-local-restore-${dumpSha}';\n${resume}`);
 assert.equal(fingerprint(),preserved,'Upgrade changed immutable proposal history');
 apply('ops/sql/post-migration-probes.sql');
 apply('ops/sql/pilot-isolation-canary.sql');
 const final = psql(target,"select value from public.fin_settings where key='schema_version';").trim();
 const noPending = execFileSync(process.execPath,['scripts/build-supabase-migration-bundle.mjs','--flow=existingDatabase',`--after-schema=${final}`,'--stdout'],{encoding:'utf8'});
 assert(noPending.includes('0 migration(s) pendente(s)'));
 console.log(JSON.stringify({classification:'synthetic_pilot_marker_upgrade',result:'VALIDATED',from:'financial-surface-hardening-1',to:final,migrations:suffix.length,bundle_sha256:createHash('sha256').update(generated).digest('hex'),preserved_dump_sha256:dumpSha,interruption:'ROLLED_BACK',destructive_boundary:'REFUSED_WITHOUT_RESTORE_ACK',resume:resumeMarker,history:'PRESERVED',hosted:'NOT_RUN'}));
} finally { psql(base,`drop database if exists ${restoredDb} with (force);`);psql(base,`drop database ${db} with (force);`); }
