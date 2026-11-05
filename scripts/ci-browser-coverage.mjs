import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { unpackReceipt } from './ci-browser-receipt.mjs';
import { BROWSER_GROUPS } from './ci-browser-groups.mjs';
export function assessBrowserCoverage(plan,receipts,sha) {
  const failures=[];
  if(!/^[a-f0-9]{40}$/.test(sha||'')||plan?.sha!==sha||plan?.mode!=='plan'||plan?.result!=='passed'||!Array.isArray(plan.cases)||!plan.cases.length)failures.push('invalid_plan');
  if(!Array.isArray(receipts)||receipts.length!==Object.keys(BROWSER_GROUPS).length)failures.push('missing_groups');
  const expected=new Map((plan?.cases||[]).map(c=>[c.id,c]));
  if(expected.size!==plan?.cases?.length)failures.push('duplicate_plan_case');
  const seen=new Set(),groups=new Set();let passed=0,skipped=0,flaky=0;
  for(const r of receipts||[]) {
    if(r.sha!==sha||r.mode!=='execution'||r.result!=='passed'||!Object.hasOwn(BROWSER_GROUPS,r.group)||groups.has(r.group)) {failures.push('invalid_receipt');continue;}
    groups.add(r.group);
    if(!Array.isArray(r.cases)||!Array.isArray(r.results)){failures.push('invalid_cases');continue;}
    for(const c of r.cases) {
      const e=expected.get(c.id);
      if(seen.has(c.id)||!e||e.project!==c.project||e.file!==c.file||e.line!==c.line||!BROWSER_GROUPS[r.group].includes(c.project)){failures.push('unexpected_or_duplicate_case');continue;}
      seen.add(c.id);
      const attempts=r.results.filter(x=>x.id===c.id).sort((a,b)=>a.retry-b.retry);
      const last=attempts.at(-1);
      if(!last||new Set(attempts.map(a=>a.retry)).size!==attempts.length||attempts.some((a,i)=>a.retry!==i)) {failures.push('missing_or_invalid_attempt');continue;}
      if(last.status==='skipped') {
        if(e.expected_status!=='skipped'&&!last.explicit_skip)failures.push('silent_skip');
        skipped++;
      } else if(last.expected_status!==e.expected_status||last.status!==last.expected_status||last.status==='interrupted'||last.status==='timedOut')failures.push('unexpected_result');
      else {passed++;if(last.retry)flaky++;}
    }
    if(r.results.some(a=>!r.cases.some(c=>c.id===a.id)))failures.push('unexpected_attempt');
  }
  if(seen.size!==expected.size)failures.push('missing_planned_cases');
  return {tool:'arandu-browser-coverage',sha,result:failures.length?'FAIL':'PASS',planned:expected.size,executed:seen.size,passed,skipped,flaky,failures:[...new Set(failures)]};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let plan,receipts,sha;
 if(process.argv[2]==='--job-outputs') {
   sha=process.env.GITHUB_SHA;
   plan=unpackReceipt(process.env.BROWSER_PLAN);
   receipts=[unpackReceipt(process.env.BROWSER_GECKO),unpackReceipt(process.env.BROWSER_MOBILE)];
 } else {
   const directory=process.argv[2];sha=process.argv[3];
   const read=name=>JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'));
   plan=read('browser-plan.json');receipts=Object.keys(BROWSER_GROUPS).map(g=>read(`browser-${g}.json`));
 }
 const report=assessBrowserCoverage(plan,receipts,sha);
 console.log(JSON.stringify(report));if(report.result!=='PASS')process.exitCode=1;
}
