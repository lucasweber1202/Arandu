// Storage privado dos documentos financeiros.
//
// O navegador nunca recebe acesso ao bucket. Estas funções rodam só no servidor,
// com o service role, e só depois que uma RPC executada com o token do usuário
// autorizou a operação e registrou o evento. As URLs assinadas têm vida curta e
// não são persistidas: o banco guarda bucket, caminho, versão e metadados.

export const DOCUMENT_BUCKET = 'fin-documents';
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_UPLOAD_TTL_SECONDS = 120;
export const DOCUMENT_DOWNLOAD_TTL_SECONDS = 60;
export const DOCUMENT_MIME_TYPES = Object.freeze({
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx'
});
const PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/v[0-9]+-[0-9a-f-]{36}$/;

export class StorageUnavailable extends Error {
  constructor(message = 'Armazenamento de documentos indisponível.') { super(message); this.code = 'storage_unavailable'; }
}

function config(env) {
  const url = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!/^https:\/\//.test(url) || !key) throw new StorageUnavailable();
  return { url, key };
}

function checkedPath(path) {
  if (!PATH.test(String(path || ''))) throw new StorageUnavailable('Caminho de documento inválido.');
  return path;
}

/** Nome de arquivo para o download: derivado do título, sem caracteres de controle. */
export function downloadName(title, mime, version) {
  const base = String(title || 'documento').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ._-]+/g, '').trim().replace(/\s+/g, '-').slice(0, 80) || 'documento';
  return `${base}-v${Number(version) || 1}.${DOCUMENT_MIME_TYPES[mime] || 'bin'}`;
}

export function createDocumentStorage({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const call = async (path, init) => {
    const { url, key } = config(env);
    const response = await fetchImpl(`${url}/storage/v1${path}`, {
      ...init,
      signal: AbortSignal.timeout(8000),
      headers: { apikey: key, Authorization: `Bearer ${key}`, ...(init.headers || {}) }
    });
    if (!response.ok) throw new StorageUnavailable();
    return response;
  };
  return {
    async signUpload(path) {
      const response = await call(`/object/upload/sign/${DOCUMENT_BUCKET}/${checkedPath(path)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: DOCUMENT_UPLOAD_TTL_SECONDS })
      });
      const data = await response.json();
      if (!data?.url) throw new StorageUnavailable();
      return `${config(env).url}/storage/v1${data.url}`;
    },
    /** Confere o objeto que o navegador subiu: tamanho e tipo reais. */
    async inspect(path) {
      const response = await call(`/object/${DOCUMENT_BUCKET}/${checkedPath(path)}`, { method: 'HEAD' });
      return {
        size: Number(response.headers.get('content-length')),
        mime: String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
      };
    },
    async signDownload(path, filename) {
      const response = await call(`/object/sign/${DOCUMENT_BUCKET}/${checkedPath(path)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: DOCUMENT_DOWNLOAD_TTL_SECONDS })
      });
      const data = await response.json();
      const signed = data?.signedURL || data?.signedUrl;
      if (!signed) throw new StorageUnavailable();
      const separator = signed.includes('?') ? '&' : '?';
      return `${config(env).url}/storage/v1${signed}${separator}download=${encodeURIComponent(filename)}`;
    }
  };
}
