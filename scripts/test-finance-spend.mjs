import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {handleFinance} from '../lib/api/domains/finance.mjs';
import {presentSpendPage,presentSpendDetail} from '../lib/finance/spend-presenter.mjs';
const ID='00000000-0000-4000-8000-000000000001';
const rows=[{id:ID,value_kind:'verified',currency:'BRL',amount:'95.00',source_table:'fin_spend_records',contract_id:ID,reconciliation_status:'confirmed'}];
const detail=presentSpendDetail({row:rows[0],history:[],reviews:[]});assert.equal(detail.actions.length,1);assert.equal(detail.actions[0].fields.find(f=>f[0]==='value_kind')[3].value,'observed');
assert.equal(presentSpendDetail({row:{...rows[0],source_table:'fin_fee_observations'},history:[],reviews:[]}).actions.length,0);
const page=presentSpendPage({rows:[],contracts:[],summary:{rows:[{currency:'BRL',value_kind:'verified',amount:'100.00'},{currency:'USD',value_kind:'estimated',amount:null}]}});assert.match(JSON.stringify(page),/indisponível/);assert.match(JSON.stringify(page),/Não soma moedas ou tipos/);
process.env.SUPABASE_URL='https://fixture.example.invalid';process.env.SUPABASE_ANON_KEY='fixture-public';delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const sent=[];globalThis.fetch=async(url,options={})=>{const u=new URL(url);sent.push({url:u.pathname,headers:options.headers,body:options.body?JSON.parse(options.body):null});if(u.pathname.endsWith('/fin_organizations'))return new Response(JSON.stringify([{id:ID,kind:'BUYER'}]));if(u.pathname.endsWith('/fin_spend_summary'))return new Response(JSON.stringify({rows:[]}));return new Response(u.pathname.includes('/rpc/')?JSON.stringify(ID):'[]');};
const deps={requireUser:async()=>({user:{id:ID},accessToken:'caller-jwt',headers:{}}),enforceRateLimit:async()=>{}};
async function call(method,path,body){const req=Object.assign(Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]),{method,url:`/api/finance/${path}`,headers:{}});const res={setHeader(){},end(raw){this.payload=JSON.parse(raw);}};await handleFinance(req,res,path.split('?')[0],deps);return res.payload;}
await call('GET',`spend?organization_id=${ID}`);await assert.rejects(()=>call('GET',`spend/detail?id=${ID}`),e=>e.status===404);
for(const path of ['spend?start=2026-02-31','spend?start=2026-10-01&end=2026-01-01','spend?after=-1','spend?provider_id=x'])await assert.rejects(()=>call('GET',path),e=>e.status===400);
await call('POST','spend/record',{contract_id:ID,amount:'100.00',organization_id:'forged'});assert.equal(sent.find(s=>s.url.endsWith('/fin_record_spend')).body.p_input.organization_id,undefined);
await call('POST','spend/reconcile',{record_id:ID,status:'confirmed',reason:'Verificação independente',no_duplicate_confirmed:'false'});assert.equal(sent.find(s=>s.url.endsWith('/fin_reconcile_spend')).body.p_input.no_duplicate_confirmed,false);
for(const s of sent)assert.equal(s.headers.Authorization,'Bearer caller-jwt');console.log('Spend: type/currency separation, unknown amounts, read-only fee sources, immutable correction inputs, date/UUID/page rejection, JWT and derived tenant passed.');
