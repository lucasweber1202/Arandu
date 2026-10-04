import { HttpError, json, readBody, clean, limited } from '../../api-core.mjs';
import { requireUuid, query, rest, rpc, memberOrganization } from './finance-core.mjs';
import { governanceCatalog, validateRetentionPolicy, OFFBOARDING_ADMIN_ACTIONS, LEGAL_HOLD_SCOPES, RETENTION_CLASSES } from '../../finance/data-governance.mjs';

// Governança de dados (P0.11, docs/FINANCIAL_DATA_GOVERNANCE.md): só admin da
// compradora. Leitura e escrita com o JWT da pessoa: RLS e as RPCs repetem a
// checagem de papel, organização e estado. O export é baixado por RPC (nunca
// por leitura direta da tabela) e só enquanto a pessoa ainda administra a
// organização e o pacote não venceu.

const EXPORT_COLUMNS = 'id,purpose,status,requested_at,completed_at,expires_at,schema_version,dataset_count,row_count,byte_size,error_code,download_count,last_downloaded_at';
const POLICY_COLUMNS = 'id,retention_class,version,retention_days,status,reason,decision_reference,effective_from,created_at,activated_at,ended_at';
const HOLD_COLUMNS = 'id,scope_type,scope_id,scope_class,reason,reference,status,created_at,released_at,release_reason';
const OFFBOARDING_COLUMNS = 'id,status,reason,requested_at,export_id,export_waived,retention_days,retention_until,decision_reference,revocation,revoked_at,updated_at,closed_at,cancelled_at';
// Um único corpo de resposta na plataforma serverless tem teto; acima disso o
// pacote é baixado por conjunto (cada parte tem checksum próprio no manifesto).
export const BUNDLE_MAX_BYTES = 4_000_000;
const REFERENCE = /^[A-Za-z0-9._:/#-]{3,120}$/;

async function requireAdmin(token, organizationId, session) {
  const organization = await memberOrganization(token, organizationId, ['BUYER']);
  const rows = await rest(token, `fin_members?select=role&organization_id=eq.${organization.id}&user_id=eq.${requireUuid(session.user.id, 'user_id')}&limit=1`);
  if (rows?.[0]?.role !== 'admin') throw new HttpError(403, 'Governança de dados é administrada por quem tem papel de administração do grupo.', 'forbidden');
  return organization;
}

function reasonText(value, label = 'motivo') {
  const text = limited(value, 1000);
  if (!text || text.length < 10 || /[<>]/.test(text)) throw new HttpError(400, `Descreva o ${label} (10 a 1.000 caracteres, sem dado pessoal).`, 'invalid_governance_input');
  return text;
}

function reference(value) {
  const text = clean(value);
  if (!text) return null;
  if (!REFERENCE.test(text)) throw new HttpError(400, 'Referência: use o código do ticket, protocolo ou documento (3 a 120 caracteres, sem espaços).', 'invalid_governance_input');
  return text;
}

function sendBody(res, status, body, headers) {
  res.statusCode = status;
  for (const [key, value] of Object.entries({ 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', ...headers })) res.setHeader(key, value);
  res.end(body);
}

/** @returns {Promise<boolean>} */
export async function handleFinanceGovernance(req, res, { resource, sub, token, session, headers }) {
  if (resource !== 'governance') return false;

  if (!sub && req.method === 'GET') {
    const organization = await requireAdmin(token, query(req).get('organization_id'), session);
    const org = organization.id;
    const [summary, policies, holds, exports, offboarding, log] = await Promise.all([
      rpc(token, 'fin_governance_summary', { p_org: org }),
      rest(token, `fin_retention_policies?select=${POLICY_COLUMNS}&organization_id=eq.${org}&order=retention_class.asc,version.desc&limit=100`),
      rest(token, `fin_legal_holds?select=${HOLD_COLUMNS}&organization_id=eq.${org}&order=created_at.desc&limit=100`),
      rest(token, `fin_data_exports?select=${EXPORT_COLUMNS}&organization_id=eq.${org}&order=requested_at.desc&limit=20`),
      rest(token, `fin_offboarding_requests?select=${OFFBOARDING_COLUMNS}&organization_id=eq.${org}&order=requested_at.desc&limit=10`),
      rest(token, `fin_governance_log?select=action,retention_class,policy_version,object_count,happened_at&organization_id=eq.${org}&order=happened_at.desc&limit=30`)
    ]);
    json(res, 200, { ok: true, catalog: governanceCatalog(), summary: summary || {}, policies: policies || [], holds: holds || [], exports: exports || [],
      offboarding: offboarding || [], log: log || [], bundle_max_bytes: BUNDLE_MAX_BYTES }, headers);
    return true;
  }

  // ------------------------------------------------------- políticas
  if (sub === 'retention-policies' && req.method === 'POST') {
    const body = await readBody(req);
    const organization = await requireAdmin(token, body.organization_id, session);
    const checked = validateRetentionPolicy({ retention_class: clean(body.retention_class), retention_days: Number(body.retention_days), reason: body.reason, decision_reference: clean(body.decision_reference) || null });
    if (!checked.ok) throw new HttpError(400, checked.error, 'invalid_retention_policy');
    const id = await rpc(token, 'fin_governance_save_retention_policy', { p_org: organization.id, p_class: checked.values.retention_class,
      p_days: checked.values.retention_days, p_reason: checked.values.reason, p_decision_reference: checked.values.decision_reference });
    json(res, 201, { ok: true, id, status: 'draft' }, headers);
    return true;
  }
  if ((sub === 'retention-activate' || sub === 'retention-retire') && req.method === 'POST') {
    const body = await readBody(req);
    await rpc(token, sub === 'retention-activate' ? 'fin_governance_activate_retention_policy' : 'fin_governance_retire_retention_policy', { p_policy: requireUuid(body.policy_id, 'policy_id') });
    json(res, 200, { ok: true }, headers);
    return true;
  }
  // Prévia sem apagar: contagens por classe da própria organização.
  if (sub === 'retention-preview' && req.method === 'POST') {
    const body = await readBody(req);
    const organization = await requireAdmin(token, body.organization_id, session);
    const preview = await rpc(token, 'fin_governance_retention_run', { p_dry_run: true, p_limit: 500, p_org: organization.id, p_request_id: null });
    json(res, 200, { ok: true, preview }, headers);
    return true;
  }

  // ------------------------------------------------------- legal hold
  if (sub === 'legal-holds' && req.method === 'POST') {
    const body = await readBody(req);
    const organization = await requireAdmin(token, body.organization_id, session);
    const scope = clean(body.scope_type);
    if (!LEGAL_HOLD_SCOPES.includes(scope)) throw new HttpError(400, 'Escopo de hold inválido.', 'invalid_legal_hold');
    const scopeClass = scope === 'retention_class' ? clean(body.scope_class) : null;
    if (scope === 'retention_class' && !(RETENTION_CLASSES[scopeClass]?.scope === 'tenant')) throw new HttpError(400, 'Escolha uma classe de retenção configurável.', 'invalid_legal_hold');
    const scopeId = ['organization', 'retention_class'].includes(scope) ? null : requireUuid(body.scope_id, 'scope_id');
    const id = await rpc(token, 'fin_governance_create_legal_hold', { p_org: organization.id, p_scope_type: scope, p_scope_id: scopeId, p_scope_class: scopeClass,
      p_reason: reasonText(body.reason), p_reference: reference(body.reference) });
    json(res, 201, { ok: true, id }, headers);
    return true;
  }
  if (sub === 'legal-holds-release' && req.method === 'POST') {
    const body = await readBody(req);
    const released = await rpc(token, 'fin_governance_release_legal_hold', { p_hold: requireUuid(body.hold_id, 'hold_id'), p_reason: reasonText(body.reason, 'motivo da liberação') });
    json(res, 200, { ok: true, released: released === true }, headers);
    return true;
  }

  // ------------------------------------------------------- export
  if (sub === 'exports' && req.method === 'POST') {
    const body = await readBody(req);
    const organization = await requireAdmin(token, body.organization_id, session);
    const id = await rpc(token, 'fin_governance_request_export', { p_org: organization.id, p_purpose: 'portability' });
    json(res, 202, { ok: true, id, status: 'requested', notice: 'O pacote é montado em segundo plano. Ele fica disponível por 7 dias depois de pronto.' }, headers);
    return true;
  }
  if (sub === 'export-download' && req.method === 'GET') {
    const params = query(req);
    const exportId = requireUuid(params.get('export_id'), 'export_id');
    const dataset = clean(params.get('dataset'));
    const noStore = { ...headers, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };
    if (dataset) {
      if (!/^[a-z_]{2,40}$/.test(dataset)) throw new HttpError(400, 'Conjunto inválido.', 'invalid_dataset');
      const content = await rpc(token, 'fin_governance_export_part', { p_export: exportId, p_dataset: dataset });
      if (typeof content !== 'string') throw new HttpError(502, 'Resposta inesperada do banco.', 'invalid_upstream');
      sendBody(res, 200, content, { ...noStore, 'Content-Disposition': `attachment; filename="${dataset}.json"` });
      return true;
    }
    const manifest = await rpc(token, 'fin_governance_export_manifest', { p_export: exportId });
    const total = (manifest?.datasets || []).reduce((sum, item) => sum + (Number(item.bytes) || 0), 0);
    if (total > BUNDLE_MAX_BYTES) throw new HttpError(413, 'Pacote grande demais para um único arquivo. Baixe cada conjunto separadamente; o manifesto traz o checksum de cada um.', 'export_bundle_too_large');
    const parts = await rpc(token, 'fin_governance_export_parts', { p_export: exportId });
    if (!Array.isArray(parts)) throw new HttpError(502, 'Resposta inesperada do banco.', 'invalid_upstream');
    // As partes entram como texto bruto: o checksum do manifesto continua
    // verificável sobre cada conjunto baixado individualmente.
    const data = parts.map((part) => `${JSON.stringify(part.dataset)}:${part.content}`).join(',');
    sendBody(res, 200, `{"manifest":${JSON.stringify(manifest)},"data":{${data}}}`,
      { ...noStore, 'Content-Disposition': `attachment; filename="arandu-export-${exportId}.json"` });
    return true;
  }

  // ------------------------------------------------------- offboarding
  if (sub === 'offboarding' && req.method === 'POST') {
    const body = await readBody(req);
    const organization = await requireAdmin(token, body.organization_id, session);
    const id = await rpc(token, 'fin_governance_request_offboarding', { p_org: organization.id, p_reason: reasonText(body.reason) });
    json(res, 201, { ok: true, id }, headers);
    return true;
  }
  if (sub === 'offboarding-action' && req.method === 'POST') {
    const body = await readBody(req);
    const action = clean(body.action);
    if (!OFFBOARDING_ADMIN_ACTIONS.includes(action)) throw new HttpError(400, 'Ação de offboarding inválida.', 'invalid_offboarding_transition');
    const payload = {};
    if (action === 'confirm_revocation') {
      const days = Number(body.retention_days);
      if (!Number.isInteger(days) || days < 0 || days > 3650) throw new HttpError(400, 'Janela de retenção pós-contrato entre 0 e 3.650 dias, conforme a decisão registrada.', 'invalid_offboarding');
      const ref = reference(body.decision_reference);
      if (!ref) throw new HttpError(400, 'Informe a referência da decisão (contrato, ticket ou parecer) que define a janela.', 'invalid_offboarding');
      if (body.confirm !== true) throw new HttpError(400, 'Confirme que todos os acessos da organização serão revogados.', 'confirmation_required');
      Object.assign(payload, { retention_days: days, decision_reference: ref, export_waived: body.export_waived === true });
    }
    const status = await rpc(token, 'fin_governance_offboarding_action', { p_request: requireUuid(body.request_id, 'request_id'), p_action: action, p_payload: payload });
    json(res, 200, { ok: true, status }, headers);
    return true;
  }
  return false;
}
