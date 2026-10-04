import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { retryableFailure, safeFailure, countResult, withDeadline } from '../lib/finance/operational-resilience.mjs';
import { pinnedWebhookRequest, dispatchWebhooks } from '../lib/finance/webhook-dispatch.mjs';
import { encryptSecret } from '../lib/finance/public-api.mjs';
for(const status of [401,403,400,404,409,422]) assert.equal(retryableFailure({status}),false);
for(const status of [408,429,502,503,504]) assert.equal(retryableFailure({status}),true);
assert.equal(safeFailure({code:'token_secret',message:'password=secret'}),'dependency_failed');
assert.throws(()=>countResult('5')); assert.equal(countResult(5),5);
let signal;
await assert.rejects(withDeadline(s=>{signal=s;return new Promise(()=>{});},5),{name:'TimeoutError'}); assert.equal(signal.aborted,true);
const addresses=[{address:'93.184.216.34',family:4}];let options;
await pinnedWebhookRequest('https://erp.example.com/hook',{headers:{},body:'{}'},addresses,(url,opts,cb)=>{
  assert.equal(url.hostname,'erp.example.com'); options=opts;
  const req=new EventEmitter();req.end=()=>cb({statusCode:204,destroy(){}});return req;
});
assert.equal(options.agent,false); let pinned;
options.lookup('erp.example.com',{all:true},(_error,rows)=>{pinned=rows;});assert.deepEqual(pinned,addresses);
const env={ARANDU_WEBHOOK_SECRET_KEY:'k'.repeat(32)};
// Usa o mesmo formato de chave da configuração pública (base64, 32 bytes).
env.ARANDU_WEBHOOK_SECRET_KEY=Buffer.alloc(32,1).toString('base64');
const row={delivery_id:'d',lease_token:'l',url:'https://erp.example.com/hook',secret_ciphertext:encryptSecret('whsec_fixture',env),event_id:'e',event_type:'rfq.created',organization_id:'o',attempt:1};
const calls=[];
const rpc=async(name,args)=>{calls.push([name,args]);if(name==='fin_webhook_claim')return [row];throw new Error('database password=secret');};
const result=await dispatchWebhooks({rpc,env,lookup:async()=>addresses,fetchImpl:async()=>({status:204})});
assert.equal(result.completion_failed,1);assert.equal(result.succeeded,0,'erro de persistência não vira sucesso');
const bad=await dispatchWebhooks({env,rpc:async(name,args)=>name==='fin_webhook_claim'?[row]:(calls.push([name,args]),'failed'),lookup:async()=>addresses,fetchImpl:async()=>({status:'200'})});
assert.equal(bad.failed,1);assert.equal(calls.at(-1)[1].p_error_code,'invalid_response');
await assert.rejects(dispatchWebhooks({rpc:async()=>({rows:[]}),env}),{code:'invalid_response'});
let time=0; let sends=0;
const deferred=await dispatchWebhooks({env,budgetMs:10,now:()=>time,rpc:async name=>name==='fin_webhook_claim'?[row,{...row,delivery_id:'d2'}]:'succeeded',lookup:async()=>addresses,fetchImpl:async()=>{sends++;time=10;return{status:204};}});
assert.equal(sends,1);assert.equal(deferred.deferred,1);
console.log('Operational resilience: classificação, redação, cancelamento, DNS fixado, respostas inválidas, conclusão falha e orçamento aprovados.');

// Outbox: conclusão perdida não é delivered/retried; 2xx sem ID de provedor
// não é entrega comprovada, e falha de persistência fica visível.
const {dispatchTransactionalOutbox}=await import('../lib/email-outbox.mjs');
const item={id:'mail',claimToken:'lease',template:'fixture',recipientAddress:'fixture@example.invalid',idempotencyKey:'fixture-mail',attempts:1};
const emailCalls=[];
const email=await dispatchTransactionalOutbox({config:{provider:'resend',ready:true},prepare:async()=>({}),send:async()=>({delivered:true,providerReference:'provider-fixture'}),rpc:async(name,args)=>{
  emailCalls.push([name,args]);if(name==='claim_transactional_email_batch_v2')return[item];throw Object.assign(new Error('token=secret'),{code:'secret_error'});
}});
assert.equal(email.delivered,0);assert.equal(email.retried,0);assert.equal(email.completion_failed,1);
assert.doesNotMatch(JSON.stringify(emailCalls),/secret_error|token=/);
const retry=await dispatchTransactionalOutbox({config:{provider:'resend',ready:true},prepare:async()=>({}),send:async()=>({delivered:false,reason:'http_503'}),rpc:async name=>name==='claim_transactional_email_batch_v2'?[item]:{ok:true,status:'retry'}});
assert.equal(retry.retried,1);
await assert.rejects(dispatchTransactionalOutbox({config:{provider:'resend',ready:true},rpc:async()=>({items:[]})}),{code:'invalid_response'});
console.log('Outbox: conclusão incerta, erro seguro, retry persistido e resposta inválida aprovados.');

const {userSupabaseRequest}=await import('../lib/supabase.mjs');
const {Readable}=await import('node:stream');
const {handleFinanceSso}=await import('../lib/api/domains/finance-sso.mjs');
const savedFetch=globalThis.fetch;
const savedUrl=process.env.SUPABASE_URL,savedKey=process.env.SUPABASE_ANON_KEY;
try {
  process.env.SUPABASE_URL='https://fixture.invalid';process.env.SUPABASE_ANON_KEY='fixture-public-key';
  globalThis.fetch=async()=>new Response('invalid-json',{status:200});
  await assert.rejects(userSupabaseRequest('fixture-token','fin_organizations'),{code:'invalid_response'});
  const org='00000000-0000-4000-8000-000000000101',user='00000000-0000-4000-8000-000000000102';
  globalThis.fetch=async url=>Response.json(String(url).includes('fin_organizations')?[{id:org,kind:'BUYER'}]:String(url).includes('fin_members')?[{role:'admin'}]:[{domain:'customer.example',status:'pending'}]);
  const args={resource:'sso',sub:'domains-verify',token:'fixture-token',session:{user:{id:user}},headers:{},resolveTxt:()=>new Promise(()=>{}),adminRpc:()=>{throw new Error('must not verify');}};
  await assert.rejects(handleFinanceSso(Object.assign(Readable.from([JSON.stringify({organization_id:org,domain:'customer.example'})]),{method:'POST'}),{},args),{status:503,code:'sso_dns_unavailable'});
  await assert.rejects(handleFinanceSso(Object.assign(Readable.from([JSON.stringify({organization_id:org,domain:'customer.example'})]),{method:'POST'}),{},{...args,resolveTxt:async()=>({records:[]})}),{status:502,code:'sso_dns_invalid_response'});
} finally {
  globalThis.fetch=savedFetch;
  if(savedUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=savedUrl;
  if(savedKey===undefined)delete process.env.SUPABASE_ANON_KEY;else process.env.SUPABASE_ANON_KEY=savedKey;
}
console.log('Supabase inválido e DNS SSO indisponível falham fechados.');
