#!/usr/bin/env node
// Only independent infrastructure preparation overlaps the canonical seed.
import fs from 'node:fs';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {assertLocalEnv} from './assert-local.mjs';

export async function overlapPreparation(tasks,{signal,graceMs=6000}={}) {
  if(tasks.length!==2||new Set(tasks.map(t=>t.name)).size!==2||!tasks.every(t=>['seed','browser'].includes(t.name)&&Number.isFinite(t.timeoutMs)&&t.timeoutMs>0))throw Error('invalid_preparation_tasks');
  const began=performance.now(),entries=[];let aborting=false,killTimer,abortDrained;
  const kill=kind=>{for(const e of entries)if(e.child.pid)try{process.kill(-e.child.pid,kind);}catch(error){if(error.code!=='ESRCH')throw error;}};
  const abort=()=>{if(aborting)return;aborting=true;kill('SIGTERM');abortDrained=new Promise(resolve=>{killTimer=setTimeout(()=>{kill('SIGKILL');resolve();},graceMs);});};
  signal?.addEventListener('abort',abort,{once:true});
  try {
    for(const task of tasks) {
      if(aborting||signal?.aborted)break;
      const child=spawn(task.command,task.args,{env:task.env||process.env,stdio:task.stdio||['ignore','pipe','pipe'],detached:true});
      child.stdout?.pipe(process.stdout,{end:false});child.stderr?.pipe(process.stderr,{end:false});
      const entry={name:task.name,child,closed:false,start_ms:performance.now()-began,result:'failure'};entries.push(entry);
      entry.done=new Promise(resolve=>{
        const timer=setTimeout(()=>{entry.timedOut=true;abort();},task.timeoutMs);
        child.once('error',()=>{entry.result='failure';abort();});
        // close, rather than exit, guarantees all child stdio is drained.
        child.once('close',(code,childSignal)=>{
          clearTimeout(timer);entry.closed=true;entry.end_ms=performance.now()-began;
          entry.result=code===0&&!entry.timedOut&&!childSignal?'success':entry.timedOut?'timed_out':childSignal?'cancelled':'failure';
          if(entry.result!=='success')abort();resolve();
        });
      });
    }
    if(signal?.aborted)abort();
    await Promise.all(entries.map(e=>e.done));
    if(abortDrained)await abortDrained; // Let seed-pool drain its own detached children before teardown.
    const phases=entries.map(e=>({name:e.name,result:e.result,start_ms:e.start_ms,end_ms:e.end_ms,wall_ms:e.end_ms-e.start_ms}));
    return {result:!aborting&&phases.length===2&&phases.every(p=>p.result==='success')?'PASS':'FAIL',wall_ms:performance.now()-began,phases,
      overlap_ms:phases.length===2?Math.max(0,Math.min(...phases.map(p=>p.end_ms))-Math.max(...phases.map(p=>p.start_ms))):0};
  } finally {clearTimeout(killTimer);signal?.removeEventListener('abort',abort);}
}

export function verifyPreparation(receipt,{sha,runId,attempt}) {
  if(!/^[a-f0-9]{40}$/.test(sha||'')||receipt?.sha!==sha||receipt.run_id!==runId||receipt.attempt!==attempt||receipt.result!=='PASS'
    ||!Array.isArray(receipt.phases)||receipt.phases.length!==2||new Set(receipt.phases.map(p=>p.name)).size!==2
    ||!['seed','browser'].every(name=>receipt.phases.some(p=>p.name===name&&p.result==='success'&&Number.isFinite(p.wall_ms)&&p.wall_ms>=0)))throw Error('seed_browser_receipt_invalid');
  return true;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  assertLocalEnv(process.env,'seed-browser-preparation');
  const directory=path.resolve(process.env.CI_DEMO_REPORTS||'reports/ci-demo');
  if(path.relative(process.cwd(),directory).split(path.sep).includes('..'))throw Error('preparation_reports_outside_checkout');
  const identity={sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),runId:process.env.GITHUB_RUN_ID||'local',attempt:process.env.GITHUB_RUN_ATTEMPT||'1'};
  const file=path.join(directory,'seed-browser-preparation.json');
  if(process.argv[2]==='--verify') {
    if(process.argv.length!==3)throw Error('invalid_preparation_arguments');
    const stat=fs.lstatSync(file);if(!stat.isFile()||stat.size>16384)throw Error('invalid_preparation_receipt');
    verifyPreparation(JSON.parse(fs.readFileSync(file,'utf8')),identity);
    console.log('CHROMIUM_PREPARED_WITH_CANONICAL_SEED_PASS');
  } else {
    if(process.argv.length!==2)throw Error('invalid_preparation_arguments');
    fs.mkdirSync(directory,{recursive:true});
    // Exclusive creation prevents accepting a stale or symlinked receipt.
    const fd=fs.openSync(file,'wx',0o600),controller=new AbortController();
    const onSignal=()=>controller.abort();process.once('SIGTERM',onSignal);process.once('SIGINT',onSignal);
    try {
      const result=await overlapPreparation([
        {name:'seed',command:'bash',args:['-o','pipefail','-c','bash scripts/ci-demo/run.sh seed-pool 2>&1 | grep -v \'@\' | tee "$CI_DEMO_REPORTS/seed.txt"'],timeoutMs:25*60*1000,env:{...process.env,CI_DEMO_REPORTS:directory}},
        {name:'browser',command:'npx',args:['playwright','install','--with-deps','chromium'],timeoutMs:15*60*1000,
          env:{...process.env,DEBIAN_FRONTEND:'noninteractive',PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT:'60000'}}
      ],{signal:controller.signal});
      const receipt={format_version:1,sha:identity.sha,run_id:identity.runId,attempt:identity.attempt,...result};
      fs.writeFileSync(fd,JSON.stringify(receipt,null,2)+'\n');
      console.log('ARANDU_SEED_BROWSER_PREPARATION '+JSON.stringify(receipt));
      if(result.result!=='PASS')process.exitCode=1;
    } finally {fs.closeSync(fd);process.removeListener('SIGTERM',onSignal);process.removeListener('SIGINT',onSignal);}
  }
}
