// Deterministic information quality, not a legal conclusion or a decision.
export function contractInformationQuality(contract,{today=new Date().toISOString().slice(0,10),documents=null,documentsPartial=false,ownerContext=null}={}) {
  const fields={};
  for(const field of ['ends_on','renewal_notice_days','owner_id','origin','current_version']) {
    fields[field]=!Object.hasOwn(contract,field)?'not_loaded':contract[field]===null||contract[field]===''?'missing':'recorded';
  }
  fields.documents=documents===null?'not_loaded':documents.length?'associated':documentsPartial?'partial':'none_associated';
  fields.owner_membership=ownerContext===null?'not_loaded':ownerContext.eligible_in_membership?'recorded_role_and_scope':'review_required';
  const signals=[];
  const add=(code,source,reason,endpoint,method='GET')=>signals.push({code,source:{type:'contract',id:contract.id,field:source},reason,
    state:'information_review',permission:{read:'authorized_context',write:'revalidated_by_command'},action:{method,endpoint}});
  if(fields.ends_on==='missing')add('contract_end_missing','ends_on','Data de término não registrada.','contract-detail?id='+contract.id);
  if(fields.renewal_notice_days==='missing')add('contract_notice_missing','renewal_notice_days','Prazo de aviso prévio não registrado.','contract-detail?id='+contract.id);
  if(fields.owner_id==='missing')add('contract_owner_missing','owner_id','Responsável não registrado.','contract-owner','POST');
  if(ownerContext&&!ownerContext.eligible_in_membership)add('contract_owner_membership_review','owner_id','Confirme a atribuição: o responsável não tem papel e escopo elegíveis na lista autorizada de membros.','contract-owner','POST');
  if(fields.origin==='missing')add('contract_source_missing','origin','Origem do registro não informada.','contract-detail?id='+contract.id);
  if(contract.current_version===0)add('contract_terms_missing','current_version','Termos estruturados ainda não registrados.','contract-terms','POST');
  if(fields.documents==='none_associated')add('contract_document_missing','documents','Nenhum documento privado associado neste escopo; referências externas são consultadas separadamente.','private-documents?organization_id='+contract.organization_id+'&entity_type=contract&entity_id='+contract.id);
  if(contract.ends_on&&contract.ends_on<today&&['active','renewing'].includes(contract.status))add('contract_status_review','ends_on','Término registrado já passou; confira o estado e o histórico do contrato.','contract-negotiations?contract_id='+contract.id);
  return {fields,signals,assessment:'recorded_information_only',observed_on:today};
}

export function obligationWorkItems(rows) {
  return rows.filter(p=>['awaiting_data','under_review','due_soon'].includes(p.facts?.status)).map(p=>({
    source:{type:'obligation_period',id:p.id,contract_id:p.contract_id,obligation_id:p.obligation_id},
    due_on:p.due_on??null,owner_id:p.owner_id??null,state:p.facts.status,
    reason:p.facts.status==='awaiting_data'?'Dados ou evidência ainda não registrados.':p.facts.status==='under_review'?'A revisão independente ainda precisa ser acompanhada.':'Prazo registrado se aproxima.',
    permission:{read:'authorized_context',write:'revalidated_by_command'},action:{method:'GET',endpoint:'covenants/detail?id='+p.id}
  }));
}
