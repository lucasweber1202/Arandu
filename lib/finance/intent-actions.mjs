// Ações abertas pela URL (`?acao=`): lista fechada, sem seletor vindo da URL.
// Módulo separado de intents.mjs para que o carregamento inicial de toda tela
// (finance/app.js) não traga o catálogo de intenções, usado só pelo "Começar".

export const INTENT_ACTIONS = Object.freeze(['registrar-contrato', 'registrar-facility', 'cadastrar-instituicao']);
export function requestedAction(search) {
  const value = new URLSearchParams(search || '').get('acao');
  return INTENT_ACTIONS.includes(value) ? value : null;
}
