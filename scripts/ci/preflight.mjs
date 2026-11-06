#!/usr/bin/env node
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {classifyChanges} from './risk-policy.mjs';
import {parseChanges} from './changes.mjs';
import {PRODUCT_E2E} from '../e2e-suites.mjs';
import {BROWSER_GROUPS} from '../ci-browser-groups.mjs';
import {buildImportGraph,allFinanceSuites,selectSuites} from './surfaces.mjs';
export function historicalEstimate(input,risk) {
 if(!['A','B','C','D'].includes(risk))throw Error('Invalid CI history risk');
 const samples=[],seen=new Set(),sources=new Set();
 for(const report of Array.isArray(input)?input:[input]) {
  if(report?.format_version!==1||!/^[\w.-]+\/[\w.-]+$/.test(report.repository||'')||!Number.isSafeInteger(report.run_id)||report.run_id<1||report.risk!==risk||!/^[a-f0-9]{40}$/.test(report.head_sha||'')||!Array.isArray(report.attempts))continue;
  for(const attempt of report.attempts) {
   const key=`${report.repository.toLowerCase()}/${report.run_id}/${attempt.attempt}`;
   if(!Number.isSafeInteger(attempt.attempt)||attempt.attempt<1||seen.has(key)||attempt.conclusion!=='success'||!attempt.critical_path||!Array.isArray(attempt.inherited_jobs)||attempt.inherited_jobs.length
     ||!Number.isFinite(attempt.attempt_wall_seconds)||attempt.attempt_wall_seconds<=0||attempt.attempt_wall_seconds>86400)continue;
   // Never learn a short partial rerun, or a different full-matrix architecture.
   if(risk==='D'&&(!Array.isArray(attempt.jobs)||attempt.jobs.filter(j=>/\/ browser$/.test(j.name)).length!==Object.keys(BROWSER_GROUPS).length))continue;
   seen.add(key);sources.add(report.head_sha);samples.push(attempt.attempt_wall_seconds);
  }
 }
 if(!samples.length)throw Error('No complete matched CI history samples');
 samples.sort((a,b)=>a-b);const n=samples.length;
 return {seconds:n%2?samples[(n-1)/2]:(samples[n/2-1]+samples[n/2])/2,
  empirical_p95_seconds:n>1?samples[Math.ceil(n*.95)-1]:null,samples:n,min_seconds:samples[0],max_seconds:samples.at(-1),source_shas:[...sources],
  limitations:['Historical reference, not merge authorization or a latency promise.','Small samples do not establish a representative population p95.','Risk and full-matrix job count match; changed test coverage and cold-cache variability can still affect duration.']};
}
function readHistory(file) {
 if(fs.statSync(file).size>8*1024*1024)throw Error('CI history exceeds size budget');
 try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw Error('Invalid CI history JSON');}
}
export function preflight(base='origin/main',{historyFile}={}) {
 const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
 const sha=git('rev-parse','HEAD'),baseSha=git('rev-parse','--verify',base+'^{commit}');
 git('merge-base','--is-ancestor',baseSha,sha);
 if(git('status','--porcelain'))throw Error('Commit a clean checkpoint before preflight');
 const changes=parseChanges(execFileSync('git',['diff','--name-status','-z','--find-renames',baseSha+'...'+sha],{encoding:'utf8'}));
 const plan=classifyChanges(changes,{readSource:p=>fs.existsSync(p)?fs.readFileSync(p,'utf8'):null});
 const suites=selectSuites(plan,{graph:buildImportGraph('.'),all:allFinanceSuites()});
 // Measured references, deliberately not a forecast for an unmatched change.
 const history=JSON.parse(fs.readFileSync('ops/ci/acceleration-v7/historical-runs.json','utf8')).runs;
 const references=history.map(r=>({run_id:r.run_id,sha:r.head_sha,wall_seconds:r.wall_seconds,runner_minutes_estimate:r.runner_minutes_estimate}));
 const durations=references.map(r=>r.wall_seconds).filter(Number.isFinite).sort((a,b)=>a-b);
 const estimate=historyFile?historicalEstimate(readHistory(historyFile),plan.risk):plan.risk==='D'&&durations.length?{historical_median_seconds:durations[Math.ceil(durations.length*.5)-1],historical_p95_seconds:durations[Math.ceil(durations.length*.95)-1],samples:durations.length,architecture:'pre-v9 full-path reference; not a prediction for v9',seconds:null}:{seconds:null,reason:'No matched official repeated measurements for this risk class'};
 return {tool:'arandu-ci-preflight',sha,base:baseSha,...plan,suites,
 test_plan:{source_and_pure:'npm run check:all',product_suites:plan.risk==='D'?PRODUCT_E2E:suites,
  browser_projects:plan.risk==='D'?Object.values(BROWSER_GROUPS).flat():['chromium-desktop','mobile-chrome'],
  browser_groups:plan.risk==='D'?BROWSER_GROUPS:null,
  presentation:plan.risk==='D'?'complete playwright.presentation.config.js':'public-tour.spec.js on Chromium desktop/mobile',
  database:plan.required.includes('database'),recovery:plan.required.includes('recovery'),demo_integration:plan.required.includes('demo-integration')},
 jobs:['classify',...(plan.risk==='D'?['full','integration']:['fast',...(plan.risk==='C'?['backend']:[])]),'database','deploy-boundaries','validate','presentation'],
 historical_reference:references,estimate,
 full_validation_triggers:plan.reasons.filter(r=>r.risk==='D'),merge_authorized:false,official_checks_required:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 const args=process.argv.slice(2);let base='origin/main',historyFile;
 if(args[0]&&!args[0].startsWith('--'))base=args.shift();
 if(args.length){if(args.length!==2||args[0]!=='--history')throw Error('Usage: preflight.mjs [base-ref] [--history report.json]');historyFile=args[1];}
 console.log(JSON.stringify(preflight(base,{historyFile}),null,2));
}
