// Historical list-reporter projection. Do not retain test titles or log bodies.
export function profileBrowserLog(log) {
 const rows=new Map();let planned=null,workers=null;
 for(const line of String(log).split('\n')) {
  const run=line.match(/Running (\d+) tests using (\d+) workers/);if(run){planned=Number(run[1]);workers=Number(run[2]);}
  const m=line.match(/(?:^|Z)\s+([✓✘×-])\s+\d+\s+\[(chromium-desktop|firefox-desktop|webkit-desktop|mobile-chrome|mobile-safari)\].*?(tests\/e2e\/[a-z0-9-]+\.spec\.js):\d+:\d+(.*)$/);
  if(!m)continue;
  const key=m[2]+'|'+m[3],row=rows.get(key)||{project:m[2],file:m[3],durations:[],skipped:0,failed_attempts:0,retry_attempts:0};rows.set(key,row);
  if(m[1]==='-'){row.skipped++;continue;}
  const duration=m[4].match(/\(([\d.]+)(ms|s|m)\)\s*$/);
  if(!duration)continue;
  row.durations.push(Number(duration[1])*({ms:1,s:1000,m:60000}[duration[2]]));
  if(m[1]!=='✓')row.failed_attempts++;
  if(/retry #\d+/.test(m[4]))row.retry_attempts++;
 }
 const specs=[...rows.values()].map(({durations,...r})=>{const sorted=[...durations].sort((a,b)=>a-b),sum=durations.reduce((a,b)=>a+b,0);return {...r,attempts:durations.length,total_worker_ms:sum,mean_ms:durations.length?sum/durations.length:null,p95_ms:sorted.length?sorted[Math.ceil(sorted.length*.95)-1]:null};}).sort((a,b)=>b.total_worker_ms-a.total_worker_ms);
 return {classification:'historical_browser_list_projection',planned,workers,observed_attempts:specs.reduce((n,s)=>n+s.attempts,0),observed_skips:specs.reduce((n,s)=>n+s.skipped,0),specs,
   limitations:['Sum of test durations is worker time, never wall-clock or billed runner minutes.','Historical list logs do not expose fixture/setup/network timings.','New structured receipts measure hooks, retries and full case identity.']};
}
