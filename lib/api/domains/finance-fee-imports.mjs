import { HttpError,json,readBody } from '../../api-core.mjs';
import { requireUuid,query,rest,rpc,memberOrganization } from './finance-core.mjs';
import { feeImportPreview,fingerprint,IMPORT_LIMITS } from '../../finance/structured-ingestion.mjs';
import { readDynamicsFees,validateDynamicsSettings,DynamicsFailure } from '../../finance/connectors/dynamics-business-central.mjs';
const invalid=()=>new HttpError(400,'Confira arquivo, mapeamento, seleção e confirmação.','invalid_fee_import');
const FIELDS=['service','charging_unit','currency','period_start','period_end','observed_amount','volume','base_amount'];
const equal=(a,b)=>FIELDS.every(k=>(a[k]??null)===(b[k]??null));
async function contractScope(token,org,id){
 const rows=await rest(token,`fin_contracts?select=id,legal_entity_id&organization_id=eq.${org}&id=eq.${id}&limit=1`);
 if(!rows?.length)throw new HttpError(404,'Contrato indisponível.','fee_import_not_found');return rows[0];
}
async function reconcilePreview(token,org,contract,preview){
 const refs=[...new Set(preview.rows.filter(r=>r.state==='valid'||r.state==='duplicate').map(r=>r.values.source_reference))];
 if(!refs.length)return preview;
 // References are generated from closed source-prefix/identifier grammars.
 const q=new URLSearchParams({select:'id,source_reference,service,charging_unit,currency,period_start,period_end,observed_amount,volume,base_amount',organization_id:`eq.${org}`,contract_id:`eq.${contract}`,source_reference:`in.(${refs.join(',')})`,limit:String(IMPORT_LIMITS.rows+1)});
 const existing=await rest(token,`fin_fee_observations?${q}`)||[];
 if(existing.length>IMPORT_LIMITS.rows)throw new HttpError(422,'Há fontes demais para reconciliar este recorte.','fee_import_coverage_limit');
 const bySource=new Map(existing.map(r=>[r.source_reference,r]));
 const rows=preview.rows.map(row=>{const found=bySource.get(row.values.source_reference);return found&&row.state==='valid'?{...row,state:equal(found,row.values)?'duplicate':'conflicting',existing_id:found.id}:row;});
 return {...preview,rows,stats:Object.fromEntries(['valid','invalid','incomplete','duplicate','conflicting','pending_review'].map(state=>[state,rows.filter(r=>r.state===state).length]))};
}
async function selectedRows(preview,body){
 if(body.confirmation!==true||body.preview_fingerprint!==preview.fingerprint||!Array.isArray(body.selected_lines)||body.selected_lines.length<1||body.selected_lines.length>IMPORT_LIMITS.rows||new Set(body.selected_lines).size!==body.selected_lines.length)throw invalid();
 return body.selected_lines.map(line=>{
  if(!Number.isInteger(line))throw invalid();const row=preview.rows.find(r=>r.line===line);
  if(!row||!['valid','duplicate'].includes(row.state))throw invalid();return {line,values:row.values};
 });
}
export async function handleFeeImports(req,res,{resource,sub,token,session,headers,env=process.env}){
 if(!['fee-imports','erp-fees'].includes(resource))return false;
 if(resource==='erp-fees'&&!sub&&req.method==='GET'){
  const q=query(req),org=await memberOrganization(token,requireUuid(q.get('organization_id'),'organization_id'),['BUYER']);
  const limit=q.has('limit')?Number(q.get('limit')):25;
  if([...q.keys()].some(k=>!['organization_id','limit','after'].includes(k))||!Number.isInteger(limit)||limit<1||limit>100)throw invalid();
  const all=await rpc(token,'fin_list_fee_integrations',{p_org:org.id,p_after:q.has('after')?requireUuid(q.get('after'),'after'):null,p_limit:limit})||[];
  const rows=all.slice(0,limit);json(res,200,{ok:true,rows,next:all.length>limit?rows.at(-1).id:null,notice:'Configuração autorizada não comprova conexão externa ativa.'},headers);return true;
 }
 if(resource==='fee-imports'&&sub==='history'&&req.method==='GET'){
  const q=query(req),org=await memberOrganization(token,requireUuid(q.get('organization_id'),'organization_id'),['BUYER']);const contract=requireUuid(q.get('contract_id'),'contract_id');
  await contractScope(token,org.id,contract);const limit=q.has('limit')?Number(q.get('limit')):25;if(!Number.isInteger(limit)||limit<1||limit>100||[...q.keys()].some(k=>!['organization_id','contract_id','limit','after'].includes(k)))throw invalid();
  const p=new URLSearchParams({select:'id,actor_id,happened_at,metadata',organization_id:`eq.${org.id}`,entity_type:'eq.contract',entity_id:`eq.${contract}`,event_type:'eq.fee_import_completed',order:'id.asc',limit:String(limit+1)});
  if(q.has('after'))p.set('id',`gt.${requireUuid(q.get('after'),'after')}`);
  const all=await rest(token,`fin_events?${p}`)||[],rows=all.slice(0,limit);json(res,200,{ok:true,rows,next:all.length>limit?rows.at(-1).id:null},headers);return true;
 }
 if(req.method!=='POST'||!['preview','confirm','configure','configuration'].includes(sub))throw new HttpError(405,'Operação de importação indisponível.','method_not_allowed');
 const b=await readBody(req),org=await memberOrganization(token,requireUuid(b.organization_id,'organization_id'),['BUYER']);
 // Confirming a file is a write command, even when its selection is malformed.
 // Check the actor before parsing/reconciling; the RPC still enforces role,
 // entity scope and revocation transactionally with the write.
 if(resource==='fee-imports'&&sub==='confirm'){
  const members=await rest(token,`fin_members?select=role&organization_id=eq.${org.id}&user_id=eq.${requireUuid(session.user.id,'user_id')}&limit=1`);
  if(!['admin','finance_manager'].includes(members?.[0]?.role))throw new HttpError(403,'Papel sem permissão para confirmar esta importação.','forbidden');
 }
 if(resource==='erp-fees'&&['configure','configuration'].includes(sub)){
  const allowed=sub==='configure'?['organization_id','integration_id','contract_id','expected_version','request_key','settings','status']:['organization_id','integration_id'];
  if(Object.keys(b).some(k=>!allowed.includes(k)))throw invalid();
  const id=requireUuid(b.integration_id,'integration_id');
  if(sub==='configuration'){
   const configuration=await rpc(token,'fin_fee_integration',{p_org:org.id,p_id:id});if(!configuration)throw new HttpError(404,'Integração indisponível.','fee_import_not_found');
   json(res,200,{ok:true,configuration,notice:'Configuração autorizada não comprova conexão externa ativa.'},headers);return true;
  }
  if(!validateDynamicsSettings(b.settings)||!Number.isInteger(b.expected_version)||b.expected_version<0||!['configured','suspended','revoked'].includes(b.status))throw invalid();
  const result=await rpc(token,'fin_configure_fee_integration',{p_org:org.id,p_id:id,p_contract:requireUuid(b.contract_id,'contract_id'),p_expected:b.expected_version,p_request:requireUuid(b.request_key,'request_key'),p_settings:b.settings,p_status:b.status});
  json(res,200,{ok:true,configuration:result},headers);return true;
 }
 let preview,contract,origin={},fileName;
 if(resource==='fee-imports'){
  const allowed=['organization_id','contract_id','file','mapping','source_reference','delimiter',...(sub==='confirm'?['confirmation','preview_fingerprint','selected_lines','request_key']:[])];
  if(Object.keys(b).some(k=>!allowed.includes(k))||!b.file||Object.keys(b.file).some(k=>!['name','format','content_base64'].includes(k))||typeof b.file.name!=='string'||b.file.name.length<1||b.file.name.length>120||/[<>\u0000-\u001f]/.test(b.file.name)||typeof b.file.content_base64!=='string'||b.file.content_base64.length>90000)throw invalid();
  contract=requireUuid(b.contract_id,'contract_id');await contractScope(token,org.id,contract);fileName=b.file.name;
  const bytes=Buffer.from(b.file.content_base64,'base64');if(bytes.toString('base64')!==b.file.content_base64)throw invalid();
  try{preview=feeImportPreview({bytes,format:b.file.format,mapping:b.mapping,source_reference:b.source_reference,delimiter:b.delimiter});}catch{throw invalid();}
 }else{
  const allowed=['organization_id','integration_id','period_start','period_end','watermark',...(sub==='confirm'?['confirmation','preview_fingerprint','selected_lines','request_key']:[])];
  if(Object.keys(b).some(k=>!allowed.includes(k)))throw invalid();
  const configuration=await rpc(token,'fin_fee_integration',{p_org:org.id,p_id:requireUuid(b.integration_id,'integration_id')});
  if(!configuration||configuration.status!=='configured')throw new HttpError(409,'Integração suspensa, revogada ou indisponível.','fee_integration_conflict');
  const members=await rest(token,`fin_members?select=role&organization_id=eq.${org.id}&user_id=eq.${requireUuid(session.user.id,'user_id')}&limit=1`);
  if(!['admin','finance_manager'].includes(members?.[0]?.role))throw new HttpError(403,'Papel sem permissão para consultar esta origem.','forbidden');
  contract=requireUuid(configuration.contract_id,'contract_id');await contractScope(token,org.id,contract);
  let data;try{data=await readDynamicsFees({settings:configuration.settings,organizationId:org.id,start:b.period_start,end:b.period_end,watermark:b.watermark??null,env});}catch(e){if(!(e instanceof DynamicsFailure))throw e;throw new HttpError(e.code==='invalid_erp_scope'?400:503,'A origem ERP não está disponível para este recorte; nada foi importado.',e.code);}
  fileName='Dynamics Business Central API v2';origin={integration_id:b.integration_id,expected_version:configuration.version,watermark:data.watermark};
  preview={api_version:'financial-fee-import-v1',rows:data.rows,fingerprint:fingerprint(JSON.stringify({integration:b.integration_id,version:configuration.version,entries:data.entries})),file_fingerprint:null,confirmation_required:true,coverage:{complete:data.complete,pages:data.pages},origin};
 }
 preview.fingerprint=fingerprint(JSON.stringify({organization_id:org.id,contract_id:contract,file_name:fileName,content:preview.fingerprint}));
 preview=await reconcilePreview(token,org.id,contract,preview);
 if(sub==='preview'){json(res,200,{ok:true,preview},headers);return true;}
 const rows=await selectedRows(preview,b);
 const result=await rpc(token,'fin_import_fee_batch',{p_org:org.id,p_contract:contract,p_request:requireUuid(b.request_key,'request_key'),p_fingerprint:preview.fingerprint,p_file_name:fileName,p_rows:rows,p_confirmation:true,p_origin:origin});
 json(res,200,{ok:true,...result,notice:'Observações registradas e reconciliadas; nenhuma verificação, decisão ou economia foi confirmada automaticamente.'},headers);return true;
}
