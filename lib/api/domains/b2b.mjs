import { HttpError, json, readBody, clean } from '../../api-core.mjs';
import { publicSupabaseRequest, userSupabaseRequest } from '../../supabase.mjs';

// Explicit fields prevent callers from writing status, reviewers, ownership or audit fields.
const resources = {
  products: { table: 'b2b_products', fields: ['sku','name','description','category','brand','manufacturer','country_of_origin','hs_code','model','batch','serial','market','composition'] },
  requirements: { table: 'b2b_requirements', fields: ['code','title','description','vertical','jurisdiction','source_url','source_version','effective_from'] },
  documents: { table: 'b2b_documents', fields: ['title','document_type','sha256','issuer','expires_at'] },
  mappings: { table: 'b2b_product_requirements', fields: ['product_id','requirement_id'] },
  evidence: { table: 'b2b_evidence', fields: ['product_id','requirement_id','document_id'] },
  passports: { table: 'b2b_passports', fields: ['product_id'] },
  cbam: { table: 'b2b_cbam_cases', fields: ['product_id','facility','reporting_period','importer','emissions_data','methodology','notes'] },
  rfqs: { table: 'b2b_rfqs', fields: ['title','category','details'] },
  invitations: { table: 'b2b_rfq_invitations', fields: ['rfq_id','provider_organization_id'] },
  quotes: { table: 'b2b_quotes', fields: ['invitation_id','provider_organization_id','category','terms','currency','amount','valid_until'] },
  decisions: { table: 'b2b_decisions', fields: ['rfq_id','quote_id','invitation_id','rationale'] },
  contracts: { table: 'b2b_contracts', fields: ['decision_id','quote_id','starts_on','ends_on','renewal_notice_days'] },
  events: { table: 'b2b_events', fields: ['entity_type','entity_id','event_type'] }
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function handleB2b(req, res, path, { requireUser, enforceRateLimit }) {
  const [resource, id] = path.split('/');
  if (resource === 'passport' && req.method === 'GET') {
    if (!uuid.test(id || '')) throw new HttpError(404, 'Passaporte não encontrado.');
    await enforceRateLimit(req, 'b2b-passport', 60, 600000);
    const rows = await publicSupabaseRequest(`rpc/b2b_public_passport`, { method: 'POST', body: { p_token: id } });
    if (!rows?.length) throw new HttpError(404, 'Passaporte não encontrado.');
    return json(res, 200, { ok: true, passport: rows[0], notice: 'Completude de dados; não é certificação de conformidade legal.' }, { 'Cache-Control': 'no-store' });
  }
  const session = await requireUser(req);
  await enforceRateLimit(req, 'b2b-account', 120, 600000, session.user.id);
  const token = session.accessToken;
  if (resource === 'transition' && req.method === 'POST') {
    const body = await readBody(req);
    if (!uuid.test(body.id || '')) throw new HttpError(400, 'ID inválido.');
    await userSupabaseRequest(token, 'rpc/b2b_transition', { method: 'POST', body: { p_kind: body.kind, p_id: body.id, p_status: body.status } });
    return json(res, 200, { ok: true }, session.headers);
  }
  if (resource === 'organizations') {
    if (req.method === 'GET') {
      const rows = await userSupabaseRequest(token, 'b2b_organizations?select=id,legal_name,trade_name,kind,country,created_at&order=created_at.desc&limit=100');
      return json(res, 200, { ok: true, rows }, session.headers);
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const result = await userSupabaseRequest(token, 'rpc/b2b_create_organization', { method: 'POST', body: { p_name: clean(body.legal_name), p_kind: clean(body.kind), p_country: clean(body.country || 'BR') } });
      return json(res, 201, { ok: true, id: result }, session.headers);
    }
  }
  const config = resources[resource];
  if (!config || id) throw new HttpError(404, 'Recurso não encontrado.');
  if (req.method === 'GET') {
    const org = new URL(req.url, 'http://localhost').searchParams.get('organization_id');
    if (!uuid.test(org || '')) throw new HttpError(400, 'organization_id inválido.');
    let filter = `organization_id=eq.${org}`;
    if (resource === 'invitations') filter = `or=(buyer_organization_id.eq.${org},provider_organization_id.eq.${org})`;
    if (resource === 'quotes') {
      const invitations = await userSupabaseRequest(token, `b2b_rfq_invitations?select=id&or=(buyer_organization_id.eq.${org},provider_organization_id.eq.${org})&limit=100`);
      if (!invitations.length) return json(res, 200, { ok: true, rows: [] }, session.headers);
      filter = `invitation_id=in.(${invitations.map(row => row.id).join(',')})`;
    }
    const rows = await userSupabaseRequest(token, `${config.table}?select=*&${filter}&order=created_at.desc&limit=100`);
    return json(res, 200, { ok: true, rows }, session.headers);
  }
  if (req.method === 'POST') {
    const body = await readBody(req);
    const org = body.organization_id;
    if (!uuid.test(org || '')) throw new HttpError(400, 'organization_id inválido.');
    const payload = Object.fromEntries(config.fields.filter(key => Object.hasOwn(body,key)).map(key => [key,body[key]]));
    if (resource === 'invitations') payload.buyer_organization_id = org;
    else if (resource !== 'quotes') payload.organization_id = org;
    if (resource === 'quotes' && org !== body.provider_organization_id) throw new HttpError(400, 'Organização do fornecedor inconsistente.');
    if (resource === 'documents') payload.uploader_id = session.user.id;
    if (resource === 'decisions') payload.decided_by = session.user.id;
    if (resource === 'events') payload.actor_id = session.user.id;
    // RLS and composite foreign keys are the final authorization boundary.
    const rows = await userSupabaseRequest(token, config.table, { method: 'POST', body: payload });
    return json(res, 201, { ok: true, row: rows?.[0] }, session.headers);
  }
  return json(res, 405, { ok: false, error: 'Método não permitido.' }, session.headers);
}
