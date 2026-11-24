import { HttpError, json, safeObject } from '../../api-core.mjs';
import { requireUuid, query, rest, memberOrganization, loadRfq } from './finance-core.mjs';
import { operationalPage, orderedPageFilters, operationalPageResult, CREATED_DESC, DUE_ASC, validDay } from './finance-operational-pages.mjs';
import { approvalReadContext } from './finance-approval-context.mjs';
import { demandFields, normalizeDemand } from '../../finance/products.mjs';

export function demandReadiness(rfq) {
 const demand=safeObject(rfq.demand),fields=demandFields(rfq.product),validation=normalizeDemand(rfq.product,demand);
 const missing=fields.filter(f=>f.required&&(demand[f.key]===null||demand[f.key]===undefined||demand[f.key]==='')).map(f=>f.key);
 return {ready:validation.errors.length===0,missing_fields:missing,validation_errors:validation.errors,
  coverage:{required:fields.filter(f=>f.required).length,missing:missing.length},
  provenance:{kind:'rfq_declared_data',rfq_id:rfq.id,revision:rfq.revision??null,updated_at:rfq.updated_at??null},
  passport:{endpoint:`rfq-passport?organization_id=${rfq.organization_id}&rfq_id=${rfq.id}`,suggestions_applied_automatically:false},
  notice:'Prontidão de preenchimento; não comprova aceite, crédito, autenticidade documental ou aprovação.'};
}
const bad=()=>{throw new HttpError(400,'Confira filtros e seção operacional.','invalid_work_query');};
const NOTICE_ASC=[{name:'notice_on',direction:'asc',type:'date'},{name:'id',direction:'asc',type:'uuid'}];
export async function handleWorkIntelligence(req,res,{resource,sub,token,session,headers}) {
 if(!['renewal-operations','work-intelligence','demand-readiness'].includes(resource))return false;
 if(req.method!=='GET'||sub)throw new HttpError(404,'Recurso não disponível.','not_found');
 const q=query(req);
 if(resource==='demand-readiness') {
  const rfq=await loadRfq(token,q.get('rfq_id'));await memberOrganization(token,rfq.organization_id,['BUYER']);
  json(res,200,{ok:true,rfq_id:rfq.id,readiness:demandReadiness(rfq)},headers);return true;
 }
 const allowed=['organization_id','section','limit','cursor','owner','legal_entity_id','due_to','due_from','urgency'];
 if([...q.keys()].some(k=>!allowed.includes(k)||q.getAll(k).length>1))bad();
 const organization=await memberOrganization(token,q.get('organization_id'),['BUYER']);
 const renewal=resource==='renewal-operations',section=renewal?'contracts':q.get('section');
 if(!['tasks','approvals','demands','contracts'].includes(section)||renewal&&q.has('section'))bad();
 const urgency=q.get('urgency');
 if(urgency&&(section!=='contracts'||!['expired','notice_due','renewing','upcoming'].includes(urgency)))bad();
 const owner=q.get('owner'),entity=q.get('legal_entity_id');
 if(owner&&owner!=='none')requireUuid(owner,'owner');if(entity)requireUuid(entity,'legal_entity_id');
 for(const key of ['due_to','due_from'])if(q.has(key)&&!validDay(q.get(key)))bad();
 if(q.get('due_from')&&q.get('due_to')&&q.get('due_from')>q.get('due_to'))bad();
 if(section==='approvals'&&(owner||q.has('due_to')||q.has('due_from')||entity))bad();
 if(section==='demands'&&(q.has('due_to')||q.has('due_from')))bad();
 const table={tasks:'fin_tasks',approvals:'fin_approval_requests',demands:'fin_rfqs',contracts:'fin_renewal_operations'}[section];
 const select={tasks:'id,organization_id,title,due_on,status,assignee_id,related_type,related_id,created_at',
 approvals:'id,organization_id,rfq_id,proposal_id,external_proposal_id,proposal_version,rfq_updated_at,external_rfq_revision,status,expires_at,requested_by,requested_at',
 demands:'id,organization_id,legal_entity_id,product,title,status,owner_id,demand,revision,updated_at,created_at',contracts:'*'}[section];
 const order=section==='contracts'?NOTICE_ASC:section==='tasks'?DUE_ASC:section==='approvals'?[{name:'requested_at',direction:'desc',type:'timestamp'},{name:'id',direction:'desc',type:'uuid'}]:CREATED_DESC;
 const page=operationalPage(q,{kind:'work-v1',section,organization:organization.id,viewer:session.user.id,owner,entity,urgency,from:q.get('due_from'),to:q.get('due_to')},order,{maxLimit:50});
 const filters=orderedPageFilters(page);filters.set('select',select);filters.set('organization_id',`eq.${organization.id}`);
 if(section==='tasks')filters.set('status','eq.open');if(section==='approvals')filters.set('status','eq.pending');if(section==='demands')filters.set('status','eq.draft');
 if(section==='contracts') {if(urgency)filters.set('urgency',`eq.${urgency}`);else if(!renewal)filters.set('urgency','in.(expired,notice_due,renewing)');}
 if(entity)filters.set('legal_entity_id',`eq.${entity}`);
 if(owner) {if(section==='contracts'&&owner==='none')filters.set('unassigned','eq.true');else filters.set(section==='tasks'?'assignee_id':'owner_id',owner==='none'?'is.null':`eq.${owner}`);}
 const date=section==='contracts'?'notice_on':'due_on';
 if(q.get('due_from'))filters.append(date,`gte.${q.get('due_from')}`);if(q.get('due_to'))filters.append(date,`lte.${q.get('due_to')}`);
 const [fetched,members]=await Promise.all([rest(token,`${table}?${filters}`),rest(token,`fin_members?select=role&organization_id=eq.${organization.id}&user_id=eq.${requireUuid(session.user.id,'viewer')}&limit=1`)]);
 const result=operationalPageResult(fetched,page),role=members?.[0]?.role;
 let rows=result.rows;
 if(section==='approvals')rows=(await approvalReadContext(token,organization.id,rows)).map(r=>({...r,viewer_can_act:false,action_conditions:{...r.action_conditions,assignment:'load_approvals_detail',endpoint:`approvals?organization_id=${organization.id}&rfq_id=${r.rfq_id}`}}));
 if(section==='demands')rows=rows.map(r=>({...r,readiness:demandReadiness(r),actions:{can_edit:['admin','finance_manager','analyst'].includes(role),authorization:'rechecked_on_command'}}));
 if(section==='tasks')rows=rows.map(r=>({...r,overdue:!!r.due_on&&r.due_on<new Date().toISOString().slice(0,10),unassigned:!r.assignee_id,actions:{can_edit:['admin','finance_manager','analyst'].includes(role),authorization:'rechecked_on_command'}}));
 let enrichment=null;
 if(section==='contracts'&&rows.length) {
  const ids=rows.map(r=>r.id).join(',');
  const [tasks,milestones,events]=await Promise.all([
   rest(token,`fin_tasks?select=id,related_id,title,status,due_on,assignee_id&organization_id=eq.${organization.id}&related_type=eq.contract&status=eq.open&related_id=in.(${ids})&order=due_on.asc.nullslast,id.asc&limit=501`),
   rest(token,`fin_contract_milestones?select=id,contract_id,kind,title,due_on,status&organization_id=eq.${organization.id}&contract_id=in.(${ids})&order=due_on.asc,id.asc&limit=501`),
   rest(token,`fin_events?select=id,entity_id,metadata,happened_at&organization_id=eq.${organization.id}&entity_type=eq.contract&entity_id=in.(${ids})&event_type=eq.renewal_rfq_started&order=happened_at.desc,id.desc&limit=501`)
  ]);
  const rfqIds=[...new Set(events.slice(0,500).map(e=>e.metadata?.rfq_id).filter(Boolean))];
  const rfqs=[];
  for(let i=0;i<rfqIds.length;i+=50)rfqs.push(...await rest(token,`fin_rfqs?select=id,title,status,owner_id,revision&organization_id=eq.${organization.id}&id=in.(${rfqIds.slice(i,i+50).map(id=>requireUuid(id,'rfq')).join(',')})&limit=50`));
  enrichment=Object.fromEntries([['tasks',tasks],['milestones',milestones],['renewal_links',events]].map(([key,values])=>[key,{limit:500,complete:values.length<=500,returned:Math.min(values.length,500),scope:'visible_contract_page'}]));
  rows=rows.map(r=>({...r,tasks:tasks.slice(0,500).filter(t=>t.related_id===r.id),milestones:milestones.slice(0,500).filter(m=>m.contract_id===r.id),
   renewal_rfqs:rfqs.filter(f=>events.slice(0,500).some(e=>e.entity_id===r.id&&e.metadata?.rfq_id===f.id)),
   history:{endpoint:`contract-detail?id=${r.id}`,parent_contract_id:r.parent_contract_id,source_rfq_id:r.rfq_id},
   actions:{can_start_renewal:['admin','finance_manager'].includes(role)&&['credit','acquiring'].includes(r.product),endpoint:'contract-renewal-rfq',authorization:'rechecked_on_command',automatic_negotiation:false}}));
 }
 json(res,200,{ok:true,...result,rows,section,page_count:rows.length,coverage:{scope:'authorized_visible_records',total:null,complete:!q.has('cursor')&&!result.page.has_more,counts:'page_only',enrichment},generated_at:new Date().toISOString()},headers);return true;
}
