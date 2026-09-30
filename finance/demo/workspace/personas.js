// Personas da demonstração vistas pela interface: quem é, o que prioriza e
// quais atalhos, sugestões e módulos do painel fazem sentido para cada papel.
// A mesma arquitetura se adapta; não são quatro aplicações diferentes. A
// permissão continua vindo do motor (papel do membro), nunca daqui.

export const PERSONA_META = Object.freeze({
  buyer: {
    key: 'buyer', group: 'Comprador', area: 'Tesouraria', name: 'Marina Costa', title: 'Gerente Financeira', org: 'Acme Indústria Ltda. — DEMO', audience: 'company',
    focus: 'Solicitações, propostas, prazos, decisões e contratos.',
    suggestions: ['new-rfq', 'my-approvals', 'find-provider', 'customize-dashboard', 'go-rfqs', 'go-proposals', 'go-contracts', 'go-tasks']
  },
  approver: {
    key: 'approver', group: 'Aprovador', area: 'Diretoria financeira', name: 'Ricardo Alves', title: 'CFO', org: 'Acme Indústria Ltda. — DEMO', audience: 'company',
    focus: 'Aprovações, valores, condições e justificativas.',
    suggestions: ['my-approvals', 'find-provider', 'customize-dashboard', 'go-approvals', 'go-rfqs', 'go-contracts', 'go-proposals']
  },
  admin: {
    key: 'admin', group: 'Administração', area: 'Controladoria', name: 'Helena Prado', title: 'Controller', org: 'Acme Indústria Ltda. — DEMO', audience: 'company',
    focus: 'Equipe, política de aprovação, perfil financeiro e configurações.',
    suggestions: ['customize-dashboard', 'find-provider', 'my-approvals', 'go-team', 'go-policy', 'go-profile', 'go-settings', 'go-providers']
  },
  provider: {
    key: 'provider', group: 'Provedor', area: 'Instituição financeira', name: 'Camila Rocha', title: 'Gerente de Relacionamento PJ', org: 'Atlas Bank — DEMO', audience: 'provider',
    focus: 'Convites, propostas, prazos e solicitações recebidas.',
    suggestions: ['go-provider-invites', 'go-provider-rfqs', 'go-provider-home', 'go-provider-invite']
  }
});
export const PERSONA_ORDER = ['buyer', 'approver', 'admin', 'provider'];

/**
 * Painel padrão de cada persona: ordem, tamanho (full = largura inteira,
 * half = meia largura) e o que começa oculto. A pessoa pode mudar tudo.
 */
export const DEFAULT_DASHBOARDS = Object.freeze({
  // Trabalho primeiro: fila pessoal, processos em andamento; números só no fim.
  buyer: {
    order: ['attention', 'inflight', 'renewals', 'tasks', 'activity', 'summary', 'pipeline', 'recent-rfqs', 'favorites', 'approvals', 'contracts', 'providers', 'shortcuts', 'governance'],
    hidden: ['pipeline', 'recent-rfqs', 'favorites', 'approvals', 'contracts', 'providers', 'shortcuts', 'governance'],
    sizes: { attention: 'full', inflight: 'full' }
  },
  approver: {
    order: ['attention', 'approvals', 'inflight', 'renewals', 'summary', 'activity', 'contracts', 'pipeline', 'recent-rfqs', 'tasks', 'favorites', 'providers', 'shortcuts', 'governance'],
    hidden: ['activity', 'contracts', 'pipeline', 'recent-rfqs', 'tasks', 'favorites', 'providers', 'shortcuts', 'governance'],
    sizes: { attention: 'full', approvals: 'full', inflight: 'full' }
  },
  admin: {
    order: ['attention', 'governance', 'inflight', 'shortcuts', 'providers', 'activity', 'summary', 'tasks', 'pipeline', 'recent-rfqs', 'approvals', 'renewals', 'contracts', 'favorites'],
    hidden: ['tasks', 'pipeline', 'recent-rfqs', 'approvals', 'renewals', 'contracts', 'favorites'],
    sizes: { attention: 'full', governance: 'full', inflight: 'full' }
  }
});
