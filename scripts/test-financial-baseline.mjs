import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { financialBaselineFiles } from '../lib/migration-baseline.mjs';

const manifest=JSON.parse(fs.readFileSync('docs/supabase-migrations.json','utf8'));
const descriptor=JSON.parse(fs.readFileSync('docs/baselines/financial-v1.json','utf8'));
assert.equal(financialBaselineFiles(process.cwd(),manifest)[0],descriptor.sql);
const future={...manifest,cleanInstall:[...manifest.cleanInstall,'docs/future.sql']};
assert.deepEqual(financialBaselineFiles(process.cwd(),future),[descriptor.sql,'docs/future.sql']);
assert.throws(()=>financialBaselineFiles(process.cwd(),{...manifest,cleanInstall:[...manifest.cleanInstall].reverse()}),/prefix changed/);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'arandu-baseline-integrity-'));
try {
  for(const file of [...manifest.cleanInstall,descriptor.sql,'docs/baselines/financial-v1.json']) {
    fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.copyFileSync(file,path.join(dir,file));
  }
  fs.appendFileSync(path.join(dir,descriptor.sql),'\n-- tampered');
  assert.throws(()=>financialBaselineFiles(dir,manifest),/digest mismatch/);
  fs.copyFileSync(descriptor.sql,path.join(dir,descriptor.sql));
  fs.appendFileSync(path.join(dir,manifest.cleanInstall[0]),'\n-- history changed');
  assert.throws(()=>financialBaselineFiles(dir,manifest),/prefix changed/);
} finally {fs.rmSync(dir,{recursive:true,force:true});}
const bundle=execFileSync(process.execPath,['scripts/build-supabase-migration-bundle.mjs','--flow=financialBaseline','--stdout'],{encoding:'utf8',maxBuffer:8*1024*1024});
assert(bundle.includes(fs.readFileSync(descriptor.sql,'utf8').trim()));
assert(!/create table (?:if not exists )?(?:public\.)?artists\s*\(/i.test(bundle));
for(const arg of ['--after-schema=financial-surface-hardening-1','--stop-before=docs/supabase-financial-legacy-art-decommission.sql']) {
  const r=spawnSync(process.execPath,['scripts/build-supabase-migration-bundle.mjs','--flow=financialBaseline',arg,'--stdout'],{encoding:'utf8',maxBuffer:8*1024*1024});
  assert.notEqual(r.status,0);assert.equal(r.stdout,'');
}
console.log('Financial baseline: exact historical prefix/digest, future suffix, tamper refusal, no marker skipping and no intermediate marketplace tables PASS.');
