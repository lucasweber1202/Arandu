import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { handleFinance } from '../lib/api/domains/finance.mjs';
import { contractInformationQuality, obligationWorkItems } from '../lib/finance/contract-operational.mjs';
import { operationalPage, orderedPageFilters, operationalPageResult, DUE_ASC } from '../lib/api/domains/finance-operational-pages.mjs';
import { readBoundedOperationalRows } from '../lib/api/domains/finance-portfolio-context.mjs';

process.env.SUPABASE_URL='https://operating-fixture.example.invalid';
process.env.SUPABASE_ANON_KEY='operating-fixture-public';delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const ORG=id(1),OTHER=id(2),CONTRACT=id(3),SECOND=id(4),ENTITY=id(5),PROVIDER=id(6),ACTOR=id(7);
const stamp='2026-01-01T10:00:00.000001+00:00';
let visible=true,revoked=false,actor=ACTOR,failure=null,sent=[],tables={};
 const base={id:CONTRACT,organization_id:ORG,legal_entity_id:ENTITY,provider_id:PROVIDER,product:'credit',title:'Contrato sintético',status:'active',ends_on:'2028-01-01',renewal_notice_days:0,owner_id:ACTOR,origin:'imported',current_version:1};
function split(value) {let depth=0,start=0,rows=[];for(let i=0;i<value.length;i++){if(value[i]==='(')depth++;if(value[i]===')')depth--;if(value[i]===','&&depth===0){rows.push(value.slice(start,i));start=i+1;}}rows.push(value.slice(start));return rows;}
const field=(row,key)=>key.includes('->>')?row[key.split('->>')[0]]?.[key.split('->>')[1]]:row[key];
function predicate(row,term) {
 for(const kind of ['and','or'])if(term.startsWith(kind+'('))return kind==='and'?split(term.slice(kind.length+1,-1)).every(t=>predicate(row,t)):split(term.slice(kind.length+1,-1)).some(t=>predicate(row,t));
 const m=term.match(/^([a-z_>\-]+)\.(eq|gt|lt|gte|lte|is)\.(.*)$/);assert(m,'unexpected fixture predicate '+term);
 const value=field(row,m[1]),right=m[3],left=typeof value==='number'?value:String(value),bound=typeof value==='number'?Number(right):right;return m[2]==='is'?right==='null'&&value==null:value!=null&&({eq:()=>String(value)===right,gt:()=>left>bound,lt:()=>left<bound,gte:()=>left>=bound,lte:()=>left<=bound})[m[2]]();
}
globalThis.fetch=async (url,options={})=>{
 const u=new URL(url),table=u.pathname.split('/').at(-1),q=u.searchParams;sent.push({table,q,options});
 if(table==='fin_facility_current_repayment')assert(!q.get('select')?.split(',').includes('id'),'Canonical repayments use facility/version/date, not an id column');
 assert.equal(options.headers.Authorization,'Bearer operating-user-jwt');assert.equal(options.headers.apikey,'operating-fixture-public');
 if(revoked)return new Response(JSON.stringify({message:'session_revoked'}),{status:401});
 if(table===failure)return new Response(JSON.stringify({message:'source_unavailable'}),{status:503});
 if(table==='fin_assign_contract_owner')return Response.json(true);
 let rows=table==='fin_contracts'?(visible?[base,{...base,id:SECOND,legal_entity_id:id(99)}]:[]):tables[table]||[];
 rows=rows.filter(row=>[...q].every(([key,value])=>{
  if(['select','order','limit','offset'].includes(key))return true;
  if(key==='or'||key==='and')return key==='or'?split(value.slice(1,-1)).some(t=>predicate(row,t)):split(value.slice(1,-1)).every(t=>predicate(row,t));
  if(value.startsWith('in.('))return value.slice(4,-1).split(',').includes(String(field(row,key)));
  if(value==='not.is.null')return field(row,key)!=null;
  return predicate(row,key+'.'+value);
 }));
 const order=q.get('order')?.split(',')||[];
 rows=[...rows].sort((a,b)=>{for(const item of order){const [k,d,n]=item.split('.'),x=a[k],y=b[k];if(x==null&&y==null)continue;if(x==null)return n==='nullslast'?1:-1;if(y==null)return n==='nullslast'?-1:1;if(x!==y)return(x<y?-1:1)*(d==='desc'?-1:1);}return 0;});
 rows=rows.slice(0,Number(q.get('limit')||1000));
 const columns=q.get('select');if(columns&&columns!=='*')rows=rows.map(row=>Object.fromEntries(columns.split(',').filter(k=>Object.hasOwn(row,k)).map(k=>[k,row[k]])));
 return Response.json(rows);
};
const deps={requireUser:async()=>({user:{id:actor},accessToken:'operating-user-jwt',headers:{}}),enforceRateLimit:async()=>{}};
async function call(query,method='GET',body=null) {
 sent=[];const stream=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);
 const [route]=query.split('?'),req=Object.assign(stream,{url:'/api/finance/'+query,method,headers:{}}),res={setHeader(){},end(raw){this.body=JSON.parse(raw);}};
 await handleFinance(req,res,route,deps);return res.body;
}
const section=(name,extra='',contract=CONTRACT)=>`contract-detail?id=${contract}&section=${name}${extra}`;
try {
 const scope={contract:CONTRACT,viewer:ACTOR};
 const controls=operationalPage(new URLSearchParams('limit=2'),scope,DUE_ASC);
 const first=operationalPageResult([{id:id(10),due_on:'2026-01-01'},{id:id(11),due_on:'2026-01-01'},{id:id(12),due_on:null}],controls);
 const next=operationalPage(new URLSearchParams({limit:'2',cursor:first.page.next_cursor}),scope,DUE_ASC);
 assert.equal(orderedPageFilters(next).get('or'),`(due_on.gt.2026-01-01,due_on.is.null,and(due_on.eq.2026-01-01,id.gt.${id(11)}))`);
 const nullPage=operationalPageResult([{id:id(12),due_on:null},{id:id(13),due_on:null},{id:id(14),due_on:null}],controls);
 assert.equal(orderedPageFilters(operationalPage(new URLSearchParams({cursor:nullPage.page.next_cursor}),scope,DUE_ASC)).get('or'),`(and(due_on.is.null,id.gt.${id(13)}))`);
 assert.throws(()=>operationalPage(new URLSearchParams({cursor:first.page.next_cursor}),{...scope,contract:SECOND},DUE_ASC),e=>e.status===400);
 for(const query of ['limit=0','limit=101','limit=01','cursor=garbage','limit=1&limit=2'])assert.throws(()=>operationalPage(new URLSearchParams(query),scope,DUE_ASC),e=>e.status===400);
 assert.throws(()=>operationalPageResult(null,controls),e=>e.status===502);

 tables.fin_tasks=Array.from({length:29},(_,i)=>({id:id(100+i),organization_id:ORG,legal_entity_id:ENTITY,title:'Tarefa sintética',status:'open',related_type:'contract',related_id:CONTRACT,created_at:stamp,due_on:i<20?'2026-01-01':null,assignee_id:i===0?ACTOR:null}));
 tables.fin_tasks.push({...tables.fin_tasks[0],id:id(999),related_id:SECOND});
 tables.fin_members=[{organization_id:ORG,user_id:ACTOR,display_name:'Responsável sintético',role:'finance_manager',entity_scope:'group'}];
 let page=await call(section('tasks','&limit=7')),tasks=[...page.rows];assert.equal(page.rows[0].assignee_name,'Responsável sintético');
 assert(sent.some(s=>s.table==='fin_tasks'&&s.q.get('related_id')==='eq.'+CONTRACT));
 const originalCursor=page.page.next_cursor;
 while(page.page.has_more){page=await call(section('tasks','&limit=7&cursor='+page.page.next_cursor));tasks.push(...page.rows);}
 assert.equal(tasks.length,29);assert.equal(new Set(tasks.map(r=>r.id)).size,29);assert.equal(tasks.filter(r=>r.due_on===null).length,9);
 for(const query of [section('tasks','&cursor='+originalCursor,SECOND),section('tasks','&status=done&cursor='+originalCursor),section('milestones','&cursor='+originalCursor)])await assert.rejects(()=>call(query),e=>e.status===400);
 actor=id(8);await assert.rejects(()=>call(section('tasks','&cursor='+originalCursor)),e=>e.status===400);actor=ACTOR;
 for(const extra of ['&limit=0','&status=forged','&provider_id='+PROVIDER,'&id='+SECOND,'&unassigned=true'])await assert.rejects(()=>call(section('tasks',extra)),e=>e.status===400);
 for(const name of ['constructor','toString','unknown',''])await assert.rejects(()=>call(section(name)),e=>e.status===400);

 tables.fin_obligation_monitor=[{id:id(201),organization_id:ORG,contract_id:CONTRACT,obligation_id:id(202),provider_id:PROVIDER,legal_entity_id:ENTITY,title:'Obrigação sintética',due_on:'2026-02-01',owner_id:ACTOR,created_at:stamp,facts:{status:'awaiting_data',has_data:false}},{id:id(203),organization_id:ORG,contract_id:SECOND,created_at:stamp,due_on:'2026-01-01',facts:{status:'compliant'}}];
 page=await call(section('obligations'));assert.equal(page.rows.length,1);assert.equal(page.work_items[0].source.contract_id,CONTRACT);assert.equal(page.work_items[0].state,'awaiting_data');assert.equal(page.rows[0].facts.has_data,false);
 assert.equal(obligationWorkItems([{id:id(1),facts:{status:'not_due'}},{id:id(2),facts:{status:'compliant'}}]).length,0);

 tables.fin_private_documents=[{id:id(301),organization_id:ORG,buyer_organization_id:ORG,entity_type:'contract',entity_id:CONTRACT,title:'Documento sintético',visibility:'internal',current_version:2,created_at:stamp,removed_at:null},{id:id(302),organization_id:ORG,buyer_organization_id:ORG,entity_type:'contract',entity_id:SECOND,current_version:1,created_at:stamp,removed_at:null}];
 tables.fin_document_versions=[{document_id:id(301),version:1,status:'available',size_bytes:1,storage_path:'MUST_NOT_LEAK'},{document_id:id(301),version:2,status:'available',size_bytes:2,mime_type:'application/pdf',completed_at:stamp,uploaded_by:ACTOR,storage_path:'MUST_NOT_LEAK'}];
 tables.fin_contract_document_evidence=tables.fin_private_documents.map(d=>({...d,contract_organization_id:ORG,contract_id:d.entity_id,source_relation:'direct_contract',available_version:2,size_bytes:2,mime_type:'application/pdf',completed_at:stamp,uploaded_by:ACTOR,storage_path:'MUST_NOT_LEAK'}));
 page=await call(section('documents'));assert.equal(page.rows.length,1);assert.equal(page.rows[0].current.version,2);assert.equal(page.rows[0].current.size_bytes,2);assert(!JSON.stringify(page).includes('MUST_NOT_LEAK'));assert.equal(page.information_quality.fields.documents,'associated');
 assert(!sent.some(s=>s.table.startsWith('fin_document_')&&s.options.method==='POST'),'Context must never sign a download URL');
 tables.fin_contract_document_evidence[0].available_version=null;page=await call(section('documents'));assert.equal(page.rows[0].current,null);assert.equal(page.rows[0].availability,'not_confirmed_available');

 const rfq=id(401);tables.fin_events=[{id:id(402),organization_id:ORG,entity_type:'rfq',entity_id:rfq,event_type:'rfq_created_from_contract',actor_id:ACTOR,happened_at:stamp,metadata:{contract_id:CONTRACT,contract_version:1}},{id:id(403),organization_id:ORG,entity_type:'rfq',entity_id:id(404),event_type:'rfq_created_from_contract',happened_at:stamp,metadata:{contract_id:SECOND}}];
 tables.fin_rfqs=[{id:rfq,organization_id:ORG,legal_entity_id:ENTITY,product:'credit',status:'collecting',revision:1,title:'Renovação sintética',created_at:stamp}];
 page=await call(section('renewals'));assert.equal(page.rows.length,1);assert.equal(page.rows[0].rfq.id,rfq);assert.equal(page.rows[0].metadata.contract_version,1);

 visible=false;for(const name of ['documents','obligations','tasks','milestones','renewals']){await assert.rejects(()=>call(section(name)),e=>e.status===404);assert(sent.every(s=>s.table==='fin_contracts'));}visible=true;
 revoked=true;await assert.rejects(()=>call(section('tasks')));revoked=false;
 failure='fin_obligation_monitor';await assert.rejects(()=>call(section('obligations')));failure=null;
 const quality=contractInformationQuality({...base,ends_on:null,current_version:0},{documents:[]});assert(quality.signals.some(s=>s.code==='contract_end_missing'));assert(!quality.signals.some(s=>s.code==='contract_notice_missing'),'Explicit zero notice is recorded, not missing');assert.equal(contractInformationQuality(base).fields.documents,'not_loaded');assert.equal(contractInformationQuality(base,{documents:[],documentsPartial:true}).fields.documents,'partial');

 tables.fin_contract_versions=Array.from({length:105},(_,i)=>({contract_id:CONTRACT,version:i+1,effective_from:i===0?'2020-01-01':'2099-01-01',source:'correction',terms:{spread_pct_year:i+1}}));
 const detail=await call('contract-detail?id='+CONTRACT);assert.equal(detail.versions.length,100);assert.equal(detail.coverage.sections.versions.has_more,true);assert.equal(detail.effective.version,1,'Applicable version must not disappear behind 100 future versions');
 assert.equal(detail.owner_context.eligible_in_membership,true);assert.equal(detail.owner_context.coverage,'membership_role_and_entity_only');
 tables.fin_members=[];const departed=await call('contract-detail?id='+CONTRACT);assert.equal(departed.owner_context.eligible_in_membership,false);assert(departed.next_actions.some(s=>s.code==='contract_owner_membership_review'));
 assert.equal(detail.sections.documents.loaded,false);assert.equal(detail.information_quality.fields.documents,'not_loaded');
 await assert.rejects(()=>call('contract-owner','POST',{contract_id:CONTRACT,expected_owner_id:null,owner_id:ACTOR}),e=>e.status===400&&e.code==='invalid_id');
 await assert.rejects(()=>call('contract-owner','POST',{contract_id:CONTRACT,owner_id:ACTOR}),e=>e.status===400&&e.code==='invalid_id');

 tables.fin_organizations=[{id:ORG,kind:'BUYER'}];tables.fin_legal_entities=[{id:ENTITY,organization_id:ORG}];
 tables.fin_portfolio_facility_context=[{id:id(501),organization_id:ORG,legal_entity_id:ENTITY,provider_id:PROVIDER,provider_name:'Instituição sintética',contract_id:CONTRACT,contract_product:'credit',kind:'revolving_credit',name:'Linha BRL',status:'active',currency:'BRL',approved_limit:10000,maturity_on:'2027-01-01',schedule_version:0},{id:id(502),organization_id:ORG,legal_entity_id:ENTITY,provider_id:PROVIDER,contract_id:CONTRACT,contract_product:'credit',kind:'term_loan',name:'Linha USD',status:'active',currency:'USD',approved_limit:50000,maturity_on:null,schedule_version:0},{id:id(503),organization_id:ORG,legal_entity_id:ENTITY,provider_id:PROVIDER,contract_id:CONTRACT,contract_product:'credit',kind:'term_loan',name:'Linha vencida',status:'matured',currency:'BRL',approved_limit:2000,maturity_on:'2020-01-01',schedule_version:0}];
 tables.fin_facilities=tables.fin_portfolio_facility_context.map(({contract_product,provider_name,...row})=>row);
 tables.fin_portfolio_guarantee_context=[{id:id(504),organization_id:ORG,legal_entity_id:ENTITY,provider_id:null,contract_id:null,facility_id:id(501),facility_contract_id:CONTRACT,facility_provider_id:PROVIDER,facility_contract_product:'credit',facility_kind:'revolving_credit',kind:'receivables',currency:'BRL',status:'active',committed_amount:500,ends_on:null}];
 tables.fin_facility_latest_balance=[{id:id(505),organization_id:ORG,facility_id:id(501),as_of:'2026-01-01',recorded_at:stamp,outstanding_amount:2000,used_limit_amount:1000,source:'declared',source_reference:'Fonte sintética'}];
 tables.fin_facility_current_repayment=[];
 const portfolio=await call(`portfolio/context?organization_id=${ORG}&provider_id=${PROVIDER}&product=credit`);
 assert.equal(portfolio.coverage.complete,true);assert.equal(portfolio.coverage.facilities,3);assert.equal(portfolio.coverage.latest_balances,1);assert.equal(portfolio.views.currencies.length,2);
 assert.equal(portfolio.views.currencies.find(r=>r.currency==='BRL').outstanding,2000);assert.equal(portfolio.views.currencies.find(r=>r.currency==='USD').outstanding_unknown,1);assert.equal(portfolio.views.currencies.find(r=>r.currency==='USD').outstanding,null);assert.equal(portfolio.views.currencies.find(r=>r.currency==='USD').available_limit,null);assert(!('facilities' in portfolio),'Summary must not duplicate every detail record');
 assert(sent.some(s=>s.table==='fin_portfolio_facility_context'&&s.q.get('provider_id')===`eq.${PROVIDER}`&&s.q.get('contract_product')==='eq.credit'));
 assert(!sent.some(s=>s.table==='fin_facilities'),'Scoped context must not fall back to the whole legacy portfolio');
 const drill=await call(portfolio.drilldowns.facilities.find(r=>r.currency==='BRL').endpoint);assert.equal(drill.rows.length,1);assert.equal(drill.rows[0].latest_balance.outstanding_amount,2000);
 const usd=await call(`portfolio/context?organization_id=${ORG}&section=facilities&currency=USD`);assert.equal(usd.rows[0].latest_balance,null);assert.equal(usd.rows[0].balance_state,'unknown');
 let facilities=await call(`portfolio/context?organization_id=${ORG}&section=facilities&limit=1`);const fcursor=facilities.page.next_cursor;assert(fcursor);
 assert.equal(sent.find(s=>s.table==='fin_facilities').q.get('limit'),'2','Source page is bounded before joined enrichment');
 assert.equal(sent.find(s=>s.table==='fin_portfolio_facility_context').q.get('id'),`in.(${facilities.rows[0].id})`,'Enrichment only queries IDs from the authorized source page');
 assert.equal(sent.filter(s=>s.table==='fin_portfolio_facility_context').length,1,'No query per facility');
 const more=await call(`portfolio/context?organization_id=${ORG}&section=facilities&limit=1&cursor=${fcursor}`);assert.notEqual(more.rows[0].id,facilities.rows[0].id);
 const projection=tables.fin_portfolio_facility_context;tables.fin_portfolio_facility_context=[];
 const changed=await call(`portfolio/context?organization_id=${ORG}&section=facilities&limit=1`);assert.deepEqual(changed.rows,[]);assert.equal(changed.coverage.changed_during_read,true);assert.equal(changed.coverage.complete,false);assert.equal(changed.page.next_cursor,fcursor,'Revoked enrichment does not lose the authorized source continuation');
 tables.fin_portfolio_facility_context=projection;failure='fin_portfolio_facility_context';
 await assert.rejects(()=>call(`portfolio/context?organization_id=${ORG}&section=facilities`),e=>e.status===503);failure=null;
 await assert.rejects(()=>call(`portfolio/context?organization_id=${ORG}&section=facilities&currency=USD&cursor=${fcursor}`),e=>e.status===400);
 const scopedGuarantee=await call(`portfolio/context?organization_id=${ORG}&section=guarantees&provider_id=${PROVIDER}&contract_id=${CONTRACT}&product=credit`);assert.equal(scopedGuarantee.rows.length,1);assert.equal(scopedGuarantee.rows[0].id,id(504));
 await assert.rejects(()=>call(`portfolio/context?organization_id=${OTHER}`),e=>e.status===403);
 await assert.rejects(()=>call(`portfolio/context?organization_id=${ORG}&contract_id=${id(9999)}`),e=>e.status===404);
 for(const q of ['section=unknown','currency=???','product=forged','status=closed','maturity_from=2026-02-30','horizon_months=05','provider_id='+PROVIDER+'&provider_id='+PROVIDER])await assert.rejects(()=>call(`portfolio/context?organization_id=${ORG}&${q}`),e=>e.status===400);
 await assert.rejects(()=>readBoundedOperationalRows('operating-user-jwt','fin_portfolio_facility_context',new URLSearchParams({select:'id',organization_id:'eq.'+ORG}),2),e=>e.status===422&&e.code==='portfolio_context_coverage_limit');
 // More than one transport batch, tied facility/version keys and no id field.
 tables.fin_portfolio_facility_context=tables.fin_portfolio_facility_context.map(row=>({...row,schedule_version:1}));
 tables.fin_facilities=tables.fin_facilities.map(row=>({...row,schedule_version:1}));
 tables.fin_facility_current_repayment=Array.from({length:221},(_,i)=>({organization_id:ORG,facility_id:id(501),schedule_version:1,due_on:new Date(Date.UTC(new Date().getUTCFullYear()+1,0,i+1)).toISOString().slice(0,10),principal_amount:10}));
 const schedules=await call(`portfolio/context?organization_id=${ORG}`);
 assert.equal(schedules.coverage.current_repayments,221);assert.equal(schedules.views.currencies.find(row=>row.currency==='BRL').maturity_wall.reduce((sum,row)=>sum+row.scheduled,0),2210);
 assert.equal(sent.filter(row=>row.table==='fin_facility_current_repayment').length,2);assert(sent.filter(row=>row.table==='fin_facility_current_repayment').every(row=>row.q.get('order')==='facility_id.asc,schedule_version.asc,due_on.asc'));
 tables.fin_portfolio_facility_context=tables.fin_portfolio_facility_context.map(row=>({...row,schedule_version:2}));
 await assert.rejects(()=>call(`portfolio/context?organization_id=${ORG}`),error=>error.status===409&&error.code==='portfolio_context_changed','A schedule-version race must not produce a partial financial total');
 tables.fin_portfolio_facility_context=tables.fin_portfolio_facility_context.map(row=>({...row,schedule_version:1}));

 tables.fin_obligation_monitor=Array.from({length:29},(_,i)=>({id:id(600+i),organization_id:ORG,contract_id:CONTRACT,obligation_id:id(202),provider_id:PROVIDER,legal_entity_id:ENTITY,owner_id:ACTOR,title:'Período sintético',kind:'financial_covenant',period_start:'2026-01-01',period_end:'2026-01-31',due_on:'2026-02-01',facts:{status:i%2?'under_review':'awaiting_data',has_data:Boolean(i%2)}}));
 let periods=await call(`covenants?format=records&organization_id=${ORG}&contract_id=${CONTRACT}&limit=8`),allPeriods=[...periods.rows];const pcursor=periods.page.next_cursor;
 while(periods.page.has_more){periods=await call(`covenants?format=records&organization_id=${ORG}&contract_id=${CONTRACT}&limit=8&cursor=${periods.page.next_cursor}`);allPeriods.push(...periods.rows);}
 assert.equal(allPeriods.length,29);assert.equal(new Set(allPeriods.map(r=>r.id)).size,29);
 await assert.rejects(()=>call(`covenants?format=records&organization_id=${ORG}&contract_id=${CONTRACT}&status=under_review&cursor=${pcursor}`),e=>e.status===400);
 const statusPage=await call(`covenants?format=records&organization_id=${ORG}&contract_id=${CONTRACT}&status=under_review`);assert.equal(statusPage.rows.length,14);assert(statusPage.rows.every(r=>r.facts.status==='under_review'));
 const oldPresenter=await call(`covenants?organization_id=${ORG}&contract_id=${CONTRACT}`);assert(oldPresenter.rows[0].cells);assert.equal(oldPresenter.rows[0].contract_id,CONTRACT,'Claude #328 additive DTO must remain');
 const rawDetail=await call('covenants/detail?format=records&id='+id(600));assert.equal(rawDetail.record.id,id(600));assert.equal(rawDetail.record.facts.has_data,false);assert.equal(rawDetail.coverage.history_complete,true);
 for(const q of ['format=wrong','format=records&after=25','format=records&owner_id=bad','format=records&due_from=2026-02-30'])await assert.rejects(()=>call(`covenants?organization_id=${ORG}&${q}`),e=>e.status===400);

 tables.fin_document_versions=Array.from({length:4},(_,i)=>({document_id:id(301),version:i+1,status:i===3?'pending':'available',mime_type:'application/pdf',size_bytes:100,uploaded_by:ACTOR,created_at:stamp,completed_at:i===3?null:stamp,storage_path:'MUST_NOT_LEAK'}));
 const versionPage=await call(`private-documents/versions?organization_id=${ORG}&document_id=${id(301)}&limit=2`);assert.equal(versionPage.rows[0].version,4);assert.equal(versionPage.rows[0].status,'pending');assert(!JSON.stringify(versionPage).includes('MUST_NOT_LEAK'));
 const lastVersions=await call(`private-documents/versions?organization_id=${ORG}&document_id=${id(301)}&limit=2&cursor=${versionPage.page.next_cursor}`);assert.deepEqual(lastVersions.rows.map(r=>r.version),[2,1]);assert.equal(lastVersions.page.has_more,false);
 await assert.rejects(()=>call(`private-documents/versions?organization_id=${ORG}&document_id=${id(302)}&cursor=${versionPage.page.next_cursor}`),e=>e.status===400);
 await assert.rejects(()=>call(`private-documents/versions?organization_id=${OTHER}&document_id=${id(301)}`),e=>e.status===403);

 tables.fin_providers=[{id:PROVIDER,organization_id:ORG,name:'Instituição sintética',kind:'bank'}];
 tables.fin_legal_entities.push({id:id(99),organization_id:ORG});
 tables.fin_contract_document_evidence=tables.fin_contract_document_evidence.map(row=>({...row,provider_id:PROVIDER,legal_entity_id:row.contract_id===CONTRACT?ENTITY:id(99)}));
 const institutionDocs=await call(`provider-relationship?organization_id=${ORG}&provider_id=${PROVIDER}&section=documents&legal_entity_id=${ENTITY}&include_crm=true`);
 assert.equal(institutionDocs.rows.length,1);assert.equal(institutionDocs.rows[0].reference.document_id,id(301));assert.equal(institutionDocs.rows[0].reference.contract_id,CONTRACT);assert(!sent.some(s=>s.table.startsWith('fin_crm_')),'A paged section must not load and discard CRM context');
 const institutionPeriods=await call(`provider-relationship?organization_id=${ORG}&provider_id=${PROVIDER}&section=obligations&legal_entity_id=${ENTITY}`);assert.equal(institutionPeriods.rows.length,25);assert.equal(institutionPeriods.rows[0].contract_id,CONTRACT);
 const institutionFacilities=await call(`provider-relationship?organization_id=${ORG}&provider_id=${PROVIDER}&section=facilities&legal_entity_id=${ENTITY}`);assert.equal(institutionFacilities.rows.length,3);assert(institutionFacilities.rows.every(r=>r.provider_id===PROVIDER));
 await assert.rejects(()=>call(`provider-relationship?organization_id=${ORG}&provider_id=${PROVIDER}&legal_entity_id=${ENTITY}`),e=>e.status===400&&e.code==='relationship_entity_requires_section');
 await assert.rejects(()=>call(`provider-relationship?organization_id=${ORG}&provider_id=${PROVIDER}&section=documents&legal_entity_id=${id(888)}`),e=>e.status===404);
 const list=await call(`tasks?organization_id=${ORG}&status=open&limit=2`);assert(list.page.next_cursor);
 await assert.rejects(()=>call(`tasks?organization_id=${ORG}&status=done&limit=2&cursor=${list.page.next_cursor}`),e=>e.status===400&&e.code==='invalid_task_cursor');
 console.log('Financial operating API: scoped cursor pages, null task deadlines, contract sections, current document metadata, real-source renewal links, absent sources, JWT isolation and failures PASS (HTTP fixture; SQL/ephemeral evidence separate).');
} finally {delete process.env.SUPABASE_URL;delete process.env.SUPABASE_ANON_KEY;}
