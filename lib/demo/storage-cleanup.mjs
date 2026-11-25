// Exclusão do Storage no reset/cleanup da Demo (Arandu 12.1 / P1-B).
//
// Antes: a exclusão dos objetos usava `.catch(() => null)` e o reset seguia
// apagando fin_document_versions; uma falha do Storage deixava objetos órfãos
// sem nenhuma referência para repetir a limpeza, e o workspace saía como limpo.
//
// Agora: (1) só caminhos do próprio escopo (organização e documento do
// workspace, formato canônico org/doc/vN-uuid do bucket fin-documents);
// (2) lotes com nova tentativa limitada para falha de rede/5xx/429;
// (3) qualquer lote que falhe interrompe o reset ANTES das tabelas, de modo que
// as referências ficam no banco e a próxima execução retoma de onde parou;
// (4) objeto já ausente não é erro (a API de remoção é idempotente e só devolve
// o que apagou). Sem I/O próprio: `remove` e `sleep` são injetados.

export const STORAGE_BUCKET = 'fin-documents';
const PATH = /^([0-9a-f-]{36})\/([0-9a-f-]{36})\/v[0-9]+-[0-9a-f-]{36}$/;

export class StorageCleanupError extends Error {
  constructor(message, { remaining = [], removed = 0 } = {}) {
    super(message);
    this.name = 'StorageCleanupError';
    this.remaining = remaining;
    this.removed = removed;
  }
}

/** Valida que cada referência pertence ao escopo; qualquer intrusa recusa tudo. */
export function scopedStoragePaths(rows, { orgs, documents }) {
  const orgSet = new Set(orgs);
  const docSet = new Set(documents);
  const paths = [];
  for (const row of rows || []) {
    if (!row?.storage_path) continue;
    const bucket = row.storage_bucket || STORAGE_BUCKET;
    const match = PATH.exec(row.storage_path);
    if (bucket !== STORAGE_BUCKET || !match || !orgSet.has(match[1]) || !docSet.has(match[2])
      || (row.document_id && row.document_id !== match[2])) {
      throw new StorageCleanupError('Referência de Storage fora do escopo deste reset: nada foi removido.');
    }
    paths.push(row.storage_path);
  }
  return [...new Set(paths)];
}

const retryable = (error) => error?.retryable !== false && (error?.status === undefined || error.status === 429 || error.status >= 500);

/**
 * Remove os caminhos em lotes. `remove(batch)` resolve quando o Storage aceitou
 * (objetos ausentes contam como removidos) e rejeita com { status } em erro HTTP.
 */
export async function deleteStorageObjects(paths, { remove, batchSize = 100, attempts = 3, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), backoffMs = 500 } = {}) {
  if (typeof remove !== 'function') throw new TypeError('remove é obrigatório.');
  let removed = 0;
  for (let index = 0; index < paths.length; index += batchSize) {
    const batch = paths.slice(index, index + batchSize);
    for (let attempt = 1; ; attempt += 1) {
      try {
        await remove(batch);
        removed += batch.length;
        break;
      } catch (error) {
        if (attempt >= attempts || !retryable(error)) {
          throw new StorageCleanupError(`Exclusão do Storage falhou (${error?.status || 'rede'}); referências preservadas para nova tentativa.`,
            { remaining: paths.slice(index), removed });
        }
        await sleep(backoffMs * attempt);
      }
    }
  }
  return { removed };
}
