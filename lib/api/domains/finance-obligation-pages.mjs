import { HttpError } from '../../api-core.mjs';
import { requireUuid, rest } from './finance-core.mjs';
import { operationalPage, orderedPageFilters, operationalPageResult, DUE_ASC, validDay } from './finance-operational-pages.mjs';
import { OBLIGATION_STATES } from '../../finance/covenants.mjs';
import { obligationWorkItems } from '../../finance/contract-operational.mjs';

export const OBLIGATION_RECORD_FIELDS='id,organization_id,obligation_id,contract_id,legal_entity_id,provider_id,title,kind,owner_id,frequency,source_clause,source_reference,source_contract_version,obligation_version,cancellation_reason,period_start,period_end,due_on,task_id,created_at,facts';
export async function readObligationRecords(token,org,params,viewerId) {
  const allowed=new Set(['organization_id','format','contract_id','provider_id','legal_entity_id','obligation_id','owner_id','status','due_from','due_to','limit','cursor']);
  if([...params.keys()].some(k=>!allowed.has(k))||[...allowed].some(k=>params.getAll(k).length>1))throw new HttpError(400,'Filtros de obrigação inválidos.','invalid_query');
  const scope={organization_id:org},filters=new URLSearchParams({select:OBLIGATION_RECORD_FIELDS,organization_id:`eq.${org}`});
  for(const key of ['contract_id','provider_id','legal_entity_id','obligation_id','owner_id'])if(params.has(key)) {
    scope[key]=requireUuid(params.get(key),key);filters.set(key,`eq.${scope[key]}`);
  }
  if(params.has('status')) {
    const status=params.get('status');if(!Object.hasOwn(OBLIGATION_STATES,status))throw new HttpError(400,'Estado de obrigação inválido.','invalid_query');
    scope.status=status;filters.set('facts->>status',`eq.${status}`);
  }
  for(const key of ['due_from','due_to'])if(params.has(key)) {
    if(!validDay(params.get(key)))throw new HttpError(400,'Prazo de obrigação inválido.','invalid_query');scope[key]=params.get(key);
  }
  if(scope.due_from&&scope.due_to&&scope.due_from>scope.due_to)throw new HttpError(400,'Intervalo de prazo inválido.','invalid_query');
  const bounds=[];if(scope.due_from)bounds.push(`due_on.gte.${scope.due_from}`);if(scope.due_to)bounds.push(`due_on.lte.${scope.due_to}`);
  if(bounds.length)filters.set('and',`(${bounds.join(',')})`);
  const controls=operationalPage(params,{kind:'obligation-records-v1',scope,viewer:viewerId},DUE_ASC,{maxLimit:50});
  for(const [key,value] of orderedPageFilters(controls))filters.set(key,value);
  const result=operationalPageResult(await rest(token,`fin_obligation_monitor?${filters}`),controls);
  return {ok:true,...result,scope,work_items:obligationWorkItems(result.rows),
    coverage:{complete:!controls.cursor&&!result.page.has_more,first_page:!controls.cursor,has_more:result.page.has_more},
    provenance:{kind:'authorized_live_projection',facts:'database_obligation_facts',conclusion:'human_review_required'}};
}
