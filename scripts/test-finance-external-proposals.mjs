import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { PRODUCTS, normalizeProposal } from '../lib/finance/products.mjs';
import { normalizeExternalTerms, externalComparisonProposal } from '../lib/finance/external-proposals.mjs';
import { buildComparison, applyUserWeights } from '../lib/finance/comparison.mjs';
import { handleFinance } from '../lib/api/domains/finance.mjs';
const sql=readFileSync('docs/supabase-financial-external-proposals.sql','utf8');
const schema=JSON.parse(/select '(\{"credit"[^\n]+)'::jsonb/.exec(sql)[1]);
for(const [key,p] of Object.entries(PRODUCTS)) {
 const expected=p.proposalFields.map(({key,type,min,max,options})=>({key,type,...min!==undefined?{min}:{},...max!==undefined?{max}:{},...options?{options}:{}}));
 assert.deepEqual(schema[key],expected,'database validator mirrors the existing product schema');
}
for (const terms of [{offered_amount:[]},{offered_amount:false},{notes:{}},{offered_amount:-1}]) assert(normalizeExternalTerms('credit',terms).errors.length);
assert.deepEqual(normalizeExternalTerms('credit',{offered_amount:null,interest_rate_month:' '}).values,{},'no absent-to-zero conversion');
assert.deepEqual(normalizeExternalTerms('credit',{interest_rate_month:0}).values,{interest_rate_month:0});
assert.deepEqual(normalizeExternalTerms('credit',{forged_field:1}).rejected,['forged_field']);
for (const [product,terms] of [['credit',{institution:'DEMO',product_name:'DEMO',offered_amount:100000,interest_rate_month:1.5,term_months:12,index:'pre',grace_months:0,amortization:'price'}],['acquiring',{institution:'DEMO',product_name:'DEMO',mdr_debit:1,mdr_credit_cash:2}]]) {
 assert.deepEqual(normalizeExternalTerms(product,terms).values,normalizeProposal(product,terms).values);
 const portal={id:'portal',provider_name:'Portal DEMO',terms,version:1,submitted_at:'2026-01-01T12:00:00Z'};
 const external=externalComparisonProposal({id:'external',terms,currency:'BRL',current_version:1,recorded_by:'writer',reviewed_by:'reviewer'});
 const comparison=buildComparison(product,[portal,external]);
 for(const row of comparison.rows) assert.deepEqual(row.values[0],row.values[1],'channel does not change financial values');
 assert.equal(comparison.columns[1].provenance.source,'buyer_recorded_external');
 assert.equal(comparison.columns[1].provenance.institution_acceptance,'not_recorded');
 const key=product==='credit'?'interest_rate_month':'mdr_debit';
 const weighted=applyUserWeights(product,[portal,external],{[key]:100});
 const baseline=applyUserWeights(product,[portal,{...portal,id:'external'}],{[key]:100});
 assert.deepEqual(weighted.results.map(({provider_name,...result})=>result),baseline.results.map(({provider_name,...result})=>result),'same financial scoring regardless of channel');
 assert(!Object.keys(comparison).some(key=>/ranking|recommended|best/.test(key)));
}
const unknown=buildComparison('credit',[externalComparisonProposal({id:'x',terms:{offered_amount:100},current_version:1})]);
assert.equal(unknown.columns[0].currency,null,'missing currency is not silently BRL for external data');
assert.equal(unknown.columns[0].currency_source,'not_declared');

process.env.SUPABASE_URL='https://external-tests.example.invalid';
process.env.SUPABASE_ANON_KEY='external-anon';
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG='00000000-0000-4000-8000-000000000701', RFQ='00000000-0000-4000-8000-000000000702', ID='00000000-0000-4000-8000-000000000703', PROVIDER='00000000-0000-4000-8000-000000000704';
let sent=[],kind='BUYER',rpcError=null,unavailable=false;
const row={id:ID,organization_id:ORG,rfq_id:RFQ,provider_id:PROVIDER,product:'credit',state:'reviewed',current_version:1,terms:{offered_amount:100},currency:'BRL',rfq_revision:1,document_available:true,recorded_by:'writer',reviewed_by:'reviewer'};
globalThis.fetch=async(url,options={})=>{
 const req={url:String(url),body:options.body?JSON.parse(options.body):null,headers:options.headers};sent.push(req);
 if(unavailable) return Response.json({message:'upstream unavailable'},{status:503});
 if(req.url.includes('rpc/')) return rpcError?Response.json({message:rpcError,code:'P0001'},{status:400}):Response.json(req.url.includes('_review')?ID:{id:ID,version:1,replayed:false});
 if(req.url.includes('fin_organizations')) return Response.json([{id:ORG,kind}]);
 if(req.url.includes('fin_rfqs?')) return Response.json([{id:RFQ,organization_id:ORG,product:'credit',revision:1,demand:{}}]);
 if(req.url.includes('fin_external_proposal_current?')) return Response.json([row]);
 if(req.url.includes('fin_external_proposal_versions?')) return Response.json([{proposal_id:ID,version:1,terms:{offered_amount:100}}]);
 return Response.json([]);
};
const deps={requireUser:async()=>({user:{id:'actor'},accessToken:'external-user-jwt',headers:{}}),enforceRateLimit:async()=>{}};
async function call(method,path,body) {
 const req=Object.assign(Readable.from(body?[JSON.stringify(body)]:[]),{method,url:'/api/finance/'+path,headers:{}});
 const res={setHeader(){},end(raw){this.payload=JSON.parse(raw);}};
 await handleFinance(req,res,path.split('?')[0],deps);return res;
}
const input={rfq_id:RFQ,provider_id:PROVIDER,request_key:'external-key-1',terms:{offered_amount:100},state:'pending_review',channel:'manual',received_at:'2026-01-01T12:00:00Z',source_reference:'Fonte fictícia',currency:'BRL',rfq_revision:1};
let response=await call('POST','external-proposals',{...input,recorded_by:'forged',document_sha256:'forged',institution_acceptance:'accepted'});
assert.equal(response.statusCode,201);
let rpc=sent.find(req=>req.url.includes('rpc/fin_external_proposal_save'));
assert.equal(rpc.body.p_expected,0);assert.equal(rpc.body.p_id,null);
assert(!JSON.stringify(rpc.body).includes('forged'),'server-owned provenance excludes client assertions');
assert(sent.every(req=>req.headers.Authorization==='Bearer external-user-jwt'),'all reads and RPCs use the user JWT');
response=await call('GET',`external-proposals?organization_id=${ORG}&rfq_id=${RFQ}`);
assert.equal(response.payload.rows[0].id,ID);assert.equal(response.payload.decision_allowed,false);
response=await call('GET',`external-proposals?organization_id=${ORG}&id=${ID}`);
assert.equal(response.payload.versions[0].version,1);
assert(sent.some(request=>request.url.includes('fin_external_proposal_versions?')&&request.url.includes('version=lte.1')),'history cannot include a future unreviewed version beyond the header snapshot');
response=await call('POST','comparison',{rfq_id:RFQ});
assert.equal(response.payload.comparison.columns[0].provenance.source,'buyer_recorded_external');
assert(sent.some(request=>request.url.includes('or=(document_id.is.null,document_available.eq.true)')),'manual/no-document analysis does not falsely label a file available');
response=await call('POST','external-proposals/confirm',{id:ID,expected_version:1,reason:'Material fictício conferido',material_reviewed:true,document_read:false});
assert.equal(response.payload.review_id,ID);
response=await call('POST','external-proposals/versions',{...input,id:ID,expected_version:1,request_key:'external-key-2',correction_reason:'Correção sintética justificada'});
assert.equal(response.statusCode,201);
for(const [path,body] of [['external-proposals',{...input,terms:{offered_amount:[]}}],['external-proposals',{...input,document_version:2}],['external-proposals',{...input,source_reference:{forged:true}}],['external-proposals',{...input,rfq_revision:1.5}],['external-proposals',{...input,product:'acquiring'}],['external-proposals',{...input,legal_entity_id:PROVIDER}],['external-proposals/versions',{...input,id:ID,expected_version:0}]]) {
 const n=sent.filter(req=>req.url.includes('rpc/')).length;
 await assert.rejects(()=>call('POST',path,body),err=>err.status===400);
 assert.equal(sent.filter(req=>req.url.includes('rpc/')).length,n,'invalid request has no material write');
}
for(const action of ['decision','contract']) await assert.rejects(()=>call('POST','external-proposals/'+action,{id:ID}),err=>err.status===409&&err.code==='external_decision_not_supported');
kind='PROVIDER';await assert.rejects(()=>call('POST','external-proposals',input),err=>err.status===400);kind='BUYER';
rpcError='external proposal conflict';await assert.rejects(()=>call('POST','external-proposals',input),err=>err.status===409&&err.code==='external_proposal_conflict');rpcError=null;
unavailable=true;await assert.rejects(()=>call('POST','external-proposals',input));
console.log('External proposals: product/schema parity, absent values, neutral mixed comparison, user JWT, API mutation/read/pagination, conflicts and fail-closed outage passed.');
