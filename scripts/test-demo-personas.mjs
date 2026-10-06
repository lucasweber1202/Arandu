import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
process.env.SUPABASE_URL='https://localhost:8443';
process.env.SUPABASE_ANON_KEY='fixture-public';
process.env.SUPABASE_SERVICE_ROLE_KEY='fixture-service';
process.env.ARANDU_DEMO_PASSWORD='Fixture-password-123';
delete process.env.VERCEL_ENV;
const {default:handler}=await import('../api/[...path].js');
let marker='demo',calls=[];
globalThis.fetch=async(url,init={})=>{
 calls.push({url:String(url),init});
 if(String(url).includes('/fin_settings?'))return new Response(JSON.stringify([{value:marker}]));
 if(String(url).includes('/token?')){const b=JSON.parse(init.body);assert.equal(b.email,'juliana.ramos@vittafoods.example');return new Response(JSON.stringify({access_token:'test-access',refresh_token:'test-refresh',user:{id:'fixture',email:b.email}}));}
 throw new Error('Unexpected upstream request');
};
async function call(method,action,body){
 const req=Object.assign(Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]),{method,url:`/api/auth/${action}`,headers:{origin:'https://localhost:4443',host:'localhost:4443'},socket:{remoteAddress:'127.0.0.1'}});
 const res={headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;},end(b){this.body=JSON.parse(b);}};
 await handler(req,res);return res;
}
for(const env of ['production','pilot','', 'unknown']){
 process.env.ARANDU_ENV=env;const before=calls.length;
 assert.equal((await call('GET','demo-personas')).statusCode,404);
 assert.equal((await call('POST','demo-login',{persona:'juliana'})).statusCode,404);
 assert.equal(calls.length,before);
}
process.env.ARANDU_ENV='demo';marker='pilot';assert.equal((await call('GET','demo-personas')).statusCode,404);
marker='demo';const listing=await call('GET','demo-personas');assert.equal(listing.statusCode,200);assert.equal(listing.body.personas.length,9);
assert.ok(!JSON.stringify(listing.body).includes(process.env.ARANDU_DEMO_PASSWORD));
assert.equal((await call('POST','demo-login',{persona:'arbitrary@example.com',email:'real@example.com'})).statusCode,400);
const login=await call('POST','demo-login',{persona:'juliana',email:'real@example.com',password:'forged'});
assert.equal(login.statusCode,200);assert.match(login.headers['set-cookie'],/HttpOnly; SameSite=Lax; Secure/);
assert.ok(!JSON.stringify(login.body).includes('test-access'));
process.env.ARANDU_DEPLOYMENT_KIND='demo';assert.equal((await call('GET','demo-personas')).statusCode,404);
console.log('Demo personas: nine fixed identities, four disabled runtimes, marker refusal, arbitrary identity rejection, server-only password and secure session cookie passed.');
