import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {tokenHash,workspacePassword,BASELINE_VERSION} from '../lib/finance/demo-workspaces.mjs';
import {encodeSessionValue} from '../lib/session-cookie.mjs';
import {demoWorkspaceFixture} from './fixtures/demo-workspace.mjs';
process.env.SUPABASE_URL='https://localhost:8443';
process.env.SUPABASE_ANON_KEY='fixture-public';
process.env.SUPABASE_SERVICE_ROLE_KEY='fixture-service';
process.env.ARANDU_DEMO_PASSWORD='Fixture-password-123';
delete process.env.VERCEL_ENV;
const {default:handler}=await import('../api/[...path].js');

// Banco simulado: um pool de workspaces com o mesmo contrato das funções SQL
// (fin_demo_workspace_claim/resume/active); o servidor nunca escolhe pelo navegador.
const WS_A='00000000-0000-4000-8000-00000000aaa1', WS_B='00000000-0000-4000-8000-00000000bbb1';
const fixture=(index,slug,id)=>({...demoWorkspaceFixture(index,{slug}),id});
let sessionUser='',marker='demo',calls=[],pool=[],claimed={},logins=[],logouts=0,loginUserIdOverride=null;
function resetPool(){pool=[fixture(1,'aaaaaaaaaa',WS_A),fixture(2,'bbbbbbbbbb',WS_B)];claimed={};}
resetPool();
const future=()=>new Date(Date.now()+86_400_000).toISOString();
globalThis.fetch=async(url,init={})=>{
 const u=String(url);calls.push({url:u,init});
 if(u.includes('/fin_settings?'))return new Response(JSON.stringify([{value:marker}]));
 if(u.endsWith('/rpc/fin_demo_workspace_claim')){
  const b=JSON.parse(init.body);assert.match(b.p_token_hash,/^[a-f0-9]{64}$/);assert.ok(b.p_max_active>0&&b.p_idle_minutes<=b.p_lifetime_minutes);
  const w=pool.shift();if(!w)return new Response('[]');
  claimed[w.id]={baseline_version:BASELINE_VERSION,...w,status:'claimed',claim_token_hash:b.p_token_hash,expires_at:future(),idle_expires_at:future()};return new Response(JSON.stringify([claimed[w.id]]));
 }
 if(u.endsWith('/rpc/fin_demo_workspace_resume')){
  const b=JSON.parse(init.body);const w=claimed[b.p_id];
  return new Response(JSON.stringify(w&&w.claim_token_hash===b.p_token_hash?[w]:[]));
 }
 if(u.endsWith('/rpc/fin_demo_workspace_active'))return new Response(JSON.stringify(Object.values(claimed).some(w=>w.slug===JSON.parse(init.body).p_slug)));
 if(u.includes('/auth/v1/logout')){logouts+=1;return new Response('{}');}
 if(u.endsWith('/auth/v1/user'))return new Response(JSON.stringify({id:'fixture',email:sessionUser}));
 if(u.includes('/token?')){
  const b=JSON.parse(init.body);logins.push(b.email);
  assert.match(b.email,/\+ws-[a-f0-9]{10}@/,'login de visitante nunca usa conta do baseline');
  assert.equal(b.password,workspacePassword(process.env.ARANDU_DEMO_PASSWORD,b.email),'senha derivada no servidor');
  const workspace=Object.values(claimed).find(w=>Object.values(w.personas).includes(b.email));
  const id=workspace.user_ids[Object.values(workspace.personas).indexOf(b.email)];
  return new Response(JSON.stringify({access_token:`access-${logins.length}`,refresh_token:'test-refresh',user:{id:loginUserIdOverride||id,email:b.email}}));
 }
 throw new Error(`Unexpected upstream request ${u}`);
};
async function call(method,action,body,cookie='',ip='127.0.0.1'){
 const req=Object.assign(Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]),{method,url:`/api/auth/${action}`,headers:{origin:'https://localhost:4443',host:'localhost:4443',...(cookie?{cookie}:{})},socket:{remoteAddress:ip}});
 const res={headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;},end(b){this.body=JSON.parse(b);}};
 await handler(req,res);return res;
}
const cookies=(res)=>[].concat(res.headers['set-cookie']||[]);
const wsCookie=(res)=>cookies(res).find(c=>c.startsWith('arandu_demo_ws='))?.split(';')[0];
const sessionCookieOf=(res)=>cookies(res).find(c=>c.startsWith('arandu_session='))?.split(';')[0];

// 1. Fora da Demo canônica, nada responde nem consulta upstream.
for(const env of ['production','pilot','','unknown']){
 process.env.ARANDU_ENV=env;const before=calls.length;
 assert.equal((await call('GET','demo-personas')).statusCode,404);
 assert.equal((await call('POST','demo-login',{persona:'juliana'})).statusCode,404);
 assert.equal(calls.length,before);
}
process.env.ARANDU_ENV='demo';marker='pilot';assert.equal((await call('GET','demo-personas')).statusCode,404);
marker='demo';const listing=await call('GET','demo-personas');assert.equal(listing.statusCode,200);assert.equal(listing.body.personas.length,9);
assert.ok(!JSON.stringify(listing.body).includes(process.env.ARANDU_DEMO_PASSWORD));
assert.equal((await call('POST','demo-login',{persona:'arbitrary@example.com',email:'real@example.com'})).statusCode,400);

// 2. Visitante A recebe um workspace; o corpo forjado não escolhe conta nem papel.
const a1=await call('POST','demo-login',{persona:'juliana',email:'real@example.com',password:'forged',workspace:WS_B,role:'admin'});
assert.equal(a1.statusCode,200);assert.equal(logins.at(-1),'juliana.ramos+ws-aaaaaaaaaa@vittafoods.example');
for(const c of cookies(a1))assert.match(c,/HttpOnly; SameSite=Lax; Secure/);
const cookieA=wsCookie(a1);assert.match(cookieA,new RegExp(`^arandu_demo_ws=${WS_A}\\.`));
assert.ok(!JSON.stringify(a1.body).includes('access-')&&!JSON.stringify(a1.body).includes(cookieA.split('.')[1]),'token e sessão só em cookie HttpOnly');
assert.ok(!JSON.stringify(claimed).includes(cookieA.split('.')[1]),'banco guarda só o hash do token');
assert.equal(claimed[WS_A].claim_token_hash,tokenHash(cookieA.split('.')[1]));

// 3. Troca de persona no MESMO workspace, encerrando a sessão anterior.
const before=logouts;
const a2=await call('POST','demo-login',{persona:'helena'},`${cookieA}; ${sessionCookieOf(a1)}`);
assert.equal(a2.statusCode,200);assert.equal(logins.at(-1),'helena.duarte+ws-aaaaaaaaaa@vittafoods.example');assert.equal(logouts,before+1);
const a3=await call('POST','demo-login',{persona:'lumina'},cookieA);
assert.equal(logins.at(-1),'diego.freitas+ws-aaaaaaaaaa@luminapay.example');assert.equal(pool.length,1,'troca de persona não consome workspace');

// 4. Visitante B é outro workspace; token adulterado/ID manipulado não abre o de A.
const forged=`arandu_demo_ws=${WS_A}.${'x'.repeat(43)}`;
const b1=await call('POST','demo-login',{persona:'juliana'},forged,'10.0.0.2');
assert.equal(b1.statusCode,200);assert.equal(logins.at(-1),'juliana.ramos+ws-bbbbbbbbbb@vittafoods.example');
assert.equal((await call('POST','demo-login',{persona:'juliana'},'arandu_demo_ws=not-a-cookie','10.0.0.3')).statusCode,503,'cookie inválido nunca vira acesso; pool vazio responde capacidade');

// 5. Pool vazio: 503 claro, sem login.
resetPool();pool=[];const n=logins.length;
const full=await call('POST','demo-login',{persona:'juliana'},'','10.0.0.4');assert.equal(full.statusCode,503);assert.equal(full.body.code,'demo_capacity');assert.equal(logins.length,n);

// 6. Mapa de personas que aponta para outro workspace é recusado.
resetPool();pool=[{id:WS_A,slug:'aaaaaaaaaa',personas:{juliana:'juliana.ramos+ws-bbbbbbbbbb@vittafoods.example'}}];
const bad=await call('POST','demo-login',{persona:'juliana'},'','10.0.0.5');assert.equal(bad.statusCode,503);assert.equal(logins.length,n);
// Same slug is insufficient: a corrupted map must not switch a requested role/person.
resetPool();pool=[{id:WS_A,slug:'aaaaaaaaaa',personas:{juliana:'helena.duarte+ws-aaaaaaaaaa@vittafoods.example'}}];
assert.equal((await call('POST','demo-login',{persona:'juliana'},'','10.0.0.6')).statusCode,503);assert.equal(logins.length,n);
resetPool();pool[0].baseline_version='obsolete';
assert.equal((await call('POST','demo-login',{persona:'juliana'},'','10.0.0.7')).statusCode,503);assert.equal(logins.length,n);

// 7. Reivindicação limitada por origem: a quinta na mesma hora recebe 429, sem tocar o pool.
resetPool();for(let i=0;i<10;i+=1)pool.push(fixture(i+3,`cccccccc${String(i).padStart(2,'0')}`,`00000000-0000-4000-8000-0000000000${String(i).padStart(2,'0')}`));
const statuses=[];for(let i=0;i<5;i+=1)statuses.push((await call('POST','demo-login',{persona:'juliana'},'','10.0.0.9')).statusCode);
assert.deepEqual(statuses,[200,200,200,200,429]);
// Restored/misprovisioned Auth account with a different UUID must not receive a session.
resetPool();loginUserIdOverride='00000000-0000-4000-8000-000000009999';
const wrongAuth=await call('POST','demo-login',{persona:'juliana'},'','10.0.0.10');
assert.equal(wrongAuth.statusCode,503);assert.equal(wrongAuth.body.code,'demo_workspace_incomplete');
assert.equal(sessionCookieOf(wrongAuth),undefined);loginUserIdOverride=null;
resetPool();pool[0].user_ids=[];const beforeIncomplete=logins.length;
assert.equal((await call('POST','demo-login',{persona:'juliana'},'','10.0.0.11')).statusCode,503);
assert.equal(logins.length,beforeIncomplete,'incomplete workspace must fail before Auth');

// 8. Sessão de conta de workspace só vale com o workspace ativo; JWT válido não basta.
const session=(token)=>`arandu_session=${encodeURIComponent(encodeSessionValue({access_token:token,refresh_token:'',expires_at:Math.floor(Date.now()/1000)+3600}))}`;
claimed={x:{id:'x',slug:'eeeeeeeeee',status:'claimed'}};
sessionUser='juliana.ramos+ws-eeeeeeeeee@vittafoods.example';
const live=await call('GET','session',null,session('t-live'));assert.equal(live.body.authenticated,true);
sessionUser='juliana.ramos+ws-ffffffffff@vittafoods.example';
const dead=await call('GET','session',null,session('t-dead'));assert.equal(dead.body.authenticated,false,'workspace vencido/limpo derruba a sessão');
assert.ok(cookies(dead).some(c=>c.startsWith('arandu_session=;')),'cookie de sessão apagado');
sessionUser='cliente@empresa-real.example';
assert.equal((await call('GET','session',null,session('t-real'))).body.authenticated,true,'conta fora de workspace não é afetada');
process.env.ARANDU_ENV='production';sessionUser='juliana.ramos+ws-eeeeeeeeee@vittafoods.example';
assert.equal((await call('GET','session',null,session('t-prod'))).body.authenticated,false,'conta de workspace nunca opera fora da Demo');
process.env.ARANDU_ENV='demo';
process.env.ARANDU_DEPLOYMENT_KIND='demo';assert.equal((await call('GET','demo-personas')).statusCode,404);delete process.env.ARANDU_DEPLOYMENT_KIND;
console.log('Demo personas: nove chaves fixas, workspace por visitante (reivindicação, retomada por hash, troca de persona no mesmo workspace com logout), token adulterado recusado, pool vazio 503, mapa cruzado recusado, senha derivada só no servidor e cookies seguros e sessão derrubada com workspace inativo (ou fora da Demo) aprovados.');
