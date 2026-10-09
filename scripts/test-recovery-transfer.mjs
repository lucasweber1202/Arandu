import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { approvedDestination, transferRecovery, digestFile } from '../lib/recovery-transfer.mjs';
const ref = 'offgpyysgdhfemjlchod', sha = 'a'.repeat(40);
const names = ['database.dump.age', 'roles.sql.age', 'manifest.json'];
const stamp = new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
const d = { approved: true, private: true, key_recovery_verified: true, id: 'synthetic-test', project_ref: ref,
  reviewed_sha: sha, retention_days: 30, approval_ref: 'ARA-8', jurisdiction: 'BR',
  hostname: 'fixture.s3.sa-east-1.amazonaws.com', prefix: '/recovery/unique-run/', objects: {} };
for (const name of names) d.objects[name] = Object.fromEntries(['put','get'].map(method => [method,
  `https://${d.hostname}${d.prefix}${name}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=fixture&X-Amz-Credential=fixture&X-Amz-Date=${stamp}&X-Amz-Expires=7200&X-Amz-SignedHeaders=host%3Bif-none-match`]));
assert.equal(approvedDestination(JSON.stringify(d),ref,sha).id,d.id);
for (const change of [{approved:false},{private:false},{key_recovery_verified:false},{reviewed_sha:'b'.repeat(40)},
  {project_ref:'wrong'},{hostname:'attacker.example'},{prefix:'/another/'},{retention_days:0}]) {
  assert.throws(()=>approvedDestination(JSON.stringify({...d,...change}),ref,sha));
}
assert.throws(()=>approvedDestination('',ref,sha));
const noConditional = structuredClone(d);
noConditional.objects[names[0]].put = noConditional.objects[names[0]].put.replace('host%3Bif-none-match','host');
assert.throws(()=>approvedDestination(JSON.stringify(noConditional),ref,sha));
const directory = fs.mkdtempSync(path.join(tmpdir(),'arandu-transfer-test-'));
try {
  const manifest = { result:'exported_unverified',restore:'NOT RUN',conversion:'BLOCKED',files:[] };
  for(const name of names.slice(0,2)) {
    fs.writeFileSync(path.join(directory,name),'age-encryption.org/v1\nfixture'.repeat(20),{mode:0o600});
    manifest.files.push({name,...await digestFile(path.join(directory,name))});
  }
  const remote = new Map();
  let fail = '', calls = 0;
  const request = async (url, options={}) => {
    calls++; assert.equal(options.redirect,'error');
    const name = new URL(url).pathname.split('/').at(-1);
    if(options.method==='PUT') {
      assert.equal(options.headers['If-None-Match'],'*');
      if(remote.has(name) || fail==='put') return new Response(null,{status:412});
      const chunks=[];for await(const c of options.body)chunks.push(c);
      remote.set(name,Buffer.concat(chunks));return new Response(null,{status:200});
    }
    return fail==='get' ? new Response(null,{status:403}) : new Response(fail==='hash' ? 'corrupted' : remote.get(name));
  };
  const run = () => transferRecovery({directory,manifest:structuredClone(manifest),destination:d,request});
  const result = await run();assert.equal(calls,6);assert.equal(result.transfer,'ciphertext_readback_verified');
  assert.equal(result.restore,'NOT RUN');assert(!JSON.stringify(result).includes('X-Amz'));
  await assert.rejects(run()); // An existing remote object cannot be overwritten.
  for(const mode of ['put','get','hash']) {
    remote.clear();fail=mode;await assert.rejects(run());
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'))).transfer,'failed');
    assert(!remote.has('manifest.json'),'No completion record after artifact failure');
  }
  fail='';remote.clear();fs.appendFileSync(path.join(directory,names[0]),'tamper');
  await assert.rejects(run());assert.equal(remote.size,0);
} finally {fs.rmSync(directory,{recursive:true,force:true});}
console.log('Recovery transfer: approval/SHA identity, no overwrite, redacted manifest, PUT/GET/hash failures validated (mock S3).');
