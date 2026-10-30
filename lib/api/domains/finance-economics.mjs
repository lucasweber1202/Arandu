import { HttpError, json, readBody } from '../../api-core.mjs';
import { requireUuid, rest, memberOrganization } from './finance-core.mjs';
import { compareAcquiringEconomics, validateAcquiringProfile } from '../../finance/acquiring-economics.mjs';

export async function handleFinanceEconomics(req, res, { resource, sub, token, headers }) {
  if (resource !== 'acquiring-economics' || sub) return false;
  if (req.method !== 'POST') throw new HttpError(405, 'Use POST para analisar o cenário.', 'method_not_allowed');
  const body = await readBody(req);
  if (Object.keys(body).some(k => !['organization_id', 'contract_id', 'proposal_id', 'proposal_version', 'profile'].includes(k))) throw new HttpError(400, 'Informe referências aos registros e o perfil de recebimentos.', 'unknown_economics_field');
  const errors = validateAcquiringProfile(body.profile);
  if (errors.length) throw new HttpError(400, 'Confira período, moeda, mix completo e fonte dos volumes.', 'invalid_economics_profile');
  const contractId = requireUuid(body.contract_id, 'contract_id');
  const proposalId = requireUuid(body.proposal_id, 'proposal_id');
  if (!Number.isInteger(body.proposal_version) || body.proposal_version < 1 || body.proposal_version > 100000) throw new HttpError(400, 'Informe a versão da proposta analisada.', 'invalid_version');
  const org = await memberOrganization(token, body.organization_id, ['BUYER']);
  const unavailable = () => new HttpError(404, 'Condição ou proposta não encontrada para esta análise.', 'economics_source_unavailable');
  const contract = (await rest(token, `fin_contracts?select=id,organization_id,legal_entity_id,product,currency,starts_on,ends_on&organization_id=eq.${org.id}&id=eq.${contractId}&limit=1`))?.[0];
  if (!contract || contract.product !== 'acquiring') throw unavailable();
  const proposal = (await rest(token, `fin_proposals?select=id,rfq_id,product&buyer_organization_id=eq.${org.id}&id=eq.${proposalId}&limit=1`))?.[0];
  if (!proposal || proposal.product !== 'acquiring') throw unavailable();
  const rfq = (await rest(token, `fin_rfqs?select=id,legal_entity_id&organization_id=eq.${org.id}&id=eq.${proposal.rfq_id}&limit=1`))?.[0];
  if (!rfq || rfq.legal_entity_id !== contract.legal_entity_id) throw unavailable();
  const [versions, offered] = await Promise.all([
    rest(token, `fin_contract_versions?select=version,effective_from,source,amendment_id,terms&contract_id=eq.${contractId}&order=version.desc&limit=501`),
    rest(token, `fin_proposal_versions?select=version,terms,submitted_at,rfq_revision&proposal_id=eq.${proposalId}&version=eq.${body.proposal_version}&limit=1`)
  ]);
  if (!offered?.[0]) throw unavailable();
  if (versions.length > 500) throw new HttpError(422, 'O histórico excede a cobertura desta análise.', 'economics_coverage_limit');
  const analysis = compareAcquiringEconomics({ contract, versions, proposal, proposalVersion: offered[0], profile: body.profile });
  json(res, 200, { ok: true, analysis }, headers);
  return true;
}
