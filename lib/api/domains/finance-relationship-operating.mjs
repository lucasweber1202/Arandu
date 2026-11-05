import { HttpError } from '../../api-core.mjs';
import { rest } from './finance-core.mjs';
import { operationalPage, orderedPageFilters, operationalPageResult, CREATED_DESC } from './finance-operational-pages.mjs';
import { readObligationRecords } from './finance-obligation-pages.mjs';
import { readPortfolioContext } from './finance-portfolio-context.mjs';

export async function readRelationshipOperatingSection(token,scope,params,viewerId) {
  const section=params.get('section');
  const allowed=new Set(['organization_id','provider_id','legal_entity_id','section','include_crm','limit','cursor','status','owner_id','due_from','due_to','currency','facility_kind','product']);
  if([...params.keys()].some(k=>!allowed.has(k))||[...allowed].some(k=>params.getAll(k).length>1))throw new HttpError(400,'Filtros de seção inválidos.','invalid_relationship_page');
  const q=new URLSearchParams({organization_id:scope.org,provider_id:scope.provider});
  if(scope.entity)q.set('legal_entity_id',scope.entity);
  const copy=keys=>{for(const key of keys)if(params.has(key))q.set(key,params.get(key));};
  if(section==='facilities') {
    if(['owner_id','due_from','due_to'].some(k=>params.has(k)))throw new HttpError(400,'Filtro não disponível nesta seção.','invalid_relationship_page');
    q.set('section','facilities');copy(['limit','cursor','status','currency','facility_kind','product']);
    return readPortfolioContext(token,q,viewerId);
  }
  if(section==='obligations') {
    if(['currency','facility_kind','product'].some(k=>params.has(k)))throw new HttpError(400,'Filtro não disponível nesta seção.','invalid_relationship_page');
    copy(['limit','cursor','status','owner_id','due_from','due_to']);
    return {section,...await readObligationRecords(token,scope.org,q,viewerId)};
  }
  if(section!=='documents'||['status','owner_id','due_from','due_to','currency','facility_kind','product'].some(k=>params.has(k)))throw new HttpError(400,'Seção ou filtro inválido.','invalid_relationship_page');
  const order=[...CREATED_DESC,{name:'contract_id',direction:'desc',type:'uuid'}];
  const controls=operationalPage(params,{kind:'relationship-document-links-v1',organization:scope.org,provider:scope.provider,entity:scope.entity??null,viewer:viewerId},order,{maxLimit:50});
  const filters=orderedPageFilters(controls);
  filters.set('select','id,contract_id,contract_organization_id,provider_id,legal_entity_id,entity_type,entity_id,title,visibility,current_version,created_at,source_relation,available_version,mime_type,size_bytes,sha256,uploaded_by,completed_at');
  filters.set('contract_organization_id',`eq.${scope.org}`);filters.set('provider_id',`eq.${scope.provider}`);
  if(scope.entity)filters.set('legal_entity_id',`eq.${scope.entity}`);
  const result=operationalPageResult(await rest(token,`fin_contract_document_evidence?${filters}`),controls);
  return {ok:true,section,...result,rows:result.rows.map(row=>({...row,reference:{type:'document_contract_link',document_id:row.id,contract_id:row.contract_id}})),
    coverage:{complete:!controls.cursor&&!result.page.has_more,has_more:result.page.has_more,unit:'authorized_document_contract_associations'},download_authorization:'rechecked_by_download_rpc'};
}
