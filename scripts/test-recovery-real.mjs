// Real PostgreSQL 17 + age. Only freshly initialized loopback clusters and
// synthetic records; no hosted connection, credentials, storage or artifact.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { exportRecovery } from './consolidation-export.mjs';
import { digestFile } from '../lib/recovery-transfer.mjs';

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
  // Explicit, reviewed role definition. Never blindly apply pg_dumpall roles.
  sql(55432,'CREATE ROLE arandu_fixture_reader NOSUPERUSER NOCREATEDB NOCREATEROLE NOLOGIN;');
  // --clean applies ONLY to the new empty synthetic cluster initialized above.
  run('pg_restore',['--exit-on-error','--single-transaction','--clean','--if-exists','--dbname=postgres'],{env:{...env,PGPORT:'55432'},input:plain.stdout});
  const before=sql(55431,evidenceSql).trim(),after=sql(55432,evidenceSql).trim();
  assert.equal(after,before,'Data/schema/ACL/owners/RLS/defaults/Auth/Storage/migrations must match');
  assert.equal(sql(55432,'SET ROLE arandu_fixture_reader; SELECT count(*) FROM public.child;').trim().split('\n').at(-1),'1');
  const denied=spawnSync('psql',['-X','-v','ON_ERROR_STOP=1'],{env:{...env,PGPORT:'55432'},input:'SET ROLE arandu_fixture_reader; INSERT INTO public.child VALUES(5,2,5);',encoding:'utf8'});
  assert.notEqual(denied.status,0);
  assert.match(denied.stderr,/row-level security/);
  const corrupt=Buffer.from(fs.readFileSync(cipher));corrupt[corrupt.length-1]^=1;
  const corruptResult=spawnSync('age',['--decrypt','--identity',identity],{env,input:corrupt,timeout:30000});assert.notEqual(corruptResult.status,0);
  console.log(JSON.stringify({classification:'synthetic_postgresql17_age_same_backup_restore',result:'VALIDATED',
    hosted_backup:'NOT RUN',supabase_compatibility:'NOT PROVEN',ciphertext:manifest.files,
    reconciliation_sha256:createHash('sha256').update(before).digest('hex')}));
} finally {
  for(const data of started.reverse())spawnSync('pg_ctl',['-D',data,'-m','immediate','-w','stop'],{env,stdio:'ignore',timeout:30000});
  fs.rmSync(dir,{recursive:true,force:true});
}
