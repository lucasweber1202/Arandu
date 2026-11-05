#!/usr/bin/env node
import { readFileSync,writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const seconds=(start,end)=>{const a=Date.parse(start),b=Date.parse(end);return Number.isFinite(a)&&Number.isFinite(b)&&b>=a?(b-a)/1000:null;};
export function profileRun(run,jobs){
 const classify=name=>{
  const n=name.toLowerCase();
  if(/official baseline and four visitor seeds/.test(n))return 'seed_pool';
  if(/browser system dependencies|install chromium only/.test(n))return 'browser_system_and_binary_install';
  if(/verify and install|every engine required/.test(n))return 'browser_binary_install';
  if(/teardown/.test(n))return 'teardown';
  if(/presentation journeys/.test(n))return 'presentation';
  if(/cache/.test(n))return /playwright|browser/.test(n)?'browser_cache':'dependency_cache';
  if(/workspaces|pool/.test(n))return 'pool';
  if(/desktop and mobile journeys|presentation journeys|demo e2e/.test(n))return 'browser_execution';
  if(/seed sanity/.test(n))return 'seed_check';
  if(/supabase up|migrations, app/.test(n))return 'supabase_bootstrap_and_migrations';
  if(/pull pinned/.test(n))return 'images';
  if(/upload|artifact|evidence|evidência/.test(n))return 'artifacts';
  if(/seed|seme/.test(n))return 'seed';
  if(/pool|workspace/.test(n))return 'pool';
  if(/advers/.test(n))return 'adversarial';
  if(/recovery|restore|encrypted export/.test(n))return 'recovery';
  if(/journey|jornada|smoke|test|checks/.test(n))return 'validation';
  if(/browser|playwright|chromium|firefox|webkit/.test(n))return 'browsers';
  if(/npm ci|^install$|dependencies|dependências/.test(n))return 'dependencies';
  if(/build/.test(n))return 'build';
  return 'setup_or_other';
 };
 const rows=jobs.map(job=>{const stages={};for(const step of job.steps||[]){const duration=seconds(step.started_at,step.completed_at);if(duration!==null){const kind=classify(step.name);stages[kind]=(stages[kind]||0)+duration;}}
 const duration=job.conclusion==='skipped'?0:seconds(job.started_at,job.completed_at);
 return {name:job.name,conclusion:job.conclusion,runner_labels:job.labels||[],queue_seconds:job.conclusion==='skipped'?0:seconds(job.created_at,job.started_at),pre_queue_dependency_and_dispatch_seconds:seconds(run.created_at,job.created_at),duration_seconds:duration,rounded_runner_minutes:duration===null?null:Math.ceil(duration/60),dispatch_and_dependency_wait_seconds:seconds(run.created_at,job.started_at),stages};});
 const execution=rows.filter(r=>r.duration_seconds>0);
 const intervals=jobs.filter(j=>j.conclusion!=='skipped'&&seconds(j.started_at,j.completed_at)!==null);
 const executionWall=intervals.length&&rows.every(r=>r.duration_seconds!==null)?(Math.max(...intervals.map(j=>Date.parse(j.completed_at)))-Math.min(...intervals.map(j=>Date.parse(j.started_at))))/1000:null;
 return {run_id:run.id,head_sha:run.head_sha,event:run.event,attempt:run.run_attempt||null,conclusion:run.conclusion,execution_wall_seconds:executionWall,total_runner_seconds:rows.every(r=>r.duration_seconds!==null)?execution.reduce((n,r)=>n+r.duration_seconds,0):null,measured_queue_seconds:rows.every(r=>r.queue_seconds!==null)?rows.reduce((n,r)=>n+r.queue_seconds,0):null,wall_seconds:seconds(run.created_at,run.updated_at),runner_minutes_estimate:rows.every(r=>r.rounded_runner_minutes!==null)?rows.reduce((sum,r)=>sum+r.rounded_runner_minutes,0):null,jobs:rows,limitations:['Runner minutes are per-job rounded estimates, not invoice amounts.','Queue is job.created_at → started_at. Run creation → job creation includes dependencies and dispatch, not runner queue.','Stages classify named steps; nested work and cache hits require logs.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [runPath,jobsPath,out]=process.argv.slice(2);if(!runPath||!jobsPath)throw new Error('Usage: ci-profile.mjs run.json jobs.json [output.json]');
 const result=profileRun(JSON.parse(readFileSync(runPath)),JSON.parse(readFileSync(jobsPath)).jobs);
 const content=JSON.stringify(result,null,2)+'\n';if(out)writeFileSync(out,content);else process.stdout.write(content);
}
