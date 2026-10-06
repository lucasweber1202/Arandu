import {HttpError,json,readBody} from '../../api-core.mjs';
import {requireUuid,query,rest,rpc,memberOrganization} from './finance-core.mjs';
import {presentCovenantPage,presentCovenantDetail} from '../../finance/covenant-presenter.mjs';
const optional=(v,k)=>v?requireUuid(v,k):null;
const version=v=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<1)throw new HttpError(400,'Versão inválida.','invalid_obligation');return n;};
const pick=(b,keys)=>Object.fromEntries(keys.filter(k=>b[k]!==undefined && b[k]!=='').map(k=>[k,b[k]]));
export async function handleFinanceCovenants(req,res,{resource,sub,token,headers}){
 if(resource!=='covenants')return false;
 const q=query(req);
 if(req.method==='GET'){
 if(sub==='summary'){const org=await memberOrganization(token,q.get('organization_id'),['BUYER']);json(res,200,{ok:true,...await rpc(token,'fin_obligation_summary',{p_org:org.id,p_entity:optional(q.get('legal_entity_id'),'legal_entity_id')})},headers);return true;}
 if(sub && sub!=='detail')throw new HttpError(404,'Recurso indisponível.','not_found');
 if(sub==='detail'){
 const rows=await rest(token,`fin_obligation_monitor?select=*&id=eq.${requireUuid(q.get('id'),'id')}&limit=1`);if(!rows?.[0])throw new HttpError(404,'Período indisponível.','obligation_not_found');const p=rows[0];
 const tables=['fin_covenant_measurements','fin_obligation_evidence','fin_obligation_reviews','fin_covenant_waivers'];const data=await Promise.all(tables.map(t=>rest(token,`${t}?select=*&period_id=eq.${p.id}&limit=501`)));
 if(data.some(d=>d?.length>500))throw new HttpError(409,'Histórico excede a cobertura desta tela; use o export governado.','obligation_coverage_limit');
 json(res,200,{ok:true,...presentCovenantDetail({period:p,measurements:data[0] || [],evidence:data[1] || [],reviews:data[2] || [],waivers:data[3] || []})},headers);return true;
 }
 const org=await memberOrganization(token,q.get('organization_id'),['BUYER']);let filters=`organization_id=eq.${org.id}`;
 for(const k of ['provider_id','legal_entity_id','obligation_id'])if(q.get(k))filters+=`&${k}=eq.${requireUuid(q.get(k),k)}`;
 const offset=Number(q.get('after') || 0);if(!Number.isInteger(offset)||offset<0||offset>5000)throw new HttpError(400,'Página inválida.','invalid_page');
 const [rows,members,contracts]=await Promise.all([rest(token,`fin_obligation_monitor?select=*&${filters}&order=due_on.asc,id.asc&limit=26&offset=${offset}`),rest(token,`fin_members?select=user_id,role,display_name&organization_id=eq.${org.id}&limit=500`),rest(token,`fin_contracts?select=id,title&organization_id=eq.${org.id}&status=in.(active,renewing)&limit=500`)]);
 json(res,200,{ok:true,...presentCovenantPage({rows:(rows || []).slice(0,25),members:members || [],contracts:contracts || [],next:rows?.length>25?String(offset+25):null})},headers);return true;
 }
 if(req.method!=='POST')throw new HttpError(405,'Método indisponível.','method_not_allowed');const b=await readBody(req);let id;
 if(sub==='open')id=await rpc(token,'fin_open_obligation',{p_contract:requireUuid(b.contract_id,'contract_id'),p_input:pick(b,['title','kind','source_clause','source_reference','owner_id','frequency','first_period_start','first_period_end','first_due_on','grace_days','due_soon_days','metric','operator','threshold','unit','currency'])});
 else if(sub==='data')id=await rpc(token,'fin_record_obligation_data',{p_period:requireUuid(b.period_id,'period_id'),p_input:{...pick(b,['measured_value','measured_on','source_reference','provenance']),document_id:optional(b.document_id,'document_id')}});
 else if(sub==='review')id=await rpc(token,'fin_review_obligation',{p_period:requireUuid(b.period_id,'period_id'),p_expected:optional(b.expected_review_id,'expected_review_id'),p_input:{status:b.status,reason:b.reason,measurement_id:optional(b.measurement_id,'measurement_id'),evidence_id:optional(b.evidence_id,'evidence_id')}});
 else if(sub==='waiver' || sub==='decide-waiver')id=await rpc(token,'fin_covenant_waiver',{p_period:requireUuid(b.period_id,'period_id'),p_waiver:sub==='decide-waiver'?requireUuid(b.waiver_id,'waiver_id'):null,p_expected:sub==='decide-waiver'?version(b.expected_version):null,p_input:sub==='decide-waiver'?pick(b,['status','decision_reason']):pick(b,['valid_until','reason','controls'])});
 else if(sub==='cancel')id=await rpc(token,'fin_cancel_obligation',{p_obligation:requireUuid(b.obligation_id,'obligation_id'),p_expected:version(b.expected_version),p_reason:b.reason});
 else throw new HttpError(404,'Recurso indisponível.','not_found');json(res,201,{ok:true,id:id || null},headers);return true;
}
