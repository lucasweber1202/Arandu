import {HttpError,json,readBody} from '../../api-core.mjs';
import {requireUuid,query,rest,rpc,memberOrganization} from './finance-core.mjs';
import {presentPerformancePage,presentPerformanceDetail} from '../../finance/performance-presenter.mjs';
const optional=(v,k)=>v?requireUuid(v,k):null;
const pick=(b,keys)=>Object.fromEntries(keys.filter(k=>b[k]!==undefined&&b[k]!=='').map(k=>[k,b[k]]));
export async function handleFinancePerformance(req,res,{resource,sub,token,headers}){
 if(resource!=='performance')return false;
 const q=query(req);
 if(req.method==='GET'){
  if(sub==='detail'){
   const id=requireUuid(q.get('id'),'id');const periods=await rest(token,`fin_provider_performance_periods?select=*&id=eq.${id}&limit=1`);
   if(!periods?.[0])throw new HttpError(404,'Período indisponível.','not_found');
   const data=await Promise.all(['fin_provider_performance_monitor','fin_provider_performance_observations','fin_provider_performance_reviews'].map(t=>rest(token,`${t}?select=*&period_id=eq.${id}&limit=501`)));
   if(data.some(d=>d?.length>500))throw new HttpError(409,'Use o export governado para o histórico completo.','performance_coverage_limit');
   const history=await rest(token,`fin_provider_performance_monitor?select=*&contract_id=eq.${periods[0].contract_id}&order=period_end.asc,dimension_id.asc&limit=501`);
   if(history?.length>500)throw new HttpError(409,'Histórico excede a cobertura desta tela; use o export governado.','performance_coverage_limit');
   json(res,200,{ok:true,...presentPerformanceDetail({period:periods[0],metrics:data[0]||[],observations:data[1]||[],reviews:data[2]||[],history:history||[]})},headers);return true;
  }
  const org=await memberOrganization(token,q.get('organization_id'),['BUYER']);
  if(sub==='summary'){json(res,200,{ok:true,...await rpc(token,'fin_performance_summary',{p_org:org.id,p_entity:optional(q.get('legal_entity_id'),'legal_entity_id')})},headers);return true;}
  if(sub)throw new HttpError(404,'Recurso indisponível.','not_found');
  const offset=Number(q.get('after')||0);if(!Number.isInteger(offset)||offset<0||offset>5000)throw new HttpError(400,'Página inválida.','invalid_page');
  let filter=`organization_id=eq.${org.id}`;for(const k of ['provider_id','legal_entity_id'])if(q.get(k))filter+=`&${k}=eq.${requireUuid(q.get(k),k)}`;
  const [rows,contracts,dimensions,members]=await Promise.all([rest(token,`fin_provider_performance_periods?select=*&${filter}&order=period_end.desc,id.asc&limit=26&offset=${offset}`),rest(token,`fin_contracts?select=id,title&organization_id=eq.${org.id}&status=in.(active,renewing)&limit=501`),rest(token,`fin_provider_performance_dimensions?select=*&organization_id=eq.${org.id}&order=dimension_key.asc,version.desc&limit=501`),rest(token,`fin_members?select=user_id,role,display_name&organization_id=eq.${org.id}&limit=501`)]);
  if([contracts,dimensions,members].some(d=>d?.length>500))throw new HttpError(409,'Configuração excede a cobertura desta tela.','performance_coverage_limit');
  json(res,200,{ok:true,...presentPerformancePage({rows:(rows||[]).slice(0,25),contracts:contracts||[],dimensions:dimensions||[],members:members||[],next:rows?.length>25?String(offset+25):null})},headers);return true;
 }
 if(req.method!=='POST')throw new HttpError(405,'Método indisponível.','method_not_allowed');
 const b=await readBody(req);let id;
 if(sub==='dimension'){const org=await memberOrganization(token,b.organization_id,['BUYER']);id=await rpc(token,'fin_performance_dimension',{p_org:org.id,p_input:pick(b,['dimension_key','title','metric','unit','methodology'])});}
 else if(sub==='open'){
  let dimensions=b.dimensions;try{if(typeof dimensions==='string')dimensions=JSON.parse(dimensions);}catch{throw new HttpError(400,'Dimensões: informe um array JSON válido.','invalid_performance');}
  if(!Array.isArray(dimensions)||!dimensions.length||dimensions.length>20)throw new HttpError(400,'Selecione de 1 a 20 dimensões.','invalid_performance');
  id=await rpc(token,'fin_open_performance_period',{p_contract:requireUuid(b.contract_id,'contract_id'),p_input:{...pick(b,['title','period_start','period_end','review_due_on','owner_id','previous_period_id']),dimensions}});
 }else if(sub==='measure')id=await rpc(token,'fin_measure_performance',{p_period:requireUuid(b.period_id,'period_id'),p_dimension:requireUuid(b.dimension_id,'dimension_id'),p_expected:optional(b.expected_observation_id,'expected_observation_id'),p_input:pick(b,['value','availability','source_type','source_reference','provenance','coverage_numerator','coverage_denominator','observed_on','correction_reason'])});
 else if(sub==='review')id=await rpc(token,'fin_review_performance',{p_observation:requireUuid(b.observation_id,'observation_id'),p_input:pick(b,['status','reason'])});
 else if(sub==='close'){
  const n=Number(b.expected_version);if(!Number.isSafeInteger(n)||n<1)throw new HttpError(400,'Versão inválida.','invalid_performance');
  id=await rpc(token,'fin_close_performance',{p_period:requireUuid(b.period_id,'period_id'),p_expected:n,p_input:{confirm:b.confirm===true||b.confirm==='true',reason:b.reason}});
 }else throw new HttpError(404,'Recurso indisponível.','not_found');
 json(res,201,{ok:true,id:id||null},headers);return true;
}
