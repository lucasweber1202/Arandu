// Arquitetura de informação do workspace (Guideline v3.3 §35.7, Design
// Constitution §7). Fonte ÚNICA do menu: a casca estática gerada por
// scripts/generate-finance-pages.mjs e o menu montado em runtime por
// finance/src/shell.js leem esta lista. O menu é organizado pelo objetivo de
// quem usa (cinco áreas), não pela arquitetura interna; nenhuma rota muda.
//
// sandboxExcluded: presente em todo build real; só não é espelhada no sandbox
// legado /demo, cujo motor no navegador está congelado.
// mobileOnly: entra na folha "Mais" do celular, não na barra lateral (o sino
// já dá acesso às notificações no desktop).

export const COMPANY_AREAS = Object.freeze([
  {
    key: 'work', label: 'Meu trabalho', hint: 'Pendências, aprovações, prazos e alertas',
    items: [
      { key: 'dashboard', label: 'Início', path: '/finance/dashboard.html', icon: 'home' },
      { key: 'tasks', label: 'Tarefas', path: '/finance/tasks.html', icon: 'tasks' },
      { key: 'approvals', label: 'Aprovações', path: '/finance/approvals.html', icon: 'checkCircle' },
      { key: 'notifications', label: 'Notificações', path: '/finance/notifications.html', icon: 'bell', mobileOnly: true }
    ]
  },
  {
    key: 'sourcing', label: 'Contratações', hint: 'Solicitações, propostas, decisão e implantação',
    items: [
      { key: 'rfqs', label: 'Solicitações', path: '/finance/rfqs.html', icon: 'file', views: ['rfqs', 'rfq', 'newRfq'] },
      { key: 'proposals', label: 'Propostas', path: '/finance/proposals.html', icon: 'inbox' },
      { key: 'extractions', label: 'Documentos e fatos', path: '/finance/extractions.html', icon: 'file', sandboxExcluded: true },
      { key: 'implementations', label: 'Implantação', path: '/finance/implementations.html', icon: 'tasks', sandboxExcluded: true }
    ]
  },
  {
    key: 'portfolio', label: 'Portfólio financeiro', hint: 'Contratos, dívida, limites, tarifas e obrigações',
    items: [
      { key: 'contracts', label: 'Contratos', short: 'Contratos', hint: 'Contratos e renovações', path: '/finance/contracts.html', icon: 'briefcase' },
      { key: 'portfolio', label: 'Dívida e limites', path: '/finance/portfolio.html', icon: 'layers' },
      { key: 'covenants', label: 'Covenants', path: '/finance/covenants.html', icon: 'calendar', sandboxExcluded: true },
      { key: 'fees', label: 'Tarifas bancárias', path: '/finance/fees.html', icon: 'scale' },
      { key: 'spend', label: 'Spend', path: '/finance/spend.html', icon: 'layers', sandboxExcluded: true },
      { key: 'value', label: 'Valor e savings', path: '/finance/value.html', icon: 'layers' },
      { key: 'opportunities', label: 'Oportunidades', path: '/finance/opportunities.html', icon: 'flag' }
    ]
  },
  {
    key: 'relationships', label: 'Relacionamentos', hint: 'Instituições, qualificação e performance',
    items: [
      { key: 'providers', label: 'Instituições', path: '/finance/providers.html', icon: 'building' },
      { key: 'qualifications', label: 'Qualificação', path: '/finance/qualifications.html', icon: 'checkCircle', sandboxExcluded: true },
      { key: 'performance', label: 'Performance', path: '/finance/performance.html', icon: 'scale', sandboxExcluded: true }
    ]
  },
  {
    key: 'governance', label: 'Governança', hint: 'Perfil da empresa, pessoas, políticas e integrações',
    items: [
      { key: 'passport', label: 'Perfil financeiro', path: '/finance/passport.html', icon: 'shield' },
      { key: 'settings', label: 'Configurações', path: '/finance/settings.html', icon: 'settings' }
    ]
  }
]);

export const PROVIDER_AREAS = Object.freeze([
  {
    key: 'provider', label: 'Portal da instituição', hint: 'Convites e propostas da sua instituição',
    items: [
      { key: 'providerHome', label: 'Início', path: '/provider/index.html', icon: 'home' },
      { key: 'providerRfqs', label: 'Oportunidades', path: '/provider/rfqs.html', icon: 'inbox', views: ['providerRfqs', 'providerProposal'] },
      { key: 'providerInvite', label: 'Código de convite', path: '/provider/invite.html', icon: 'send' }
    ]
  }
]);

/** Áreas visíveis para o público e o modo (o sandbox /demo não espelha páginas excluídas). */
export function areasFor(audience, mode = 'real') {
  const areas = audience === 'provider' ? PROVIDER_AREAS : COMPANY_AREAS;
  return areas
    .map((area) => ({ ...area, items: area.items.filter((item) => !(mode === 'demo' && item.sandboxExcluded)) }))
    .filter((area) => area.items.length);
}

/** Lista plana na ordem do menu (busca, folha "Mais", contagens). */
export function navItems(audience, mode = 'real') {
  return areasFor(audience, mode).flatMap((area) => area.items.map((item) => ({ ...item, area: area.key, areaLabel: area.label })));
}

/** Área e item ativos para uma view (inclusive views internas como `rfq`). */
export function locate(audience, view, mode = 'real') {
  const target = view === 'home' ? (audience === 'provider' ? 'providerHome' : 'dashboard') : view;
  return navItems(audience, mode).find((item) => item.key === target || item.views?.includes(target)) || null;
}
