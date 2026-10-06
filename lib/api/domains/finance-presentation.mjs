import {HttpError} from '../../api-core.mjs';
import {rest,requireUuid} from './finance-core.mjs';
// Caller token throughout. Missing/hidden references stay unavailable.
export async function presentationContext(token,organizationId) {
 const org=requireUuid(organizationId,'organization_id');
 const tables=[['providers','fin_providers','id,name'],['contracts','fin_contracts','id,title'],['members','fin_members','user_id,display_name,role'],['entities','fin_legal_entities','id,legal_name']];
 const results=await Promise.all(tables.map(([,table,columns])=>rest(token,`${table}?select=${columns}&organization_id=eq.${org}&limit=501`)));
 if(results.some(r=>r?.length>500))throw new HttpError(409,'Referências excedem a cobertura desta tela; use o export governado.','presentation_coverage_limit');
 return Object.fromEntries(tables.map(([key],i)=>[key,results[i]||[]]));
}
