import { resolveTxt as dnsResolveTxt } from 'node:dns/promises';
import { HttpError, json, readBody, clean, limited } from '../../api-core.mjs';
import { adminSupabaseRpc } from '../../supabase.mjs';
import { requireUuid, query, rest, rpc, memberOrganization } from './finance-core.mjs';
import { domainVerificationToken, readiness, sha256, ssoStateConfigured } from '../../finance/sso.mjs';

// Administração de SSO (docs/FINANCIAL_SSO.md): só admin da compradora.
// Escrita por RPC com o JWT do admin. A verificação de domínio lê o TXT no DNS
// AQUI e manda ao banco só o hash do token encontrado (service role), depois de
// confirmar com o JWT da pessoa que ela administra a organização dona do domínio.

const CONNECTION_COLUMNS = 'id,protocol,broker,display_name,provider_ref,issuer,audience,metadata_url,attribute_mapping,status,enforce_sso,mfa_policy,max_session_hours,sessions_valid_after,created_at,updated_at,activated_at';
export const CHALLENGE_PREFIX = '_arandu-challenge';

async function requireAdmin(token, organizationId, session) {
  const organization = await memberOrganization(token, organizationId, ['BUYER']);
  const rows = await rest(token, `fin_members?select=role&organization_id=eq.${organization.id}&user_id=eq.${requireUuid(session.user.id, 'user_id')}&limit=1`);
  if (rows?.[0]?.role !== 'admin') throw new HttpError(403, 'SSO é administrado por quem tem papel de administração.', 'forbidden');
  return organization;
}

function cleanDomain(value) {
  const domain = clean(value).toLowerCase().replace(/^@/, '');
  if (!/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(domain) || domain.length > 253) throw new HttpError(400, 'Informe um domínio válido (ex.: suaempresa.com.br).', 'invalid_sso_domain');
  return domain;
}

/** @returns {Promise<boolean>} */
export async function handleFinanceSso(req, res, { resource, sub, token, session, headers, env = process.env, adminRpc = adminSupabaseRpc, resolveTxt = dnsResolveTxt }) {
  if (resource !== 'sso') return false;

  if (!sub && req.method === 'GET') {
    const organization = await requireAdmin(token, query(req).get('organization_id'), session);
    const [connections, domains, events] = await Promise.all([
      rest(token, `fin_sso_connections?select=${CONNECTION_COLUMNS}&organization_id=eq.${organization.id}&order=created_at.asc&limit=20`),
      rest(token, `fin_sso_domains?select=domain,connection_id,status,created_at,verified_at&organization_id=eq.${organization.id}&order=domain.asc&limit=50`),
      rest(token, `fin_sso_events?select=connection_id,outcome,reason_code,email_domain,happened_at&organization_id=eq.${organization.id}&order=happened_at.desc&limit=50`)
    ]);
    const brokerConfigured = env.ARANDU_SSO_BROKER === 'supabase';
    json(res, 200, { ok: true, state_secret_configured: ssoStateConfigured(env), broker_configured: brokerConfigured, challenge_prefix: CHALLENGE_PREFIX,
      connections: (connections || []).map((connection) => ({ ...connection, readiness: readiness({ connection, domains: domains || [], events: events || [], env, brokerConfigured }) })),
      domains: domains || [], events: events || [] }, headers);
    return true;
  }

  if (sub === 'connections' && req.method === 'POST') {
    const body = await readBody(req);
    const organization = await requireAdmin(token, body.organization_id, session);
    const protocol = clean(body.protocol);
    if (!['saml', 'oidc'].includes(protocol)) throw new HttpError(400, 'Escolha SAML ou OIDC.', 'invalid_sso_connection');
    const broker = clean(body.broker) || 'supabase';
    if (!['supabase', 'mock'].includes(broker)) throw new HttpError(400, 'Broker inválido.', 'invalid_sso_connection');
    const name = limited(body.display_name, 120);
    if (!name || name.length < 2 || /[<>]/.test(name)) throw new HttpError(400, 'Dê um nome à conexão (2 a 120 caracteres).', 'invalid_sso_connection');
    const hours = body.max_session_hours === undefined ? 12 : Number(body.max_session_hours);
    if (!Number.isInteger(hours) || hours < 1 || hours > 168) throw new HttpError(400, 'Sessão máxima entre 1 e 168 horas.', 'invalid_sso_connection');
    const id = await rpc(token, 'fin_sso_save_connection', {
      p_org: organization.id, p_connection: body.connection_id ? requireUuid(body.connection_id, 'connection_id') : null, p_protocol: protocol, p_broker: broker, p_display_name: name,
      p_provider_ref: clean(body.provider_ref) || null, p_issuer: clean(body.issuer) || null, p_audience: clean(body.audience) || null,
      p_metadata_url: clean(body.metadata_url) || null, p_mapping: body.attribute_mapping && typeof body.attribute_mapping === 'object' ? body.attribute_mapping : null, p_max_session_hours: hours
    });
    json(res, 201, { ok: true, id }, headers);
    return true;
  }

  // Reivindica domínio: o registro TXT aparece uma única vez nesta resposta.
  if (sub === 'domains' && req.method === 'POST') {
    const body = await readBody(req);
    const organization = await requireAdmin(token, body.organization_id, session);
    const domain = cleanDomain(body.domain);
    const challenge = domainVerificationToken();
    await rpc(token, 'fin_sso_claim_domain', { p_org: organization.id, p_domain: domain, p_token_hash: challenge.hash });
    json(res, 201, { ok: true, domain, record: { type: 'TXT', name: `${CHALLENGE_PREFIX}.${domain}`, value: challenge.record },
      notice: 'Publique este registro TXT no DNS do domínio e depois clique em Verificar. O valor não é mostrado de novo; para trocar, reivindique de novo.' },
    { ...headers, 'Cache-Control': 'no-store' });
    return true;
  }

  if (sub === 'domains-verify' && req.method === 'POST') {
    const body = await readBody(req);
    const organization = await requireAdmin(token, body.organization_id, session);
    const domain = cleanDomain(body.domain);
    const owned = await rest(token, `fin_sso_domains?select=domain,status&organization_id=eq.${organization.id}&domain=eq.${encodeURIComponent(domain)}&limit=1`);
    if (!owned?.[0]) throw new HttpError(404, 'Domínio não reivindicado por esta organização.', 'sso_domain_not_found');
    if (owned[0].status === 'verified') { json(res, 200, { ok: true, status: 'verified' }, headers); return true; }
    let records = [];
    try { records = await resolveTxt(`${CHALLENGE_PREFIX}.${domain}`); } catch { records = []; }
    for (const parts of records.slice(0, 20)) {
      const value = (Array.isArray(parts) ? parts.join('') : String(parts)).trim();
      const match = /^arandu-domain-verification=([A-Za-z0-9_-]{16,64})$/.exec(value);
      if (!match) continue;
      try {
        await adminRpc('fin_sso_mark_domain_verified', { p_domain: domain, p_token_hash: sha256(match[1]) });
        json(res, 200, { ok: true, status: 'verified' }, headers);
        return true;
      } catch { /* outro TXT pode ser o certo */ }
    }
    throw new HttpError(409, 'Registro TXT não encontrado ou diferente do esperado. A propagação do DNS pode levar alguns minutos.', 'sso_domain_not_verified');
  }

  if (sub === 'domains-link' && req.method === 'POST') {
    const body = await readBody(req);
    await rpc(token, 'fin_sso_link_domain', { p_domain: cleanDomain(body.domain), p_connection: body.connection_id ? requireUuid(body.connection_id, 'connection_id') : null });
    json(res, 200, { ok: true }, headers);
    return true;
  }

  if (sub === 'status' && req.method === 'POST') {
    const body = await readBody(req);
    const status = clean(body.status);
    if (!['draft', 'testing', 'active', 'disabled'].includes(status)) throw new HttpError(400, 'Estado inválido.', 'invalid_sso_connection');
    await rpc(token, 'fin_sso_set_status', { p_connection: requireUuid(body.connection_id, 'connection_id'), p_status: status, p_enforce: body.enforce === true });
    json(res, 200, { ok: true }, headers);
    return true;
  }

  if (sub === 'revoke-sessions' && req.method === 'POST') {
    const body = await readBody(req);
    await rpc(token, 'fin_sso_revoke_sessions', { p_connection: requireUuid(body.connection_id, 'connection_id') });
    json(res, 200, { ok: true }, headers);
    return true;
  }
  return false;
}
