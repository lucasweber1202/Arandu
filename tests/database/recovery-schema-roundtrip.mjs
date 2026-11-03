// Disposable databases only. Reproduces #306's view deparser drift using the
// canonical pre-repair migrations, then tests repair, rollback and tampering.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { loopbackTarget } from '../../lib/recovery-reconciliation.mjs';
import { CHECK_CONSTRAINTS_SQL, restoreSchemaFingerprint } from '../../lib/restore-schema-fingerprint.mjs';
const connection = loopbackTarget(process.argv[2]);
const env = { ...process.env, ...connection };
const run = (bin,args,extra={}) => execFileSync(bin,args,{env,encoding:'utf8',maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe'],...extra});
const sql = (db,input) => run('psql',['-X','-At','-v','ON_ERROR_STOP=1','-d',db],{input});
const suffix=randomUUID().replaceAll('-','');
const source=`fp_source_${suffix}`, target=`fp_target_${suffix}`;
const apply=(db,file)=>sql(db,fs.readFileSync(file,'utf8'));
const repair='docs/supabase-financial-crm-view-roundtrip.sql';
const rollback='docs/rollback/supabase-financial-crm-view-roundtrip.rollback.sql';
const dump=db=>run('pg_dump',['-d',db,'--schema=public','--schema-only','--no-owner','--no-acl']);
const fingerprint=db=>restoreSchemaFingerprint(dump(db),JSON.parse(sql(db,CHECK_CONSTRAINTS_SQL)));
const projection=db=>sql(db,`select jsonb_build_object('columns',(select jsonb_agg(jsonb_build_array(attname,format_type(atttypid,atttypmod)) order by attnum) from pg_attribute where attrelid='public.fin_crm_institution_records'::regclass and attnum>0 and not attisdropped),'options',reloptions,'acl',relacl::text)::text from pg_class where oid='public.fin_crm_institution_records'::regclass;`);
// CREATE DATABASE cannot be grouped in a transaction: send separate sessions.
function resetTarget() {
  sql(connection.PGDATABASE,`drop database if exists ${target}`);
  sql(connection.PGDATABASE,`create database ${target}`);
  apply(target,'tests/database/bootstrap.sql');
  const archive=run('pg_dump',['-d',source,'--schema=public','--no-owner','--no-acl','-Fc'],{encoding:'buffer'});
  // Fresh bootstrap already owns public; remove just that TOC entry. pg_restore
  // exits on every other error, so an incomplete restore cannot appear green.
  const toc=run('pg_restore',['-l'],{input:archive}).split('\n').filter(l=>!/^\d+; \d+ \d+ (SCHEMA - public |DEFAULT ACL )/.test(l)).join('\n');
  const list=`/tmp/arandu-fp-${suffix}.list`;
  fs.writeFileSync(list,toc,{mode:0o600});
  try { run('pg_restore',['-d',target,'--no-owner','--exit-on-error','-L',list],{input:archive}); }
  finally { fs.rmSync(list,{force:true}); }
}
try {
  sql(connection.PGDATABASE,`create database ${source}`);
  apply(source,'tests/database/bootstrap.sql');
  const files=JSON.parse(fs.readFileSync('docs/supabase-migrations.json')).cleanInstall;
  assert.equal(files.at(-1),repair);
  for(const file of files.slice(0,-1)) apply(source,file);
  sql(source,'create table public.fp_logic(a boolean,b boolean,c boolean, constraint fp_logic_check check(a and (b or c)))');
  resetTarget();
  assert.notEqual(fingerprint(source),fingerprint(target),'Pre-fix clean install must reproduce schema drift');
  const before=projection(source), beforeHash=fingerprint(source);
  const beforeView=sql(source,"select pg_get_viewdef('public.fin_crm_institution_records'::regclass)");
  const restoredView=sql(target,"select pg_get_viewdef('public.fin_crm_institution_records'::regclass)");
  assert.notEqual(beforeView,restoredView);
  assert.equal(beforeView.replace("'process'::text,","'process'::text AS text,").replace('NULL::text,','NULL::text AS text,'),restoredView,'Exact drift is limited to the two redundant aliases');
  apply(source,repair); apply(source,repair);
  assert.equal(projection(source),before,'View API, RLS mode and grants preserved');
  resetTarget();
  assert.equal(fingerprint(source),fingerprint(target),'Repaired canonical schema roundtrips');
  sql(target,'alter table public.fp_logic drop constraint fp_logic_check; alter table public.fp_logic add constraint fp_logic_check check((a and b) or c)');
  assert.notEqual(fingerprint(source),fingerprint(target),'Boolean grouping tamper must fail');
  sql(target,'alter table public.fp_logic drop constraint fp_logic_check; alter table public.fp_logic add constraint fp_logic_check check(a and (b or c))');
  assert.equal(fingerprint(source),fingerprint(target));
  const view=sql(target,"select pg_get_viewdef('public.fin_crm_institution_records'::regclass)");
  sql(target,'create or replace view public.fin_crm_institution_records with(security_invoker=true) as '+view.replace("'process'::text","'tampered'::text"));
  assert.notEqual(fingerprint(source),fingerprint(target),'View expression tamper must fail');
  sql(target,'drop view public.fin_crm_institution_records');
  assert.notEqual(fingerprint(source),fingerprint(target),'Incomplete restore must fail');
  apply(source,rollback);
  assert.equal(fingerprint(source),beforeHash,'Rollback restores the previous definition');
  apply(source,repair); resetTarget();
  assert.equal(fingerprint(source),fingerprint(target),'Upgrade after rollback roundtrips');
  console.log('PASS recovery schema: reproduced aliases; clean install, reapply, upgrade, rollback; grouping/view tamper and missing view rejected.');
} finally {
  for(const db of [target,source]) sql(connection.PGDATABASE,`drop database if exists ${db}`);
}
