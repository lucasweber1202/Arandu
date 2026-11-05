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
 const history=JSON.parse(fs.readFileSync('ops/ci/acceleration-v7/historical-runs.json','utf8'));
 return {tool:'arandu-ci-preflight',sha,base:baseSha,...plan,suites,
 jobs:['classify',...(plan.risk==='D'?['full','integration']:['fast',...(plan.risk==='C'?['backend']:[])]),'database','deploy-boundaries','validate','presentation'],
 historical_reference:history,estimate:{seconds:null,reason:'No matched repeated measurements for this exact class and coverage; targets are not forecasts'},
 full_validation_triggers:plan.reasons.filter(r=>r.risk==='D'),merge_authorized:false,official_checks_required:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 if(process.argv.length>3)throw Error('Usage: preflight.mjs [base-ref]');
 console.log(JSON.stringify(preflight(process.argv[2]),null,2));
}
