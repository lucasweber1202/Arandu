import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
process.env.SUPABASE_URL='https://arandu-platform-test.supabase.co';process.env.SUPABASE_ANON_KEY='anon-platform-test';process.env.SUPABASE_SERVICE_ROLE_KEY='service-platform-test';process.env.ARANDU_ADMIN_TOKEN='admin-platform-test';delete process.env.VERCEL_ENV;delete process.env.ARANDU_DISTRIBUTED_RATE_LIMIT;
const {default:handler}=await import(`../api/[...path].js?platform-test=${Date.now()}`);
function req(method,url,body,headers={}){const chunks=body===undefined?[]:[Buffer.from(JSON.stringify(body))];const request=Readable.from(chunks);request.method=method;request.url=url;request.headers=Object.fromEntries(Object.entries(headers).map(([key,value])=>[key.toLowerCase(),value]));request.socket={remoteAddress:'127.0.0.9'};return request;}
function res(){return{statusCode:0,headers:{},body:'',setHeader(name,value){this.headers[String(name).toLowerCase()]=value;},end(value=''){this.body=String(value);}};}
async function call(active,method,url,body,headers){const response=res();await active(req(method,url,body,headers),response);return{status:response.statusCode,body:response.body?JSON.parse(response.body):null,headers:response.headers};}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});const originalFetch=global.fetch;
try{
  const keys=[];global.fetch=async(url,options={})=>{keys.push(options.headers?.apikey);const value=String(url);if(value.includes('v_catalog_readiness'))return json([{verified_ready:true,dataset_version:'real-v2'}]);if(value.includes('v_public_catalog'))return json([{id:'obra-real'}]);throw new Error(`URL inesperada: ${value}`);};
  const catalog=await call(handler,'GET','/api/catalog');assert.equal(catalog.status,200);assert.deepEqual(keys,['anon-platform-test','anon-platform-test']);
  global.fetch=async(url)=>{assert.match(String(url),/\/auth\/v1\/recover/);return json({});};
  const reset=await call(handler,'POST','/api/auth/reset-password',{email:'pessoa@example.com'});assert.equal(reset.status,202);assert.match(reset.body.message,/existir uma conta/);
  global.fetch=async()=>{throw new Error('Rotas negadas não devem consultar o banco.');};
  assert.equal((await call(handler,'GET','/api/privacy/export')).status,401);
  assert.equal((await call(handler,'GET','/api/catalog-review')).status,401);
  const noConsent=await call(handler,'POST','/api/conversion-events',{anonymousId:'d9428888-122b-11e1-b85c-61cd3cbb3210',eventType:'search',consentVersion:'antiga'});assert.equal(noConsent.status,403);assert.equal(noConsent.body.code,'analytics_consent_required');

  process.env.VERCEL_ENV='preview';
  const {default:distributedHandler}=await import(`../api/[...path].js?distributed-test=${Date.now()}`);
  global.fetch=async(url)=>{assert.match(String(url),/rpc\/consume_rate_limit/);return json(false);};
  const limited=await call(distributedHandler,'POST','/api/auth/reset-password',{email:'pessoa@example.com'});assert.equal(limited.status,429);
  console.log('Arandu Platform API Contract Tests');console.log('6 cenários aprovados.');
}finally{global.fetch=originalFetch;delete process.env.VERCEL_ENV;}
