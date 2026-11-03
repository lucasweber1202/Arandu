import {readFileSync,appendFileSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {classifyChanges} from './risk-policy.mjs';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH));
const sha=git('rev-parse','HEAD');
if(sha!==process.env.GITHUB_SHA)throw Error('Checkout SHA mismatch');
let plan={risk:'D',reasons:['Main, scheduled or manual full validation']};
if(process.env.GITHUB_EVENT_NAME==='pull_request'){
 const {base,head}=event.pull_request;
 const parents=git('rev-list','--parents','-n','1','HEAD').split(' ').slice(1);
 if(!parents.includes(base.sha)||!parents.includes(head.sha))throw Error('Merge candidate does not match base/head');
 // Strict branch freshness: the candidate must already contain the current base.
 git('merge-base','--is-ancestor',base.sha,head.sha);
 const fields=execFileSync('git',['diff','--name-status','-z','--find-renames',`${base.sha}...${head.sha}`],{encoding:'utf8'}).split('\0');
 const changes=[];
 for(let i=0;i<fields.length&&fields[i];){const status=fields[i++];const filename=fields[i++];if(status.startsWith('R'))changes.push({status:'renamed',previous_filename:filename,filename:fields[i++]});else changes.push({status:{A:'added',M:'modified',D:'removed',T:'modified'}[status],filename});}
 plan=classifyChanges(changes);
}
const all=readdirSync('tests/e2e').filter(n=>/^finance-.*\.spec\.js$/.test(n));
const areas={fees:['fees','ingestion','contracts'],crm:['crm','central','relationship-center'],copilot:['copilot'],provider:['provider-draft','procurement'],rfq:['procurement','external-proposals','negotiation-board'],negotiation:['procurement','external-proposals','negotiation-board']};
const names=new Set();
for(const reason of plan.reasons){const path=reason.path||'';if(plan.risk==='A')continue;const area=Object.keys(areas).find(a=>path.includes('/views/'+a));for(const name of area?areas[area].map(n=>'finance-'+n+'.spec.js'):all)if(all.includes(name))names.add(name);}
const suites=[...names].map(n=>'tests/e2e/'+n);
if(!suites.length)suites.push('tests/e2e/finance-procurement.spec.js');
appendFileSync(process.env.GITHUB_OUTPUT,`risk=${plan.risk}\ndeep=${['C','D'].includes(plan.risk)}\nsha=${sha}\nsuites=${JSON.stringify(suites)}\n`);
appendFileSync(process.env.GITHUB_STEP_SUMMARY,`## Risk policy\nAnalyzed checkout: ${sha}\n\n${JSON.stringify(plan,null,2)}\n`);
