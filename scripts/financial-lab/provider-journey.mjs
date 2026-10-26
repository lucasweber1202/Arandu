// Optional composition gate: requires the provider-intent PR in the checkout.
// Real GoTrue sessions -> Arandu API -> PostgREST -> PostgreSQL/RLS.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const APP=process.env.PILOT_APP_URL,SB=process.env.SUPABASE_URL,DB=process.env.PILOT_DB_URL;
for(const raw of [APP,SB])if(new URL(raw).hostname!=='localhost')throw Error('Exclusive local lab only');
if(new URL(DB).hostname!=='db')throw Error('Exclusive Docker DB only');
const password=`Local-${crypto.randomBytes(16).toString('hex')}Aa1`,checks=[];
const must=(v,label)=>{if(!v)throw Error(label);checks.push(label);};
const sql=q=>{const r=spawnSync('psql',[DB,'-X','-qAt','-v','ON_ERROR_STOP=1','-c',q],{encoding:'utf8'});if(r.status!==0)throw Error('Local fixture/observation SQL failed');return r.stdout.trim();};
const api=async(who,method,resource,body)=>{
 const r=await fetch(`${APP}/api/${resource}`,{method,headers:{Origin:APP,'Content-Type':'application/json',...(who.cookie?{Cookie:who.cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const cookies=r.headers.getSetCookie?.()||[];const cookie=cookies.find(x=>x.startsWith('arandu_session='));if(cookie)who.cookie=cookie.split(';')[0];
 return {status:r.status,data:await r.json()};
};
const people={};
for(const name of ['buyer','manager','analyst','viewer','provider','other','revoked']){
 const email=`${name}-${crypto.randomBytes(4).toString('hex')}@receipt-lab.example`;
 const r=await fetch(`${SB}/auth/v1/admin/users`,{method:'POST',headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({email,password,email_confirm:true})});
 const user=await r.json();must(r.ok&&user.id,'Synthetic Auth account created');people[name]={id:user.id,email};
 const login=await api(people[name],'POST','auth/login',{email,password});must(login.status===200&&people[name].cookie,'Real login cookie issued');
}
sql("insert into public.fin_pilot_allowlist(pattern,created_by,note)values('@receipt-lab.example','"+people.buyer.id+"','Exclusive synthetic receipt test')");
const orgs={};
for(const name of ['buyer','other','provider']){
 const r=await api(people[name],'POST','finance/organizations',{legal_name:`Synthetic receipt ${name}`,kind:name==='provider'?'PROVIDER':'BUYER'});must(r.status===201&&r.data.id,'Organization created through real API');orgs[name]=r.data.id;
}
for(const [name,role] of [['manager','finance_manager'],['analyst','analyst'],['viewer','viewer'],['revoked','admin']])sql(`insert into public.fin_members(organization_id,user_id,role)values('${orgs.buyer}','${people[name].id}','${role}')`);
const key=crypto.randomUUID(),input={organization_id:orgs.buyer,name:'Synthetic identical name',kind:'bank',request_key:key};
const first=await api(people.buyer,'POST','finance/providers',input);must(first.status===201&&first.data.state==='confirmed'&&first.data.id,'Creation confirmed by persistent intent API');
const id=first.data.id;
// Forget the create response; the receipt must identify the same committed row.
const receipt=await api(people.buyer,'GET',`finance/provider-creation-result?organization_id=${orgs.buyer}&request_key=${key}`);
must(receipt.status===200&&receipt.data.state==='confirmed'&&receipt.data.id===id,'Receipt recovers a discarded create response');
const retries=await Promise.all(Array.from({length:4},()=>api(people.buyer,'POST','finance/providers',input)));
must(retries.every(r=>r.status===200&&r.data.replayed&&r.data.id===id),'Concurrent real HTTP retries return one identity');
must(sql(`select count(*) from public.fin_providers where organization_id='${orgs.buyer}' and creation_request_key='${key}'`)==='1','One persisted counterparty');
must(sql(`select count(*) from public.fin_events where entity_id='${id}' and event_type='provider_created'`)==='1','One creation audit event');
const changed=await api(people.buyer,'POST','finance/providers',{...input,name:'Changed material'});must(changed.status===409&&changed.data.code==='provider_creation_conflict','Changed material conflicts safely');
const homonym=await api(people.buyer,'POST','finance/providers',{...input,request_key:crypto.randomUUID()});must(homonym.status===201&&homonym.data.id!==id,'Distinct intentions never merge by name');
must(first.data.row.provider_organization_id===null&&first.data.row.verification_state==='NAO_VERIFICADO','Counterparty does not become authenticated institution');
for(const name of ['analyst','viewer','provider','other']){
 const denied=await api(people[name],'POST','finance/providers',{...input,request_key:crypto.randomUUID()});must(denied.status===403,`${name} cannot create in buyer scope`);
}
const sameActorKey=await api(people.manager,'GET',`finance/provider-creation-result?organization_id=${orgs.buyer}&request_key=${key}`);
must(sameActorKey.status===200&&sameActorKey.data.state==='unconfirmed'&&sameActorKey.data.id===null,'Another authorized actor cannot enumerate receipt');
for(const name of ['other','provider']){
 const denied=await api(people[name],'GET',`finance/provider-creation-result?organization_id=${orgs.buyer}&request_key=${key}`);must(denied.status===403,`${name} cannot read buyer receipt`);
}
const revokedInput={...input,request_key:crypto.randomUUID()};
const created=await api(people.revoked,'POST','finance/providers',revokedInput);must(created.status===201,'Authorized actor can create before revocation');
sql(`delete from public.fin_members where organization_id='${orgs.buyer}' and user_id='${people.revoked.id}'`);
const revoked=await api(people.revoked,'GET',`finance/provider-creation-result?organization_id=${orgs.buyer}&request_key=${revokedInput.request_key}`);must(revoked.status===403,'Revoked actor denied despite valid GoTrue session');
const malformed=await api(people.buyer,'POST','finance/providers',{...input,request_key:'bad'});must(malformed.status===400,'Malformed intent rejected before database write');
const report=`# Real provider receipt composition\n\n${checks.length} checks PASS. Real Auth, HTTP API, PostgreSQL and RLS. Storage/browser/hosted NOT_RUN in this focused gate.\n\n${[...new Set(checks)].map(x=>'- '+x).join('\n')}\n`;
fs.writeFileSync(process.env.PILOT_REPORT,report,{mode:0o644});console.log(`${checks.length} real provider receipt checks PASS`);
