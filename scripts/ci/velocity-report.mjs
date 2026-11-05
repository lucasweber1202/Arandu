#!/usr/bin/env node
// Allowlisted metadata only: never serialize API payloads, logs or PR titles.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {profileRun} from '../ci-profile.mjs';
const elapsed=(a,b)=>{const n=(Date.parse(b)-Date.parse(a))/1000;return Number.isFinite(n)&&n>=0?n:null;};
function kind(name) {
 if(name==='classify')return 'classify';
 if(/^full \/ validate-source$/.test(name))return 'source';
 if(/^full \/ validate(?:-mobile|-webkit|-safari)? \/ browser$/.test(name))return 'browser';
 if(/^full \/ browser-coverage$/.test(name))return 'coverage';
 if(/^full \/ (?:database|deploy-boundaries)$/.test(name))return 'full-root';
 if(/^full \/ presentation$/.test(name))return 'presentation';
 if(/^integration \/ demo-integration$/.test(name))return 'integration';
 if(['fast','backend'].includes(name))return 'fast';
 if(['database','validate','presentation','deploy-boundaries'].includes(name))return 'gate';
 return 'unknown';
}
export function reportAttempt(run,jobs) {
 // Failed-job reruns can return successful jobs with copied old start/end
 // timestamps but a NEW created_at/run_attempt. They consumed no runner here.
 const inherited=jobs.filter(j=>j.conclusion!=='skipped'&&Date.parse(j.completed_at)<Date.parse(j.created_at));
 jobs=jobs.filter(j=>!inherited.includes(j));
 const result=profileRun(run,jobs), active=jobs.filter(j=>j.conclusion!=='skipped');
 const byName=new Map(active.map(j=>[j.name,j]));
 const dependencies=j=>{
  const k=kind(j.name);
  if(k==='classify')return [];
  if(['source','full-root','integration','fast'].includes(k))return active.some(x=>kind(x.name)==='classify')?active.filter(x=>kind(x.name)==='classify').map(x=>x.name):null;
  if(['browser','presentation'].includes(k))return active.some(x=>kind(x.name)==='source')?active.filter(x=>kind(x.name)==='source').map(x=>x.name):null;
  if(k==='coverage')return active.filter(x=>['source','browser'].includes(kind(x.name))).map(x=>x.name);
  if(k==='gate')return active.filter(x=>!['gate','unknown'].includes(kind(x.name))).map(x=>x.name);
  return null;
 };
 const memo=new Map();
 function critical(name,visiting=new Set()) {
  if(memo.has(name))return memo.get(name);
  if(visiting.has(name))throw Error('Cyclic CI DAG');visiting.add(name);
  const j=byName.get(name),deps=dependencies(j),duration=elapsed(j.started_at,j.completed_at),queue=elapsed(j.created_at,j.started_at);
  if(deps===null||duration===null||queue===null)return null;
  const parents=deps.map(n=>critical(n,new Set(visiting)));if(parents.some(p=>p===null))return null;
  const parent=parents.sort((a,b)=>b.seconds-a.seconds)[0]||{seconds:0,path:[]};
  const value={seconds:parent.seconds+queue+duration,path:[...parent.path,name]};memo.set(name,value);return value;
 }
 const paths=active.map(j=>critical(j.name));
 const complete=paths.length>0&&paths.every(Boolean);
 const end=active.map(j=>j.completed_at).filter(Boolean).sort().at(-1);
 return {...result,inherited_jobs:inherited.map(j=>({name:j.name,conclusion:j.conclusion,previous_execution_seconds:elapsed(j.started_at,j.completed_at)})),attempt_wall_seconds:elapsed(run.run_started_at||run.created_at,end),
 critical_path:complete?paths.sort((a,b)=>b.seconds-a.seconds)[0]:null,
 dag_model:'Arandu v7-v9; duration + measured queue weights; dispatch slack reported separately',
 jobs:result.jobs.map(row=>{const raw=byName.get(row.name);return {...row,needs:raw?dependencies(raw):[],steps:(raw?.steps||[]).map(s=>({number:s.number,name:s.name,conclusion:s.conclusion,seconds:elapsed(s.started_at,s.completed_at)}))};}),
 limitations:[...result.limitations,'Critical path uses declared Arandu dependencies, not chronological overlap inference. Unknown topology or missing timestamps returns null.','Run updated_at may include later retries: use attempt_wall_seconds for an individual attempt. Inherited jobs with completion before new creation are excluded from runner costs.','Test-level flakes/retries require browser receipts; a rerun is not proof of a flaky test.']};
}
export function riskReceipt(log) {
 for(const line of String(log).split('\n')) {
  const match=line.match(/ARANDU_RISK_RECEIPT (\{.*\})$/);if(!match)continue;
  let value;try{value=JSON.parse(match[1]);}catch{continue;}
  if(!/^[a-f0-9]{40}$/.test(value.sha||'')||!['A','B','C','D'].includes(value.risk)||!Array.isArray(value.reasons))continue;
  return {sha:value.sha,risk:value.risk,reasons:value.reasons.map(r=>({path:r.path,status:r.status,risk:r.risk,why:r.why})),required:value.required,suites:value.suites};
 }
 return null;
}
export function browserCounts(log) {
 const values=[];
 for(const line of String(log).split('\n')) {
  const match=line.match(/ARANDU_BROWSER_COUNTS (\{.*\})$/);if(!match)continue;
  let v;try{v=JSON.parse(match[1]);}catch{continue;}
  if(!/^[a-f0-9]{40}$/.test(v.sha||'')||!['chromium','firefox','webkit','safari','presentation'].includes(v.group)||!['passed','failed','timedout','interrupted'].includes(v.result))continue;
  const counters=['planned','executed','attempts','retries','flaky','skipped','passed'];
  if(!counters.every(k=>Number.isSafeInteger(v[k])&&v[k]>=0))continue;
  values.push({sha:v.sha,group:v.group,result:v.result,...Object.fromEntries(counters.map(k=>[k,v[k]]))});
 }
 return values;
}
export function collect(repository,runId) {
 if(!/^[\w.-]+\/[\w.-]+$/.test(repository)||!/^\d+$/.test(String(runId)))throw Error('Invalid repository/run');
 const api=endpoint=>JSON.parse(execFileSync('gh',['api',endpoint],{encoding:'utf8',maxBuffer:32*1024*1024}));
 const root=`repos/${repository}/actions/runs/${runId}`, latest=api(root),attempts=[];let classification=null;
 for(let attempt=1;attempt<=latest.run_attempt;attempt++) {
  const run=api(`${root}/attempts/${attempt}`),jobs=[];
  for(let page=1;;page++){const data=api(`${root}/attempts/${attempt}/jobs?per_page=100&page=${page}`);jobs.push(...data.jobs);if(data.jobs.length<100)break;}
  const classify=jobs.find(j=>j.name==='classify'&&j.conclusion==='success');
  if(classify) {
   // This one job logs no payloads. Capture privately and retain only the receipt.
   try {classification=riskReceipt(execFileSync('gh',['api',`repos/${repository}/actions/jobs/${classify.id}/logs`],{encoding:'utf8',maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']}))||classification;}catch{/* Expired logs leave classification explicitly unmeasured. */}
  }
  const browser=[];
  for(const job of jobs.filter(j=>['browser','presentation'].includes(kind(j.name))&&!(Date.parse(j.completed_at)<Date.parse(j.created_at)))) {
   try {browser.push(...browserCounts(execFileSync('gh',['api',`repos/${repository}/actions/jobs/${job.id}/logs`],{encoding:'utf8',maxBuffer:64*1024*1024,stdio:['ignore','pipe','pipe']})));}catch{/* Unavailable evidence remains unmeasured. */}
  }
  attempts.push({...reportAttempt(run,jobs),browser_counts:browser,browser_flakes:browser.length?browser.reduce((n,b)=>n+b.flaky,0):null,browser_retries:browser.length?browser.reduce((n,b)=>n+b.retries,0):null});
 }
 return {format_version:1,repository,run_id:Number(runId),pr_numbers:(latest.pull_requests||[]).map(p=>p.number),head_sha:latest.head_sha,
 analyzed_sha:classification?.sha||null,risk:classification?.risk||null,classification_reasons:classification?.reasons||null,classification_note:'Receipt from classify job; unavailable/expired logs leave null, never infer risk from job names',
 attempts,reruns:attempts.length-1,total_runner_minutes_estimate:attempts.every(a=>a.runner_minutes_estimate!==null)?attempts.reduce((n,a)=>n+a.runner_minutes_estimate,0):null,flakes:attempts.every(a=>a.browser_flakes!==null)?attempts.reduce((n,a)=>n+a.browser_flakes,0):null};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 const [repository,runId,out]=process.argv.slice(2);if(!out)throw Error('Usage: velocity-report.mjs owner/repo run-id output.json');
 fs.writeFileSync(out,JSON.stringify(collect(repository,runId),null,2)+'\n');
}
