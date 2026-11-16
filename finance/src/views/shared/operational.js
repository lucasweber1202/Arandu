// Peças pequenas e compartilhadas para as telas que consomem as APIs
// operacionais do Arandu 10 (cenários, caixa de trabalho, renovações,
// prontidão). Nada aqui decide ou autoriza: só organiza o que o servidor
// devolveu — página, cobertura, erro canônico — de um jeito único.

import { el, icon, textSpan } from '../../core.js';
import { button, mutedText } from '../../ui.js';

/**
 * Guarda de sequência: cada chamada a `next()` invalida as anteriores.
 * `isCurrent(token)` diz se a resposta ainda descreve o estado mais recente.
 * Exportada para teste.
 */
export function sequence() {
  let current = 0;
  return { next: () => ++current, isCurrent: (token) => token === current };
}

/** Chave de idempotência no formato aceito pelo servidor ([A-Za-z0-9._:-]{8,80}). Exportada para teste. */
export function requestKey(prefix = 'ui') {
  const random = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${String(prefix).replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 20) || 'ui'}:${random}`;
}

/** Envio cujo resultado não foi confirmado (rede, tempo esgotado, 5xx exceto 503 de schema). Exportada para teste. */
export function outcomeUnknown(error) {
  if (!error) return false;
  if (!error.status) return true;
  return error.status >= 500 && error.status !== 503;
}

const CODE_MESSAGES = {
  scenario_conflict: 'Este cenário foi alterado em outra sessão ou a chave de envio já foi usada com outros dados. Recarregue a versão atual antes de continuar.',
  scenario_stale: 'As propostas ou a solicitação mudaram desde que o cenário foi salvo. Atualize o contexto do cenário antes de comparar.',
  scenario_coverage_limit: 'A solicitação tem mais propostas do que o limite de análise de cenários (500).',
  proposal_coverage_limit: 'A solicitação tem mais propostas do que o limite de análise (500).',
  scenario_not_found: 'Cenário não disponível para esta conta.',
  invalid_scenario: 'Confira o nome (2 a 120 caracteres, sem < ou >) e os pesos (entre 1 e 100).',
  approval_stale: 'O pedido de aprovação ficou desatualizado. Nada foi decidido.'
};
const STATUS_MESSAGES = {
  400: 'O servidor recusou os dados enviados. Confira os campos e tente de novo.',
  401: 'Sua sessão expirou. Entre novamente para continuar.',
  403: 'Seu papel nesta organização não permite esta ação.',
  404: 'Registro não disponível para esta conta.',
  409: 'O registro mudou enquanto você trabalhava. Recarregue antes de continuar.',
  422: 'O servidor não conseguiu processar este pedido com os dados atuais.',
  429: 'Muitas consultas seguidas. Aguarde um minuto e tente de novo.',
  503: 'O serviço desta área ainda não está disponível neste ambiente (atualização de banco pendente).'
};

/** Mensagem legível para um erro canônico `{status, code, message}`. Exportada para teste. */
export function operationalError(error) {
  if (!error) return 'Falha desconhecida.';
  if (error.code && CODE_MESSAGES[error.code]) return CODE_MESSAGES[error.code];
  if (!error.status) return 'A conexão falhou antes de confirmar o resultado. Nada é dado como feito: confira antes de repetir.';
  if (error.status === 400 && error.message) return error.message;
  return STATUS_MESSAGES[error.status] || error.message || 'Não foi possível concluir.';
}

/**
 * Texto de cobertura de uma página operacional. `coverage.total` é sempre
 * null no contrato: nunca anunciamos total da carteira. Exportada para teste.
 */
export function coverageText({ shown = 0, page = null, coverage = null } = {}) {
  const more = Boolean(page?.has_more);
  if (!shown && !more) return null;
  const base = `${shown} ${shown === 1 ? 'item carregado' : 'itens carregados'}`;
  if (more) return `${base}; há mais registros no servidor. O total não é calculado.`;
  if (coverage && coverage.complete === false) return `${base}. A leitura pode não cobrir todos os registros.`;
  return `${base}. Todos os registros visíveis para você nesta consulta.`;
}

/** Linha de cobertura + botão "Carregar mais" para listas paginadas por cursor. */
export function pagerFooter({ shown, page, coverage, loading = false, onMore, label = 'Carregar mais' }) {
  const text = coverageText({ shown, page, coverage });
  const more = page?.has_more && page?.next_cursor ? button(loading ? 'Carregando…' : label, { size: 'sm', iconName: 'chevronDown', onClick: onMore }) : null;
  if (more) more.disabled = loading;
  if (!text && !more) return null;
  return el('div', { class: 'pager-footer' }, [text ? mutedText(text) : null, more].filter(Boolean));
}

/** Aviso discreto de leitura parcial (enriquecimento incompleto, limite atingido). */
export function partialNote(text, { id = null } = {}) {
  return el('p', { class: 'callout callout-warning compact', role: 'note', ...(id ? { id } : {}) }, [icon('alert', { size: 14 }), textSpan(text)]);
}

/** Erro localizado de uma seção: nunca vira lista vazia. */
export function sectionError(error, onRetry) {
  return el('div', { class: 'callout callout-danger compact section-error', role: 'alert' }, [
    icon('alert', { size: 14 }), textSpan(`Não foi possível carregar. ${operationalError(error)}`),
    onRetry && error?.status !== 401 && error?.status !== 403 ? button('Tentar novamente', { size: 'sm', iconName: 'refresh', onClick: onRetry }) : null
  ].filter(Boolean));
}

/** Monta query string ignorando vazios. Exportada para teste. */
export function queryString(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  return search.toString();
}
