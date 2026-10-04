// Políticas explícitas: nenhuma escrita é repetida automaticamente.
export const DEPENDENCIES = Object.freeze({
  database: { timeout_ms: 8000, max_retries: 0, owner: 'platform', critical: true },
  auth: { timeout_ms: 8000, max_retries: 0, owner: 'security', critical: true },
  storage: { timeout_ms: 8000, max_retries: 0, owner: 'platform', critical: true },
  webhook: { timeout_ms: 10000, max_retries: 7, owner: 'integrations', critical: false },
  dns: { timeout_ms: 2000, max_retries: 0, owner: 'platform', critical: true },
  email: { timeout_ms: 4000, max_retries: 4, owner: 'platform', critical: false }
});

export function retryableFailure({ status, code } = {}) {
  return [408, 429, 502, 503, 504].includes(status) || ['timeout', 'network_error', '55P03', '40001', '40P01'].includes(code);
}

export function safeFailure(error, fallback = 'dependency_failed') {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'timeout';
  if (error?.code === 'invalid_response') return 'invalid_response';
  if (error?.code === '55P03') return 'job_busy';
  if (error?.status === 429) return 'rate_limited';
  if (error?.status === 401 || error?.status === 403) return 'dependency_unauthorized';
  return fallback;
}

export function invalidResponse() {
  return Object.assign(new Error('Resposta da dependência inválida.'), { code: 'invalid_response' });
}

export function countResult(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw invalidResponse();
  return value;
}

export async function withDeadline(operation, timeoutMs = 8000) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = Object.assign(new Error('Dependência excedeu o prazo.'), { name: 'TimeoutError' });
      controller.abort(error);
      reject(error);
    }, Math.max(1, timeoutMs));
  });
  try { return await Promise.race([Promise.resolve().then(() => operation(controller.signal)), timeout]); }
  finally { clearTimeout(timer); }
}
