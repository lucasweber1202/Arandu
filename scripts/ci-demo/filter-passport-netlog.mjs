import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {safeNetworkUrl} from '../../tests/e2e/helpers/browser-problems.mjs';
const [input,output]=process.argv.slice(2);let d;
try{d=JSON.parse(readFileSync(input,'utf8'));}finally{unlinkSync(input);}
const types=Object.fromEntries(Object.entries(d.constants.logEventTypes).map(([k,v])=>[v,k]));
const requests=new Map();
for(const e of d.events){if(types[e.type]==='URL_REQUEST_START_JOB'&&e.params?.url){const u=new URL(e.params.url);const entity=u.searchParams.get('entity_type');requests.set(e.source.id,{url:safeNetworkUrl(u.href),method:e.params.method,entityType:['rfq','profile','contract','proposal','provider'].includes(entity)?entity:null});}}
const failures=new Map();const errors={};let sslAuthorityErrors=0;
for(const e of d.events){const type=types[e.type],code=e.params?.net_error;if(code===undefined)continue;
 if(type==='SSL_HANDSHAKE_ERROR'&&code===-202)sslAuthorityErrors++;
 if(type==='HTTP_TRANSACTION_RESTART_AFTER_ERROR')errors[String(code)]=(errors[String(code)]||0)+1;
 if(code<0&&requests.has(e.source.id))failures.set(e.source.id+':'+code,{...requests.get(e.source.id),error:code});
}
const result={scope:'Filtered transport metadata only; raw NetLog deleted',sslAuthorityErrors,httpConnectionRetries:errors,failedRequests:[...failures.values()]};
writeFileSync(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
