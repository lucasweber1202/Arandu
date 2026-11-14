import { approvalTimestamp } from './finance-approval-context.mjs';
import { isDeepStrictEqual } from 'node:util';
import { HttpError, json, readBody, safeObject } from '../../api-core.mjs';
import { requireUuid, query, rest, rpc, memberOrganization, loadRfq } from './finance-core.mjs';
import { operationalPage, orderedPageFilters, operationalPageResult, CREATED_DESC } from './finance-operational-pages.mjs';
import { buildComparison, applyUserWeights, comparableFields, NEUTRAL_RANKING_NOTICE } from '../../finance/comparison.mjs';

export function scenarioFreshness(scenario, current) {
  const reasons=[];
  if (!current || !scenario.context) reasons.push('context_unavailable');
  else {
    if(scenario.context.rfq_revision!==current.rfq_revision || scenario.context.rfq_updated_at!==current.rfq_updated_at) reasons.push('rfq_changed');
    if(scenario.context.rfq_status!==current.rfq_status) reasons.push('process_changed');
    if(!isDeepStrictEqual(scenario.context.sources,current.sources)) reasons.push('proposals_changed');
  }
  const {request_key,request_payload,...record}=scenario;
  return {...record,stale:reasons.length>0,stale_reasons:reasons,classification:'human_analysis'};
}
function weightsFor(product,weights) {
  const allowed=new Set(comparableFields(product).map(f=>f.key));
  if(!weights || Array.isArray(weights)||typeof weights!=='object'||!Object.keys(weights).length||Object.keys(weights).length>30
    ||Object.entries(weights).some(([k,v])=>!allowed.has(k)||typeof v!=='number'||!Number.isFinite(v)||v<=0||v>100))
    throw new HttpError(400,'Informe critérios comparáveis e pesos entre 0 e 100.','invalid_scenario');
  return weights;
}
const invalid=()=>{throw new HttpError(400,'Confira os campos do cenário.','invalid_scenario');};
async function record(token,id) {
  const rows=await rest(token,`fin_decision_scenarios?select=*&id=eq.${requireUuid(id,'id')}&limit=1`);
  if(!rows?.[0])throw new HttpError(404,'Cenário não disponível.','scenario_not_found');
  return rows[0];
}
export async function handleFinanceScenarios(req,res,{resource,sub,token,session,headers,loadComparisonProposals}) {
  if(resource!=='decision-scenarios')return false;
  const q=query(req);
  if(req.method==='GET'&&!sub) {
    if([...q.keys()].some(k=>!['rfq_id','limit','cursor','status'].includes(k))||[...q.keys()].some(k=>q.getAll(k).length>1))invalid();
    const rfq=await loadRfq(token,q.get('rfq_id'));
    await memberOrganization(token,rfq.organization_id,['BUYER']);
    const status=q.get('status')||'active';if(!['active','archived'].includes(status))invalid();
    const page=operationalPage(q,{kind:'scenarios-v1',rfq:rfq.id,viewer:session.user.id,status},CREATED_DESC);
    const filters=orderedPageFilters(page);filters.set('select','*');filters.set('rfq_id',`eq.${rfq.id}`);filters.set('status',`eq.${status}`);
    const [rows,context]=await Promise.all([rest(token,`fin_decision_scenarios?${filters}`),rpc(token,'fin_scenario_context',{p_rfq:rfq.id})]);
    const result=operationalPageResult(rows,page);result.rows=result.rows.map(s=>scenarioFreshness(s,context));
    json(res,200,{ok:true,...result},headers);return true;
  }
  if(req.method==='GET'&&sub==='detail') {
    const s=await record(token,q.get('id'));
    const page=operationalPage(q,{kind:'scenario-history-v1',id:s.id,viewer:session.user.id},[{name:'happened_at',direction:'desc',type:'timestamp'},{name:'id',direction:'desc',type:'uuid'}]);
    const filters=orderedPageFilters(page);filters.set('select','id,event_type,actor_id,happened_at,metadata');filters.set('organization_id',`eq.${s.organization_id}`);filters.set('entity_type','eq.decision_scenario');filters.set('entity_id',`eq.${s.id}`);
    const [history,context]=await Promise.all([rest(token,`fin_events?${filters}`),rpc(token,'fin_scenario_context',{p_rfq:s.rfq_id})]);
    const result=operationalPageResult(history,page);
    json(res,200,{ok:true,scenario:scenarioFreshness(s,context),history:result.rows,coverage:{history:result.page},consistency:result.consistency},headers);return true;
  }
  if(req.method==='POST'&&sub==='compare') {
    const body=await readBody(req),rfq=await loadRfq(token,body.rfq_id);
    await memberOrganization(token,rfq.organization_id,['BUYER']);
    if(!Array.isArray(body.scenario_ids)||body.scenario_ids.length<1||body.scenario_ids.length>3||new Set(body.scenario_ids).size!==body.scenario_ids.length)invalid();
    const records=await Promise.all(body.scenario_ids.map(id=>record(token,id)));
    if(records.some(s=>s.rfq_id!==rfq.id))invalid();
    const before=await rpc(token,'fin_scenario_context',{p_rfq:rfq.id});
    if(rfq.revision!==before.rfq_revision || approvalTimestamp(rfq.updated_at)!==approvalTimestamp(before.rfq_updated_at) || records.some(s=>scenarioFreshness(s,before).stale))throw new HttpError(409,'Atualize explicitamente o contexto antes de recalcular.','scenario_stale');
    const proposals=await loadComparisonProposals(token,rfq.id);
    const after=await rpc(token,'fin_scenario_context',{p_rfq:rfq.id});
    if(!isDeepStrictEqual(before,after))throw new HttpError(409,'O contexto mudou durante a análise.','scenario_stale');
    json(res,200,{ok:true,classification:'human_analysis',notice:NEUTRAL_RANKING_NOTICE,context:after,
      comparison:buildComparison(rfq.product,proposals,safeObject(rfq.demand),{revision:rfq.revision}),
      scenarios:records.map(s=>({scenario:scenarioFreshness(s,after),weighted:applyUserWeights(rfq.product,proposals,s.weights)}))},headers);return true;
  }
  const operation=req.method==='POST'&&!sub?'create':req.method==='PATCH'&&!sub?'update':req.method==='POST'&&['archive','duplicate'].includes(sub)?sub:null;
  if(!operation)throw new HttpError(404,'Operação de cenário não disponível.','not_found');
  const body=await readBody(req);
  const existing=operation==='create'?null:await record(token,body.id);
  const rfq=await loadRfq(token,existing?.rfq_id||body.rfq_id);
  await memberOrganization(token,rfq.organization_id,['BUYER']);
  const input={};
  if(operation!=='archive') {
    if(typeof body.name!=='string'||body.name.trim().length<2||body.name.trim().length>120||/[<>]/.test(body.name))invalid();
    input.name=body.name.trim();
  }
  if(['create','update'].includes(operation))input.weights=weightsFor(rfq.product,body.weights);
  if(['create','duplicate'].includes(operation)) {
    if(typeof body.request_key!=='string'||!/^[A-Za-z0-9._:-]{8,80}$/.test(body.request_key))invalid();input.request_key=body.request_key;
  }
  if(body.refresh_context!==undefined) {if(typeof body.refresh_context!=='boolean')invalid();input.refresh_context=body.refresh_context;}
  if(['update','archive'].includes(operation)&&(!Number.isSafeInteger(body.expected_version)||body.expected_version<1))invalid();
  const scenario=await rpc(token,'fin_scenario_command',{p_rfq:rfq.id,p_id:existing?.id??null,p_expected:body.expected_version??null,p_operation:operation,p_input:input});
  const context=await rpc(token,'fin_scenario_context',{p_rfq:rfq.id});
  json(res,operation==='create'||operation==='duplicate'?201:200,{ok:true,scenario:scenarioFreshness(scenario,context)},headers);return true;
}
