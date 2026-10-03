import { HttpError, json, readBody, clean, limited } from '../../api-core.mjs';
import { requireUuid, query, rest, rpc, memberOrganization } from './finance-core.mjs';
import { validatePolicyDocument, cleanDeclaredFacts, EXCEPTION_REASON_CODES, FLAG_KINDS } from '../../finance/policy.mjs';

// Policy & Approval Engine v2 (docs/FINANCIAL_POLICY_ENGINE.md).
//
// Mesmo contrato dos demais domínios financeiros: JWT do usuário em toda
// chamada (o RLS decide o que volta), escrita só por RPC, organização sempre
// confirmada no banco. A avaliação é do banco; aqui só validamos formato para
// dar erro útil antes do round-trip.

const VERSION_COLUMNS = 'id,policy_id,version,status,document,change_note,created_by,created_at,updated_at,activated_by,activated_at,ended_at';
const DELEGATION_COLUMNS = 'id,delegator_id,delegate_id,starts_at,ends_at,reason,created_at,revoked_at,revoked_by';

function optionalUuid(value, label) {
  const text = clean(value);
  return text ? requireUuid(text, label) : null;
}

function evidenceList(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 10) throw new HttpError(400, 'Até dez evidências por exceção.', 'invalid_policy_exception');
  return value.map((item) => {
    const label = limited(item?.label, 160);
    const reference = item?.reference === undefined ? null : limited(item.reference, 300);
    const documentId = item?.document_id ? requireUuid(item.document_id, 'document_id') : null;
    if (!label || label.length < 2 || /[<>]/.test(label) || (reference && /[<>]/.test(reference)) || (!reference && !documentId)) {
      throw new HttpError(400, 'Cada evidência precisa de um rótulo e de um documento ou referência.', 'invalid_policy_exception');
    }
    return { label, ...(reference ? { reference } : {}), ...(documentId ? { document_id: documentId } : {}) };
  });
}

/** @returns {Promise<boolean>} true quando a rota foi tratada aqui. */
export async function handleFinancePolicy(req, res, { resource, sub, token, session, headers }) {
  // ------------------------------------------------------------ policies
  if (resource === 'approval-policies' && !sub && req.method === 'GET') {
    const organization = await memberOrganization(token, query(req).get('organization_id'), ['BUYER']);
    const [policies, flags, viewer] = await Promise.all([
      rest(token, `fin_policies?select=id,legal_entity_id,name,status,created_at,retired_at&organization_id=eq.${organization.id}&order=legal_entity_id.asc.nullsfirst&limit=200`),
      rest(token, `fin_policy_flags?select=key,label,kind,active,updated_at&organization_id=eq.${organization.id}&order=key.asc&limit=200`),
      rest(token, `fin_members?select=role&organization_id=eq.${organization.id}&user_id=eq.${requireUuid(session.user.id, 'user_id')}&limit=1`)
    ]);
    const ids = (policies || []).map((row) => row.id);
    // Rascunhos só voltam para admin (RLS); histórico completo por policy.
    const versions = ids.length ? await rest(token, `fin_policy_versions?select=${VERSION_COLUMNS}&policy_id=in.(${ids.join(',')})&order=version.desc&limit=1000`) : [];
    json(res, 200, {
      ok: true,
      can_admin: viewer?.[0]?.role === 'admin',
      flags: flags || [],
      rows: (policies || []).map((policy) => ({ ...policy, versions: (versions || []).filter((version) => version.policy_id === policy.id) }))
    }, headers);
    return true;
  }

  if (resource === 'approval-policies' && !sub && req.method === 'POST') {
    const body = await readBody(req);
    const organization = await memberOrganization(token, body.organization_id, ['BUYER']);
    const checked = validatePolicyDocument(body.document);
    if (!checked.ok) throw new HttpError(400, checked.error, 'invalid_policy');
    const name = limited(body.name, 160);
    if (!name || name.length < 2 || /[<>]/.test(name)) throw new HttpError(400, 'Dê um nome à policy (2 a 160 caracteres, sem HTML).', 'invalid_policy');
    const note = body.change_note ? limited(body.change_note, 1000) : null;
    const id = await rpc(token, 'fin_save_policy_draft', {
      p_org: organization.id, p_entity: optionalUuid(body.legal_entity_id, 'legal_entity_id'), p_name: name, p_document: body.document, p_change_note: note
    });
    json(res, 201, { ok: true, version_id: id }, headers);
    return true;
  }

  if (resource === 'approval-policies' && ['activate', 'discard', 'retire', 'simulate'].includes(sub) && req.method === 'POST') {
    const body = await readBody(req);
    if (sub === 'retire') {
      await rpc(token, 'fin_retire_policy', { p_policy: requireUuid(body.policy_id, 'policy_id') });
      json(res, 200, { ok: true }, headers);
      return true;
    }
    const version = requireUuid(body.version_id, 'version_id');
    if (sub === 'simulate') {
      const facts = body.facts && typeof body.facts === 'object' && !Array.isArray(body.facts) ? body.facts : null;
      if (!facts || JSON.stringify(facts).length > 4000) throw new HttpError(400, 'Informe os fatos da simulação.', 'invalid_policy');
      const result = await rpc(token, 'fin_simulate_policy_version', { p_version: version, p_facts: facts });
      json(res, 200, { ok: true, evaluation: result }, headers);
      return true;
    }
    await rpc(token, sub === 'activate' ? 'fin_activate_policy_version' : 'fin_discard_policy_draft', { p_version: version });
    json(res, 200, { ok: true }, headers);
    return true;
  }

  if (resource === 'approval-policies' && sub === 'flags' && req.method === 'POST') {
    const body = await readBody(req);
    const organization = await memberOrganization(token, body.organization_id, ['BUYER']);
    const key = clean(body.key);
    const label = limited(body.label, 120);
    if (!/^[a-z][a-z0-9_]{1,40}$/.test(key) || !label || label.length < 2 || /[<>]/.test(label) || !Object.hasOwn(FLAG_KINDS, body.kind) || typeof body.active !== 'boolean') {
      throw new HttpError(400, 'Sinalizador inválido: chave em minúsculas, nome e tipo.', 'invalid_policy');
    }
    await rpc(token, 'fin_set_policy_flag', { p_org: organization.id, p_key: key, p_label: label, p_kind: body.kind, p_active: body.active });
    json(res, 200, { ok: true }, headers);
    return true;
  }

  // Prévia do plano para uma RFQ (+ proposta, + fatos declarados): mesma
  // avaliação que o pedido gravará, sob o RLS da RFQ.
  if (resource === 'approval-policies' && sub === 'preview' && req.method === 'POST') {
    const body = await readBody(req);
    const result = await rpc(token, 'fin_preview_approval_policy', {
      p_rfq: requireUuid(body.rfq_id, 'rfq_id'), p_proposal: optionalUuid(body.proposal_id, 'proposal_id'), p_declared: cleanDeclaredFacts(body.declared)
    });
    json(res, 200, { ok: true, evaluation: result }, headers);
    return true;
  }

  if (resource === 'approval-policies' && sub === 'process-deadlines' && req.method === 'POST') {
    const body = await readBody(req);
    const organization = await memberOrganization(token, body.organization_id, ['BUYER']);
    const processed = await rpc(token, 'fin_process_approval_deadlines', { p_org: organization.id });
    json(res, 200, { ok: true, processed: Number(processed) || 0 }, headers);
    return true;
  }

  // ------------------------------------------------- exceções e substituição
  if (resource === 'approval-exceptions' && !sub && req.method === 'POST') {
    const body = await readBody(req);
    if (!Object.hasOwn(EXCEPTION_REASON_CODES, body.reason_code)) throw new HttpError(400, 'Escolha o motivo da exceção.', 'invalid_policy_exception');
    const rule = clean(body.rule_id);
    if (!/^([a-z][a-z0-9_]{1,40}|__fallback)$/.test(rule)) throw new HttpError(400, 'Regra inválida.', 'invalid_policy_exception');
    const reason = limited(body.reason, 2000);
    if (!reason || reason.length < 10) throw new HttpError(400, 'Explique a exceção em ao menos 10 caracteres.', 'invalid_policy_exception');
    const id = await rpc(token, 'fin_request_policy_exception', {
      p_request: requireUuid(body.request_id, 'request_id'), p_policy_version: requireUuid(body.policy_version_id, 'policy_version_id'),
      p_rule: rule, p_reason_code: body.reason_code, p_reason: reason, p_evidence: evidenceList(body.evidence)
    });
    json(res, 201, { ok: true, id }, headers);
    return true;
  }

  if (resource === 'approval-exceptions' && ['decide', 'cancel'].includes(sub) && req.method === 'POST') {
    const body = await readBody(req);
    const exception = requireUuid(body.exception_id, 'exception_id');
    if (sub === 'cancel') {
      await rpc(token, 'fin_cancel_policy_exception', { p_exception: exception });
      json(res, 200, { ok: true }, headers);
      return true;
    }
    if (!['approved', 'rejected'].includes(body.decision)) throw new HttpError(400, 'Decida aprovar ou rejeitar a exceção.', 'invalid_policy_exception');
    const comment = limited(body.comment, 2000);
    if (!comment || comment.length < 3) throw new HttpError(400, 'Registre o motivo da decisão.', 'invalid_policy_exception');
    const status = await rpc(token, 'fin_decide_policy_exception', { p_exception: exception, p_decision: body.decision, p_comment: comment });
    json(res, 200, { ok: true, request_status: status }, headers);
    return true;
  }

  // ------------------------------------------------------------ delegação
  if (resource === 'approval-delegations' && !sub && req.method === 'GET') {
    const organization = await memberOrganization(token, query(req).get('organization_id'), ['BUYER']);
    const rows = await rest(token, `fin_approval_delegations?select=${DELEGATION_COLUMNS}&organization_id=eq.${organization.id}&order=created_at.desc&limit=200`);
    json(res, 200, { ok: true, rows: rows || [], viewer_id: session.user.id }, headers);
    return true;
  }

  if (resource === 'approval-delegations' && !sub && req.method === 'POST') {
    const body = await readBody(req);
    const organization = await memberOrganization(token, body.organization_id, ['BUYER']);
    const starts = new Date(clean(body.starts_at) || Date.now());
    const ends = new Date(clean(body.ends_at));
    if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime()) || ends <= starts) throw new HttpError(400, 'Informe início e fim válidos para a delegação.', 'invalid_delegation');
    const reason = limited(body.reason, 500);
    if (!reason || reason.length < 3 || /[<>]/.test(reason)) throw new HttpError(400, 'Informe o motivo da delegação.', 'invalid_delegation');
    const id = await rpc(token, 'fin_set_approval_delegation', {
      p_org: organization.id, p_delegate: requireUuid(body.delegate_id, 'delegate_id'), p_starts: starts.toISOString(), p_ends: ends.toISOString(), p_reason: reason
    });
    json(res, 201, { ok: true, id }, headers);
    return true;
  }

  if (resource === 'approval-delegations' && sub === 'revoke' && req.method === 'POST') {
    const body = await readBody(req);
    await rpc(token, 'fin_revoke_approval_delegation', { p_delegation: requireUuid(body.delegation_id, 'delegation_id') });
    json(res, 200, { ok: true }, headers);
    return true;
  }

  return false;
}

