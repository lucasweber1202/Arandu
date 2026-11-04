// Coordenador das telas da empresa: aprovações, propostas, contratos,
// instituições, tarefas, notificações e configurações.
//
// Cada capability vive no seu módulo em ./company/ e é importada só quando a
// rota é aberta: abrir Tarefas não baixa contratos, configurações ou a caixa de
// aprovações (antes, um único chunk de ~52 KB servia as sete rotas).
export const COMPANY_VIEWS = Object.freeze({
  approvals: [() => import('./company/approvals.js'), 'approvalsInbox'],
  proposals: [() => import('./company/proposals.js'), 'proposalsList'],
  contracts: [() => import('./company/contracts.js'), 'contracts'],
  providers: [() => import('./company/providers.js'), 'providers'],
  tasks: [() => import('./company/tasks.js'), 'tasks'],
  notifications: [() => import('./company/notifications.js'), 'notifications'],
  settings: [() => import('./company/settings.js'), 'settings'],
});
