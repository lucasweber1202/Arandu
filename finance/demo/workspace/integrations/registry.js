// Arquitetura de conectores da demonstração.
//
// Cada conector é um adaptador com a mesma interface:
//   connect(ctx, options) · disconnect(ctx) · status() · sync(ctx) · lastSync() · events
// Na demonstração, TODOS são simulados: não há SDK, credencial, OAuth nem
// chamada de rede. "Conectar" grava o estado neste navegador e emite o evento
// no barramento; "Sincronizar" produz dados fictícios determinísticos. A
// interface é a que um conector real implementaria no servidor — é isso que a
// demo mostra, não uma integração.

import { readOS, updateOS } from '../platform/os-store.js';
import { emit } from '../platform/bus.js';

export const CATEGORIES = Object.freeze([
  ['communication', 'Comunicação', 'comunicacao', 'Avisos de aprovação, prazo e proposta onde a equipe já conversa. Decisões continuam no Arandu.'],
  ['erp', 'ERP / Financeiro', 'erp', 'Fornecedores e centros de custo entram; contratos saem prontos para registro.'],
  ['identity', 'Identidade', 'identidade', 'SSO, provisionamento (SCIM) e mapeamento de grupos para papéis.'],
  ['files', 'Arquivos', 'arquivos', 'Anexar documentos das pastas da empresa às solicitações.'],
  ['open_finance', 'Open Finance', 'open-finance', 'Contas, saldos, transações e empréstimos com consentimento, para o perfil financeiro.'],
  ['analytics', 'Analytics', 'analytics', 'Eventos de uso do produto para a equipe de produto.']
]);

// scopes: o que o conector leria/escreveria — mostrado no consentimento.
export const CONNECTORS = Object.freeze([
  { id: 'slack', name: 'Slack', category: 'communication', account: 'acme-demo.slack.invalid · #financeiro', scopes: ['Enviar avisos para um canal escolhido', 'Enviar mensagem direta a quem precisa agir'], events: ['approval.requested', 'proposal.submitted', 'rfq.deadline'] },
  { id: 'teams', name: 'Microsoft Teams', category: 'communication', account: 'Acme DEMO · Finanças', scopes: ['Publicar cartões num canal', 'Mensagem direta a quem precisa agir'], events: ['approval.requested', 'proposal.submitted', 'rfq.deadline'] },
  { id: 'omie', name: 'Omie', category: 'erp', account: 'Acme Indústria (DEMO)', scopes: ['Ler fornecedores', 'Ler centros de custo', 'Preparar lançamentos de contrato (sem enviar)'], events: ['erp.imported', 'contract.created'] },
  { id: 'totvs', name: 'TOTVS', category: 'erp', account: 'Protheus DEMO', scopes: ['Ler fornecedores', 'Ler centros de custo', 'Preparar lançamentos de contrato (sem enviar)'], events: ['erp.imported', 'contract.created'] },
  { id: 'sap', name: 'SAP', category: 'erp', account: 'S/4HANA DEMO', scopes: ['Ler fornecedores (Business Partner)', 'Ler centros de custo', 'Preparar lançamentos (sem enviar)'], events: ['erp.imported', 'contract.created'] },
  { id: 'netsuite', name: 'NetSuite', category: 'erp', account: 'Acme DEMO (sandbox)', scopes: ['Ler fornecedores', 'Ler departamentos', 'Preparar lançamentos (sem enviar)'], events: ['erp.imported', 'contract.created'] },
  { id: 'dynamics', name: 'Dynamics 365', category: 'erp', account: 'Finance & Operations DEMO', scopes: ['Ler fornecedores', 'Ler centros de custo', 'Preparar lançamentos (sem enviar)'], events: ['erp.imported', 'contract.created'] },
  { id: 'workos', name: 'WorkOS', category: 'identity', account: 'SSO + Directory Sync (DEMO)', scopes: ['Login único (SAML/OIDC)', 'Provisionar pessoas e grupos (SCIM)'], events: ['directory.imported', 'member.provisioned'] },
  { id: 'gdrive', name: 'Google Drive', category: 'files', account: 'Drive compartilhado Finanças (DEMO)', scopes: ['Escolher arquivos para anexar (somente os escolhidos)'], events: ['document.attached'] },
  { id: 'onedrive', name: 'OneDrive', category: 'files', account: 'SharePoint Finanças (DEMO)', scopes: ['Escolher arquivos para anexar (somente os escolhidos)'], events: ['document.attached'] },
  { id: 'pluggy', name: 'Pluggy', category: 'open_finance', account: 'Consentimento Open Finance (DEMO)', scopes: ['Contas', 'Saldos', 'Transações', 'Empréstimos'], events: ['financial_profile.updated'] },
  { id: 'belvo', name: 'Belvo', category: 'open_finance', account: 'Consentimento Open Finance (DEMO)', scopes: ['Contas', 'Saldos', 'Transações', 'Empréstimos'], events: ['financial_profile.updated'] },
  { id: 'posthog', name: 'PostHog', category: 'analytics', account: 'Projeto Arandu DEMO', scopes: ['Receber eventos de uso (sem dado financeiro nem pessoal)'], events: ['analytics.batch'] }
]);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const actorOf = (ctx) => ({ id: ctx?.viewer?.id || null, name: ctx?.viewer?.name || null });

export function createAdapter(def) {
  const read = () => readOS().integrations[def.id] || null;
  return Object.freeze({
    ...def,
    status: () => read()?.status || 'disconnected',
    lastSync: () => read()?.last_sync || null,
    record: read,
    async connect(ctx, options = {}) {
      await wait(options.latency ?? 350);
      const now = new Date().toISOString();
      updateOS((draft) => { draft.integrations[def.id] = { status: 'connected', connected_at: now, last_sync: now, connected_by: ctx?.viewer?.name || null, options, simulated: true }; });
      emit('integration.connected', { object: { type: 'integration', id: def.id, title: def.name }, actor: actorOf(ctx), detail: { category: def.category, options } });
      return read();
    },
    async disconnect(ctx) {
      updateOS((draft) => { delete draft.integrations[def.id]; });
      emit('integration.disconnected', { object: { type: 'integration', id: def.id, title: def.name }, actor: actorOf(ctx) });
    },
    async sync(ctx) {
      if (read()?.status !== 'connected') throw new Error(`${def.name} não está conectado.`);
      await wait(250);
      const now = new Date().toISOString();
      updateOS((draft) => { draft.integrations[def.id].last_sync = now; });
      emit('integration.synced', { object: { type: 'integration', id: def.id, title: def.name }, actor: actorOf(ctx), origin: def.id === 'teams' ? 'teams' : ORIGIN_OF[def.category] || 'automation', detail: { at: now } });
      return read();
    }
  });
}
const ORIGIN_OF = { communication: 'slack', erp: 'erp', open_finance: 'open_finance', identity: 'directory' };

export const ADAPTERS = Object.freeze(Object.fromEntries(CONNECTORS.map((def) => [def.id, createAdapter(def)])));
export const connected = (category = null) => Object.values(ADAPTERS).filter((adapter) => adapter.status() === 'connected' && (!category || adapter.category === category));
