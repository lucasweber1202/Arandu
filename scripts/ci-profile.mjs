#!/usr/bin/env node
import { readFileSync,writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const seconds=(start,end)=>start&&end?Math.max(0,(Date.parse(end)-Date.parse(start))/1000):null;
export function profileRun(run,jobs){
 const classify=name=>{
  const n=name.toLowerCase();
  if(/cache|restore playwright|save verified playwright/.test(n))return 'browser_cache';
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
 const duration=seconds(job.started_at,job.completed_at);
 return {name:job.name,conclusion:job.conclusion,duration_seconds:duration,rounded_runner_minutes:duration===null?null:Math.ceil(duration/60),dispatch_and_dependency_wait_seconds:seconds(run.created_at,job.started_at),stages};});
 return {run_id:run.id,head_sha:run.head_sha,conclusion:run.conclusion,wall_seconds:seconds(run.created_at,run.updated_at),runner_minutes_estimate:rows.every(r=>r.rounded_runner_minutes!==null)?rows.reduce((sum,r)=>sum+r.rounded_runner_minutes,0):null,jobs:rows,limitations:['Runner minutes are per-job rounded estimates, not invoice amounts.','Dispatch/dependency wait is not an isolated runner queue measurement.','Stages classify named steps; nested work and cache hits require logs.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [runPath,jobsPath,out]=process.argv.slice(2);if(!runPath||!jobsPath)throw new Error('Usage: ci-profile.mjs run.json jobs.json [output.json]');
 const result=profileRun(JSON.parse(readFileSync(runPath)),JSON.parse(readFileSync(jobsPath)).jobs);
 const content=JSON.stringify(result,null,2)+'\n';if(out)writeFileSync(out,content);else process.stdout.write(content);
}
