import { HttpError } from '../../api-core.mjs';
import { rest } from './finance-core.mjs';
import { operationalPage, orderedPageFilters, operationalPageResult, CREATED_DESC, DUE_ASC } from './finance-operational-pages.mjs';
import { projectTaskAssignees } from './finance-tasks.mjs';
import { contractInformationQuality, obligationWorkItems } from '../../finance/contract-operational.mjs';

const TASK_ORDER=[DUE_ASC[0],{name:'created_at',direction:'asc',type:'timestamp'},DUE_ASC[1]];
const EVENT_ORDER=[{name:'happened_at',direction:'desc',type:'timestamp'},CREATED_DESC[1]];
const SECTIONS=Object.freeze({
  documents:{table:'fin_private_documents',order:CREATED_DESC,select:'id,organization_id,buyer_organization_id,entity_type,entity_id,title,visibility,current_version,created_by,created_at'},
  obligations:{table:'fin_obligation_monitor',order:DUE_ASC,select:'id,organization_id,obligation_id,contract_id,legal_entity_id,provider_id,title,kind,owner_id,frequency,source_clause,source_reference,source_contract_version,obligation_version,cancellation_reason,period_start,period_end,due_on,task_id,created_at,facts'},
  tasks:{table:'fin_tasks',order:TASK_ORDER,select:'id,organization_id,legal_entity_id,title,due_on,status,related_type,related_id,created_at,created_by,assignee_id'},
  milestones:{table:'fin_contract_milestones',order:DUE_ASC,select:'id,organization_id,contract_id,kind,title,due_on,lead_days,recurrence,ends_after,owner_id,status,completed_at,created_at'},
  renewals:{table:'fin_events',order:EVENT_ORDER,select:'id,organization_id,entity_type,entity_id,event_type,actor_id,happened_at,metadata'}
});

export async function readContractOwnerContext(token,contract) {
  if(!contract.owner_id)return null;
  const rows=await rest(token,`fin_members?select=user_id,display_name,role,entity_scope&organization_id=eq.${contract.organization_id}&user_id=eq.${contract.owner_id}&limit=1`);
  const member=rows?.[0];
  let entityAllowed=member?.entity_scope==='group';
  if(member?.entity_scope==='entities'&&contract.legal_entity_id) {
    const grants=await rest(token,`fin_member_entity_grants?select=entity_id&organization_id=eq.${contract.organization_id}&user_id=eq.${contract.owner_id}&entity_id=eq.${contract.legal_entity_id}&limit=1`);
    entityAllowed=Boolean(grants?.length);
  }
  return {user_id:contract.owner_id,display_name:member?.display_name??null,membership:member?'authorized_member_record':'not_visible_or_removed',
    eligible_in_membership:Boolean(member&&['admin','finance_manager','analyst'].includes(member.role)&&entityAllowed),
    coverage:'membership_role_and_entity_only',assignment_authorization:'revalidated_by_command_including_auth_and_governance'};
}

export async function readContractSection(token,contract,params,viewerId) {
  const section=params.get('section'),definition=SECTIONS[section];
  if(!Object.hasOwn(SECTIONS,section)||params.getAll('section').length!==1)throw new HttpError(400,'Seção de contrato inválida.','invalid_contract_section');
  if(params.getAll('id').length!==1||[...params.keys()].some(k=>!['id','section','status','limit','cursor'].includes(k)))throw new HttpError(400,'Filtro inválido para esta seção.','invalid_contract_filter');
  for(const key of ['status','assignee_id','unassigned'])if(params.getAll(key).length>1)throw new HttpError(400,'Filtro repetido.','invalid_contract_filter');
  let status=params.get('status');
  if(status!==null&&(section!=='tasks'&&section!=='milestones'||!(section==='tasks'?['open','done','cancelled','all']:['scheduled','done','cancelled','all']).includes(status)))throw new HttpError(400,'Situação inválida para esta seção.','invalid_contract_filter');
  if(status===null&&section==='tasks')status='open';
  if(['assignee_id','unassigned'].some(k=>params.has(k)))throw new HttpError(400,'Use a API de tarefas para filtrar responsáveis.','invalid_contract_filter');
  const controls=operationalPage(params,{kind:'contract-section-v1',organization:contract.organization_id,contract:contract.id,section,status,viewer:viewerId},definition.order,{maxLimit:50});
  const filters=orderedPageFilters(controls);
  filters.set('select',definition.select);
  filters.set(section==='documents'?'buyer_organization_id':'organization_id',`eq.${contract.organization_id}`);
  if(section==='documents') {
    filters.set('entity_type','eq.contract');filters.set('entity_id',`eq.${contract.id}`);filters.set('removed_at','is.null');
  } else if(section==='tasks') {
    filters.set('related_type','eq.contract');filters.set('related_id',`eq.${contract.id}`);
  } else if(section==='renewals') {
    filters.set('entity_type','eq.rfq');filters.set('event_type','eq.rfq_created_from_contract');filters.set('metadata->>contract_id',`eq.${contract.id}`);
  } else filters.set('contract_id',`eq.${contract.id}`);
  if(status&&status!=='all')filters.set('status',`eq.${status}`);
  const result=operationalPageResult(await rest(token,`${definition.table}?${filters}`),controls);
  let rows=result.rows;
  if(section==='tasks') {
    const ids=[...new Set(rows.map(row=>row.assignee_id).filter(Boolean))];
    const members=ids.length?await rest(token,`fin_members?select=user_id,display_name&organization_id=eq.${contract.organization_id}&user_id=in.(${ids.join(',')})&limit=${ids.length}`):[];
    rows=projectTaskAssignees(rows,members);
  }
  if(section==='documents') {
    const pairs=rows.filter(row=>row.current_version>0).map(row=>`and(document_id.eq.${row.id},version.eq.${row.current_version})`);
    const versions=pairs.length?await rest(token,`fin_document_versions?select=document_id,version,status,mime_type,size_bytes,uploaded_by,completed_at&status=eq.available&or=(${pairs.join(',')})&limit=${rows.length}`):[];
    const current=new Map((versions||[]).map(v=>[v.document_id,v]));
    rows=rows.map(row=>({...row,current:current.get(row.id)||null,availability:current.has(row.id)?'recorded_available':'not_confirmed_available',download_authorization:'rechecked_by_download_rpc'}));
  }
  if(section==='renewals') {
    const ids=[...new Set(rows.map(row=>row.entity_id))];
    const rfqs=ids.length?await rest(token,`fin_rfqs?select=id,organization_id,legal_entity_id,product,title,status,revision,response_deadline,created_at&organization_id=eq.${contract.organization_id}&id=in.(${ids.join(',')})&limit=${ids.length}`):[];
    const map=new Map((rfqs||[]).map(row=>[row.id,row]));
    rows=rows.map(row=>({...row,rfq:map.get(row.entity_id)||null,rfq_state:map.has(row.entity_id)?'authorized_record':'not_accessible_or_removed'}));
  }
  return {ok:true,contract:{id:contract.id,organization_id:contract.organization_id,legal_entity_id:contract.legal_entity_id??null,provider_id:contract.provider_id,product:contract.product,status:contract.status},
    section,rows,page:result.page,consistency:result.consistency,coverage:{scope:'authorized_contract',complete:!controls.cursor&&!result.page.has_more,first_page:!controls.cursor,has_more:result.page.has_more},
    ...(section==='obligations'?{work_items:obligationWorkItems(rows)}:{}),
    ...(section==='documents'?{information_quality:contractInformationQuality(contract,{documents:rows,documentsPartial:Boolean(controls.cursor)||result.page.has_more})}:{}),
    provenance:{resource:section,kind:'authorized_live_projection',duplicate_system_of_record:false}};
}
