// Real loopback-only HTTP/Auth/RLS journey. Synthetic users; no hosted access.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { decodeSessionValue } from '../../lib/session-cookie.mjs';
const APP=process.env.PILOT_APP_URL||'https://localhost:4443',SB=process.env.SUPABASE_URL,DB=process.env.PILOT_DB_URL;
for(const value of [APP,SB,DB])assert(value&&['localhost','127.0.0.1'].includes(new URL(value).hostname),'loopback local fixture only');
const ANON=process.env.SUPABASE_ANON_KEY,SERVICE=process.env.SUPABASE_SERVICE_ROLE_KEY;
const run=randomBytes(4).toString('hex'),password=`A10-${randomBytes(16).toString('hex')}`;
const sql=q=>execFileSync('psql',[DB,'-X','-qAt','-v','ON_ERROR_STOP=1','-c',q],{encoding:'utf8'}).trim();
let checks=0;
async function api(who,method,path,body,expected=200) {
 const response=await fetch(`${APP}/api/${path}`,{method,headers:{Origin:APP,'Content-Type':'application/json',...(who?.cookie?{Cookie:who.cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json();
 const cookie=response.headers.getSetCookie().find(c=>c.startsWith('arandu_session='));if(who&&cookie)who.cookie=cookie.split(';')[0];
 assert.equal(response.status,expected,`${method} ${path}: ${JSON.stringify(data)}`);checks++;return data;
}
const people={};
for(const name of ['buyer','viewer','other','institution']) {
 const email=`a10-${name}-${run}@example.invalid`;
 const response=await fetch(`${SB}/auth/v1/admin/users`,{method:'POST',headers:{apikey:SERVICE,Authorization:`Bearer ${SERVICE}`,'Content-Type':'application/json'},body:JSON.stringify({email,password,email_confirm:true})});
 assert(response.ok,'synthetic user provisioning');const account=await response.json();people[name]={id:account.id};
 sql(`insert into public.fin_pilot_allowlist(pattern,created_by,note) values('${email}','${account.id}','Synthetic loopback Arandu 10 journey')`);
 await api(people[name],'POST','auth/login',{email,password});
}
const buyer=people.buyer,viewer=people.viewer,other=people.other,institution=people.institution;
const org=(await api(buyer,'POST','finance/organizations',{legal_name:`A10 journey ${run}`,kind:'BUYER'},201)).id;
await api(other,'POST','finance/organizations',{legal_name:`A10 other ${run}`,kind:'BUYER'},201);
const institutionOrg=(await api(institution,'POST','finance/organizations',{legal_name:`A10 institution ${run}`,kind:'PROVIDER'},201)).id;
sql(`insert into public.fin_members(organization_id,user_id,role) values('${org}','${viewer.id}','viewer')`);
const rfq=(await api(buyer,'POST','finance/rfqs',{organization_id:org,product:'credit',title:'A10 persistent human analysis',demand:{amount:50000,purpose:'capital_de_giro',term_months:12}},201)).id;
const input={rfq_id:rfq,name:'Scenario A',weights:{term_months:50},request_key:`a10-${run}-create`};
const saved=(await api(buyer,'POST','finance/decision-scenarios',input,201)).scenario;
assert.equal(saved.stale,false);assert.equal(saved.classification,'human_analysis');
const replay=(await api(buyer,'POST','finance/decision-scenarios',input,201)).scenario;assert.equal(replay.id,saved.id);
await api(buyer,'POST','finance/decision-scenarios',{...input,name:'Conflict'},409);
await api(viewer,'GET',`finance/decision-scenarios?rfq_id=${rfq}`);
await api(viewer,'POST','finance/decision-scenarios',{...input,request_key:`a10-${run}-viewer`},403);
await api(other,'GET',`finance/decision-scenarios/detail?id=${saved.id}`,null,404);
await api(institution,'GET',`finance/decision-scenarios/detail?id=${saved.id}`,null,404);
await api(null,'GET',`finance/decision-scenarios?rfq_id=${rfq}`,null,401);
const copy=(await api(buyer,'POST','finance/decision-scenarios/duplicate',{id:saved.id,name:'Scenario B',request_key:`a10-${run}-copy`},201)).scenario;
let page=await api(buyer,'GET',`finance/decision-scenarios?rfq_id=${rfq}&limit=1`);assert(page.page.has_more);const first=page.rows[0].id;
page=await api(buyer,'GET',`finance/decision-scenarios?rfq_id=${rfq}&limit=1&cursor=${page.page.next_cursor}`);assert(!page.page.has_more);assert.notEqual(page.rows[0].id,first);
const edit={id:saved.id,expected_version:1,name:'Concurrent edit',weights:{term_months:60}};
const results=await Promise.all([1,2].map(async()=>{
 const response=await fetch(`${APP}/api/finance/decision-scenarios`,{method:'PATCH',headers:{Origin:APP,'Content-Type':'application/json',Cookie:buyer.cookie},body:JSON.stringify(edit)});return response.status;
}));assert.deepEqual(results.sort(),[200,409]);checks++;
await api(buyer,'POST','finance/decision-scenarios/compare',{rfq_id:rfq,scenario_ids:[saved.id,copy.id]});
sql(`update public.fin_rfqs set title='A10 changed material context',updated_at=clock_timestamp() where id='${rfq}'`);
page=await api(buyer,'GET',`finance/decision-scenarios?rfq_id=${rfq}`);assert(page.rows.every(r=>r.stale));
await api(buyer,'POST','finance/decision-scenarios/compare',{rfq_id:rfq,scenario_ids:[saved.id]},409);
await api(buyer,'PATCH','finance/decision-scenarios',{...edit,expected_version:2,refresh_context:true});
await api(buyer,'POST','finance/decision-scenarios/compare',{rfq_id:rfq,scenario_ids:[saved.id]});
let detail=await api(buyer,'GET',`finance/decision-scenarios/detail?id=${saved.id}`);assert.equal(detail.history.length,3);assert(detail.history.every(h=>h.actor_id===buyer.id));
await api(buyer,'POST','finance/decision-scenarios/archive',{id:saved.id,expected_version:3});
await api(buyer,'POST','finance/decision-scenarios/archive',{id:saved.id,expected_version:3});
const token=decodeSessionValue(decodeURIComponent(buyer.cookie.split('=')[1])).access_token;
const direct=await fetch(`${SB}/rest/v1/fin_decision_scenarios?id=eq.${copy.id}`,{method:'PATCH',headers:{apikey:ANON,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({name:'Direct bypass'})});assert(direct.status>=400);checks++;
for(const section of ['tasks','approvals','demands','contracts']) {
 const work=await api(viewer,'GET',`finance/work-intelligence?organization_id=${org}&section=${section}&limit=1`);assert.equal(work.coverage.total,null);assert.equal(work.page_count,work.rows.length);
}
await api(buyer,'GET',`finance/demand-readiness?rfq_id=${rfq}`);
const provider=(await api(buyer,'POST','finance/providers',{organization_id:org,name:`A10 bank ${run}`,kind:'bank'},201)).id;
const day=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
const contract=(await api(buyer,'POST','finance/contract-import',{organization_id:org,provider_id:provider,product:'credit',title:'A10 renewal source',starts_on:day(-100),ends_on:day(20),renewal_notice_days:30,currency:'BRL',terms:{currency:'BRL'}},201)).id;
const renewal1=await api(buyer,'POST','finance/contract-renewal-rfq',{organization_id:org,contract_id:contract},201);
const renewal2=await api(buyer,'POST','finance/contract-renewal-rfq',{organization_id:org,contract_id:contract},201);assert.equal(renewal1.id,renewal2.id);
const operations=await api(buyer,'GET',`finance/renewal-operations?organization_id=${org}`);const row=operations.rows.find(r=>r.id===contract);assert(row);assert(row.tasks.length);assert(row.renewal_rfqs.some(r=>r.id===renewal1.id));assert.equal(row.actions.automatic_negotiation,false);
await api(viewer,'POST','finance/contract-renewal-rfq',{organization_id:org,contract_id:contract},403);
sql(`update public.fin_contracts set status='expired',owner_id='${other.id}' where id='${contract}'`);
const expiredPortfolio=await api(viewer,'GET',`finance/renewal-operations?organization_id=${org}&urgency=expired&owner=none`);
assert(expiredPortfolio.rows.some(r=>r.id===contract&&r.unassigned&&r.urgency==='expired'));

// Real provider submission/version replacement, stale approval and withdrawal.
const sourcedRfq=(await api(buyer,'POST','finance/rfqs',{organization_id:org,product:'credit',title:'A10 versioned sources',demand:{amount:50000,purpose:'capital_de_giro',term_months:12}},201)).id;
const invite=randomUUID(),proposal=randomUUID(),tokenHash=randomBytes(32).toString('hex');
sql(`update public.fin_rfqs set status='collecting' where id='${sourcedRfq}';
 insert into public.fin_rfq_invites(id,buyer_organization_id,rfq_id,provider_id,provider_organization_id,token_hash,created_by,status,recipient_mode)
 values('${invite}','${org}','${sourcedRfq}','${provider}','${institutionOrg}','${tokenHash}','${buyer.id}','accepted','organization_open');
 insert into public.fin_proposals(id,invite_id,rfq_id,buyer_organization_id,provider_id,provider_organization_id,product)
 values('${proposal}','${invite}','${sourcedRfq}','${org}','${provider}','${institutionOrg}','credit')`);
const terms={institution:'A10 authorized institution',product_name:'Capital de giro',offered_amount:50000,interest_rate_month:1.5,term_months:12};
await api(institution,'POST','finance/proposals',{proposal_id:proposal,terms},201);
const sourceScenario=(await api(buyer,'POST','finance/decision-scenarios',{rfq_id:sourcedRfq,name:'Versioned analysis',weights:{term_months:70},request_key:`a10-${run}-source`},201)).scenario;
assert.equal(sourceScenario.context.sources[0].current_version,1);
const calculated=await api(buyer,'POST','finance/decision-scenarios/compare',{rfq_id:sourcedRfq,scenario_ids:[sourceScenario.id]});
assert.equal(calculated.scenarios[0].weighted.results[0].id,proposal);
await api(institution,'GET',`finance/decision-scenarios/detail?id=${sourceScenario.id}`,null,404);
const approval=(await api(buyer,'POST','finance/approvals/request',{rfq_id:sourcedRfq,proposal_id:proposal,approver_ids:[viewer.id],rationale:'Human review of exact proposal version'},201)).id;
let inbox=await api(viewer,'GET',`finance/approvals?organization_id=${org}&rfq_id=${sourcedRfq}`);
assert.equal(inbox.rows[0].stale,false);assert.equal(inbox.rows[0].viewer_can_act,true);
await api(institution,'POST','finance/proposals',{proposal_id:proposal,terms:{...terms,interest_rate_month:1.7}},201);
inbox=await api(viewer,'GET',`finance/approvals?organization_id=${org}&rfq_id=${sourcedRfq}`);
assert(inbox.rows[0].stale_reasons.includes('proposal_changed'));assert.equal(inbox.rows[0].viewer_can_act,false);
await api(viewer,'POST','finance/approvals/act',{request_id:approval,action:'approved'},409);
await api(buyer,'POST','finance/decision-scenarios/compare',{rfq_id:sourcedRfq,scenario_ids:[sourceScenario.id]},409);
await api(institution,'DELETE','finance/proposals',{proposal_id:proposal});
inbox=await api(viewer,'GET',`finance/approvals?organization_id=${org}&rfq_id=${sourcedRfq}`);
assert(inbox.rows[0].stale_reasons.includes('source_ineligible'));
console.log(`Arandu 10 real local HTTP/Auth/RLS: ${checks} checks PASS; CRUD, replay, concurrent edit, tenant/provider/viewer/anonymous isolation, direct-write denial, stale refresh, audit, work pages, canonical renewal recovery.`);
