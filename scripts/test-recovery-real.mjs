// Real PostgreSQL 17 + age. Only freshly initialized loopback clusters and
// synthetic records; no hosted connection, credentials, storage or artifact.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os, { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { exportRecovery } from './consolidation-export.mjs';
import { digestFile } from '../lib/recovery-transfer.mjs';
import { verifyRestore } from './consolidation-restore-verify.mjs';
import { loopbackTarget } from '../lib/recovery-reconciliation.mjs';
import { initStore, prepareKey, privateExport, verifyExport } from './recovery.mjs';

const dir = fs.mkdtempSync(path.join(tmpdir(),'arandu-real-recovery-'));
fs.chmodSync(dir,0o700);
const env = { PATH: process.env.PATH, HOME: dir, PGHOST:'127.0.0.1', PGUSER:'postgres', PGDATABASE:'postgres', PGSSLMODE:'disable' };
const started=[];
const run = (bin,args,extra={}) => {
  const result = spawnSync(bin,args,{env,encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024,...extra});
  if(result.error || result.status!==0) throw new Error(`${bin} synthetic operation failed: ${result.stderr || ''}`);
  return result.stdout;
};
const sql=(port,query)=>run('psql',['-X','-At','-v','ON_ERROR_STOP=1'],{env:{...env,PGPORT:String(port)},input:query});
const fixture = `
CREATE ROLE arandu_fixture_reader NOSUPERUSER NOCREATEDB NOCREATEROLE NOLOGIN;
CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA supabase_migrations;
CREATE TABLE auth.users(id integer primary key); INSERT INTO auth.users VALUES(7);
CREATE TABLE auth.mfa_factors(id integer primary key);
CREATE TABLE storage.objects(id integer primary key);
CREATE TABLE storage.buckets(id text primary key); INSERT INTO storage.buckets VALUES('synthetic-private');
CREATE TABLE supabase_migrations.schema_migrations(version text primary key); INSERT INTO supabase_migrations.schema_migrations VALUES('synthetic-1');
CREATE TABLE public.parent(id integer PRIMARY KEY, label text NOT NULL);
CREATE TABLE public.child(id integer PRIMARY KEY, parent_id integer REFERENCES public.parent(id), amount numeric CHECK(amount>0));
INSERT INTO public.parent VALUES(1,'synthetic-alpha'),(2,'synthetic-beta'); INSERT INTO public.child VALUES(3,1,42),(4,2,84);
CREATE INDEX child_amount_idx ON public.child(amount);
CREATE FUNCTION public.positive(n numeric) RETURNS boolean LANGUAGE sql IMMUTABLE AS 'select n > 0';
CREATE VIEW public.summary AS SELECT p.id,count(c.id) AS children FROM public.parent p LEFT JOIN public.child c ON c.parent_id=p.id GROUP BY p.id;
CREATE FUNCTION public.noop_trigger() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RETURN NEW; END';
CREATE TRIGGER child_guard BEFORE INSERT ON public.child FOR EACH ROW EXECUTE FUNCTION public.noop_trigger();
ALTER TABLE public.child ENABLE ROW LEVEL SECURITY;
CREATE POLICY reader ON public.child FOR SELECT TO arandu_fixture_reader USING(parent_id=1);
GRANT USAGE ON SCHEMA public TO arandu_fixture_reader;
GRANT SELECT,INSERT ON public.child TO arandu_fixture_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO arandu_fixture_reader;
`;
const evidenceSql = `SELECT json_build_object(
 'data',(SELECT json_agg(row_to_json(t) ORDER BY id) FROM public.parent t),
 'child',(SELECT json_agg(row_to_json(t) ORDER BY id) FROM public.child t),
 'auth',(SELECT count(*) FROM auth.users),'storage',(SELECT count(*) FROM storage.buckets),
 'migrations',(SELECT json_agg(version ORDER BY version) FROM supabase_migrations.schema_migrations),
 'catalog',(SELECT json_agg(row_to_json(t) ORDER BY nspname,relname) FROM
  (SELECT n.nspname,c.relname,c.relkind,c.relrowsecurity,pg_get_userbyid(c.relowner) owner,c.relacl::text
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','storage','supabase_migrations')) t),
 'constraints',(SELECT json_agg(pg_get_constraintdef(oid) ORDER BY conname) FROM pg_constraint WHERE conrelid IN ('public.parent'::regclass,'public.child'::regclass)),
 'policies',(SELECT json_agg(row_to_json(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public'),
 'defaults',(SELECT json_agg(row_to_json(t)) FROM (SELECT pg_get_userbyid(defaclrole) owner,defaclobjtype,defaclacl::text FROM pg_default_acl) t),
 'functions',(SELECT json_agg(pg_get_functiondef(p.oid) ORDER BY proname) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public'),
 'indexes',(SELECT json_agg(indexdef ORDER BY indexname) FROM pg_indexes WHERE schemaname='public'),
 'triggers',(SELECT json_agg(pg_get_triggerdef(oid) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.child'::regclass AND NOT tgisinternal),
 'view',pg_get_viewdef('public.summary'::regclass),
 'columns',(SELECT json_agg(row_to_json(t) ORDER BY table_schema,table_name,ordinal_position) FROM
   (SELECT table_schema,table_name,column_name,ordinal_position,data_type,is_nullable,column_default FROM information_schema.columns
    WHERE table_schema IN ('public','auth','storage','supabase_migrations')) t),
 'extensions',(SELECT json_agg(extname ORDER BY extname) FROM pg_extension))::text;`;
try {
  assert.match(run('pg_dump',['--version']),/PostgreSQL\) 17\./);
  assert.match(run('age',['--version']),/1\.3\.2/);
  for(const [name,port] of [['source',55431],['target',55432]]) {
    const data=path.join(dir,name);
    run('initdb',['-D',data,'-U','postgres','--auth=trust','--no-locale','--encoding=UTF8']);
    run('pg_ctl',['-D',data,'-l',path.join(dir,`${name}.log`),'-o',`-h 127.0.0.1 -p ${port} -k ${dir}`,'-w','start']);started.push(data);
  }
  sql(55431,fixture);
  const identity=path.join(dir,'identity'),wrong=path.join(dir,'wrong');
  run('age-keygen',['-o',identity]);run('age-keygen',['-o',wrong]);
  fs.chmodSync(identity,0o600);fs.chmodSync(wrong,0o600);
  const recipient=run('age-keygen',['-y',identity]).trim();
  const output=path.join(dir,'private');fs.mkdirSync(output,{mode:0o700});
  const exportEnv={...env,
    ARANDU_RECOVERY_CONFIRM:'ARANDU-ENCRYPTED-EXPORT',ARANDU_RECOVERY_PROJECT_REF:'offgpyysgdhfemjlchod',
    ARANDU_RECOVERY_DATABASE_URL:'postgresql://postgres@127.0.0.1:55431/postgres?sslmode=disable',
    ARANDU_RECOVERY_RECIPIENT:recipient,ARANDU_RECOVERY_DIRECTORY:output};
  await assert.rejects(exportRecovery({root:process.cwd(),syntheticLocal:true,env:{...exportEnv,ARANDU_RECOVERY_RECIPIENT:'age1'+'a'.repeat(58)}}));
  assert.equal(fs.readdirSync(output).length,0,'Real age checksum rejection before export');
  const manifest=await exportRecovery({root:process.cwd(),syntheticLocal:true,env:exportEnv});
  const backup=path.join(output,fs.readdirSync(output)[0]);
  assert.equal(manifest.classification,'synthetic_encrypted_export');assert.equal(manifest.project_ref,null);
  assert.equal(manifest.restore,'NOT RUN');
  // Contagens tiradas no mesmo snapshot que o pg_dump importou.
  assert.equal(manifest.snapshot,'exported_snapshot_shared_with_pg_dump');
  assert.deepEqual(manifest.snapshot_counts,{'auth.mfa_factors':0,'auth.users':1,'public.child':2,'public.parent':2,'storage.buckets':1,'storage.objects':0,'supabase_migrations.schema_migrations':1});
  const pgDumpSnapshot=fs.readFileSync(path.join(dir,'source.log'),'utf8');
  assert(!/ERROR/.test(pgDumpSnapshot),'source cluster logged an error during snapshot export');
  for(const f of manifest.files)assert.deepEqual(await digestFile(path.join(backup,f.name)),{bytes:f.bytes,sha256:f.sha256});
  const cipher=path.join(backup,'database.dump.age');
  assert(!fs.readFileSync(cipher).includes(Buffer.from('synthetic-alpha')));
  const wrongResult=spawnSync('age',['--decrypt','--identity',wrong,cipher],{env,timeout:30000});
  assert.notEqual(wrongResult.status,0);assert.equal(wrongResult.stdout.length,0);
  const plain=spawnSync('age',['--decrypt','--identity',identity,cipher],{env,timeout:30000,maxBuffer:16*1024*1024});
  assert.equal(plain.status,0);assert.equal(plain.stdout.subarray(0,5).toString(),'PGDMP');
  run('pg_restore',['--list'],{input:plain.stdout});
  const roles=run('age',['--decrypt','--identity',identity,path.join(backup,'roles.sql.age')]);
  assert(roles.includes('CREATE ROLE arandu_fixture_reader;'));assert(!/PASSWORD '/.test(roles));
  const restoreEnv={...env,ARANDU_RESTORE_CONFIRM:'ARANDU-ISOLATED-RESTORE',ARANDU_RESTORE_BACKUP:backup,ARANDU_RESTORE_IDENTITY:identity,
    ARANDU_RESTORE_TARGET_URL:'postgresql://postgres@127.0.0.1:55432/postgres?sslmode=disable'};
  const code=(promise,expected)=>assert.rejects(promise,(e)=>e.code===expected);
  // Fail-closed antes de qualquer descriptografia ou escrita no destino.
  assert.throws(()=>loopbackTarget('postgresql://postgres:x@db.offgpyysgdhfemjlchod.supabase.co:5432/postgres'));
  await assert.rejects(verifyRestore({root:process.cwd(),env:{...restoreEnv,ARANDU_RESTORE_TARGET_URL:'postgresql://postgres@10.0.0.5:5432/postgres'}}));
  await assert.rejects(verifyRestore({root:process.cwd(),env:{...restoreEnv,ARANDU_RESTORE_CONFIRM:''}}));
  fs.chmodSync(identity,0o644);await code(verifyRestore({root:process.cwd(),env:restoreEnv}),'invalid_input');fs.chmodSync(identity,0o600);
  await code(verifyRestore({root:process.cwd(),env:{...restoreEnv,ARANDU_RESTORE_TARGET_URL:'postgresql://postgres@127.0.0.1:55431/postgres?sslmode=disable'}}),'target_not_empty');
  const tampered=path.join(dir,'tampered');fs.cpSync(backup,tampered,{recursive:true});
  const tamperedManifest=JSON.parse(fs.readFileSync(path.join(tampered,'manifest.json'),'utf8'));
  fs.appendFileSync(path.join(tampered,'roles.sql.age'),'x');
  await code(verifyRestore({root:process.cwd(),env:{...restoreEnv,ARANDU_RESTORE_BACKUP:tampered}}),'hash_mismatch');
  fs.copyFileSync(path.join(backup,'roles.sql.age'),path.join(tampered,'roles.sql.age'));
  tamperedManifest.snapshot_counts['public.parent']=3;fs.writeFileSync(path.join(tampered,'manifest.json'),JSON.stringify(tamperedManifest));
  await code(verifyRestore({root:process.cwd(),env:{...restoreEnv,ARANDU_RESTORE_BACKUP:tampered}}),'invalid_manifest');
  await code(verifyRestore({root:process.cwd(),env:{...restoreEnv,ARANDU_RESTORE_IDENTITY:wrong}}),'decrypt_failed');
  // Role ausente no destino: restore em transação única aborta e reverte.
  await code(verifyRestore({root:process.cwd(),env:restoreEnv}),'restore_failed');
  assert.equal(sql(55432,"select count(*) from pg_tables where schemaname='public';").trim(),'0','restore abortado deixou objetos');
  // Explicit, reviewed role definition. Never blindly apply pg_dumpall roles.
  sql(55432,'CREATE ROLE arandu_fixture_reader NOSUPERUSER NOCREATEDB NOCREATEROLE NOLOGIN;');
  const record=await verifyRestore({root:process.cwd(),env:restoreEnv});
  assert.equal(record.reconciliation,'MATCH');assert.equal(record.tables,7);assert.equal(record.conversion,'BLOCKED');assert.equal(record.roles_file,'NOT APPLIED');
  assert.equal(record.source_counts_sha256,record.target_counts_sha256);
  const recordFile=fs.readdirSync(backup).find((f)=>f.startsWith('restore-verification-'));
  assert.equal(fs.statSync(path.join(backup,recordFile)).mode&0o777,0o600);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(backup,'manifest.json'),'utf8')),manifest,'manifest original alterado');
  assert(!fs.readFileSync(path.join(backup,recordFile),'utf8').includes('synthetic-alpha'),'registro com conteúdo de dados');
  // Destino agora tem dados: segunda verificação no mesmo cluster é recusada.
  await code(verifyRestore({root:process.cwd(),env:restoreEnv}),'target_not_empty');
  const before=sql(55431,evidenceSql).trim(),after=sql(55432,evidenceSql).trim();
  assert.equal(after,before,'Data/schema/ACL/owners/RLS/defaults/Auth/Storage/migrations must match');
  assert.equal(sql(55432,'SET ROLE arandu_fixture_reader; SELECT count(*) FROM public.child;').trim().split('\n').at(-1),'1');
  const denied=spawnSync('psql',['-X','-v','ON_ERROR_STOP=1'],{env:{...env,PGPORT:'55432'},input:'SET ROLE arandu_fixture_reader; INSERT INTO public.child VALUES(5,2,5);',encoding:'utf8'});
  assert.notEqual(denied.status,0);
  assert.match(denied.stderr,/row-level security/);
  // Estratégia private-store (sem AWS): identidade preparada fora do store, store
  // durável marcado, export + verify, restore do MESMO ciphertext e nível 5.
  {
    const home=fs.mkdtempSync(path.join(os.homedir(),'.arandu-private-store-test-'));fs.chmodSync(home,0o700);
    try{
      const opEnv={PATH:process.env.PATH};
      const keys=path.join(home,'keys');fs.mkdirSync(keys,{mode:0o700});
      const storeDir=path.join(home,'store');
      const key=prepareKey({env:{...opEnv,ARANDU_RECOVERY_IDENTITY_FILE:path.join(keys,'id.agekey')},args:['--generate']});
      assert.equal(key.generated,true);assert.equal(key.roundtrip,'VERIFIED');
      assert.equal(fs.statSync(path.join(keys,'id.agekey')).mode&0o777,0o600);
      assert.equal(prepareKey({env:{...opEnv,ARANDU_RECOVERY_IDENTITY_FILE:path.join(keys,'id.agekey')}}).recipient,key.recipient,'identidade regenerada');
      const store=initStore({env:{...opEnv,ARANDU_RECOVERY_DIRECTORY:storeDir},args:['--attest-persistent']});
      const privEnv={...env,ARANDU_RECOVERY_CONFIRM:'ARANDU-ENCRYPTED-EXPORT',ARANDU_RECOVERY_PROJECT_REF:'offgpyysgdhfemjlchod',
        ARANDU_RECOVERY_DATABASE_URL:'postgresql://postgres@127.0.0.1:55431/postgres?sslmode=disable',ARANDU_RECOVERY_RECIPIENT:key.recipient,ARANDU_RECOVERY_DIRECTORY:storeDir};
      const quiet=()=>{};
      // Falhas classificadas por estágio, sem artefato parcial no store.
      await assert.rejects(privateExport({env:{...privEnv,ARANDU_RECOVERY_DATABASE_URL:'postgresql://postgres@127.0.0.1:55439/postgres?sslmode=disable'},syntheticLocal:true,log:quiet}),(e)=>e.code==='RECOVERY_CONNECTION_FAILED');
      await assert.rejects(privateExport({env:{...privEnv,ARANDU_RECOVERY_RECIPIENT:''},syntheticLocal:true,log:quiet}),(e)=>e.code==='RECOVERY_RECIPIENT_MISSING');
      await assert.rejects(privateExport({env:{...privEnv,ARANDU_RECOVERY_CONFIRM:''},syntheticLocal:true,log:quiet}),(e)=>e.code==='RECOVERY_CONFIRMATION_MISSING');
      await assert.rejects(privateExport({env:{...privEnv,RUNNER_ENVIRONMENT:'github-hosted'},syntheticLocal:true,log:quiet}),(e)=>e.code==='RECOVERY_STORAGE_NOT_DURABLE');
      const leftovers=fs.readdirSync(storeDir).filter(n=>n!=='.arandu-recovery-store.json');
      for(const n of leftovers){const m=JSON.parse(fs.readFileSync(path.join(storeDir,n,'manifest.json'),'utf8'));assert.notEqual(m.result,'exported_unverified','falha deixou export dado como concluído');}
      const {manifest:pm,verification}=await privateExport({env:privEnv,syntheticLocal:true,log:quiet});
      assert.equal(verification.integrity,'VERIFIED');assert.equal(verification.level,4);assert.equal(verification.recovery,'RECOVERY_RESTORE_NOT_VERIFIED');
      assert.equal(pm.storage.store_id,store.store_id);
      const exportDir=path.join(storeDir,verification.export);
      const vEnv={...opEnv,ARANDU_RECOVERY_BACKUP:exportDir};
      assert.equal((await verifyExport({env:vEnv})).level,4);
      // Adulteração e permissão detectadas pelo verify do store.
      const copy=path.join(storeDir,'tampered-copy');fs.cpSync(exportDir,copy,{recursive:true});fs.chmodSync(copy,0o700);
      fs.appendFileSync(path.join(copy,'database.dump.age'),'x');
      await assert.rejects(verifyExport({env:{...opEnv,ARANDU_RECOVERY_BACKUP:copy}}),(e)=>e.code==='RECOVERY_READBACK_FAILED');
      fs.rmSync(copy,{recursive:true,force:true});
      fs.chmodSync(path.join(exportDir,'roles.sql.age'),0o644);
      await assert.rejects(verifyExport({env:vEnv}),(e)=>e.code==='RECOVERY_DESTINATION_PERMISSIONS');
      fs.chmodSync(path.join(exportDir,'roles.sql.age'),0o600);
      // Restore isolado do MESMO export num cluster novo: só então nível 5.
      const third=path.join(dir,'third');run('initdb',['-D',third,'-U','postgres','--auth=trust','--no-locale','--encoding=UTF8']);
      run('pg_ctl',['-D',third,'-l',path.join(dir,'third.log'),'-o',`-h 127.0.0.1 -p 55433 -k ${dir}`,'-w','start']);started.push(third);
      sql(55433,'CREATE ROLE arandu_fixture_reader NOSUPERUSER NOCREATEDB NOCREATEROLE NOLOGIN;');
      const rec=await verifyRestore({root:process.cwd(),env:{...env,ARANDU_RESTORE_CONFIRM:'ARANDU-ISOLATED-RESTORE',ARANDU_RESTORE_BACKUP:exportDir,
        ARANDU_RESTORE_IDENTITY:path.join(keys,'id.agekey'),ARANDU_RESTORE_TARGET_URL:'postgresql://postgres@127.0.0.1:55433/postgres?sslmode=disable'}});
      assert.equal(rec.reconciliation,'MATCH');
      const final=await verifyExport({env:vEnv});
      assert.equal(final.level,5);assert.equal(final.recovery,'RECOVERY_VERIFIED');assert.equal(final.conversion,'BLOCKED');
    } finally { fs.rmSync(home,{recursive:true,force:true}); }
  }
  const corrupt=Buffer.from(fs.readFileSync(cipher));corrupt[corrupt.length-1]^=1;
  const corruptResult=spawnSync('age',['--decrypt','--identity',identity],{env,input:corrupt,timeout:30000});assert.notEqual(corruptResult.status,0);
  console.log(JSON.stringify({classification:'synthetic_postgresql17_age_same_backup_restore',result:'VALIDATED',
    hosted_backup:'NOT RUN',supabase_compatibility:'NOT PROVEN',ciphertext:manifest.files,
    reconciliation_sha256:createHash('sha256').update(before).digest('hex')}));
} finally {
  for(const data of started.reverse())spawnSync('pg_ctl',['-D',data,'-m','immediate','-w','stop'],{env,stdio:'ignore',timeout:30000});
  fs.rmSync(dir,{recursive:true,force:true});
}
