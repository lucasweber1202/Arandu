// Extension of the PG17/age laboratory. HTTP object service is a synthetic
// fixture, NOT Supabase Storage/GoTrue: real bytes, crypto, SQL and HTTP only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { exportRecovery } from './consolidation-export.mjs';
import { verifyRestore } from './consolidation-restore-verify.mjs';
import { exportStorage, restoreStorage, verifyStorage, storageEvidence, signJwt } from './storage-recovery.mjs';
import { objectFile, sha256 } from '../lib/storage-recovery.mjs';

export async function rehearseStorageSet({ dir, env, sql, identity, recipient, sourcePort, startCluster }) {
 const orgs=['00000000-0000-4000-8000-000000000a01','00000000-0000-4000-8000-000000000a02'];
 const bytes=[Buffer.from('%PDF synthetic tenant A'),Buffer.from('%PDF synthetic tenant B')];
 const names=orgs.map((org,i)=>`${org}/document-${i}/version-1`);
 sql(sourcePort,`create table public.fin_members(organization_id uuid,user_id uuid);
 create table public.fin_private_documents(id integer primary key,organization_id uuid);
 create table public.fin_document_versions(document_id integer references public.fin_private_documents(id),storage_bucket text,storage_path text,size_bytes bigint,sha256 text,status text);
 insert into public.fin_members values('${orgs[0]}','00000000-0000-4000-8000-000000000b01');
 update storage.buckets set file_size_limit=10485760,allowed_mime_types=array['application/pdf'];
 ${names.map((name,i)=>`insert into public.fin_private_documents values(${i+1},'${orgs[i]}');
 insert into storage.objects values(${i+1},'synthetic-private','${name}','${JSON.stringify({size:bytes[i].length,mimetype:'application/pdf'})}');
 insert into public.fin_document_versions values(${i+1},'synthetic-private','${name}',${bytes[i].length},'${sha256(bytes[i])}','available');`).join('\n')}`);
 const source=path.join(dir,'object-source'), target=path.join(dir,'object-target');
 fs.mkdirSync(source,{mode:0o700});fs.mkdirSync(target,{mode:0o700});
 bytes.forEach((b,i)=>fs.writeFileSync(path.join(source,String(i)),b,{mode:0o600}));
 let mode='source'; const secret=randomBytes(32).toString('hex');
 const service=signJwt(secret,{role:'service_role',iss:'supabase'});
 const server=createServer(async(req,res)=>{
  if(req.headers.authorization!==`Bearer ${service}`){res.writeHead(403).end();return;}
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const index=names.findIndex(name=>pathname.endsWith(`/synthetic-private/${name}`));
  if(index<0){res.writeHead(404).end();return;}
  const file=path.join(mode==='source'?source:target,String(index));
  if(req.method==='POST'){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   fs.writeFileSync(file,Buffer.concat(chunks),{mode:0o600});res.end('{}');return;
  }
  if(!fs.existsSync(file)){res.writeHead(404).end();return;}
  res.end(fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const endpoint=`http://127.0.0.1:${server.address().port}`;
 try {
  const out=path.join(dir,'coherent-set');fs.mkdirSync(out,{mode:0o700});
  const database=await exportRecovery({syntheticLocal:true,env:{...env,ARANDU_RECOVERY_CONFIRM:'ARANDU-ENCRYPTED-EXPORT',ARANDU_RECOVERY_PROJECT_REF:'offgpyysgdhfemjlchod',ARANDU_RECOVERY_DATABASE_URL:`postgresql://postgres@127.0.0.1:${sourcePort}/postgres?sslmode=disable`,ARANDU_RECOVERY_RECIPIENT:recipient,ARANDU_RECOVERY_DIRECTORY:out,ARANDU_RECOVERY_STORAGE_BINARIES:'separate-export'}});
  const backup=path.join(out,fs.readdirSync(out)[0]);
  const exported=await exportStorage({env:{...env,ARANDU_STORAGE_CONFIRM:'ARANDU-STORAGE-EXPORT',ARANDU_STORAGE_SOURCE_KIND:'local-synthetic',ARANDU_STORAGE_DATABASE_URL:`postgresql://postgres@127.0.0.1:${sourcePort}/postgres?sslmode=disable`,ARANDU_STORAGE_SOURCE_URL:endpoint,ARANDU_STORAGE_SOURCE_SERVICE_KEY:service,ARANDU_STORAGE_RECIPIENT:recipient,ARANDU_STORAGE_DIRECTORY:backup}});
  const coherentPort=await startCluster('coherent-target');
  sql(coherentPort,'create role arandu_fixture_reader nologin;');
  await verifyRestore({syntheticLocal:true,env:{...env,ARANDU_RESTORE_CONFIRM:'ARANDU-ISOLATED-RESTORE',ARANDU_RESTORE_BACKUP:backup,ARANDU_RESTORE_IDENTITY:identity,ARANDU_RESTORE_TARGET_URL:`postgresql://postgres@127.0.0.1:${coherentPort}/postgres?sslmode=disable`}});
  assert.equal(sql(coherentPort,'set role arandu_fixture_reader; select count(*) from public.child;').trim().split('\n').at(-1),'1','RLS lost after restore');
  mode='target';
  const restoreEnv={...env,ARANDU_STORAGE_RESTORE_CONFIRM:'ARANDU-ISOLATED-STORAGE-RESTORE',ARANDU_STORAGE_BACKUP:exported.directory,ARANDU_STORAGE_IDENTITY:identity,ARANDU_STORAGE_TARGET_DATABASE_URL:`postgresql://postgres@127.0.0.1:${coherentPort}/postgres?sslmode=disable`,ARANDU_STORAGE_TARGET_URL:endpoint,ARANDU_STORAGE_TARGET_JWT_SECRET:secret,ARANDU_STORAGE_TARGET_SERVICE_KEY:service};
  await assert.rejects(verifyStorage({env:restoreEnv}),e=>e.code==='STORAGE_RECONCILIATION_MISMATCH');
  assert.equal((await storageEvidence(backup,database)).length,0,'metadata-only restore accepted');
  const cipher=path.join(exported.directory,objectFile(2)),original=fs.readFileSync(cipher);
  fs.renameSync(cipher,`${cipher}.missing`);
  await assert.rejects(restoreStorage({env:restoreEnv}),e=>e.code==='STORAGE_ARTIFACT_MISSING');
  fs.renameSync(`${cipher}.missing`,cipher);
  fs.appendFileSync(cipher,'tampered');
  await assert.rejects(restoreStorage({env:restoreEnv}),e=>e.code==='STORAGE_HASH_MISMATCH');
  assert.equal(fs.readdirSync(target).length,0,'corrupt set partially uploaded');
  fs.writeFileSync(cipher,original);
  const record=await restoreStorage({env:restoreEnv});assert.equal(record.reconciliation,'MATCH');
  bytes.forEach((b,i)=>assert.equal(sha256(fs.readFileSync(path.join(target,String(i)))),sha256(b)));
  assert.equal((await storageEvidence(backup,database)).length,1);
  // Broken SQL references must fail before a second binary export starts.
  sql(sourcePort,'update public.fin_document_versions set size_bytes=size_bytes+1 where document_id=1;');
  await assert.rejects(exportStorage({env:{...env,ARANDU_STORAGE_CONFIRM:'ARANDU-STORAGE-EXPORT',ARANDU_STORAGE_SOURCE_KIND:'local-synthetic',ARANDU_STORAGE_DATABASE_URL:`postgresql://postgres@127.0.0.1:${sourcePort}/postgres?sslmode=disable`,ARANDU_STORAGE_SOURCE_URL:endpoint,ARANDU_STORAGE_SOURCE_SERVICE_KEY:service,ARANDU_STORAGE_RECIPIENT:recipient,ARANDU_STORAGE_DIRECTORY:backup}}),e=>e.code==='STORAGE_REFERENCES_INCONSISTENT');
  return {classification:'synthetic_pg17_age_http_object_fixture_same_set',result:'VALIDATED',objects:2,references:2,rls:'VERIFIED',managed_auth:'NOT_PROVEN',supabase_storage:'NOT_PROVEN',external_configuration:'NOT_RUN',conversion:'BLOCKED'};
 } finally { await new Promise(resolve=>server.close(resolve)); }
}
