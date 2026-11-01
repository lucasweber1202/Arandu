import { HttpError, json, readBody } from '../../api-core.mjs';
import { requireUuid, rest, memberOrganization } from './finance-core.mjs';
import { compareGuarantees, validateGuaranteeScenario } from '../../finance/guarantee-economics.mjs';
export async function handleGuaranteeEconomics(req, res, { resource, sub, token, headers, signal }) {
  if (resource !== 'guarantee-economics' || sub) return false;
  if (req.method !== 'POST') throw new HttpError(405, 'Use uma solicitação de análise.', 'method_not_allowed');
  const b = await readBody(req);
  if (Object.keys(b).some(k => !['organization_id', 'sources', 'scenarios'].includes(k)) || !Array.isArray(b.sources) || b.sources.length < 1 || b.sources.length > 10
    || !Array.isArray(b.scenarios) || b.scenarios.length < 1 || b.scenarios.length > 10 || b.scenarios.some(s => !validateGuaranteeScenario(s))) throw new HttpError(400, 'Confira fontes e cenários da garantia.', 'invalid_guarantee_analysis');
  const org = await memberOrganization(token, requireUuid(b.organization_id, 'organization_id'), ['BUYER'], { signal });
  const sources = [];
  let entity;
  for (const requested of b.sources) {
    signal?.throwIfAborted();
    if (!requested || Object.keys(requested).some(k => !['contract_id', 'version'].includes(k)) || !Number.isInteger(requested.version) || requested.version < 1) throw new HttpError(400, 'Confira a versão contratual.', 'invalid_guarantee_analysis');
    const id = requireUuid(requested.contract_id, 'contract_id');
    const rows = await rest(token, `fin_contracts?select=id,title,product,legal_entity_id&organization_id=eq.${org.id}&id=eq.${id}&limit=1`, { signal });
    const contract = rows?.[0];
    if (!contract || contract.product !== 'guarantee' || entity !== undefined && entity !== contract.legal_entity_id) throw new HttpError(404, 'Fonte indisponível neste contexto.', 'economics_source_unavailable');
    entity = contract.legal_entity_id;
    const versions = await rest(token, `fin_contract_versions?select=version,effective_from,source,terms&organization_id=eq.${org.id}&contract_id=eq.${id}&version=eq.${requested.version}&limit=1`, { signal });
    const v = versions?.[0];
    if (!v) throw new HttpError(404, 'Fonte indisponível neste contexto.', 'economics_source_unavailable');
    sources.push({ product_terms: v.terms?.product_terms, reference: { object_type: 'contract', id, label: contract.title,
      version: v.version, effective_from: v.effective_from, source: v.source, href: `/finance/contracts.html?id=${id}` } });
  }
  json(res, 200, { ok: true, analysis: compareGuarantees(sources, b.scenarios) }, headers); return true;
}
