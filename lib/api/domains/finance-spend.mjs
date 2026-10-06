import {HttpError,json,readBody} from '../../api-core.mjs';
import {requireUuid,query,rest,rpc,memberOrganization} from './finance-core.mjs';
import {presentSpendPage,presentSpendDetail} from '../../finance/spend-presenter.mjs';
const pick=(b,keys)=>Object.fromEntries(keys.filter(k=>b[k]!==undefined&&b[k]!=='').map(k=>[k,b[k]]));
const optional=(v,k)=>v?requireUuid(v,k):null;
export async function handleFinanceSpend(req,res,{resource,sub,token,headers}){
 if(resource!=='spend')return false;const q=query(req);
 if(req.method==='GET'){
  if(sub==='detail'){
   const id=requireUuid(q.get('id'),'id');const rows=await rest(token,`fin_spend_monitor?select=*&id=eq.${id}&limit=1`);if(!rows?.[0])throw new HttpError(404,'Registro indisponível.','not_found');
   let history=[],reviews=[];if(rows[0].source_table==='fin_spend_records'){const source=await rest(token,`fin_spend_records?select=source_key&id=eq.${id}&limit=1`);if(!source?.[0])throw new HttpError(404,'Registro indisponível.','not_found');history=await rest(token,`fin_spend_records?select=*&organization_id=eq.${rows[0].organization_id}&source_key=eq.${source[0].source_key}&order=revision.asc&limit=501`);reviews=await rest(token,`fin_spend_reconciliations?select=*&record_id=eq.${id}&limit=1`);if(history?.length>500)throw new HttpError(409,'Use o export governado para o histórico completo.','spend_coverage_limit');}
   json(res,200,{ok:true,...presentSpendDetail({row:rows[0],history:history||[],reviews:reviews||[]})},headers);return true;
  }
  if(sub&&sub!=='summary')throw new HttpError(404,'Recurso indisponível.','not_found');const org=await memberOrganization(token,q.get('organization_id'),['BUYER']);
  const year=new Date().getUTCFullYear();const start=q.get('start')||`${year}-01-01`,end=q.get('end')||`${year}-12-31`;
  const valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
  let dates=false;try{dates=valid(start)&&valid(end)&&end>=start&&Date.parse(end)-Date.parse(start)<=1826*86400000;}catch{}if(!dates)throw new HttpError(400,'Período inválido.','invalid_spend');
  const entity=optional(q.get('legal_entity_id'),'legal_entity_id'),provider=optional(q.get('provider_id'),'provider_id');const summary=await rpc(token,'fin_spend_summary',{p_org:org.id,p_start:start,p_end:end,p_entity:entity,p_provider:provider});if(sub==='summary'){json(res,200,{ok:true,...summary},headers);return true;}
  const offset=Number(q.get('after')||0);if(!Number.isInteger(offset)||offset<0||offset>5000)throw new HttpError(400,'Página inválida.','invalid_page');
  let filter=`organization_id=eq.${org.id}&period_end=gte.${start}&period_start=lte.${end}`;if(entity)filter+=`&legal_entity_id=eq.${entity}`;if(provider)filter+=`&provider_id=eq.${provider}`;
  const [rows,contracts]=await Promise.all([rest(token,`fin_spend_monitor?select=*&${filter}&order=period_start.desc,id.asc&limit=26&offset=${offset}`),rest(token,`fin_contracts?select=id,title&organization_id=eq.${org.id}&limit=501`)]);if(contracts?.length>500)throw new HttpError(409,'Configuração excede a cobertura da tela.','spend_coverage_limit');
  json(res,200,{ok:true,...presentSpendPage({rows:(rows||[]).slice(0,25),contracts:contracts||[],summary:summary||{},next:rows?.length>25?String(offset+25):null})},headers);return true;
 }
 if(req.method!=='POST')throw new HttpError(405,'Método indisponível.','method_not_allowed');const b=await readBody(req);let id;
 if(sub==='record')id=await rpc(token,'fin_record_spend',{p_contract:requireUuid(b.contract_id,'contract_id'),p_expected:optional(b.expected_record_id,'expected_record_id'),p_input:pick(b,['period_start','period_end','currency','value_kind','amount','source_type','source_reference','source_line','provenance','correction_reason'])});
 else if(sub==='reconcile')id=await rpc(token,'fin_reconcile_spend',{p_record:requireUuid(b.record_id,'record_id'),p_input:{status:b.status,reason:b.reason,no_duplicate_confirmed:b.no_duplicate_confirmed===true||b.no_duplicate_confirmed==='true'}});
 else throw new HttpError(404,'Recurso indisponível.','not_found');json(res,201,{ok:true,id},headers);return true;
}
