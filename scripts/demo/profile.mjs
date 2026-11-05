// Synthetic seed timing only. Never retain URLs, queries, IDs, payloads,
// cookies, credentials, response text or exception messages.
import { performance } from 'node:perf_hooks';
import { AsyncLocalStorage } from 'node:async_hooks';
const label = value => typeof value==='string' && /^[a-z][a-z0-9_.-]{0,63}$/i.test(value) ? value : 'other';
const resource = value => String(value||'').split('?')[0].split('/').slice(0,2).map(part=>/^[a-z][a-z_-]{0,63}$/.test(part)?part:':id').join('/');
export function seedProfiler({clock=()=>performance.now()}={}) {
  const start=clock(),context=new AsyncLocalStorage(),phases=[],requests=new Map(),waits={};
  let failed=false;
  return {
    async phase(name,run) {
      const began=clock();let ok=false;
      try {const result=await context.run(label(name),run);ok=true;return result;}
      finally {phases.push({name:label(name),start_ms:began-start,duration_ms:clock()-began,result:ok?'PASS':'FAIL'});}
    },
    async request({channel,method,path,actor='operator'},run) {
      const key=JSON.stringify([context.getStore()||'unscoped',label(channel),['GET','POST','PATCH','PUT','DELETE','HEAD'].includes(method)?method:'OTHER',resource(path),label(actor)]);
      const row=requests.get(key)||{phase:context.getStore()||'unscoped',channel:label(channel),method:['GET','POST','PATCH','PUT','DELETE','HEAD'].includes(method)?method:'OTHER',resource:resource(path),actor:label(actor),attempts:0,duration_ms:0,statuses:{}};
      requests.set(key,row);row.attempts++;const began=clock();let status='transport_error';
      try {const result=await run();status=Number.isInteger(result?.response?.status)?String(result.response.status):'invalid_response';return result;}
      finally {row.duration_ms+=clock()-began;row.statuses[status]=(row.statuses[status]||0)+1;}
    },
    async pause(reason,ms,run) {
      const key=label(reason),row=waits[key]||{count:0,requested_ms:0,elapsed_ms:0};waits[key]=row;
      row.count++;row.requested_ms+=ms;const began=clock();try{return await run();}finally{row.elapsed_ms+=clock()-began;}
    },
    finish({success=true}={}) {
      failed ||= !success;
      return {format_version:1,classification:'synthetic_seed_timing_no_payload',result:failed?'FAIL':'PASS',wall_ms:clock()-start,phases,requests:[...requests.values()],waits,
        limitations:['Phase times are inclusive; nested phases must not be summed as wall time.','HTTP attempts include response body consumption, without contents.','Account labels contain role/side only; no account identifiers.']};
    }
  };
}
