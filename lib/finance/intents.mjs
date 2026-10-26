// Intake por objetivo (Guideline v3.3 §35.10, Constitution §13): a pessoa
// começa pelo que precisa fazer, não pelo módulo. Cada intenção leva a um
// fluxo que JÁ existe — nada é duplicado — e só aparece para quem pode agir.
// `acao` abre o formulário do fluxo de destino (botões com data-intent).

export const INTENTS = Object.freeze([
  { key: 'credit', group: 'Contratar', label: 'Contratar crédito', detail: 'Capital de giro, financiamento, linhas estruturadas', path: '/finance/new-rfq.html?product=credit', icon: 'briefcase', permission: 'create_rfq' },
  { key: 'acquiring', group: 'Contratar', label: 'Avaliar adquirência', detail: 'MDR, antecipação, PIX e prazos de liquidação', path: '/finance/new-rfq.html?product=acquiring', icon: 'layers', permission: 'create_rfq' },
  { key: 'renew', group: 'Contratar', label: 'Renovar ou renegociar um contrato', detail: 'Contratos na janela de renovação; nova concorrência a partir do contrato', path: '/finance/contracts.html', icon: 'repeat', permission: 'create_rfq' },
  { key: 'compare', group: 'Contratar', label: 'Comparar propostas recebidas', detail: 'Solicitações em avaliação', path: '/finance/rfqs.html?status=comparing', icon: 'scale', permission: null },
  { key: 'contract', group: 'Registrar o que já existe', label: 'Registrar um contrato existente', detail: 'Carteira atual, fora de uma concorrência no Arandu', path: '/finance/contracts.html?acao=registrar-contrato', icon: 'briefcase', permission: 'create_rfq' },
  { key: 'facility', group: 'Registrar o que já existe', label: 'Registrar facility ou limite', detail: 'Limite aprovado e usado, vencimentos e garantias', path: '/finance/portfolio.html?acao=registrar-facility', icon: 'layers', permission: 'edit_profile' },
  { key: 'institution', group: 'Registrar o que já existe', label: 'Cadastrar uma instituição', detail: 'Banco, fintech ou adquirente com quem a empresa trabalha', path: '/finance/providers.html?acao=cadastrar-instituicao', icon: 'building', permission: 'create_rfq' },
  { key: 'fees', group: 'Registrar o que já existe', label: 'Registrar tarifa ou condição bancária', detail: 'Tarifa contratada e cobrança observada, com fonte', path: '/finance/fees.html', icon: 'scale', permission: 'create_rfq' },
  { key: 'deadlines', group: 'Acompanhar', label: 'Acompanhar vencimentos e próximas ações', detail: 'Aviso prévio, renovações e tarefas da equipe, com responsável', path: '/finance/tasks.html', icon: 'tasks', permission: null },
  { key: 'review', group: 'Acompanhar', label: 'Revisar condições de um contrato', detail: 'Termos vigentes, versões, aditivos e documento de suporte', path: '/finance/contracts.html', icon: 'file', permission: null },
  { key: 'obligation', group: 'Acompanhar', label: 'Acompanhar uma obrigação ou covenant', detail: 'Medições, prazos e evidência', path: '/finance/covenants.html', icon: 'calendar', permission: null }
]);

/** Intenções que a pessoa pode executar (ação inacessível não aparece como executável). */
export function intentsFor(can) {
  return INTENTS.filter((intent) => !intent.permission || can(intent.permission));
}

/** Ação pedida pela URL, só de uma lista fechada (nada de seletor vindo da URL). */
export const INTENT_ACTIONS = Object.freeze(['registrar-contrato', 'registrar-facility', 'cadastrar-instituicao']);
export function requestedAction(search) {
  const value = new URLSearchParams(search || '').get('acao');
  return INTENT_ACTIONS.includes(value) ? value : null;
}
