// Worker-time comparison from measured historical cases; not a wall-clock claim.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
export function browserBalance(profile) {
 const designs={
  two:[['firefox-desktop','webkit-desktop'],['chromium-desktop','mobile-chrome','mobile-safari']],
  three:[['webkit-desktop'],['mobile-safari'],['chromium-desktop','mobile-chrome','firefox-desktop']],
  four:[['chromium-desktop','mobile-chrome'],['firefox-desktop'],['webkit-desktop'],['mobile-safari']]
 };
 const totals={};for(const s of profile.specs)totals[s.project]=(totals[s.project]||0)+s.total_worker_ms;
 return {source_run:profile.run_id,source_cases:profile.planned,worker_ms_by_project:totals,
 designs:Object.entries(designs).map(([name,groups])=>{const loads=groups.map(projects=>projects.reduce((n,p)=>n+totals[p],0));return {name,groups,worker_ms:loads,max_worker_ms:Math.max(...loads),total_worker_ms:loads.reduce((a,b)=>a+b,0)};}),
 limitations:['Worker time is the sum of test durations, not wall-clock, queue or runner minutes.','Each additional job pays checkout/install/system dependency overhead. Measure actual CI before accepting the partition.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(browserBalance(JSON.parse(fs.readFileSync(process.argv[2]||'ops/ci/acceleration-v7/browser-baseline-41898780191.json','utf8'))),null,2));
