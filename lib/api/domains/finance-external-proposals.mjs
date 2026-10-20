import { HttpError, json, readBody, clean } from '../../api-core.mjs';
import { rest, rpc, requireUuid, query, memberOrganization, loadRfq } from './finance-core.mjs';
import { normalizeExternalTerms, externalComparisonProposal, EXTERNAL_PROPOSAL_NOTICE } from '../../finance/external-proposals.mjs';

const bad = () => new HttpError(400, 'Confira os campos, origem e versão do registro externo.', 'invalid_external_proposal');
const integer = (raw, minimum = 1) => {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < minimum || raw > 2147483647) throw bad();
  return raw;
};
const externalRpc = rpc;
export async function loadExternalComparison(token, rfqId) {
  const rows = await rest(token, `fin_external_proposal_current?select=*&rfq_id=eq.${requireUuid(rfqId,'rfq_id')}&state=eq.reviewed&or=(document_id.is.null,document_available.eq.true)&rfq_revision_matches=eq.true&order=id.asc&limit=501`);
  if ((rows || []).length > 500) throw new HttpError(422, 'Há propostas externas demais para esta comparação. Reduza o escopo; nenhum resultado parcial foi produzido.', 'external_comparison_limit');
  return (rows || []).map(externalComparisonProposal);
}
export async function handleExternalProposals(req,res,{resource,sub,token,headers}) {
  if (resource !== 'external-proposals') return false;
  if (req.method === 'GET') {
    if (sub) throw new HttpError(404,'Rota indisponível.','route_not_found');
    const q=query(req);
    await memberOrganization(token,q.get('organization_id'),['BUYER']);
    const limit=Number(q.get('limit') || 25);
    if (!Number.isInteger(limit) || limit<1 || limit>50) throw bad();
    if (q.get('id')) {
      const id=requireUuid(q.get('id'),'id');
      const [record]=await rest(token,`fin_external_proposal_current?select=*&id=eq.${id}&limit=1`) || [];
      if (!record || record.organization_id !== q.get('organization_id')) throw new HttpError(404,'Registro indisponível.','external_proposal_not_found');
      const before=q.get('before_version') ? Number(q.get('before_version')) : 2147483647;
      integer(before);
      // Pin history to the header version already read. A concurrent append
      // must not inherit that header's earlier reviewed state.
      const upper=Math.min(record.current_version,before-1);
      const versions=await rest(token,`fin_external_proposal_versions?select=proposal_id,version,terms,preparation_state,channel,received_at,source_reference,currency,rfq_revision,document_id,document_version,document_sha256,correction_reason,recorded_by,recorded_at&proposal_id=eq.${id}&version=lte.${upper}&order=version.desc&limit=${limit+1}`);
      const page=(versions||[]).slice(0,limit).map(version=>({...version,version_state:version.version<record.current_version?'superseded':record.state}));
      // Reviews are page-bound: no unbounded history scan and no N+1.
      const reviews=page.length ? await rest(token,`fin_external_proposal_reviews?select=id,version,action,reason,document_read,reviewed_by,reviewed_at&proposal_id=eq.${id}&version=in.(${page.map(v=>v.version).join(',')})&order=version.desc&limit=${limit*2}`) : [];
      json(res,200,{ok:true,record,versions:page,reviews:reviews||[],page:{has_more:(versions||[]).length>limit,next_before:(versions||[]).length>limit?page.at(-1).version:null},decision_allowed:false,notice:EXTERNAL_PROPOSAL_NOTICE},headers);
    } else {
      const rfq=await loadRfq(token,requireUuid(q.get('rfq_id'),'rfq_id'));
      if (rfq.organization_id!==q.get('organization_id')) throw new HttpError(403,'Registro indisponível.','organization_forbidden');
      const cursor=q.get('after') ? `&id=gt.${requireUuid(q.get('after'),'after')}` : '';
      const rows=await rest(token,`fin_external_proposal_current?select=*&organization_id=eq.${rfq.organization_id}&rfq_id=eq.${rfq.id}${cursor}&order=id.asc&limit=${limit+1}`);
      const page=(rows||[]).slice(0,limit);
      json(res,200,{ok:true,rows:page,page:{has_more:(rows||[]).length>limit,next_after:(rows||[]).length>limit?page.at(-1).id:null},decision_allowed:false,notice:EXTERNAL_PROPOSAL_NOTICE},headers);
    }
    return true;
  }
  if (req.method !== 'POST') throw new HttpError(405,'Método indisponível.','method_not_allowed');
  const body=await readBody(req,{maxBytes:48000});
  if (sub==='decision' || sub==='contract') throw new HttpError(409,'Proposta externa disponível para análise. Decisão e contrato exigem um caminho formal ainda não habilitado; nenhum registro foi criado.','external_decision_not_supported');
  if (sub==='confirm' || sub==='withdraw') {
    if (typeof body.reason!=='string') throw bad();
    const id=await externalRpc(token,'fin_external_proposal_review',{
      p_id:requireUuid(body.id,'id'),p_expected:integer(body.expected_version),
      p_action:sub==='confirm'?'confirm':'withdraw',p_reason:clean(body.reason),
      p_material_reviewed:body.material_reviewed===true,p_document_read:body.document_read===true
    });
    json(res,200,{ok:true,review_id:id,notice:EXTERNAL_PROPOSAL_NOTICE},headers);return true;
  }
  if (sub && sub!=='versions') throw new HttpError(404,'Rota indisponível.','route_not_found');
  const rfq=await loadRfq(token,requireUuid(body.rfq_id,'rfq_id'));
  await memberOrganization(token,rfq.organization_id,['BUYER']);
  if ((body.organization_id!=null && body.organization_id!==rfq.organization_id) || (Object.hasOwn(body,'legal_entity_id') && (body.legal_entity_id??null)!==(rfq.legal_entity_id??null)) || (body.product!=null && body.product!==rfq.product)) throw bad();
  if (typeof body.request_key!=='string' || typeof body.source_reference!=='string' || (sub==='versions' && typeof body.correction_reason!=='string')) throw bad();
  const normalized=normalizeExternalTerms(rfq.product,body.terms);
  if (normalized.errors.length || normalized.rejected.length || !body.terms || typeof body.terms!=='object' || Array.isArray(body.terms)) throw bad();
  if (!['preparing','pending_review'].includes(body.state) || !['email','document','spreadsheet','formal_communication','manual'].includes(body.channel)) throw bad();
  if (body.received_at!=null && (typeof body.received_at!=='string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(body.received_at) || !Number.isFinite(Date.parse(body.received_at)))) throw bad();
  if (body.currency!=null && !/^[A-Z]{3}$/.test(body.currency)) throw bad();
  if (!body.document_id && body.document_version!=null) throw bad();
  const id=body.id ? requireUuid(body.id,'id') : null;
  if (Boolean(id)!==Boolean(sub==='versions')) throw bad();
  const result=await externalRpc(token,'fin_external_proposal_save',{
    p_rfq:rfq.id,p_provider:requireUuid(body.provider_id,'provider_id'),p_key:clean(body.request_key),
    p_expected:id?integer(body.expected_version):0,p_id:id,
    p_input:{terms:normalized.values,state:body.state,channel:body.channel,received_at:body.received_at??null,
      source_reference:clean(body.source_reference),currency:body.currency||null,rfq_revision:integer(body.rfq_revision),
      document_id:body.document_id?requireUuid(body.document_id,'document_id'):null,
      document_version:body.document_id?integer(body.document_version):null,
      correction_reason:id?clean(body.correction_reason):null}
  });
  json(res,result.replayed?200:201,{ok:true,...result,notice:EXTERNAL_PROPOSAL_NOTICE},headers);return true;
}
