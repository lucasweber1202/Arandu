#!/usr/bin/env node
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {classifyChanges} from './risk-policy.mjs';
import {parseChanges} from './changes.mjs';
import {buildImportGraph,allFinanceSuites,selectSuites} from './surfaces.mjs';
export function preflight(base='origin/main') {
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
 const estimate=plan.risk==='D'&&durations.length?{historical_median_seconds:durations[Math.ceil(durations.length*.5)-1],historical_p95_seconds:durations[Math.ceil(durations.length*.95)-1],samples:durations.length,architecture:'pre-v9 full-path reference; not a prediction for v9',seconds:null}:{seconds:null,reason:'No matched official repeated measurements for this risk class'};
 return {tool:'arandu-ci-preflight',sha,base:baseSha,...plan,suites,
 jobs:['classify',...(plan.risk==='D'?['full','integration']:['fast',...(plan.risk==='C'?['backend']:[])]),'database','deploy-boundaries','validate','presentation'],
 historical_reference:references,estimate,
 full_validation_triggers:plan.reasons.filter(r=>r.risk==='D'),merge_authorized:false,official_checks_required:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 if(process.argv.length>3)throw Error('Usage: preflight.mjs [base-ref]');
 console.log(JSON.stringify(preflight(process.argv[2]),null,2));
}
