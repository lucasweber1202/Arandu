// Personas da demonstração vistas pela interface: quem é, o que prioriza e
// quais atalhos, sugestões e módulos do painel fazem sentido para cada papel.
// A mesma arquitetura se adapta; não são quatro aplicações diferentes. A
// permissão continua vindo do motor (papel do membro), nunca daqui.

export const PERSONA_META = Object.freeze({
  buyer: {
    key: 'buyer', group: 'Comprador', area: 'Tesouraria', name: 'Marina Costa', title: 'Gerente Financeira', org: 'Acme Indústria Ltda. — DEMO', audience: 'company',
    focus: 'Solicitações, propostas, prazos, decisões e contratos.',
    suggestions: ['new-rfq', 'go-rfqs', 'go-proposals', 'go-contracts', 'go-approvals', 'go-tasks']
  },
  approver: {
    key: 'approver', group: 'Aprovador', area: 'Diretoria financeira', name: 'Ricardo Alves', title: 'CFO', org: 'Acme Indústria Ltda. — DEMO', audience: 'company',
    focus: 'Aprovações, valores, condições e justificativas.',
    suggestions: ['go-approvals', 'go-rfqs', 'go-contracts', 'go-proposals', 'go-dashboard']
  },
  admin: {
    key: 'admin', group: 'Administração', area: 'Controladoria', name: 'Helena Prado', title: 'Controller', org: 'Acme Indústria Ltda. — DEMO', audience: 'company',
    focus: 'Equipe, política de aprovação, perfil financeiro e configurações.',
    suggestions: ['go-team', 'go-policy', 'go-profile', 'go-settings', 'go-providers', 'open-preferences']
  },
  provider: {
    key: 'provider', group: 'Provedor', area: 'Instituição financeira', name: 'Camila Rocha', title: 'Gerente de Relacionamento PJ', org: 'Atlas Bank — DEMO', audience: 'provider',
    focus: 'Convites, propostas, prazos e solicitações recebidas.',
    suggestions: ['go-provider-home', 'go-provider-rfqs', 'go-provider-invite']
  }
});
export const PERSONA_ORDER = ['buyer', 'approver', 'admin', 'provider'];

/**
 * Painel padrão de cada persona: ordem, tamanho (full = largura inteira,
 * half = meia largura) e o que começa oculto. A pessoa pode mudar tudo.
 */
export const DEFAULT_DASHBOARDS = Object.freeze({
  buyer: {
    order: ['attention', 'summary', 'pipeline', 'recent-rfqs', 'renewals', 'tasks', 'activity', 'favorites', 'approvals', 'contracts', 'providers', 'shortcuts', 'governance'],
    hidden: ['favorites', 'approvals', 'contracts', 'providers', 'shortcuts', 'governance'],
    sizes: { attention: 'full', summary: 'full', pipeline: 'full' }
  },
  approver: {
    order: ['attention', 'approvals', 'summary', 'renewals', 'activity', 'contracts', 'pipeline', 'recent-rfqs', 'tasks', 'favorites', 'providers', 'shortcuts', 'governance'],
    hidden: ['pipeline', 'recent-rfqs', 'tasks', 'favorites', 'providers', 'shortcuts', 'governance'],
    sizes: { attention: 'full', approvals: 'full', summary: 'full' }
  },
  admin: {
    order: ['attention', 'governance', 'shortcuts', 'summary', 'providers', 'activity', 'tasks', 'pipeline', 'recent-rfqs', 'approvals', 'renewals', 'contracts', 'favorites'],
    hidden: ['tasks', 'pipeline', 'recent-rfqs', 'approvals', 'renewals', 'contracts', 'favorites'],
    sizes: { attention: 'full', governance: 'full', summary: 'full' }
  }
});
