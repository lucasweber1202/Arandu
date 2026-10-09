import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { sourceConnection, PILOT_REF } from '../lib/pilot-backup-preflight.mjs';
import { exportRecovery } from './consolidation-export.mjs';

const workflow=fs.readFileSync('.github/workflows/consolidation-export.yml','utf8');
assert.match(workflow,/on:\s*\n\s+workflow_dispatch:/);
assert(!/\n\s+(push|pull_request|schedule|workflow_run):/.test(workflow));
assert.match(workflow,/if: github.ref == 'refs\/heads\/main'/);
assert.match(workflow,/environment: database-recovery/);
assert.match(workflow,/runs-on: \[self-hosted, linux, arandu-recovery\]/);
assert.match(workflow,/REVIEWED_SHA !== process.env.EXECUTION_SHA/);
assert.match(workflow,/ref: \$\{\{ github.sha \}\}/);
assert.match(workflow,/persist-credentials: false/);
assert(!/uses:.*upload-artifact|contents: write|--restore|--decrypt/.test(workflow));
assert(!/run:.*\$\{\{ inputs\./.test(workflow));
assert(!/target_url|database_url:\s*\n|host:\s*\n/.test(workflow));

const legacy = 'igacnfjeuqhxcmfyepgj';
const uri = ref => `postgresql://postgres:private-fixture@db.${ref}.supabase.co/postgres`;
assert.throws(() => sourceConnection(uri(legacy))); // Existing drill stays Pilot-only.
assert.equal(sourceConnection(uri(legacy), { projectRef: legacy }).projectRef, legacy);
assert.throws(() => sourceConnection(uri(PILOT_REF), { projectRef: legacy }));
assert.throws(() => sourceConnection(uri(legacy), { projectRef: 'unknown' }));
assert.throws(() => sourceConnection(`postgresql://postgres.${legacy}:pw@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`, { projectRef: legacy }));

const dir = fs.mkdtempSync(path.join(tmpdir(), 'arandu-export-test-'));
const root = path.join(dir, 'repo'); fs.mkdirSync(root);
const output = path.join(dir, 'private'); fs.mkdirSync(output, { mode: 0o700 });
const bin = path.join(dir, 'bin'); fs.mkdirSync(bin);
const trace = path.join(dir, 'trace');
const fake = `#!/usr/bin/env node
const fs = require('node:fs');
const name = require('node:path').basename(process.argv[1]);
const args = process.argv.slice(2);
fs.appendFileSync(process.env.TRACE, JSON.stringify({name,args,hostaddr:process.env.PGHOSTADDR,options:process.env.PGOPTIONS})+'\\n');
if(args.includes('--version')) {console.log(name==='age'?'v1.2.1':name+' (PostgreSQL) '+(process.env.TEST_MAJOR||'17')+'.6');process.exit(0);}
if(name==='psql') {console.log(JSON.stringify({server_major:17,storage_objects:Number(process.env.TEST_OBJECTS||0),auth_users:0,mfa_factors:0}));process.exit(0);}
if(name===process.env.TEST_FAIL) {console.error('private-fixture');process.exit(1);}
if(name==='age') {process.stdin.resume();process.stdin.on('end',()=>process.stdout.write('age-encryption.org/v1\\n'+'ciphertext-fixture'.repeat(20)));}
else process.stdout.write('sensitive plaintext fixture');
`;
for (const name of ['psql','pg_dump','pg_dumpall','pg_restore','age']) fs.writeFileSync(path.join(bin,name),fake,{mode:0o700});
const env = { ...process.env, PATH:bin+path.delimiter+process.env.PATH, TRACE:trace,
  ARANDU_RECOVERY_CONFIRM:'ARANDU-ENCRYPTED-EXPORT', ARANDU_RECOVERY_PROJECT_REF:legacy,
  ARANDU_RECOVERY_DATABASE_URL:uri(legacy), ARANDU_RECOVERY_RECIPIENT:'age1'+'a'.repeat(58), ARANDU_RECOVERY_DIRECTORY:output,
  PGHOSTADDR:'203.0.113.99' };
const original = {PATH:process.env.PATH,TRACE:process.env.TRACE,TEST_FAIL:process.env.TEST_FAIL};
// age inherits only runtime context; fake trace verifies piping without claiming crypto validation.
process.env.PATH=env.PATH;process.env.TRACE=trace;
try {
  for(const change of [ {ARANDU_RECOVERY_CONFIRM:''}, {ARANDU_RECOVERY_PROJECT_REF:''},
    {ARANDU_RECOVERY_PROJECT_REF:PILOT_REF}, {ARANDU_RECOVERY_RECIPIENT:'-o bad'},
    {ARANDU_RECOVERY_DIRECTORY:root}, {TEST_MAJOR:'16'}, {TEST_OBJECTS:'1'}]) {
    await assert.rejects(exportRecovery({env:{...env,...change},root}));
    assert.equal(fs.readdirSync(output).length,0,'No export created before preflight passes');
  }
  fs.symlinkSync(root,path.join(dir,'repo-link'));
  await assert.rejects(exportRecovery({env:{...env,ARANDU_RECOVERY_DIRECTORY:path.join(dir,'repo-link')},root}));
  fs.chmodSync(output,0o755);
  await assert.rejects(exportRecovery({env,root}));fs.chmodSync(output,0o700);
  const manifest=await exportRecovery({env,root});
  assert.equal(manifest.result,'exported_unverified');assert.equal(manifest.restore,'NOT RUN');
  assert.equal(manifest.conversion,'BLOCKED');assert.equal(manifest.files.length,2);
  assert(!JSON.stringify(manifest).includes('private-fixture'));
  const calls=fs.readFileSync(trace,'utf8').trim().split('\n').map(JSON.parse);
  assert(calls.every(c=>!JSON.stringify(c.args).includes('private-fixture')));
  assert(calls.every(c=>!c.hostaddr));
  assert(calls.find(c=>c.name==='pg_dumpall'&&!c.args.includes('--version')).args.includes('--no-role-passwords'));
  const exported=path.join(output,fs.readdirSync(output)[0]);
  for(const file of manifest.files) {
    assert.match(file.sha256,/^[a-f0-9]{64}$/);assert.equal(fs.statSync(path.join(exported,file.name)).mode&0o777,0o600);
    assert(!fs.readFileSync(path.join(exported,file.name),'utf8').includes('sensitive plaintext'));
  }
  await assert.rejects(exportRecovery({env:{...env,TEST_FAIL:'pg_dumpall'},root}));
  const failed=fs.readdirSync(output).map(f=>path.join(output,f)).find(f=>JSON.parse(fs.readFileSync(path.join(f,'manifest.json'))).result==='failed');
  assert(failed);assert(!fs.existsSync(path.join(failed,'roles.sql.age')));
  process.env.TEST_FAIL='age';
  await assert.rejects(exportRecovery({env,root}));
  assert.equal(fs.readdirSync(output).length,3,'Unique directories never overwrite earlier backups');
} finally {
  for(const [key,value] of Object.entries(original)) {if(value===undefined)delete process.env[key];else process.env[key]=value;}
  fs.rmSync(dir,{recursive:true,force:true});
}
console.log('Encrypted export: identity, TLS, private paths, PG17, stream failures, redaction and no false recovery PASS validated (mock transport).');
