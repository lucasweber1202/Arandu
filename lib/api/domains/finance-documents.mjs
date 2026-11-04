import { userSupabaseRequest } from '../../supabase.mjs';
import { HttpError, json, readBody, clean, limited } from '../../api-core.mjs';
import { createDocumentStorage, downloadName, signedUrlTtl, DOCUMENT_MIME_TYPES, DOCUMENT_MAX_BYTES, DOCUMENT_UPLOAD_WINDOW_SECONDS } from '../../finance/document-storage.mjs';
import { requireUuid, query, rest, rpc, upstream, memberOrganization } from './finance-core.mjs';
const DOCUMENT_ENTITIES = ['rfq', 'proposal', 'contract', 'profile', 'provider'];
export async function handleFinanceDocuments(req, res, {resource, sub, token, headers, session, documentStorage, adminRpc, env, enforceRateLimit}) {
  // Documentos são REFERÊNCIA (https), não upload. A decisão está registrada em
  // docs/FINANCIAL_MVP_RUNBOOK.md: upload seguro exige storage, assinatura,
  // política de acesso e retenção, e não improvisamos isso.
  if (resource === 'documents') {
    if (req.method === 'GET') {
      const organization = await memberOrganization(token, query(req).get('organization_id'));
      const entityType = clean(query(req).get('entity_type'));
      const entityId = clean(query(req).get('entity_id'));
      let filter = `organization_id=eq.${organization.id}`;
      if (entityType) {
        if (!DOCUMENT_ENTITIES.includes(entityType)) throw new HttpError(400, 'Tipo de entidade inválido.', 'invalid_entity_type');
        filter += `&entity_type=eq.${entityType}`;
      }
      if (entityId) filter += `&entity_id=eq.${requireUuid(entityId, 'entity_id')}`;
      const rows = await rest(token, `fin_documents?select=id,entity_type,entity_id,title,reference_url,note,created_at&${filter}&order=created_at.desc&limit=200`);
      return json(res, 200, { ok: true, rows, upload_supported: false }, headers);
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const organization = await memberOrganization(token, body.organization_id, ['BUYER']);
      const entityType = clean(body.entity_type);
      if (!DOCUMENT_ENTITIES.includes(entityType)) throw new HttpError(400, 'Tipo de entidade inválido.', 'invalid_entity_type');
      const referenceUrl = clean(body.reference_url);
      if (!/^https:\/\//.test(referenceUrl)) throw new HttpError(400, 'A referência documental precisa usar https.', 'invalid_reference');
      const title = limited(body.title, 200);
      if (title.length < 2) throw new HttpError(400, 'Informe um título para o documento.', 'invalid_title');
      const rows = await upstream(userSupabaseRequest(token, 'fin_documents', {
        method: 'POST',
        body: {
          organization_id: organization.id, entity_type: entityType,
          entity_id: requireUuid(body.entity_id, 'entity_id'),
          title, reference_url: referenceUrl, note: limited(body.note, 1000) || null,
          created_by: session.user.id
        }
      }));
      return json(res, 201, { ok: true, row: rows?.[0] ?? null }, headers);
    }
  }

  // --------------------------------------------------- documentos privados
  // Autorização e trilha ficam no banco (RPC com o token do usuário). O servidor
  // só usa o service role depois disso, para assinar URLs curtas que não são
  // gravadas em lugar nenhum.
  if (resource === 'private-documents') {
    const storage = () => documentStorage || createDocumentStorage({ env });
    if (req.method === 'GET') {
      await memberOrganization(token, query(req).get('organization_id'));
      const entityType = clean(query(req).get('entity_type'));
      if (!['rfq', 'proposal', 'contract', 'profile'].includes(entityType)) throw new HttpError(400, 'Tipo de entidade inválido.', 'invalid_entity_type');
      const entityId = requireUuid(query(req).get('entity_id'), 'entity_id');
      const documents = await rest(token, `fin_private_documents?select=id,organization_id,buyer_organization_id,entity_type,entity_id,title,visibility,current_version,created_by,created_at&entity_type=eq.${entityType}&entity_id=eq.${entityId}&removed_at=is.null&order=created_at.desc&limit=100`);
      const ids = (documents || []).map((row) => row.id);
      const versions = ids.length
        ? await rest(token, `fin_document_versions?select=document_id,version,mime_type,size_bytes,uploaded_by,completed_at&document_id=in.(${ids.join(',')})&order=version.desc&limit=500`)
        : [];
      const rows = projectDocumentVersions(documents, versions);
      return json(res, 200, { ok: true, rows, limits: { max_bytes: DOCUMENT_MAX_BYTES, mime_types: Object.keys(DOCUMENT_MIME_TYPES) } }, headers);
    }
    if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.', 'method_not_allowed');
    const body = await readBody(req);
    await enforceRateLimit(req, 'finance-documents', 40, 600000, session.user.id);
    if (sub === 'upload') {
      const organization = await memberOrganization(token, body.organization_id);
      const mime = clean(body.mime_type).toLowerCase();
      const size = Number(body.size);
      if (!DOCUMENT_MIME_TYPES[mime]) throw new HttpError(400, 'Tipo de arquivo não aceito. Envie PDF, JPG, PNG, XLSX ou DOCX.', 'document_type_not_allowed');
      if (!Number.isInteger(size) || size < 1 || size > DOCUMENT_MAX_BYTES) throw new HttpError(413, 'O arquivo passa de 10 MB. Reduza o tamanho ou divida em partes.', 'document_too_large');
      const sha = clean(body.sha256).toLowerCase();
      const [slot] = await upstream(rpc(token, 'fin_document_begin_upload', {
        p_org: organization.id, p_entity_type: clean(body.entity_type), p_entity_id: requireUuid(body.entity_id, 'entity_id'),
        p_title: limited(body.title, 200), p_visibility: clean(body.visibility) || 'internal', p_mime: mime, p_size: size,
        p_sha256: /^[0-9a-f]{64}$/.test(sha) ? sha : null, p_document_id: clean(body.document_id) ? requireUuid(body.document_id, 'document_id') : null
      })) || [];
      if (!slot?.path) throw new HttpError(409, 'Não foi possível reservar o envio do documento.', 'document_slot_failed');
      const uploadUrl = await storage().signUpload(slot.path).catch(() => { throw new HttpError(503, 'O armazenamento de documentos está indisponível. Tente novamente em instantes.', 'storage_unavailable'); });
      // `expires_in` é o prazo que o Storage de fato deu à URL; `complete_within` é o
      // limite que o banco impõe à reserva, qualquer que seja esse prazo.
      return json(res, 201, { ok: true, document_id: slot.document_id, version: slot.version, upload_url: uploadUrl, expires_in: signedUrlTtl(uploadUrl), complete_within: DOCUMENT_UPLOAD_WINDOW_SECONDS }, headers);
    }
    if (sub === 'complete') {
      const documentId = requireUuid(body.document_id, 'document_id');
      const version = Number(body.version);
      if (!Number.isInteger(version) || version < 1) throw new HttpError(400, 'Versão inválida.', 'invalid_version');
      const [pending] = await upstream(rpc(token, 'fin_document_pending_upload', { p_document: documentId, p_version: version })) || [];
      if (!pending?.path) throw new HttpError(404, 'Este envio não está pendente ou não pertence à sua conta.', 'upload_not_pending');
      const object = await storage().inspect(pending.path).catch(() => null);
      if (!object) throw new HttpError(409, 'O arquivo ainda não chegou ao armazenamento. Envie de novo.', 'upload_missing');
      const status = await adminRpc('fin_document_finalize_upload', { p_document: documentId, p_version: version, p_size: object.size, p_mime: object.mime });
      if (status !== 'available') throw new HttpError(409, 'O arquivo recebido não confere com o que foi declarado (tipo ou tamanho). Envie de novo.', 'upload_mismatch');
      return json(res, 200, { ok: true, document_id: documentId, version, status }, headers);
    }
    if (sub === 'download') {
      const documentId = requireUuid(body.document_id, 'document_id');
      const version = body.version === undefined || body.version === null ? null : Number(body.version);
      if (version !== null && (!Number.isInteger(version) || version < 1)) throw new HttpError(400, 'Versão inválida.', 'invalid_version');
      const [grant] = await upstream(rpc(token, 'fin_document_authorize_download', { p_document: documentId, p_version: version })) || [];
      if (!grant?.path) throw new HttpError(404, 'Documento não encontrado ou já removido.', 'document_not_found');
      const url = await storage().signDownload(grant.path, downloadName(grant.title, grant.mime_type, grant.version))
        .catch(() => { throw new HttpError(503, 'O armazenamento de documentos está indisponível. Tente novamente em instantes.', 'storage_unavailable'); });
      return json(res, 200, { ok: true, url, version: grant.version, expires_in: signedUrlTtl(url) }, headers);
    }
    if (sub === 'remove') {
      await upstream(rpc(token, 'fin_document_remove', { p_document: requireUuid(body.document_id, 'document_id') }));
      return json(res, 200, { ok: true }, headers);
    }
    throw new HttpError(404, 'Operação de documento desconhecida.', 'not_found');
  }

  throw new HttpError(404, 'Recurso financeiro não encontrado.', 'finance_route_not_found');
}

export function projectDocumentVersions(documents, versions) {
      const byDocument = new Map();
      for (const version of versions || []) {
        if (!byDocument.has(version.document_id)) byDocument.set(version.document_id, []);
        byDocument.get(version.document_id).push(version);
      }
      return (documents || []).map((row) => ({ ...row, versions: byDocument.get(row.id) || [] }));
}
