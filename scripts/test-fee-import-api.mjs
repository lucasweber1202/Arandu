import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { handleFinance } from '../lib/api/domains/finance.mjs';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const org=id(1),contract=id(2),actor=id(3);
const previous=Object.fromEntries(['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY'].map(k=>[k,process.env[k]]));
process.env.SUPABASE_URL='https://supabase.example.invalid';process.env.SUPABASE_ANON_KEY='anon';delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const original=globalThis.fetch;let calls=[],hidden=false,existing=[],role='admin',rpcFailure=null;
const settings={tenant_id:id(6),company_id:id(7),account_id:id(8),environment:'sandbox',currency:'BRL',service:'Tarifa',charging_unit:'one_off'};
globalThis.fetch=async(url,options)=>{const u=new URL(url);calls.push({u,options});
 if(u.pathname.endsWith('/fin_organizations'))return Response.json([{id:org,kind:'BUYER'}]);
 if(u.pathname.endsWith('/fin_contracts'))return Response.json(hidden?[]:[{id:contract,legal_entity_id:id(4)}]);
 if(u.pathname.endsWith('/fin_members'))return Response.json([{role}]);
 if(u.pathname.endsWith('/fin_fee_observations'))return Response.json(existing);
 if(u.pathname.endsWith('/rpc/fin_import_fee_batch'))return rpcFailure?Response.json({code:'P0001',message:rpcFailure},{status:400}):Response.json({imported:1,ignored:0,replayed:false,rows:[{line:2,id:id(10),state:'imported'}]});
 if(u.pathname.endsWith('/rpc/fin_fee_integration'))return Response.json({id:id(5),contract_id:contract,status:'configured',version:1,settings});
 if(u.pathname.endsWith('/rpc/fin_configure_fee_integration'))return Response.json({id:id(5),version:1,replayed:false,status:'configured',settings});
 return Response.json([]);};
async function call(path,body=null){const method=body?'POST':'GET';const req=Object.assign(Readable.from(body?[JSON.stringify(body)]:[]),{method,url:`/api/finance/${path}`,headers:{}});const res={statusCode:200,setHeader(){},end(s){this.body=JSON.parse(s);}};await handleFinance(req,res,path.split('?')[0],{requireUser:async()=>({user:{id:actor},accessToken:'import-user-jwt'}),enforceRateLimit:async()=>{}});return res;}
const columns=['source_object_id','service','charging_unit','currency','period_start','period_end','observed_amount'];
const csv=columns.join(',')+'\nentry-1,Tarifa,one_off,BRL,2026-10-01,2026-10-01,10.50\nentry-2,Tarifa,one_off,BRL,2026-10-01,2026-10-01,bad\n';
const body={organization_id:org,contract_id:contract,file:{name:'Tarifas.csv',format:'csv',content_base64:Buffer.from(csv).toString('base64')},mapping:Object.fromEntries(columns.map(k=>[k,k])),source_reference:'Banco arquivo'};
try{
 let response=await call('fee-imports/preview',body);let preview=response.body.preview;assert.deepEqual(preview.rows.map(r=>r.state),['valid','invalid']);
 const confirm={...body,confirmation:true,preview_fingerprint:preview.fingerprint,selected_lines:[2],request_key:id(11)};
 const before=calls.filter(c=>c.u.pathname.endsWith('/rpc/fin_import_fee_batch')).length;
 for(const invalid of [{...confirm,contract_id:id(99)},{...confirm,confirmation:false},{...confirm,selected_lines:[3]},{...confirm,selected_lines:[2,2]},{...confirm,preview_fingerprint:'changed'},{...confirm,unexpected:true}])await assert.rejects(()=>call('fee-imports/confirm',invalid),e=>e.status===400);
 assert.equal(calls.filter(c=>c.u.pathname.endsWith('/rpc/fin_import_fee_batch')).length,before);
 response=await call('fee-imports/confirm',confirm);assert.equal(response.body.imported,1);const sent=JSON.parse(calls.at(-1).options.body);assert.equal(sent.p_rows[0].values.observed_amount,10.5);assert.equal(sent.p_org,org);assert.equal(sent.p_confirmation,true);
 existing=[{id:id(12),...preview.rows[0].values}];response=await call('fee-imports/preview',body);assert.equal(response.body.preview.rows[0].state,'duplicate');
 existing[0].observed_amount=12;response=await call('fee-imports/preview',body);assert.equal(response.body.preview.rows[0].state,'conflicting');await assert.rejects(()=>call('fee-imports/confirm',confirm),e=>e.status===400);existing=[];
 hidden=true;calls=[];await assert.rejects(()=>call('fee-imports/preview',body),e=>e.status===404);assert(!calls.some(c=>c.u.pathname.endsWith('/fin_fee_observations')));hidden=false;
 await call(`fee-imports/history?organization_id=${org}&contract_id=${contract}&limit=1`);assert.equal(calls.at(-1).u.searchParams.get('event_type'),'eq.fee_import_completed');
 await call('erp-fees/configure',{organization_id:org,integration_id:id(5),contract_id:contract,expected_version:0,request_key:id(20),settings,status:'configured'});assert.equal(JSON.parse(calls.at(-1).options.body).p_contract,contract);
 role='viewer';
 response=await call('fee-imports/preview',body);assert.equal(response.body.preview.rows[0].state,'valid');
 for(const deniedRole of ['viewer','analyst',undefined]){
  role=deniedRole;
  for(const denied of [confirm,{...confirm,selected_lines:[1]}, {organization_id:org}]){
   calls=[];
   await assert.rejects(()=>call('fee-imports/confirm',denied),e=>e.status===403&&e.code==='forbidden');
   assert(!calls.some(c=>/fin_contracts|fin_fee_observations|rpc\/fin_import_fee_batch/.test(c.u.pathname)));
  }
 }
 role='finance_manager';response=await call('fee-imports/confirm',confirm);assert.equal(response.body.imported,1);
 // Revocation/entity scope can change after the API role check: the RPC's
 // refusal remains authoritative and is translated without leaking SQL.
 rpcFailure='forbidden';await assert.rejects(()=>call('fee-imports/confirm',confirm),e=>e.status===403&&e.code==='forbidden');
 rpcFailure='fee import request conflict';await assert.rejects(()=>call('fee-imports/confirm',confirm),e=>e.status===409&&e.code==='fee_import_conflict');rpcFailure=null;
 role='viewer';await assert.rejects(()=>call('erp-fees/preview',{organization_id:org,integration_id:id(5),period_start:'2026-10-01',period_end:'2026-10-31'}),e=>e.status===403);
 role='admin';await assert.rejects(()=>call('erp-fees/preview',{organization_id:org,integration_id:id(5),period_start:'2026-10-01',period_end:'2026-10-31'}),e=>e.status===503&&e.code==='erp_not_configured');
 assert(calls.every(c=>c.u.hostname==='supabase.example.invalid'&&c.options.headers.Authorization==='Bearer import-user-jwt'));
 console.log('Fee import API: mixed preview, explicit confirmation, fingerprint, mapping, duplicates/conflicts, selected rows, root authorization, history, configuration and unavailable ERP PASS (HTTP mocks).');
}finally{globalThis.fetch=original;for(const[k,v]of Object.entries(previous))if(v===undefined)delete process.env[k];else process.env[k]=v;}
