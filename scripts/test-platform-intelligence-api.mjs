import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import fs from 'node:fs';
import { handleFinance } from '../lib/api/domains/finance.mjs';
import { financialCopilotTools } from '../lib/api/domains/finance-copilot.mjs';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const org=id(1), contract=id(2), actor=id(3), entity=id(4);
const previous = Object.fromEntries(['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY'].map(k=>[k,process.env[k]]));
process.env.SUPABASE_URL='https://supabase.example.invalid';process.env.SUPABASE_ANON_KEY='fixture';delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const original=globalThis.fetch;
const values=JSON.parse(fs.readFileSync('tests/fixtures/platform-intelligence/product-terms.json')).bank_guarantee;
let calls=[], hidden=false, mismatch=false, conflict=false;
globalThis.fetch=async(url, options)=>{
 const u=new URL(url);calls.push({u,options});
 if(u.pathname.endsWith('/fin_organizations')) return Response.json([{id:org,kind:'BUYER'}]);
 if(u.pathname.endsWith('/fin_members')) return Response.json([{role:'admin'}]);
 if(u.pathname.endsWith('/fin_contracts')) return Response.json(hidden?[]:[{id:contract,title:'Garantia declarada',product:'guarantee',legal_entity_id:mismatch&&u.searchParams.get('id')===`eq.${id(9)}`?id(10):entity}]);
 if(u.pathname.endsWith('/fin_contract_versions')) return Response.json([{version:1,effective_from:'2026-01-01',source:'import',terms:{product_terms:{schema_version:'financial-product-terms-1',modality:'bank_guarantee',values}}}]);
 if(u.pathname.endsWith('/rpc/fin_crm_command')) return conflict?Response.json({message:'crm request conflict'},{status:400}):Response.json({id:id(8),version:1,replayed:true});
 return Response.json([]);
};
async function call(path, body){
 const req=Object.assign(Readable.from([JSON.stringify(body)]),{method:'POST',url:`/api/finance/${path}`,headers:{}});
 const res={statusCode:200,setHeader(){},end(s){this.body=JSON.parse(s)}};
 await handleFinance(req,res,path,{requireUser:async()=>({user:{id:actor},accessToken:'person-jwt'}),enforceRateLimit:async()=>{}});return res;
}
try{
 await assert.rejects(()=>call('copilot/ask',{organization_id:org,question:'Quais contratos?'}),e=>e.status===503&&e.code==='copilot_not_configured');
 const activity={organization_id:org,legal_entity_id:entity,request_key:id(7),values:{kind:'follow_up',status:'planned',subject:'Revisar contrato',due_on:'2026-11-05',source_reference:'Reunião declarada'}};
 await assert.rejects(()=>call('copilot/confirm',activity),e=>e.status===400);assert(!calls.some(c=>c.u.pathname.endsWith('/rpc/fin_crm_command')));
 const confirmed=await call('copilot/confirm',{...activity,confirmation:true});assert.equal(confirmed.body.replayed,true);
 assert.equal(JSON.parse(calls.at(-1).options.body).p_scope.legal_entity_id,entity);
 conflict=true;await assert.rejects(()=>call('copilot/confirm',{...activity,confirmation:true}),e=>e.status===409);conflict=false;
 const analysis={organization_id:org,sources:[{contract_id:contract,version:1}],scenarios:[{label:'Base',period_start:'2026-01-01',period_end:'2027-01-01',currency:'BRL',guaranteed_amount:1000000,source_reference:'Hipótese declarada'}]};
 const result=await call('guarantee-economics',analysis);assert.equal(result.body.analysis.scenarios[0].results[0].total,20150);
 const before=calls.length;await assert.rejects(()=>call('guarantee-economics',{...analysis,scenarios:[{...analysis.scenarios[0],guaranteed_amount:'1'}]}),e=>e.status===400);assert.equal(calls.length,before);
 mismatch=true;await assert.rejects(()=>call('guarantee-economics',{...analysis,sources:[...analysis.sources,{contract_id:id(9),version:1}]}),e=>e.status===404);mismatch=false;
 hidden=true;calls=[];await assert.rejects(()=>call('guarantee-economics',analysis),e=>e.status===404);assert(!calls.some(c=>c.u.pathname.endsWith('/fin_contract_versions')));hidden=false;
 const tools=financialCopilotTools({token:'person-jwt',organizationId:org});calls=[];
 await tools.read_financial.execute({kind:'contracts',provider_id:id(5),due_after:'2026-11-01',due_before:'2027-01-30'});
 assert.equal(calls.at(-1).u.searchParams.get('organization_id'),`eq.${org}`);assert.deepEqual(calls.at(-1).u.searchParams.getAll('ends_on'),['lte.2027-01-30','gte.2026-11-01']);
 assert(calls.every(c=>c.options.headers.Authorization==='Bearer person-jwt'));
 console.log('Platform Intelligence API: real handlers, JWT scope, source authorization, cross entity rejection, typed scenarios, unavailable LLM and explicit CRM confirmation/replay PASS (HTTP mocks).');
}finally{globalThis.fetch=original;for(const[k,v]of Object.entries(previous))if(v===undefined)delete process.env[k];else process.env[k]=v;}
