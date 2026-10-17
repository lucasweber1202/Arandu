import { HttpError,json,readBody } from '../../api-core.mjs';
import { requireUuid,query,rest,rpc,memberOrganization } from './finance-core.mjs';
import { validateImplementationOpen } from '../../finance/implementation.mjs';
import { presentImplementationPage,presentImplementationDetail } from '../../finance/implementation-presenter.mjs';
const today=()=>new Date().toISOString().slice(0,10);
const optional=(v,k)=>v?requireUuid(v,k):null;
const version=v=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<1)throw new HttpError(400,'Versão inválida.','invalid_implementation');return n;};
// Bounded lookups under the actor JWT; hidden provenance never uses a privileged fallback.
async function implementationOrigin(token, plan) {
  const org = requireUuid(plan.organization_id, 'organization_id');
  const read = (table, columns, id) => id ? rest(token, `${table}?select=${columns}&organization_id=eq.${org}&id=eq.${requireUuid(id, 'reference_id')}&limit=1`) : [];
  const [contracts, decisions, providers, entities] = await Promise.all([
    read('fin_contracts', 'id,title,status', plan.contract_id),
    read('fin_decisions', 'id,decided_at', plan.decision_id),
    read('fin_providers', 'id,name', plan.provider_id),
    read('fin_legal_entities', 'id,legal_name', plan.legal_entity_id)
  ]);
  return { contracts: contracts || [], decisions: decisions || [], providers: providers || [], entities: entities || [] };
}
export async function handleFinanceImplementations(req,res,{resource,sub,token,headers}) {
  if(resource!=='implementations')return false;
  const q=query(req);
  if(req.method==='GET'){
    if(sub && sub!=='detail')throw new HttpError(404,'Recurso indisponível.','not_found');
    const contractId=q.has('contract_id')?requireUuid(q.get('contract_id'),'contract_id'):null;
    if(q.getAll('contract_id').length>1 || (sub && contractId))throw new HttpError(400,'Filtro de contrato disponível apenas na lista, uma vez.','invalid_query');
    let rows,org;
    if(sub==='detail'){rows=await rest(token,`fin_implementation_plans?select=*&id=eq.${requireUuid(q.get('id'),'id')}&limit=1`);if(!rows?.[0])throw new HttpError(404,'Implantação indisponível para sua conta.','implementation_not_found');org={id:rows[0].organization_id};}
    else{org=await memberOrganization(token,q.get('organization_id'),['BUYER']);const offset=Number(q.get('after') || 0);if(!Number.isInteger(offset)||offset<0||offset>5000)throw new HttpError(400,'Página inválida.','invalid_page');let filters=`organization_id=eq.${org.id}`;for(const k of ['provider_id','legal_entity_id','contract_id'])if(q.get(k))filters+=`&${k}=eq.${requireUuid(q.get(k),k)}`;rows=await rest(token,`fin_implementation_plans?select=*&${filters}&order=updated_at.desc,id.desc&limit=26&offset=${offset}`);}
    const page=(rows || []).slice(0,25);const ids=page.map(p=>p.id);const child=(t,order)=>ids.length?rest(token,`${t}?select=*&plan_id=in.(${ids.join(',')})&order=${order}&limit=5001`):[];
    const [milestones,dependencies,issues,acceptances,members,contracts,origin]=await Promise.all([child('fin_implementation_milestones','position.asc,id.asc'),child('fin_implementation_dependencies','milestone_id.asc,depends_on_id.asc'),child('fin_implementation_issues','opened_at.asc,id.asc'),child('fin_implementation_acceptances','accepted_at.asc,id.asc'),rest(token,`fin_members?select=user_id,role,display_name&organization_id=eq.${org.id}&limit=500`),sub==='detail'?[]:rest(token,`fin_contracts?select=id,title,status&organization_id=eq.${org.id}&status=in.(active,renewing)&limit=500`),sub==='detail'?implementationOrigin(token,page[0]):{}]);
    if([milestones,dependencies,issues,acceptances].some(x=>x?.length>5000))throw new HttpError(409,'Refine o escopo para carregar o plano completo.','implementation_coverage_limit');
    const data={milestones:milestones || [],dependencies:dependencies || [],issues:issues || [],acceptances:acceptances || [],members:members || [],today:today()};
    json(res,200,{ok:true,...(sub==='detail'?presentImplementationDetail({...data,...origin,plan:page[0]}):presentImplementationPage({...data,rows:page,contracts:contracts || [],next:(rows || []).length>25?String(Number(q.get('after') || 0)+25):null}))},headers);return true;
  }
  if(req.method!=='POST')throw new HttpError(405,'Método indisponível.','method_not_allowed');
  const b=await readBody(req);let id;
  if(sub==='open'){const input={title:b.title,starts_on:b.starts_on,target_go_live:b.target_go_live,source_reference:b.source_reference,owner_id:optional(b.owner_id,'owner_id'),provider_owner_contact_id:optional(b.provider_owner_contact_id,'provider_owner_contact_id')};const error=validateImplementationOpen(input);if(error)throw new HttpError(400,error,'invalid_implementation');id=await rpc(token,'fin_open_implementation',{p_contract:requireUuid(b.contract_id,'contract_id'),p_input:input});}
  else if(sub==='milestone'){id=await rpc(token,'fin_update_implementation_milestone',{p_milestone:requireUuid(b.milestone_id,'milestone_id'),p_expected:version(b.expected_version),p_input:{status:b.status,owner_id:optional(b.owner_id,'owner_id'),...(b.due_on?{due_on:b.due_on}:{}),...(b.evidence_reference?{evidence_reference:b.evidence_reference}:{}),...(b.blocker?{blocker:b.blocker}:{}),document_id:optional(b.document_id,'document_id')}});}
  else if(sub==='issue' || sub==='resolve-issue'){id=await rpc(token,'fin_implementation_issue',{p_plan:requireUuid(b.plan_id,'plan_id'),p_issue:sub==='resolve-issue'?requireUuid(b.issue_id,'issue_id'):null,p_input:sub==='resolve-issue'?{resolution_reference:b.resolution_reference}:{title:b.title,due_on:b.due_on,owner_id:optional(b.owner_id,'owner_id'),milestone_id:optional(b.milestone_id,'milestone_id')}});}
  else if(sub==='accept'){id=await rpc(token,'fin_accept_implementation',{p_plan:requireUuid(b.plan_id,'plan_id'),p_expected:version(b.expected_version),p_input:{confirm:b.confirm===true || b.confirm==='true',actual_go_live:b.actual_go_live,evidence_reference:b.evidence_reference,value_record_id:optional(b.value_record_id,'value_record_id'),document_id:optional(b.document_id,'document_id')}});}
  else if(sub==='cancel'){id=await rpc(token,'fin_cancel_implementation',{p_plan:requireUuid(b.plan_id,'plan_id'),p_expected:version(b.expected_version),p_reason:b.reason});}
  else throw new HttpError(404,'Recurso indisponível.','not_found');
  json(res,201,{ok:true,id:id || null},headers);return true;
}
