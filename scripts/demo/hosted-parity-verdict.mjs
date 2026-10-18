// Veredito da verificação hospedada (scripts/demo/hosted-parity.mjs), separado
// para ser testável sem rede. Cada item tem um resultado:
//   PASS     — comprovado pelo servidor
//   FAIL     — comprovado que NÃO atende (resposta lida e errada)
//   BLOCKED  — o verificador não tem acesso (401/403 de proteção de deploy, proxy)
//   UNKNOWN  — transporte impediu concluir (rede, timeout, 5xx sem corpo da aplicação)
//   NOT_RUN  — não se aplica a este alvo (ex.: SHA no laboratório local)
// Nenhum desses, exceto PASS, conta como PASS.

/** Classifica uma resposta HTTP que não pôde ser lida como da aplicação. */
export function transportOutcome(response) {
  if (!response || response.status === 0) return 'UNKNOWN';
  if (response.status === 401 || response.status === 403 || response.status === 407) return response.app ? null : 'BLOCKED';
  if (response.status >= 500 && !response.app) return 'UNKNOWN';
  return null;
}

/**
 * Veredito geral. Falha comprovada prevalece: se algo foi lido e está errado, o
 * alvo NÃO está pronto, mesmo que outro item não tenha sido lido. Sem falha
 * comprovada, falta de acesso vem antes de transporte, e só tudo PASS (ou
 * NOT_RUN declarado no laboratório) é READY.
 */
export function verdict(checks, { local = false } = {}) {
  const results = checks.map((check) => check.result);
  if (results.includes('FAIL')) return 'NOT_READY';
  if (results.includes('BLOCKED')) return 'ACCESS_BLOCKED';
  if (results.includes('UNKNOWN')) return 'INCONCLUSIVE';
  // NOT_RUN só é aceitável para o SHA no laboratório local; em alvo hospedado é falta de prova.
  const notRun = checks.filter((check) => check.result === 'NOT_RUN');
  if (notRun.length && (!local || notRun.some((check) => check.id !== 'release-sha'))) return 'INCONCLUSIVE';
  return results.length ? 'READY' : 'INCONCLUSIVE';
}
