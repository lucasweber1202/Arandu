// Analyze profiler counters, never commands, identities or payloads.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
export function seedQuotaReport(profile,{limit=60,windowSeconds=600}={}) {
 if(!Number.isSafeInteger(limit)||limit<1||!Number.isFinite(windowSeconds)||windowSeconds<=0)throw Error('Invalid quota');
 if(!Array.isArray(profile.requests))throw Error('Detailed seed requests required');
 const actors=new Map();
 for(const row of profile.requests) {
  if(row.channel!=='app'||row.method==='GET'||row.method==='HEAD')continue;
  if(!/^[a-z][a-z0-9_.-]{0,63}$/i.test(row.actor)||!Number.isSafeInteger(row.attempts)||row.attempts<0)throw Error('Invalid counters');
  const current=actors.get(row.actor)||{actor_role:row.actor,attempts:0,rate_limited_attempts:0,domains:{}};
  const limited=row.statuses?.['429']||0;
  if(!Number.isSafeInteger(limited)||limited<0||limited>row.attempts)throw Error('Invalid 429 counters');
  const domain=String(row.resource).split('/')[0];if(!/^[a-z][a-z_-]*$/.test(domain))throw Error('Invalid resource');
  current.attempts+=row.attempts;current.rate_limited_attempts+=limited;
  current.domains[domain]=(current.domains[domain]||0)+row.attempts-limited;actors.set(row.actor,current);
 }
 return {limit,window_seconds:windowSeconds,window_model:'local first-request anchored memory limiter',actors:[...actors.values()].map(a=>({...a,non_429_attempts:a.attempts-a.rate_limited_attempts,
  minimum_windows_if_one_identity:Math.ceil((a.attempts-a.rate_limited_attempts)/limit),
  minimum_span_seconds_if_one_identity:Math.max(0,Math.ceil((a.attempts-a.rate_limited_attempts)/limit)-1)*windowSeconds})),
 backpressure:profile.waits?.backpressure||null,
 limitations:['Role labels may aggregate identities; lower bound is conditional on one identity per role in the canonical seed.','Non-429 attempts include failed business commands: quota accounting precedes domain dispatch.','Window bound applies to the local first-request anchored limiter, not aligned distributed buckets. Relative to first charged command, not process start. No quota or fixture is modified.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(seedQuotaReport(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))),null,2));
