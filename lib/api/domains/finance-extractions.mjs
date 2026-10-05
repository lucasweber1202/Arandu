import { HttpError, json, readBody } from '../../api-core.mjs';
import { requireUuid, query, rest, rpc, memberOrganization } from './finance-core.mjs';
import { createDocumentStorage, StorageUnavailable } from '../../finance/document-storage.mjs';
import { SCHEMAS, EXTRACTION_STATUS, schemaField, normalizeValue, semanticDiff, untrustedText } from '../../finance/document-intelligence.mjs';
import { providerFor, factsFromPairs, sha256Hex, ExtractionFailure } from '../../finance/extraction-providers.mjs';
import { presentExtractionPage, presentExtractionDetail, diffLines } from '../../finance/extraction-presenter.mjs';

// P1.4 Proposal & Document Intelligence. Leitura e escrita com o JWT de quem
// chama (RLS + RPCs security definer). O conteúdo do documento só é lido pelo
// servidor DEPOIS que a RPC autoriza a extração, e nunca volta ao navegador.
// O documento é dado não confiável: o leitor só produz fatos de campos do
// schema e o banco decide o estado de revisão.
const PAGE = 25;
const SPLIT = /^\s*(.{2,80}?)\s*(?::|\||\t|—|–| - )\s*(.+?)\s*$/;

function docRef(b) {
  if (typeof b.document === 'string' && b.document.includes('|')) {
    const [id, version] = b.document.split('|');
    return { id: requireUuid(id, 'document_id'), version: Number(version) || null };
  }
  return { id: requireUuid(b.document_id, 'document_id'), version: b.version === undefined || b.version === null || b.version === '' ? null : Number(b.version) };
}

async function listPage(token, org, q) {
  const offset = Math.max(0, Math.min(5000, Number(q.get('after')) || 0));
  const filters = [`organization_id=eq.${org.id}`];
  if (q.get('schema_key')) { if (!SCHEMAS[q.get('schema_key')]) throw new HttpError(400, 'Tipo de documento inválido.', 'invalid_extraction_filters'); filters.push(`schema_key=eq.${q.get('schema_key')}`); }
  if (q.get('status')) { if (!EXTRACTION_STATUS[q.get('status')]) throw new HttpError(400, 'Estado inválido.', 'invalid_extraction_filters'); filters.push(`status=eq.${q.get('status')}`); }
  const [rows, documents, open] = await Promise.all([
    rest(token, `fin_document_extractions?select=*&${filters.join('&')}&order=created_at.desc,id.desc&limit=${PAGE + 1}&offset=${offset}`),
    rest(token, `fin_private_documents?select=id,title,entity_type,entity_id,current_version&buyer_organization_id=eq.${org.id}&removed_at=is.null&current_version=gt.0&order=created_at.desc&limit=200`),
    rest(token, `fin_extraction_facts?select=extraction_id,status&organization_id=eq.${org.id}&status=in.(needs_review,extracted,confirmed)&limit=5000`)
  ]);
  const titles = new Map((documents || []).map((d) => [d.id, d.title]));
  const pending = new Map();
  const queue = { needs_review: 0, extracted: 0, confirmed: 0 };
  for (const f of open || []) {
    queue[f.status] += 1;
    if (f.status === 'needs_review') pending.set(f.extraction_id, (pending.get(f.extraction_id) || 0) + 1);
  }
  const page = (rows || []).slice(0, PAGE).map((x) => ({ ...x, document_title: titles.get(x.document_id), needs_review: pending.get(x.id) || 0 }));
  return presentExtractionPage({ rows: page, documents: (documents || []).filter((d) => ['rfq', 'proposal', 'contract'].includes(d.entity_type)), next: (rows || []).length > PAGE ? String(offset + PAGE) : null, queue });
}

async function detail(token, id) {
  const found = await rest(token, `fin_document_extractions?select=*&id=eq.${id}&limit=1`);
  const x = found?.[0];
  if (!x) throw new HttpError(404, 'Extração indisponível para sua conta.', 'extraction_not_found');
  const [facts, docs] = await Promise.all([
    rest(token, `fin_extraction_facts?select=*&extraction_id=eq.${id}&order=created_at.asc,id.asc&limit=500`),
    rest(token, `fin_private_documents?select=id,title,entity_type,entity_id&id=eq.${x.document_id}&limit=1`)
  ]);
  const ids = (facts || []).map((f) => f.id);
  const reviews = ids.length ? await rest(token, `fin_extraction_reviews?select=*&fact_id=in.(${ids.join(',')})&order=acted_at.asc&limit=500`) : [];
  const d = docs?.[0] || {};
  // Extração anterior comparável: mesmo tipo, concluída, de um documento do
  // mesmo objeto de origem (ex.: proposta v1 × v2, contrato × aditivo).
  let previous = null, previousFacts = [];
  if (x.status === 'completed' && d.entity_id) {
    const siblings = await rest(token, `fin_private_documents?select=id&buyer_organization_id=eq.${x.organization_id}&entity_type=eq.${d.entity_type}&entity_id=eq.${d.entity_id}&limit=50`);
    const docIds = (siblings || []).map((s) => s.id);
    if (docIds.length) {
      const prior = await rest(token, `fin_document_extractions?select=*&organization_id=eq.${x.organization_id}&schema_key=eq.${x.schema_key}&status=eq.completed&document_id=in.(${docIds.join(',')})&created_at=lt.${encodeURIComponent(x.created_at)}&order=created_at.desc&limit=1`);
      previous = prior?.[0] || null;
      if (previous) previousFacts = await rest(token, `fin_extraction_facts?select=*&extraction_id=eq.${previous.id}&limit=500`);
    }
  }
  return presentExtractionDetail({ extraction: x, document: d, facts: facts || [], reviews: reviews || [], previous, previousFacts: previousFacts || [] });
}

function manualFacts(schemaKey, text) {
  const lines = String(text || '').split(/\r?\n/).slice(0, 200);
  const pairs = lines.map((line, i) => ({ m: SPLIT.exec(line), i })).filter((x) => x.m).map(({ m, i }) => ({ label: m[1], value: m[2], page: null, locator: `digitação, linha ${i + 1}` }));
  return factsFromPairs(schemaKey, pairs, { method: 'manual_entry', parserVersion: 'manual-1', confidence: 1 });
}
const forDb = (facts) => facts.map(({ status: _s, ...f }) => f);

export async function handleFinanceExtractions(req, res, { resource, sub, token, headers, documentStorage = null, env = process.env, enforceRateLimit = null }) {
  if (resource !== 'extractions') return false;
  const q = query(req);
  if (req.method === 'GET' && !sub) {
    const org = await memberOrganization(token, q.get('organization_id'), ['BUYER']);
    json(res, 200, { ok: true, ...(await listPage(token, org, q)) }, headers);
    return true;
  }
  if (req.method === 'GET' && sub === 'detail') {
    json(res, 200, { ok: true, ...(await detail(token, requireUuid(q.get('id'), 'id'))) }, headers);
    return true;
  }
  if (req.method === 'GET' && sub === 'diff') {
    const [a, b] = ['a', 'b'].map((k) => requireUuid(q.get(k), k));
    const rows = await rest(token, `fin_document_extractions?select=id,schema_key&id=in.(${a},${b})&limit=2`);
    const byId = new Map((rows || []).map((x) => [x.id, x]));
    if (!byId.get(a) || !byId.get(b)) throw new HttpError(404, 'Extração indisponível para sua conta.', 'extraction_not_found');
    if (byId.get(a).schema_key !== byId.get(b).schema_key) throw new HttpError(400, 'Compare extrações do mesmo tipo de documento.', 'extraction_schema_mismatch');
    const [fa, fb] = await Promise.all([a, b].map((id) => rest(token, `fin_extraction_facts?select=*&extraction_id=eq.${id}&limit=500`)));
    const schemaKey = byId.get(a).schema_key;
    const diff = semanticDiff(schemaKey, fa || [], fb || []);
    json(res, 200, { ok: true, schema_key: schemaKey, diff, lines: diffLines(schemaKey, diff), notice: 'Comparação factual campo a campo, com proveniência; não indica melhor ou pior.' }, headers);
    return true;
  }
  if (req.method !== 'POST') throw new HttpError(405, 'Método indisponível.', 'method_not_allowed');
  const b = await readBody(req);

  if (sub === 'start') {
    const org = await memberOrganization(token, b.organization_id, ['BUYER']);
    if (enforceRateLimit) await enforceRateLimit(req, 'finance-extraction', 30, 600000);
    const ref = docRef(b);
    if (!SCHEMAS[b.schema_key]) throw new HttpError(400, 'Tipo de documento inválido.', 'invalid_extraction');
    const providerId = ['deterministic_v1', 'manual', 'model_external'].includes(b.provider) ? b.provider : null;
    if (!providerId) throw new HttpError(400, 'Leitor inválido.', 'invalid_extraction');
    let manual = null;
    if (providerId === 'manual') {
      manual = manualFacts(b.schema_key, b.manual_text);
      if (!manual.facts.some((f) => f.value_state !== 'not_provided')) throw new HttpError(400, 'Nenhum campo reconhecido: use "Rótulo: valor" por linha com os rótulos do tipo de documento.', 'invalid_extraction');
    }
    const provider = providerId === 'manual' ? { id: 'manual', version: 'manual-1' } : providerFor(providerId, { env });
    if (providerId === 'deterministic_v1' && !documentStorage && !env.SUPABASE_SERVICE_ROLE_KEY) throw new HttpError(503, 'Armazenamento de documentos indisponível para extração.', 'storage_unavailable');
    const started = await rpc(token, 'fin_document_extraction_begin', { p_org: org.id, p_document: ref.id, p_version: ref.version, p_schema: b.schema_key, p_provider: providerId, p_provider_version: provider.version });
    const grant = Array.isArray(started) ? started[0] : started;
    if (!grant?.extraction_id) throw new HttpError(502, 'Extração não iniciada.', 'extraction_unavailable');
    const fail = async (code, status = 422, message = 'Não foi possível extrair este documento.') => {
      await rpc(token, 'fin_document_extraction_fail', { p_extraction: grant.extraction_id, p_code: code });
      json(res, status, { ok: false, id: grant.extraction_id, code, error: message }, headers);
      return true;
    };
    if (providerId === 'manual') {
      const count = await rpc(token, 'fin_document_extraction_record', { p_extraction: grant.extraction_id, p_result: { facts: forDb(manual.facts), flags: manual.flags, warnings: [] } });
      json(res, 201, { ok: true, id: grant.extraction_id, facts: count }, headers);
      return true;
    }
    if (!provider?.configured && providerId === 'model_external') return fail('provider_not_configured', 409, 'Provedor de modelo não configurado neste ambiente. Use o leitor determinístico ou a digitação.');
    if (!provider.supports(grant.mime_type)) return fail('unsupported_format', 422, 'Formato sem leitor configurado (imagem exige OCR). Use a digitação manual.');
    let bytes;
    try {
      bytes = await (documentStorage || createDocumentStorage({ env })).read(grant.path);
    } catch (error) {
      if (error instanceof StorageUnavailable && /limite/.test(error.message)) return fail('too_large');
      await rpc(token, 'fin_document_extraction_fail', { p_extraction: grant.extraction_id, p_code: 'parse_error' });
      throw new HttpError(503, 'Armazenamento de documentos indisponível para extração.', 'storage_unavailable');
    }
    if (grant.sha256 && sha256Hex(bytes) !== grant.sha256) return fail('hash_mismatch', 422, 'O conteúdo armazenado não confere com o hash registrado no envio.');
    let result;
    try {
      result = await provider.extract({ bytes, mime: grant.mime_type, schemaKey: b.schema_key });
    } catch (error) {
      return fail(error instanceof ExtractionFailure ? error.code : 'parse_error');
    }
    const count = await rpc(token, 'fin_document_extraction_record', { p_extraction: grant.extraction_id, p_result: { facts: forDb(result.facts), pages: result.pages, warnings: result.warnings, flags: result.flags } });
    json(res, 201, { ok: true, id: grant.extraction_id, facts: count, warnings: result.warnings, flags: result.flags }, headers);
    return true;
  }

  if (sub === 'review') {
    const [factId, seen] = typeof b.fact === 'string' && b.fact.includes('|') ? b.fact.split('|') : [b.fact_id, b.expected_status];
    const id = requireUuid(factId, 'fact_id');
    if (!['confirm', 'reject', 'correct'].includes(b.action)) throw new HttpError(400, 'Ação inválida.', 'invalid_extraction_review');
    const reason = typeof b.reason === 'string' ? untrustedText(b.reason, 1000).text : '';
    if (b.action !== 'confirm' && (reason.length < 3 || /[<>]/.test(reason))) throw new HttpError(400, 'Justifique a rejeição ou a correção.', 'invalid_extraction_review');
    const input = { action: b.action, ...(reason ? { reason } : {}) };
    if (b.action === 'correct') {
      const found = await rest(token, `fin_extraction_facts?select=schema_key,field_key&id=eq.${id}&limit=1`);
      const field = found?.[0] && schemaField(found[0].schema_key, found[0].field_key);
      if (!field) throw new HttpError(404, 'Fato indisponível para sua conta.', 'extraction_not_found');
      const n = normalizeValue(field, b.value);
      if (n.value_state === 'unreadable') throw new HttpError(400, `Valor não reconhecido para "${field.label}".`, 'invalid_extraction_review');
      Object.assign(input, { value_state: n.value_state, normalized_value: n.normalized ?? null, unit: n.unit || null, currency: n.currency || null, raw_value: untrustedText(b.value, 500).text || null });
    }
    json(res, 201, { ok: true, id: await rpc(token, 'fin_review_extraction_fact', { p_fact: id, p_expected: seen, p_input: input }) }, headers);
    return true;
  }
  throw new HttpError(404, 'Recurso indisponível.', 'not_found');
}
