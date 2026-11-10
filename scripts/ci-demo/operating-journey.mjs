import { supabaseApiKeyHeaders } from '../../lib/supabase-api-headers.mjs';
// Six independent synthetic actors; all business writes use the real Arandu
// API and user sessions. Service access only creates Auth fixtures/allowlist.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { assertLocalEnv } from './assert-local.mjs';
import { assertDemoTarget } from '../../lib/finance/demo-guard.mjs';
import { encodeSessionValue } from '../../lib/session-cookie.mjs';
import { demoPdf } from '../demo/pdf.mjs';

assertLocalEnv(process.env,'operating-backend-journey');
const config=assertDemoTarget(process.env),APP=config.appUrl,SB=config.supabaseUrl;
if(config.target.kind!=='local'||process.argv.length!==2)throw Error('local_demo_required');
const started=performance.now(),suffix=crypto.randomBytes(5).toString('hex'),password='Operating-'+crypto.randomBytes(20).toString('base64url');
const people=Object.fromEntries(['admin','manager','analyst','viewer','provider','outsider'].map(role=>[role,{role,email:`${role}.${suffix}@operating-v8.example`}])) ;
const stages=[],requests=[];let current='preconditions';
const day=offset=>new Date(Date.now()+offset*86400000).toISOString().slice(0,10);
const must=(ok,code)=>{if(!ok)throw Error(code);};
async function stage(name,run) {
 current=name;const start=performance.now();
 try {await run();stages.push({name,result:'PASS',duration_ms:performance.now()-start});console.log(`OPERATING_JOURNEY_STAGE ${name} PASS`);}
 catch(error){stages.push({name,result:'FAIL',duration_ms:performance.now()-start});throw error;}
}
async function service(resource,body,{auth=false,method='POST',prefer}={}) {
 const response=await fetch(`${SB}/${auth?'auth/v1/':'rest/v1/'}${resource}`,{method,headers:{...supabaseApiKeyHeaders(config.serviceKey),'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});
 const text=await response.text();must(response.ok,'fixture_setup_failed');return text?JSON.parse(text):null;
}
async function call(who,method,resource,body,{expected=[200,201]}={}) {
 const began=performance.now(),response=await fetch(`${APP}/api/finance/${resource}`,{method,headers:{Origin:APP,'Content-Type':'application/json',Cookie:who.cookie},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});
 const data=await response.json();requests.push({stage:current,actor:who.role,method,resource:resource.split('?')[0],status:response.status,duration_ms:performance.now()-began});
 must(expected.includes(response.status),'unexpected_http_status');return data;
}
const get=(who,resource)=>call(who,'GET',resource);
const post=(who,resource,body)=>call(who,'POST',resource,body);
const ctx={};
let failed=false;
try {
 await stage('real_auth_and_operator_fixture',async()=>{
  for(const person of Object.values(people)) {
   const user=await service('admin/users',{email:person.email,password,email_confirm:true,user_metadata:{demo:true}},{auth:true});person.id=user.id;
   const response=await fetch(`${SB}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:config.anonKey,'Content-Type':'application/json'},body:JSON.stringify({email:person.email,password}),signal:AbortSignal.timeout(15000)});
   const session=await response.json();must(response.ok&&session.access_token,'real_auth_login_failed');person.accessToken=session.access_token;
   person.cookie=`arandu_session=${encodeURIComponent(encodeSessionValue({access_token:session.access_token,refresh_token:session.refresh_token,expires_at:Math.floor(Date.now()/1000)+3000}))}`;
  }
  await service('fin_pilot_allowlist?on_conflict=pattern',{pattern:'@operating-v8.example',created_by:people.admin.id,note:'Isolated operating journey synthetic fixtures'},{prefer:'resolution=ignore-duplicates,return=minimal'});
 });
 await stage('authorized_organization_members_and_entities',async()=>{
  ctx.org=(await post(people.admin,'organizations',{legal_name:`Operating buyer DEMO ${suffix}`,kind:'BUYER',country:'BR'})).id;
  ctx.other=(await post(people.outsider,'organizations',{legal_name:`Operating outsider DEMO ${suffix}`,kind:'BUYER',country:'BR'})).id;
  ctx.providerOrg=(await post(people.provider,'organizations',{legal_name:`Operating provider DEMO ${suffix}`,kind:'PROVIDER',country:'BR'})).id;
  for(const [role,kind] of [['manager','finance_manager'],['analyst','analyst'],['viewer','viewer']]) {
   const invite=await post(people.admin,'members/invite',{organization_id:ctx.org,email:people[role].email,role:kind});
   await post(people[role],'members/accept',{token:invite.invitationToken});
  }
  ctx.a=(await post(people.admin,'entities',{organization_id:ctx.org,kind:'legal_entity',legal_name:'Operating A DEMO',country:'BR',currency:'BRL'})).id;
  ctx.b=(await post(people.admin,'entities',{organization_id:ctx.org,kind:'legal_entity',legal_name:'Operating B DEMO',country:'US',currency:'USD'})).id;
  ctx.bank=(await post(people.admin,'providers',{organization_id:ctx.org,name:'Operating institution DEMO',kind:'bank',products:['credit']})).row.id;
 });
 await stage('contract_intent_context_and_real_storage',async()=>{
  ctx.intent=crypto.randomUUID();
  const input={organization_id:ctx.org,legal_entity_id:ctx.a,provider_id:ctx.bank,product:'credit',title:'Operating BRL contract DEMO',starts_on:day(-30),ends_on:day(300),renewal_notice_days:60,currency:'BRL',terms:{},request_key:ctx.intent,owner_id:people.manager.id};
  const created=await post(people.admin,'contract-import',input);ctx.contract=created.id;
  const replay=await post(people.admin,'contract-import',input);must(replay.id===ctx.contract&&replay.replayed===true,'contract_intent_replay_failed');
  const receipt=await get(people.admin,`contract-import-result?organization_id=${ctx.org}&legal_entity_id=${ctx.a}&request_key=${ctx.intent}`);must(receipt.id===ctx.contract,'contract_receipt_not_recoverable');
  ctx.contractB=(await post(people.admin,'contract-import',{...input,request_key:crypto.randomUUID(),legal_entity_id:ctx.b,currency:'USD',title:'Operating USD contract DEMO'})).id;
  const bytes=demoPdf({title:'Operating evidence DEMO',organization:'Synthetic operating buyer',body:'Documento sintético de teste. Nenhuma operação financeira real.'});
  ctx.hash=crypto.createHash('sha256').update(bytes).digest('hex');
  const slot=await post(people.admin,'private-documents/upload',{organization_id:ctx.org,entity_type:'contract',entity_id:ctx.contract,title:'Operating evidence DEMO',visibility:'internal',mime_type:'application/pdf',size:bytes.length,sha256:ctx.hash});ctx.document=slot.document_id;
  const upload=await fetch(slot.upload_url,{method:'PUT',headers:{'Content-Type':'application/pdf'},body:bytes,signal:AbortSignal.timeout(15000)});await upload.arrayBuffer();must(upload.ok,'real_storage_upload_failed');
  await post(people.admin,'private-documents/complete',{document_id:ctx.document,version:slot.version});
  const detail=await get(people.manager,'contract-detail?id='+ctx.contract);must(detail.contract.id===ctx.contract&&detail.owner_context.eligible_in_membership===true,'contract_context_failed');
  const docs=await get(people.manager,`contract-detail?id=${ctx.contract}&section=documents&limit=1`);must(docs.rows.some(row=>row.id===ctx.document&&row.current?.version===1),'contract_evidence_projection_failed');
  const history=await get(people.manager,`private-documents/versions?organization_id=${ctx.org}&document_id=${ctx.document}&limit=1`);must(history.rows[0]?.status==='available','document_version_page_failed');
  const grant=await post(people.manager,'private-documents/download',{document_id:ctx.document,version:1});
  const download=await fetch(grant.url,{signal:AbortSignal.timeout(15000)});const downloaded=Buffer.from(await download.arrayBuffer());must(download.ok&&crypto.createHash('sha256').update(downloaded).digest('hex')===ctx.hash,'real_storage_download_content_failed');
 });
 await stage('portfolio_scope_currency_and_drilldown',async()=>{
  ctx.facility=(await post(people.admin,'facilities',{organization_id:ctx.org,legal_entity_id:ctx.a,provider_id:ctx.bank,contract_id:ctx.contract,kind:'revolving_credit',name:'Operating BRL facility DEMO',currency:'BRL',approved_limit:10000,source:'declared'})).id;
  await post(people.admin,'facilities',{organization_id:ctx.org,legal_entity_id:ctx.b,provider_id:ctx.bank,contract_id:ctx.contractB,kind:'term_loan',name:'Operating USD facility DEMO',currency:'USD',approved_limit:50000,source:'declared'});
  await post(people.admin,'facility-balances',{facility_id:ctx.facility,as_of:day(0),outstanding_amount:2000,used_limit_amount:1000,source:'declared',source_reference:'Operating source DEMO'});
  await post(people.admin,'facility-schedule',{facility_id:ctx.facility,expected_version:0,items:[{due_on:day(60),principal_amount:777}]});
  await post(people.admin,'facility-schedule',{facility_id:ctx.facility,expected_version:1,items:Array.from({length:221},(_,i)=>({due_on:day(i+1),principal_amount:10}))});
  const aggregate=await get(people.manager,`portfolio/context?organization_id=${ctx.org}&provider_id=${ctx.bank}`);
  must(aggregate.coverage.complete&&aggregate.views.currencies.length===2,'portfolio_scope_incomplete');
  must(aggregate.coverage.current_repayments===221&&aggregate.views.currencies.find(row=>row.currency==='BRL')?.maturity_wall.reduce((sum,row)=>sum+row.scheduled,0)===2210,'current_schedule_composite_pagination_failed');
  must(aggregate.views.currencies.find(r=>r.currency==='BRL')?.outstanding===2000&&aggregate.views.currencies.find(r=>r.currency==='USD')?.outstanding_unknown===1&&aggregate.views.currencies.find(r=>r.currency==='USD')?.outstanding===null,'currency_or_unknown_balance_changed');
  const drill=await get(people.manager,aggregate.drilldowns.facilities.find(r=>r.currency==='BRL').endpoint);must(drill.rows.length===1&&drill.rows[0].id===ctx.facility&&Number(drill.rows[0].latest_balance.outstanding_amount)===2000,'portfolio_drilldown_diverged');
  const first=await get(people.manager,`portfolio/context?organization_id=${ctx.org}&section=facilities&limit=1`);must(first.page.has_more,'portfolio_pagination_not_exercised');
  const second=await get(people.manager,`portfolio/context?organization_id=${ctx.org}&section=facilities&limit=1&cursor=${first.page.next_cursor}`);must(second.rows[0].id!==first.rows[0].id,'portfolio_page_duplicated');
  await call(people.manager,'GET',`portfolio/context?organization_id=${ctx.org}&section=facilities&currency=USD&cursor=${first.page.next_cursor}`,undefined,{expected:[400]});
 });
 await stage('obligation_evidence_review_and_work',async()=>{
  ctx.obligation=(await post(people.admin,'covenants/open',{contract_id:ctx.contract,title:'Operating covenant DEMO',kind:'financial_covenant',source_clause:'Cláusula sintética 1',source_reference:'Operating contract DEMO',owner_id:people.analyst.id,frequency:'once',first_period_start:day(-30),first_period_end:day(-1),first_due_on:day(10),metric:'leverage',operator:'le',threshold:3,unit:'ratio'})).id;
  const periods=await get(people.analyst,`covenants?format=records&organization_id=${ctx.org}&contract_id=${ctx.contract}`);ctx.period=periods.rows.find(row=>row.obligation_id===ctx.obligation)?.id;must(ctx.period,'obligation_not_linked_to_contract');
  must(periods.rows.every(row=>!['compliant','non_compliant'].includes(row.facts.status)),'missing_evidence_concluded');
  const measurement=(await post(people.analyst,'covenants/data',{period_id:ctx.period,measured_value:2,measured_on:day(0),source_reference:'Operating measured source',provenance:'Apuração sintética com documento privado autorizado',document_id:ctx.document})).id;
  await call(people.analyst,'POST','covenants/review',{period_id:ctx.period,status:'compliant',reason:'Papel não autorizado',measurement_id:measurement},{expected:[403]});
  await post(people.manager,'covenants/review',{period_id:ctx.period,status:'compliant',reason:'Revisão humana independente de fonte sintética',measurement_id:measurement});
  const detail=await get(people.manager,`covenants/detail?format=records&id=${ctx.period}`);must(detail.record.facts.status==='compliant'&&detail.measurements.some(row=>row.document_id===ctx.document),'obligation_evidence_or_review_lost');
  const linked=await get(people.manager,`contract-detail?id=${ctx.contract}&section=obligations`);must(linked.rows.some(row=>row.id===ctx.period),'contract_obligation_identity_changed');
  const tasks=await get(people.manager,`contract-detail?id=${ctx.contract}&section=tasks`);must(tasks.rows.length>0&&tasks.rows.every(row=>row.related_id===ctx.contract),'contract_work_context_failed');
 });
 await stage('renewal_concurrency_and_relationship',async()=>{
  const renewals=await Promise.all([post(people.admin,'contract-renewal-rfq',{organization_id:ctx.org,contract_id:ctx.contract}),post(people.admin,'contract-renewal-rfq',{organization_id:ctx.org,contract_id:ctx.contract})]);
  must(renewals[0].id===renewals[1].id,'renewal_concurrent_duplicate');
  const origin=await get(people.admin,`contract-detail?id=${ctx.contract}&section=renewals`);must(origin.rows.length===1&&origin.rows[0].rfq?.id===renewals[0].id,'renewal_origin_not_recoverable');
  const obligations=await get(people.manager,`provider-relationship?organization_id=${ctx.org}&provider_id=${ctx.bank}&section=obligations&legal_entity_id=${ctx.a}`);must(obligations.rows.some(row=>row.id===ctx.period),'relationship_obligation_identity_changed');
  const docs=await get(people.manager,`provider-relationship?organization_id=${ctx.org}&provider_id=${ctx.bank}&section=documents&legal_entity_id=${ctx.a}`);must(docs.rows.some(row=>row.reference.document_id===ctx.document&&row.reference.contract_id===ctx.contract),'relationship_document_provenance_failed');
 });
 await stage('tenant_provider_role_entity_and_session_negatives',async()=>{
  for(const actor of [people.outsider,people.provider])await call(actor,'GET','contract-detail?id='+ctx.contract,undefined,{expected:[404]});
  await call(people.outsider,'GET',`portfolio/context?organization_id=${ctx.org}`,undefined,{expected:[403]});
  await call(people.viewer,'POST','contract-renewal-rfq',{organization_id:ctx.org,contract_id:ctx.contract},{expected:[403]});
  await post(people.admin,'entity-scopes',{organization_id:ctx.org,user_id:people.manager.id,scope:'entities',entity_ids:[ctx.a]});
  await call(people.manager,'GET','contract-detail?id='+ctx.contractB,undefined,{expected:[404]});
  const scoped=await get(people.manager,`portfolio/context?organization_id=${ctx.org}&section=facilities`);must(scoped.rows.length===1&&scoped.rows[0].legal_entity_id===ctx.a,'entity_b_context_leaked');
  await post(people.admin,'entity-scopes',{organization_id:ctx.org,user_id:people.manager.id,scope:'entities',entity_ids:[ctx.b]});
  await call(people.manager,'GET','contract-detail?id='+ctx.contract,undefined,{expected:[404]});
  const logout=await fetch(`${SB}/auth/v1/logout?scope=global`,{method:'POST',headers:{apikey:config.anonKey,Authorization:`Bearer ${people.manager.accessToken}`},signal:AbortSignal.timeout(15000)});must(logout.ok,'session_revocation_failed');
  await call(people.manager,'GET',`portfolio/context?organization_id=${ctx.org}`,undefined,{expected:[401,403]});
 });
} catch(error) {
 failed=true;console.error('OPERATING_JOURNEY_FAILED '+(/^[a-z_]+$/.test(error.message)?error.message:'dependency_or_contract_failure'));
 process.exitCode=1;
} finally {
 const report={classification:'synthetic_local_real_stack_operating_journey',result:failed?'FAIL':'PASS',wall_ms:performance.now()-started,stages,requests,
  scope:{business_writes:'real_arandu_api_and_user_jwt',operator_setup:'auth_accounts_and_allowlist_only',storage:'real_upload_and_download_content',hosted:'NOT_RUN'},
  limitations:['Synthetic local integration, not hosted validation.','Signed URLs, account identities, row contents and credentials are omitted.']};
 const directory=process.env.CI_DEMO_REPORTS||'reports/ci-demo';fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'operating-backend-journey.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log('OPERATING_BACKEND_JOURNEY '+JSON.stringify({result:report.result,stages:stages.length,requests:requests.length,wall_ms:report.wall_ms}));
}
