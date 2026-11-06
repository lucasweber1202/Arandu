import assert from 'node:assert/strict';
import {overlapPreparation,verifyPreparation} from './ci-demo/seed-browser.mjs';
const task=(name,source,timeoutMs=2000)=>({name,command:process.execPath,args:['-e',source],timeoutMs,stdio:'ignore'});
const pass=await overlapPreparation([task('seed','setTimeout(()=>process.exit(0),100)'),task('browser','setTimeout(()=>process.exit(0),100)')]);
assert.equal(pass.result,'PASS');assert(pass.overlap_ms>0);assert.equal(pass.phases.length,2);
const identity={sha:'a'.repeat(40),runId:'1',attempt:'1'};
const receipt={...pass,sha:identity.sha,run_id:'1',attempt:'1'};
assert(verifyPreparation(receipt,identity));
for(const bad of [{...receipt,sha:'b'.repeat(40)},{...receipt,run_id:'2'},{...receipt,attempt:'2'},{...receipt,result:'FAIL'},{...receipt,phases:[pass.phases[0],pass.phases[0]]},{...receipt,phases:[]}])assert.throws(()=>verifyPreparation(bad,identity));
for(const name of ['seed','browser']) {
 const result=await overlapPreparation([task(name,'process.exit(7)'),task(name==='seed'?'browser':'seed','setInterval(()=>{},100)')],{graceMs:50});
 assert.equal(result.result,'FAIL');assert(result.phases.every(p=>Number.isFinite(p.end_ms)));assert(result.phases.some(p=>p.result==='failure'));
}
const timeout=await overlapPreparation([task('seed','process.on("SIGTERM",()=>{});setInterval(()=>{},100)',100),task('browser','setInterval(()=>{},100)')],{graceMs:50});
assert.equal(timeout.result,'FAIL');assert(timeout.phases.some(p=>p.result==='timed_out'));
const controller=new AbortController();setTimeout(()=>controller.abort(),100);
const cancelled=await overlapPreparation([task('seed','setInterval(()=>{},100)'),task('browser','setInterval(()=>{},100)')],{signal:controller.signal,graceMs:50});assert.equal(cancelled.result,'FAIL');
const missing=await overlapPreparation([{...task('seed',''),command:'/nonexistent-arandu-executable'},task('browser','setInterval(()=>{},100)')],{graceMs:50});assert.equal(missing.result,'FAIL');

// A seed child may own grandchildren; do not return while they can still write.
const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'arandu-overlap-drain-')),marker=path.join(directory,'writes');
try {
 const grandchild=`const fs=require('node:fs');process.on('SIGTERM',()=>{});setInterval(()=>fs.appendFileSync(${JSON.stringify(marker)},'x'),10)`;
 const parent=`require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:'ignore'}).unref();process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},100)`;
 const result=await overlapPreparation([task('seed',parent),task('browser','setTimeout(()=>process.exit(1),200)')],{graceMs:100});
 assert.equal(result.result,'FAIL');assert(fs.existsSync(marker));
 const before=fs.readFileSync(marker,'utf8');await new Promise(resolve=>setTimeout(resolve,100));
 assert.equal(fs.readFileSync(marker,'utf8'),before,'grandchild kept writing after preparation returned');
} finally {fs.rmSync(directory,{recursive:true,force:true});}

console.log('Seed/browser overlap: actual concurrency, both required, failed spawn/seed/browser, timeout, cancellation, drained children and stale receipts fail closed PASS');
