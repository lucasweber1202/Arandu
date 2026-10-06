// Catálogo da Public API v1 sem dependência de Node: usado pela interface e
// pelo servidor (lib/finance/public-api.mjs). Mesmas listas do banco
// (fin_api_scope_catalog, fin_webhook_event_catalog).
export const API_VERSION = 'v1';
export const API_SCOPES = Object.freeze(['rfqs:read', 'rfqs:write', 'contracts:read', 'providers:read', 'portfolio:read', 'approvals:read', 'webhooks:manage']);
export const SCOPE_LABELS = Object.freeze({
  'rfqs:read': 'Ler solicitações', 'rfqs:write': 'Criar rascunhos de solicitação', 'contracts:read': 'Ler contratos',
  'providers:read': 'Ler diretório de provedores', 'portfolio:read': 'Ler facilities (portfólio)', 'approvals:read': 'Ler status de aprovações',
  'webhooks:manage': 'Gerenciar webhooks'
});
export const WEBHOOK_EVENTS = Object.freeze(['rfq.created', 'rfq.status_changed', 'proposal.submitted', 'decision.recorded', 'approval.required', 'approval.completed',
  'contract.created', 'contract.renewal_due']);
