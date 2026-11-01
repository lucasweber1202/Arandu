import { readBoundedResponse } from '../../bounded-response.mjs';
import { CHARGING_UNITS, FEE_CURRENCIES, validateFeeObservation } from '../fee-intelligence.mjs';
import { resolveRuntime } from '../../runtime-mode.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const stamp=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,7})?Z$/.test(v)&&Number.isFinite(Date.parse(v))&&day(v.slice(0,10));
const canonicalStamp=v=>v.replace(/(?:\.(\d{1,7}))?Z$/,(_,digits='')=>'.'+digits.padEnd(7,'0')+'Z');
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export class DynamicsFailure extends Error{constructor(code){super(code);this.code=code;}}
const fail=code=>{throw new DynamicsFailure(code);};
export function validateDynamicsSettings(s){
 return s&&typeof s==='object'&&!Array.isArray(s)&&Object.keys(s).every(k=>['tenant_id','environment','company_id','account_id','currency','service','charging_unit'].includes(k))
 &&['tenant_id','company_id','account_id'].every(k=>typeof s[k]==='string'&&UUID.test(s[k]))&&typeof s.environment==='string'&&/^[A-Za-z0-9_-]{1,60}$/.test(s.environment)
 &&FEE_CURRENCIES.includes(s.currency)&&typeof s.service==='string'&&s.service.length>=2&&s.service.length<=120&&!/[<>\u0000-\u001f]/.test(s.service)
 &&Object.hasOwn(CHARGING_UNITS,s.charging_unit);
}
export function dynamicsCredential(organizationId,settings,env=process.env){
 if(!resolveRuntime(env).canCallExternalProviders||env.ARANDU_DYNAMICS_ENABLED!=='true'||!env.ARANDU_DYNAMICS_ACCESS_TOKEN
 ||env.ARANDU_DYNAMICS_ORGANIZATION_ID!==organizationId||env.ARANDU_DYNAMICS_TENANT_ID!==settings.tenant_id
 ||env.ARANDU_DYNAMICS_COMPANY_ID!==settings.company_id||env.ARANDU_DYNAMICS_ENVIRONMENT!==settings.environment)fail('erp_not_configured');
 return env.ARANDU_DYNAMICS_ACCESS_TOKEN;
}
// Official read-only API v2.0. No arbitrary endpoint or ledger writes. A user
// explicitly maps ONE expense account to ONE contractual service/currency.
export async function readDynamicsFees({settings,organizationId,start,end,watermark=null,env=process.env,fetchImpl=globalThis.fetch,credential=dynamicsCredential}){
 if(!validateDynamicsSettings(settings)||!day(start)||!day(end)||start>end||(Date.parse(end)-Date.parse(start))/86400000>366||end>new Date().toISOString().slice(0,10)||watermark!==null&&!stamp(watermark))fail('invalid_erp_scope');
 const token=credential(organizationId,settings,env);
 const path=`/v2.0/${settings.tenant_id}/${settings.environment}/api/v2.0/companies(${settings.company_id})/generalLedgerEntries`;
 const base=new URL(`https://api.businesscentral.dynamics.com${path}`);
 base.searchParams.set('$select','id,postingDate,accountId,debitAmount,creditAmount,lastModifiedDateTime');
 base.searchParams.set('$filter',`accountId eq ${settings.account_id} and postingDate ge ${start} and postingDate le ${end}${watermark?` and lastModifiedDateTime ge ${watermark}`:''}`);
 base.searchParams.set('$top','100');base.searchParams.set('$orderby','lastModifiedDateTime,id');
 const seen=new Set(),entries=[];let next=base.href,latest=watermark?canonicalStamp(watermark):null,pages=0;
 const signal=AbortSignal.timeout(20000);
 while(next){
  if(++pages>5||seen.has(next))fail('erp_coverage_limit');seen.add(next);
  const url=new URL(next);
  if(url.origin!==base.origin||url.pathname!==path||url.username||url.password||url.hash||next.length>4096)fail('erp_unsafe_continuation');
  let response,body;
  try{response=await fetchImpl(url,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},redirect:'error',signal});
   if(!response.ok)fail(response.status===401||response.status===403?'erp_access_denied':response.status===429?'erp_rate_limited':'erp_provider_unavailable');
   body=JSON.parse((await readBoundedResponse(response,256*1024)).toString('utf8'));
  }catch(e){if(e instanceof DynamicsFailure)throw e;fail(signal.aborted?'erp_timeout':'erp_provider_unavailable');}
  if(!Array.isArray(body.value)||body.value.length>100)fail('erp_invalid_response');
  for(const row of body.value){
   if(!row||!UUID.test(row.id)||row.accountId!==settings.account_id||!day(row.postingDate)||row.postingDate<start||row.postingDate>end||!stamp(row.lastModifiedDateTime)
    ||typeof row.debitAmount!=='number'||!Number.isFinite(row.debitAmount)||typeof row.creditAmount!=='number'||!Number.isFinite(row.creditAmount)||row.debitAmount<0||row.creditAmount<0)fail('erp_invalid_response');
   if(entries.some(e=>e.id===row.id))fail('erp_duplicate_page');
   entries.push(row);if(entries.length>100)fail('erp_coverage_limit');
   const modified=canonicalStamp(row.lastModifiedDateTime);if(watermark&&modified<canonicalStamp(watermark))fail('erp_invalid_response');if(!latest||modified>latest)latest=modified;
  }
  next=body['@odata.nextLink']??null;if(next!==null&&typeof next!=='string')fail('erp_invalid_response');
 }
 return {adapter:'dynamics-business-central-v2',entries,watermark:latest,pages,complete:true,
  rows:entries.map((r,index)=>({line:index+1,state:r.creditAmount!==0||r.debitAmount===0?'pending_review':'valid',
   errors:r.creditAmount!==0||r.debitAmount===0?[{column:'creditAmount',code:'credit_or_zero_requires_review',suggestion:'Créditos, estornos e valores zero exigem revisão fora da importação de despesas.'}]:[],
   values:{service:settings.service,charging_unit:settings.charging_unit,currency:settings.currency,period_start:r.postingDate,period_end:r.postingDate,observed_amount:r.debitAmount,
    source_type:'erp',source_reference:`dynamics/${settings.tenant_id}/${settings.company_id}/${r.id}`,source_object_id:r.id,evidence_reference:`dynamics:${r.id}@${r.lastModifiedDateTime}`}})).map(row=>{const problem=validateFeeObservation(row.values);return problem&&row.state==='valid'?{...row,state:'invalid',errors:[{column:'debitAmount',code:'invalid_fee_observation',suggestion:problem}]}:row;})};
}
