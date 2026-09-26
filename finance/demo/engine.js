// Motor da demonstração interativa.
//
// Implementa, dentro do navegador, o MESMO contrato de `/api/finance/*` que a
// interface usa com a sessão real. A interface não sabe se fala com o servidor
// ou com este motor: recebe um `transport` com `request(path, options)`.
//
// Fronteira de segurança:
//   * este módulo nunca chama `fetch`, `XMLHttpRequest`, `sendBeacon` nem
//     WebSocket — não há caminho de rede a partir daqui;
//   * todo dado é fictício e vive só em `localStorage` sob uma chave própria;
//   * a "persona" é simulação de produto: ela troca o usuário fictício que o
//     motor considera logado, e não toca em nenhuma credencial real.
//
// As regras (quem pode o quê, em que estado) espelham as funções SQL do
// produto real, para que a demonstração não ensine um fluxo que a produção
// recusaria.

import { PRODUCTS, normalizeDemand, normalizeProposal, normalize, demandFields, proposalFields } from '../../lib/finance/products.mjs';
import { canTransition, nextStates } from '../../lib/finance/workflow.mjs';
import { comparableFields, NEUTRAL_RANKING_NOTICE } from '../../lib/finance/comparison.mjs';
import { createSeed, DEMO_SEED_ID, PERSONAS } from './seed.js';

export const DEMO_STORAGE_KEY = 'arandu_demo_state_v1';
export const DEMO_SCHEMA = 1;
const DAY = 86400000;
const ARRAYS = ['users', 'organizations', 'members', 'providers', 'rfqs', 'rfq_revisions', 'invites', 'proposals', 'proposal_versions',
  'proposal_drafts', 'editor_drafts', 'approvals', 'policies', 'decisions', 'contracts', 'renewal_milestones', 'tasks', 'comments',
  'notifications', 'preferences', 'events', 'profile', 'terms', 'simulated_emails'];

export class DemoError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const fail = (status, message, code) => { throw new DemoError(status, message, code); };

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, hex);
}
const clean = (value) => String(value ?? '').trim();
const limited = (value, max) => clean(value).slice(0, max);

/** Memória simples para quando o navegador recusa `localStorage` (aba privada, política). */
function memoryStorage() {
  const map = new Map();
  return { getItem: (key) => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)), removeItem: (key) => map.delete(key) };
}

/**
 * Valida o estado lido do navegador. Qualquer coisa fora do formato esperado —
 * versão antiga, JSON corrompido, adulteração manual — volta ao conjunto
 * inicial. O motor nunca tenta "consertar" um estado desconhecido.
 */
export function validState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
  if (state.schema !== DEMO_SCHEMA || state.seed !== DEMO_SEED_ID) return false;
  if (!PERSONAS[state.persona]) return false;
  if (!state.data || typeof state.data !== 'object') return false;
  return ARRAYS.every((key) => Array.isArray(state.data[key]));
}

export function createDemoEngine({ storage, now = () => new Date(), latency = 0 } = {}) {
  let store = storage;
  let persistent = true;
  try {
    store = store || globalThis.localStorage;
    const probe = '__arandu_demo_probe__';
    store.setItem(probe, '1');
    store.removeItem(probe);
  } catch {
    store = memoryStorage();
    persistent = false;
  }
  let recovered = false;

  function fresh(persona = 'buyer') {
    return { schema: DEMO_SCHEMA, seed: DEMO_SEED_ID, created_at: now().toISOString(), persona, simulate: { fail_next: false }, data: createSeed(now()) };
  }
  function load() {
    let parsed = null;
    try { parsed = JSON.parse(store.getItem(DEMO_STORAGE_KEY) || 'null'); } catch { parsed = null; }
    if (validState(parsed)) return parsed;
    if (parsed !== null) recovered = true;
    const state = fresh();
    save(state);
    return state;
  }
  function save(state) {
    try { store.setItem(DEMO_STORAGE_KEY, JSON.stringify(state)); } catch { persistent = false; }
  }

  // ------------------------------------------------------------ utilitários
  const today = () => now().toISOString().slice(0, 10);
  const nowIso = () => now().toISOString();

  function context(state) {
    const persona = PERSONAS[state.persona];
    const user = state.data.users.find((row) => row.id === persona.user);
    return { persona, user, userId: persona.user };
  }
  function memberships(state, userId) { return state.data.members.filter((row) => row.user_id === userId); }
  function org(state, id) { return state.data.organizations.find((row) => row.id === id); }
  function userName(state, id) { return state.data.users.find((row) => row.id === id)?.name || 'Membro'; }

  function memberOrganization(state, userId, organizationId, kinds = null) {
    const id = clean(organizationId);
    if (!id) fail(400, 'Informe a organização.', 'invalid_organization_id');
    const organization = org(state, id);
    const member = state.data.members.find((row) => row.organization_id === id && row.user_id === userId);
    if (!organization || !member) fail(403, 'Acesso negado para esta organização.', 'forbidden');
    if (kinds && !kinds.includes(organization.kind)) fail(403, 'Acesso negado para esta organização.', 'forbidden');
    return { organization, member };
  }
  function hasRole(state, userId, organizationId, roles = null) {
    const member = state.data.members.find((row) => row.organization_id === organizationId && row.user_id === userId);
    return Boolean(member && (!roles || roles.includes(member.role)));
  }
  function requireRole(state, userId, organizationId, roles) {
    if (!hasRole(state, userId, organizationId, roles)) fail(403, 'Sua conta não tem permissão para esta operação nesta organização.', 'forbidden');
  }
  function rfqById(state, id) { return state.data.rfqs.find((row) => row.id === id); }
  /** RFQ visível para o usuário: membro do comprador ou provedor com convite aceito. */
  function loadRfq(state, userId, id) {
    const rfq = rfqById(state, clean(id));
    if (!rfq) fail(404, 'Solicitação não encontrada.', 'rfq_not_found');
    if (hasRole(state, userId, rfq.organization_id)) return rfq;
    if (providerCanSee(state, userId, rfq.id)) return rfq;
    fail(404, 'Solicitação não encontrada.', 'rfq_not_found');
  }
  function providerOrgsOf(state, userId) {
    return memberships(state, userId).map((row) => org(state, row.organization_id)).filter((row) => row?.kind === 'PROVIDER').map((row) => row.id);
  }
  function providerCanSee(state, userId, rfqId) {
    const orgs = providerOrgsOf(state, userId);
    return state.data.invites.some((row) => row.rfq_id === rfqId && row.status === 'accepted' && orgs.includes(row.provider_organization_id));
  }

  function event(state, organizationId, entityType, entityId, eventType, actorId, metadata = {}) {
    state.data.events.push({ id: uuid(), organization_id: organizationId, entity_type: entityType, entity_id: entityId,
      event_type: eventType, actor_id: actorId, happened_at: nowIso(), metadata });
  }
  function notify(state, { organizationId, userId, eventType, objectType, objectId, title, body }) {
    if (!userId) return;
    const pref = state.data.preferences.find((row) => row.organization_id === organizationId && row.user_id === userId && row.event_type === eventType);
    if (pref && pref.in_app === false) return;
    state.data.notifications.push({ id: uuid(), organization_id: organizationId, user_id: userId, event_type: eventType, object_type: objectType,
      object_id: objectId, title: limited(title, 120), body: limited(body, 240), created_at: nowIso(), read_at: null });
    // Registro do e-mail que o produto real enfileiraria, sem enviar nada.
    if (pref?.email) state.data.simulated_emails.push({ template: eventType, user_id: userId, created_at: nowIso(), sent: false });
  }

  function providerName(state, providerId) { return state.data.providers.find((row) => row.id === providerId)?.name || 'Provedor'; }
  function currentVersion(state, proposal) {
    return state.data.proposal_versions.find((row) => row.proposal_id === proposal.id && row.version === proposal.current_version) || null;
  }
  function proposalsWithTerms(state, rfqIds) {
    return state.data.proposals
      .filter((row) => rfqIds.includes(row.rfq_id) && row.current_version > 0 && row.status !== 'withdrawn')
      .map((proposal) => {
        const version = currentVersion(state, proposal);
        const providerRow = state.data.providers.find((row) => row.id === proposal.provider_id);
        return {
          id: proposal.id, rfq_id: proposal.rfq_id, provider_id: proposal.provider_id,
          provider_name: providerRow?.name || 'Provedor', provider_kind: providerRow?.kind || null,
          provider_verification: providerRow?.verification_state || 'NAO_VERIFICADO',
          status: proposal.status, version: proposal.current_version,
          versions_count: state.data.proposal_versions.filter((row) => row.proposal_id === proposal.id).length,
          submitted_at: version?.submitted_at || null, note: version?.note || null,
          rfq_revision: version?.rfq_revision ?? null, terms: clone(version?.terms || {})
        };
      });
  }
  function withRenewalWindow(contract) {
    const ends = Date.parse(`${contract.ends_on}T00:00:00Z`);
    if (!Number.isFinite(ends)) return { ...contract, review_from: null, days_to_end: null };
    const reviewFrom = new Date(ends - Number(contract.renewal_notice_days || 0) * DAY).toISOString().slice(0, 10);
    const days = Math.round((ends - Date.parse(`${today()}T00:00:00Z`)) / DAY);
    return { ...contract, review_from: reviewFrom, days_to_end: days };
  }
  function snapshotOf(rfq) {
    return { title: rfq.title, description: rfq.description, demand: clone(rfq.demand), response_deadline: rfq.response_deadline };
  }
  function rejectInvalid(result) {
    if (result.errors?.length) fail(400, result.errors.join(' '), 'invalid_payload');
    return result.values;
  }

  // ----------------------------------------------------------------- rotas
  const routes = {
    'GET organizations': (state, { userId }) => ({
      ok: true,
      rows: memberships(state, userId).map((row) => org(state, row.organization_id)).filter(Boolean)
        .map(({ id, legal_name, trade_name, kind, country, sector, revenue_band, created_at }) => ({ id, legal_name, trade_name, kind, country, sector, revenue_band, created_at }))
    }),
    'PATCH organizations': (state, { userId, body }) => {
      const { organization } = memberOrganization(state, userId, body.organization_id);
      requireRole(state, userId, organization.id, ['admin', 'finance_manager']);
      const band = clean(body.revenue_band);
      if (band && !['ate_360k', '360k_4_8m', '4_8m_30m', '30m_300m', 'acima_300m'].includes(band)) fail(400, 'Faixa de faturamento inválida.', 'invalid_revenue_band');
      if (clean(body.trade_name)) organization.trade_name = limited(body.trade_name, 200);
      if (clean(body.sector)) organization.sector = limited(body.sector, 120);
      if (band) organization.revenue_band = band;
      if (clean(body.tax_identifier)) {
        const digits = clean(body.tax_identifier).replace(/\D/g, '');
        if (digits.length !== 14) fail(400, 'O CNPJ informado não está em um formato aceito.', 'invalid_cnpj');
        organization.tax_identifier = digits;
      }
      return { ok: true, tax_identifier: clean(body.tax_identifier) ? { format_valid: true, externally_verified: false } : null };
    },
    'GET members': (state, { userId, query }) => {
      const { organization } = memberOrganization(state, userId, query.get('organization_id'), ['BUYER']);
      const rows = state.data.members.filter((row) => row.organization_id === organization.id).map((row) => {
        const user = state.data.users.find((item) => item.id === row.user_id);
        return { user_id: row.user_id, role: row.role, created_at: row.created_at, display_name: user?.name || null, title: user?.title || null };
      });
      return { ok: true, rows, viewer_id: userId };
    },

    'GET overview': (state, { userId, query }) => {
      const { organization } = memberOrganization(state, userId, query.get('organization_id'));
      const rfqs = state.data.rfqs.filter((row) => row.organization_id === organization.id)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      const proposals = proposalsWithTerms(state, rfqs.map((row) => row.id));
      const decorated = rfqs.map((rfq) => ({
        ...clone(rfq),
        proposals: proposals.filter((row) => row.rfq_id === rfq.id),
        invites_count: state.data.invites.filter((row) => row.rfq_id === rfq.id).length,
        invites: state.data.invites.filter((row) => row.rfq_id === rfq.id).map((row) => ({
          id: row.id, provider_id: row.provider_id, provider_name: providerName(state, row.provider_id), status: row.status,
          created_at: row.created_at, accepted_at: row.accepted_at,
          responded: state.data.proposals.some((item) => item.invite_id === row.id && item.current_version > 0)
        })),
        owner_name: userName(state, rfq.owner_id),
        pending_approval: state.data.approvals.some((row) => row.rfq_id === rfq.id && row.status === 'pending'),
        decision_id: state.data.decisions.find((row) => row.rfq_id === rfq.id)?.id || null,
        next_states: nextStates('rfq', rfq.status)
      }));
      const contracts = state.data.contracts.filter((row) => row.organization_id === organization.id)
        .sort((a, b) => String(a.ends_on).localeCompare(String(b.ends_on))).map((row) => withRenewalWindow(clone(row)));
      const full = clone(organization);
      return {
        ok: true,
        organization: full,
        rfqs: decorated,
        providers: clone(state.data.providers.filter((row) => row.organization_id === organization.id)).sort((a, b) => a.name.localeCompare(b.name)),
        contracts,
        profile: clone(state.data.profile.filter((row) => row.organization_id === organization.id)).sort((a, b) => a.field_key.localeCompare(b.field_key)),
        tasks: clone(state.data.tasks.filter((row) => row.organization_id === organization.id && row.status === 'open'))
          .sort((a, b) => String(a.due_on || '9999').localeCompare(String(b.due_on || '9999')))
          .map((row) => ({ ...row, assignee_name: row.assignee_id ? userName(state, row.assignee_id) : null })),
        terms: clone(state.data.terms.filter((row) => row.organization_id === organization.id)),
        milestones: clone(state.data.renewal_milestones)
      };
    },

    'GET assignments': (state, { userId, query }) => {
      const { organization } = memberOrganization(state, userId, query.get('organization_id'), ['PROVIDER']);
      const rows = state.data.proposals.filter((row) => row.provider_organization_id === organization.id)
        .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
        .map((proposal) => {
          const rfq = rfqById(state, proposal.rfq_id);
          const history = state.data.proposal_versions.filter((row) => row.proposal_id === proposal.id).sort((a, b) => b.version - a.version);
          const current = history.find((row) => row.version === proposal.current_version);
          const buyer = org(state, proposal.buyer_organization_id);
          return {
            proposal_id: proposal.id, rfq_id: proposal.rfq_id, product: proposal.product, status: proposal.status,
            version: proposal.current_version, title: rfq?.title || 'Solicitação', description: rfq?.description || null,
            buyer_name: buyer?.legal_name || null,
            rfq_status: rfq?.status || null, rfq_revision: rfq?.revision || 1,
            submitted_rfq_revision: current?.rfq_revision || null,
            response_deadline: rfq?.response_deadline || null, demand: clone(rfq?.demand || {}),
            terms: clone(current?.terms || {}),
            has_draft: state.data.proposal_drafts.some((row) => row.proposal_id === proposal.id && row.base_version === proposal.current_version),
            decided: state.data.decisions.some((row) => row.rfq_id === proposal.rfq_id),
            selected: state.data.decisions.some((row) => row.proposal_id === proposal.id),
            history: history.map(({ version, submitted_at, note, rfq_revision }) => ({ version, submitted_at, note, rfq_revision }))
          };
        });
      const pending = state.data.invites.filter((row) => row.status === 'invited' && state.data.providers.find((item) => item.id === row.provider_id)?.provider_organization_id === organization.id)
        .map((row) => {
          const rfq = rfqById(state, row.rfq_id);
          return { invite_id: row.id, rfq_id: row.rfq_id, title: rfq?.title, product: rfq?.product, response_deadline: rfq?.response_deadline,
            buyer_name: org(state, row.buyer_organization_id)?.legal_name, created_at: row.created_at, demo_token: row.token };
        });
      return { ok: true, rows, pending_invites: pending };
    },

    'GET rfq-revisions': (state, { userId, query }) => {
      memberOrganization(state, userId, query.get('organization_id'));
      const rfq = loadRfq(state, userId, query.get('rfq_id'));
      const rows = state.data.rfq_revisions.filter((row) => row.rfq_id === rfq.id).sort((a, b) => b.revision - a.revision)
        .map((row) => ({ revision: row.revision, snapshot: clone(row.snapshot), changed_by: row.changed_by, changed_by_name: userName(state, row.changed_by), published_at: row.published_at }));
      return { ok: true, rows };
    },

    'POST rfqs': (state, { userId, body }) => {
      const { organization } = memberOrganization(state, userId, body.organization_id, ['BUYER']);
      requireRole(state, userId, organization.id, ['admin', 'finance_manager']);
      const product = clean(body.product);
      if (!PRODUCTS[product]) fail(400, 'Produto financeiro inválido.', 'invalid_product');
      const title = limited(body.title, 200);
      if (title.length < 3) fail(400, 'Informe um título para a solicitação.', 'invalid_title');
      const normalized = normalizeDemand(product, body.demand);
      const demand = rejectInvalid(normalized);
      const rfq = { id: uuid(), organization_id: organization.id, owner_id: userId, product, title, description: limited(body.description, 4000) || null,
        status: 'draft', demand, response_deadline: clean(body.response_deadline) || null, revision: 1, created_at: nowIso(), updated_at: nowIso() };
      state.data.rfqs.push(rfq);
      state.data.rfq_revisions.push({ rfq_id: rfq.id, revision: 1, snapshot: snapshotOf(rfq), changed_by: userId, published_at: nowIso() });
      event(state, organization.id, 'rfq', rfq.id, 'rfq_created', userId);
      return { ok: true, id: rfq.id, warnings: normalized.warnings };
    },
    'PATCH rfqs': (state, { userId, body }) => {
      const rfq = loadRfq(state, userId, body.rfq_id);
      requireRole(state, userId, rfq.organization_id, ['admin', 'finance_manager']);
      if (!['draft', 'open', 'collecting'].includes(rfq.status)) fail(409, 'A operação não é permitida no estado atual desta solicitação.', 'invalid_state');
      const expected = Number(body.expected_revision);
      if (!Number.isSafeInteger(expected) || expected < 1) fail(400, 'Informe a revisão atual da RFQ.', 'invalid_revision');
      if (expected !== rfq.revision) fail(409, `A RFQ mudou em outra sessão (agora na revisão ${rfq.revision}). Recarregue a versão atual antes de publicar.`, 'rfq_revision_conflict');
      const normalized = normalizeDemand(rfq.product, body.demand);
      const demand = rejectInvalid(normalized);
      const title = limited(body.title, 200) || rfq.title;
      if (title.length < 3) fail(400, 'Informe um título para a solicitação.', 'invalid_title');
      const next = { title, description: limited(body.description, 4000) || null, demand, response_deadline: clean(body.response_deadline) || null };
      const material = JSON.stringify([rfq.title, rfq.description, rfq.demand, rfq.response_deadline]) !== JSON.stringify([next.title, next.description, next.demand, next.response_deadline]);
      Object.assign(rfq, next, { updated_at: nowIso() });
      if (material) {
        const previous = rfq.revision;
        rfq.revision += 1;
        state.data.rfq_revisions.push({ rfq_id: rfq.id, revision: rfq.revision, snapshot: snapshotOf(rfq), changed_by: userId, published_at: nowIso() });
        event(state, rfq.organization_id, 'rfq', rfq.id, 'rfq_revised', userId, { revision: rfq.revision, previous_revision: previous });
        for (const invite of state.data.invites.filter((row) => row.rfq_id === rfq.id && row.status === 'accepted')) {
          const providerUsers = state.data.members.filter((row) => row.organization_id === invite.provider_organization_id).map((row) => row.user_id);
          for (const providerUser of providerUsers) notify(state, { organizationId: invite.provider_organization_id, userId: providerUser, eventType: 'rfq_revised',
            objectType: 'rfq', objectId: rfq.id, title: 'Solicitação revisada', body: `${rfq.title} está na revisão ${rfq.revision}` });
        }
      }
      return { ok: true, revision: rfq.revision, warnings: normalized.warnings };
    },

    'GET rfq-editor': (state, { userId, query }) => {
      const { organization } = memberOrganization(state, userId, query.get('organization_id'), ['BUYER']);
      const draft = state.data.editor_drafts.find((row) => row.organization_id === organization.id && row.user_id === userId) || null;
      return { ok: true, draft: draft && { payload: clone(draft.payload), revision: draft.revision, updated_at: draft.updated_at } };
    },
    'PATCH rfq-editor': (state, { userId, body }) => {
      const { organization } = memberOrganization(state, userId, body.organization_id, ['BUYER']);
      requireRole(state, userId, organization.id, ['admin', 'finance_manager']);
      const product = clean(body.product);
      if (!PRODUCTS[product]) fail(400, 'Produto financeiro inválido.', 'invalid_product');
      const expected = Number(body.expected_revision);
      if (!Number.isSafeInteger(expected) || expected < 0) fail(400, 'Revisão inválida.', 'invalid_revision');
      const demand = rejectInvalid(normalize(demandFields(product).map((field) => ({ ...field, required: false })), body.demand));
      let draft = state.data.editor_drafts.find((row) => row.organization_id === organization.id && row.user_id === userId);
      if ((draft?.revision || 0) !== expected) fail(409, 'Esta solicitação foi alterada em outra aba. Recarregue o rascunho antes de salvar.', 'rfq_draft_conflict');
      const payload = { product, title: limited(body.title, 200), response_deadline: clean(body.response_deadline) || null, description: limited(body.description, 4000) || null, demand };
      if (!draft) { draft = { organization_id: organization.id, user_id: userId, revision: 0 }; state.data.editor_drafts.push(draft); }
      draft.payload = payload;
      draft.revision += 1;
      draft.updated_at = nowIso();
      return { ok: true, revision: draft.revision, updated_at: draft.updated_at };
    },
    'DELETE rfq-editor': (state, { userId, body }) => {
      const { organization } = memberOrganization(state, userId, body.organization_id, ['BUYER']);
      const index = state.data.editor_drafts.findIndex((row) => row.organization_id === organization.id && row.user_id === userId);
      if (index >= 0) {
        if (state.data.editor_drafts[index].revision !== Number(body.expected_revision)) fail(409, 'Esta solicitação foi alterada em outra aba. Recarregue o rascunho antes de salvar.', 'rfq_draft_conflict');
        state.data.editor_drafts.splice(index, 1);
      }
      return { ok: true };
    },

    'POST transition': (state, { userId, body }) => {
      const kind = clean(body.kind);
      if (!['rfq', 'contract'].includes(kind)) fail(400, 'Transição inválida.', 'invalid_transition');
      const status = clean(body.status);
      const row = kind === 'rfq' ? loadRfq(state, userId, body.id) : state.data.contracts.find((item) => item.id === clean(body.id));
      if (!row) fail(404, 'Registro não encontrado.', 'not_found');
      requireRole(state, userId, row.organization_id, ['admin', 'finance_manager']);
      const from = clean(body.from) || row.status;
      if (from !== row.status || !canTransition(kind, row.status, status)) fail(409, 'Esta mudança de estado não é permitida a partir do estado atual.', 'invalid_transition');
      row.status = status;
      row.updated_at = nowIso();
      event(state, row.organization_id, kind, row.id, `${kind}_${status}`, userId);
      return { ok: true };
    },

    'GET invites': (state, { userId, query }) => {
      const { organization } = memberOrganization(state, userId, query.get('organization_id'));
      const rows = state.data.invites.filter((row) => row.buyer_organization_id === organization.id || row.provider_organization_id === organization.id)
        .map(({ id, rfq_id, provider_id, provider_organization_id, status, expires_at, accepted_at }) => ({ id, rfq_id, provider_id, provider_organization_id, status, expires_at, accepted_at }));
      return { ok: true, rows };
    },
    'POST invites/send': (state, { userId, body }) => {
      const rfq = loadRfq(state, userId, body.rfq_id);
      requireRole(state, userId, rfq.organization_id, ['admin', 'finance_manager']);
      if (!['draft', 'open', 'collecting'].includes(rfq.status)) fail(409, 'A operação não é permitida no estado atual desta solicitação.', 'invalid_state');
      const providerRow = state.data.providers.find((row) => row.id === clean(body.provider_id) && row.organization_id === rfq.organization_id && row.status === 'active');
      if (!providerRow) fail(404, 'Provedor não encontrado nesta organização.', 'provider_not_found');
      if (state.data.invites.some((row) => row.rfq_id === rfq.id && row.provider_id === providerRow.id && ['invited', 'accepted'].includes(row.status))) {
        fail(409, 'Este provedor já foi convidado para esta solicitação.', 'already_invited');
      }
      const token = Array.from({ length: 4 }, () => uuid().replace(/-/g, '')).join('').slice(0, 64);
      const invite = { id: uuid(), rfq_id: rfq.id, buyer_organization_id: rfq.organization_id, provider_id: providerRow.id, provider_organization_id: null,
        status: 'invited', token, created_at: nowIso(), accepted_at: null, expires_at: new Date(now().getTime() + 30 * DAY).toISOString() };
      state.data.invites.push(invite);
      event(state, rfq.organization_id, 'rfq', rfq.id, 'provider_invited', userId, { provider: providerRow.name });
      if (providerRow.provider_organization_id) {
        const buyer = org(state, rfq.organization_id);
        for (const member of state.data.members.filter((row) => row.organization_id === providerRow.provider_organization_id)) {
          notify(state, { organizationId: providerRow.provider_organization_id, userId: member.user_id, eventType: 'invite_received', objectType: 'invite',
            objectId: invite.id, title: 'Novo convite para cotar', body: `${buyer?.legal_name || 'Empresa'} · ${rfq.title}` });
        }
      }
      state.data.simulated_emails.push({ template: 'provider_invite', provider: providerRow.name, created_at: nowIso(), sent: false });
      return { ok: true, invitationToken: token, simulated_delivery: true };
    },
    'POST invites/accept': (state, { userId, body }) => {
      const token = clean(body.token);
      if (!/^[0-9a-f]{64}$/.test(token)) fail(400, 'Convite inválido.', 'invalid_token');
      const { organization } = memberOrganization(state, userId, body.provider_organization_id, ['PROVIDER']);
      requireRole(state, userId, organization.id, ['admin', 'provider_user']);
      const invite = state.data.invites.find((row) => row.token === token && row.status === 'invited' && Date.parse(row.expires_at) > now().getTime());
      const registry = invite && state.data.providers.find((row) => row.id === invite.provider_id);
      // O convite é endereçado a uma instituição: outra organização não o consome.
      if (!invite || (registry?.provider_organization_id && registry.provider_organization_id !== organization.id)) {
        fail(409, 'Este convite não é válido: ele pode ter expirado, já ter sido usado ou ter sido revogado.', 'invite_invalid');
      }
      invite.status = 'accepted';
      invite.accepted_at = nowIso();
      invite.provider_organization_id = organization.id;
      const rfq = rfqById(state, invite.rfq_id);
      if (!state.data.proposals.some((row) => row.invite_id === invite.id)) {
        state.data.proposals.push({ id: uuid(), invite_id: invite.id, rfq_id: invite.rfq_id, buyer_organization_id: invite.buyer_organization_id,
          provider_id: invite.provider_id, provider_organization_id: organization.id, product: rfq.product, status: 'draft', current_version: 0,
          created_at: nowIso(), updated_at: nowIso() });
      }
      event(state, invite.buyer_organization_id, 'rfq', invite.rfq_id, 'invite_accepted', userId, { provider: providerName(state, invite.provider_id) });
      return { ok: true, inviteId: invite.id, proposal_id: state.data.proposals.find((row) => row.invite_id === invite.id).id };
    },

    'POST proposals': (state, { userId, body }) => {
      const proposal = state.data.proposals.find((row) => row.id === clean(body.proposal_id));
      if (!proposal) fail(404, 'Proposta não encontrada.', 'proposal_not_found');
      requireRole(state, userId, proposal.provider_organization_id, ['admin', 'provider_user']);
      if (proposal.status === 'withdrawn') fail(409, 'A operação não é permitida no estado atual desta solicitação.', 'invalid_state');
      const terms = rejectInvalid(normalizeProposal(proposal.product, body.terms));
      const rfq = rfqById(state, proposal.rfq_id);
      if (!['open', 'collecting'].includes(rfq.status)) fail(409, 'Esta solicitação não está mais recebendo propostas.', 'rfq_closed');
      const current = currentVersion(state, proposal);
      if (current && JSON.stringify(current.terms) === JSON.stringify(terms) && current.rfq_revision === rfq.revision) {
        return { ok: true, version: proposal.current_version, replay: true };
      }
      const version = proposal.current_version + 1;
      state.data.proposal_versions.push({ proposal_id: proposal.id, version, terms, note: limited(body.note, 1000) || null,
        submitted_by: userId, submitted_at: nowIso(), rfq_revision: rfq.revision });
      proposal.current_version = version;
      proposal.status = version === 1 ? 'submitted' : 'revised';
      proposal.updated_at = nowIso();
      state.data.proposal_drafts = state.data.proposal_drafts.filter((row) => row.proposal_id !== proposal.id);
      if (rfq.status === 'open') rfq.status = 'collecting';
      const name = providerName(state, proposal.provider_id);
      event(state, proposal.buyer_organization_id, 'rfq', rfq.id, version === 1 ? 'proposal_submitted' : 'proposal_revised', userId,
        { provider: name, version, rfq_revision: rfq.revision });
      notify(state, { organizationId: rfq.organization_id, userId: rfq.owner_id, eventType: version === 1 ? 'proposal_received' : 'proposal_revised',
        objectType: 'rfq', objectId: rfq.id, title: version === 1 ? 'Nova proposta recebida' : 'Proposta revisada',
        body: `${name} · ${rfq.title} · revisão ${rfq.revision}` });
      return { ok: true, version };
    },
    'DELETE proposals': (state, { userId, body }) => {
      const proposal = state.data.proposals.find((row) => row.id === clean(body.proposal_id));
      if (!proposal) fail(404, 'Proposta não encontrada.', 'proposal_not_found');
      requireRole(state, userId, proposal.provider_organization_id, ['admin', 'provider_user']);
      if (state.data.decisions.some((row) => row.proposal_id === proposal.id)) fail(409, 'Esta proposta não pode ser retirada porque já foi escolhida em uma decisão.', 'proposal_decided');
      proposal.status = 'withdrawn';
      proposal.updated_at = nowIso();
      return { ok: true };
    },
    'GET proposal-draft': (state, { userId, query }) => {
      const proposal = state.data.proposals.find((row) => row.id === clean(query.get('proposal_id')));
      if (!proposal) fail(404, 'Proposta não encontrada.', 'proposal_not_found');
      memberOrganization(state, userId, proposal.provider_organization_id, ['PROVIDER']);
      const draft = state.data.proposal_drafts.find((row) => row.proposal_id === proposal.id);
      return { ok: true, draft: draft?.base_version === proposal.current_version ? clone(draft) : null };
    },
    'PATCH proposal-draft': (state, { userId, body }) => {
      const proposal = state.data.proposals.find((row) => row.id === clean(body.proposal_id));
      if (!proposal) fail(404, 'Proposta não encontrada.', 'proposal_not_found');
      requireRole(state, userId, proposal.provider_organization_id, ['admin', 'provider_user']);
      const terms = rejectInvalid(normalize(proposalFields(proposal.product).map((field) => ({ ...field, required: false })), body.terms));
      const expected = Number(body.expected_revision);
      const base = Number(body.base_version);
      let draft = state.data.proposal_drafts.find((row) => row.proposal_id === proposal.id);
      if (base !== proposal.current_version) fail(409, 'Este rascunho mudou em outra aba ou a proposta foi enviada. Atualize a página antes de continuar.', 'draft_conflict');
      const currentRevision = draft && draft.base_version === proposal.current_version ? draft.revision : 0;
      if (currentRevision !== expected) fail(409, 'Este rascunho mudou em outra aba ou a proposta foi enviada. Atualize a página antes de continuar.', 'draft_conflict');
      if (!draft) { draft = { proposal_id: proposal.id }; state.data.proposal_drafts.push(draft); }
      Object.assign(draft, { base_version: base, revision: currentRevision + 1, terms, updated_at: nowIso() });
      return { ok: true, revision: draft.revision, updated_at: draft.updated_at };
    },

    'GET approvals': (state, { userId, query }) => {
      const { organization } = memberOrganization(state, userId, query.get('organization_id'), ['BUYER']);
      const rfqId = clean(query.get('rfq_id'));
      const rows = state.data.approvals.filter((row) => row.organization_id === organization.id && (!rfqId || row.rfq_id === rfqId))
        .sort((a, b) => String(b.requested_at).localeCompare(String(a.requested_at)))
        .map((row) => ({ ...clone(row), stale: approvalStale(state, row) }));
      return { ok: true, rows };
    },
    'POST approvals/request': (state, { userId, body }) => {
      const rfq = loadRfq(state, userId, body.rfq_id);
      requireRole(state, userId, rfq.organization_id, ['admin', 'finance_manager']);
      if (!['collecting', 'comparing'].includes(rfq.status)) fail(409, 'A operação não é permitida no estado atual desta solicitação.', 'invalid_state');
      if (state.data.approvals.some((row) => row.rfq_id === rfq.id && row.status === 'pending')) fail(409, 'Já há uma aprovação em andamento para esta RFQ.', 'approval_pending');
      const proposal = state.data.proposals.find((row) => row.id === clean(body.proposal_id) && row.rfq_id === rfq.id && ['submitted', 'revised'].includes(row.status));
      if (!proposal) fail(409, 'Esta proposta não pode ser escolhida: ela precisa estar enviada e pertencer a esta solicitação.', 'proposal_not_eligible');
      const approvers = Array.isArray(body.approver_ids) ? body.approver_ids.map(clean) : [];
      if (approvers.length < 1 || approvers.length > 5) fail(400, 'Escolha de um a cinco aprovadores.', 'invalid_approvers');
      if (new Set(approvers).size !== approvers.length || approvers.some((id) => id === userId || !hasRole(state, id, rfq.organization_id, ['admin', 'finance_manager', 'viewer']))) {
        fail(400, 'Escolha membros distintos desta organização, diferentes do solicitante.', 'invalid_approver');
      }
      const rationale = limited(body.rationale, 4000);
      if (!rationale) fail(400, 'Explique o contexto para quem vai aprovar.', 'invalid_rationale');
      const request = { id: uuid(), organization_id: rfq.organization_id, rfq_id: rfq.id, proposal_id: proposal.id, proposal_version: proposal.current_version,
        rfq_revision: rfq.revision, requested_by: userId, requested_at: nowIso(), status: 'pending', resolved_at: null, rationale,
        steps: approvers.map((id, index) => ({ id: uuid(), position: index + 1, approver_id: id, status: 'pending', comment: null, acted_at: null })) };
      state.data.approvals.push(request);
      event(state, rfq.organization_id, 'rfq', rfq.id, 'approval_requested', userId, { proposal: providerName(state, proposal.provider_id) });
      notify(state, { organizationId: rfq.organization_id, userId: approvers[0], eventType: 'approval_requested', objectType: 'rfq', objectId: rfq.id,
        title: 'Aprovação aguardando você', body: `${rfq.title} · etapa 1 de ${approvers.length}` });
      return { ok: true, id: request.id };
    },
    'POST approvals/act': (state, { userId, body }) => {
      const request = state.data.approvals.find((row) => row.id === clean(body.request_id));
      if (!request || !hasRole(state, userId, request.organization_id)) fail(404, 'Aprovação não encontrada.', 'approval_not_found');
      if (request.status !== 'pending') fail(409, 'Esta aprovação já foi concluída.', 'approval_closed');
      const action = clean(body.action);
      if (!['approved', 'rejected', 'changes_requested'].includes(action)) fail(400, 'Ação de aprovação inválida.', 'invalid_action');
      const comment = limited(body.comment, 2000);
      if (action !== 'approved' && comment.length < 3) fail(400, 'Informe um motivo ao rejeitar ou solicitar alterações.', 'comment_required');
      if (approvalStale(state, request)) fail(409, 'A aprovação está pendente ou ficou desatualizada após uma alteração. Solicite uma nova aprovação.', 'approval_stale');
      const step = request.steps.filter((row) => row.status === 'pending').sort((a, b) => a.position - b.position)[0];
      if (!step || step.approver_id !== userId || request.requested_by === userId) fail(403, 'Sua conta não tem permissão para esta operação nesta organização.', 'forbidden');
      Object.assign(step, { status: action, comment: comment || null, acted_at: nowIso() });
      const rfq = rfqById(state, request.rfq_id);
      const remaining = request.steps.filter((row) => row.status === 'pending').sort((a, b) => a.position - b.position);
      const status = action === 'approved' && remaining.length ? 'pending' : action;
      event(state, request.organization_id, 'rfq', request.rfq_id, action === 'approved' && remaining.length ? 'approval_step_approved' : `approval_${action}`, userId, { position: step.position });
      if (status === 'pending') {
        notify(state, { organizationId: request.organization_id, userId: remaining[0].approver_id, eventType: 'approval_requested', objectType: 'rfq', objectId: rfq.id,
          title: 'Aprovação aguardando você', body: `${rfq.title} · etapa ${remaining[0].position} de ${request.steps.length}` });
      } else {
        request.status = status;
        request.resolved_at = nowIso();
        const titles = { approved: 'Aprovação concluída', rejected: 'Aprovação rejeitada', changes_requested: 'Alterações solicitadas' };
        notify(state, { organizationId: request.organization_id, userId: request.requested_by, eventType: `approval_${status}`, objectType: 'rfq', objectId: rfq.id,
          title: titles[status], body: `${rfq.title}${comment ? ` · ${comment}` : ''}` });
      }
      return { ok: true, status };
    },
    'POST approvals/cancel': (state, { userId, body }) => {
      const request = state.data.approvals.find((row) => row.id === clean(body.request_id));
      if (!request || !hasRole(state, userId, request.organization_id)) fail(404, 'Aprovação não encontrada.', 'approval_not_found');
      if (request.status !== 'pending') fail(409, 'Esta aprovação já foi concluída.', 'approval_closed');
      if (request.requested_by !== userId) fail(403, 'Sua conta não tem permissão para esta operação nesta organização.', 'forbidden');
      request.status = 'cancelled';
      request.resolved_at = nowIso();
      event(state, request.organization_id, 'rfq', request.rfq_id, 'approval_cancelled', userId);
      return { ok: true };
    },
    'GET approval-policy': (state, { userId, query }) => {
      const { organization } = memberOrganization(state, userId, query.get('organization_id'), ['BUYER']);
      const policy = state.data.policies.find((row) => row.organization_id === organization.id);
      return { ok: true, required_for_decision: policy?.required_for_decision ?? false, updated_at: policy?.updated_at ?? null };
    },
    'POST approval-policy': (state, { userId, body }) => {
      const { organization } = memberOrganization(state, userId, body.organization_id, ['BUYER']);
      requireRole(state, userId, organization.id, ['admin']);
      if (typeof body.required_for_decision !== 'boolean') fail(400, 'Política inválida.', 'invalid_policy');
      let policy = state.data.policies.find((row) => row.organization_id === organization.id);
      if (!policy) { policy = { organization_id: organization.id }; state.data.policies.push(policy); }
      Object.assign(policy, { required_for_decision: body.required_for_decision, updated_at: nowIso(), updated_by: userId });
      event(state, organization.id, 'organization', organization.id, 'approval_policy_updated', userId, { required: body.required_for_decision });
      return { ok: true };
    },

    'GET decisions': (state, { userId, query }) => {
      const { organization } = memberOrganization(state, userId, query.get('organization_id'));
      return { ok: true, rows: clone(state.data.decisions.filter((row) => row.organization_id === organization.id)) };
    },
    'POST decisions': (state, { userId, body }) => {
      const rfq = loadRfq(state, userId, body.rfq_id);
      requireRole(state, userId, rfq.organization_id, ['admin', 'finance_manager']);
      if (!['collecting', 'comparing'].includes(rfq.status)) fail(409, 'A operação não é permitida no estado atual desta solicitação.', 'invalid_state');
      if (state.data.decisions.some((row) => row.rfq_id === rfq.id)) fail(409, 'Esta solicitação já tem uma decisão registrada.', 'decision_exists');
      const proposal = state.data.proposals.find((row) => row.id === clean(body.proposal_id) && row.rfq_id === rfq.id && ['submitted', 'revised'].includes(row.status));
      if (!proposal) fail(409, 'Esta proposta não pode ser escolhida: ela precisa estar enviada e pertencer a esta solicitação.', 'proposal_not_eligible');
      const policy = state.data.policies.find((row) => row.organization_id === rfq.organization_id);
      const latest = state.data.approvals.filter((row) => row.rfq_id === rfq.id && row.status !== 'cancelled')
        .sort((a, b) => String(b.requested_at).localeCompare(String(a.requested_at)))[0];
      const approvalOk = latest && latest.status === 'approved' && latest.proposal_id === proposal.id && !approvalStale(state, latest);
      if ((policy?.required_for_decision && !approvalOk) || (latest && !approvalOk)) {
        fail(409, 'A aprovação está pendente ou ficou desatualizada após uma alteração. Solicite uma nova aprovação.', 'approval_stale');
      }
      const allowed = new Set(comparableFields(rfq.product).map((field) => field.key));
      const weights = {};
      for (const [key, value] of Object.entries(body.criteria?.weights || {})) {
        const weight = Number(value);
        if (allowed.has(key) && Number.isFinite(weight) && weight > 0 && weight <= 100) weights[key] = weight;
      }
      const decision = { id: uuid(), organization_id: rfq.organization_id, rfq_id: rfq.id, proposal_id: proposal.id, proposal_version: proposal.current_version,
        decided_by: userId, decided_at: nowIso(), criteria: { weights, decided_by_human: true, source: Object.keys(weights).length ? 'user_weights' : 'manual' },
        rationale: limited(body.rationale, 4000) || null, snapshot: { proposals: proposalsWithTerms(state, [rfq.id]), rfq_revision: rfq.revision } };
      state.data.decisions.push(decision);
      rfq.status = 'decided';
      rfq.updated_at = nowIso();
      event(state, rfq.organization_id, 'rfq', rfq.id, 'decision_recorded', userId, { provider: providerName(state, proposal.provider_id) });
      return { ok: true, id: decision.id };
    },

    'GET contracts': (state, { userId, query }) => {
      const { organization } = memberOrganization(state, userId, query.get('organization_id'));
      return { ok: true, rows: state.data.contracts.filter((row) => row.organization_id === organization.id).map((row) => withRenewalWindow(clone(row))) };
    },
    'POST contracts': (state, { userId, body }) => {
      const decision = state.data.decisions.find((row) => row.id === clean(body.decision_id));
      if (!decision || !hasRole(state, userId, decision.organization_id)) fail(404, 'Decisão não encontrada.', 'decision_not_found');
      requireRole(state, userId, decision.organization_id, ['admin', 'finance_manager']);
      if (state.data.contracts.some((row) => row.decision_id === decision.id)) fail(409, 'Esta decisão já gerou um contrato.', 'contract_exists');
      const starts = clean(body.starts_on);
      const ends = clean(body.ends_on);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(starts) || !/^\d{4}-\d{2}-\d{2}$/.test(ends)) fail(400, 'Informe início e fim do contrato no formato AAAA-MM-DD.', 'invalid_dates');
      if (ends < starts) fail(400, 'O fim do contrato não pode anteceder o início.', 'invalid_period');
      const notice = Number(body.renewal_notice_days ?? 60);
      if (!Number.isInteger(notice) || notice < 0 || notice > 3650) fail(400, 'Aviso prévio inválido.', 'invalid_notice');
      const reference = clean(body.document_reference);
      if (reference && !/^https:\/\//.test(reference)) fail(400, 'A referência documental precisa usar https.', 'invalid_reference');
      const rfq = rfqById(state, decision.rfq_id);
      const proposal = state.data.proposals.find((row) => row.id === decision.proposal_id);
      const contract = { id: uuid(), organization_id: decision.organization_id, decision_id: decision.id, rfq_id: decision.rfq_id, proposal_id: decision.proposal_id,
        provider_id: proposal?.provider_id, provider_name: providerName(state, proposal?.provider_id), product: rfq.product, status: 'active', owner_id: userId,
        starts_on: starts, ends_on: ends, renewal_notice_days: notice, cost_summary: limited(body.cost_summary, 1000) || null,
        main_conditions: limited(body.main_conditions, 4000) || null, document_reference: reference || null, created_at: nowIso() };
      state.data.contracts.push(contract);
      if (rfq.status === 'decided') { rfq.status = 'contracted'; rfq.updated_at = nowIso(); }
      event(state, decision.organization_id, 'contract', contract.id, 'contract_registered', userId, { provider: contract.provider_name });
      event(state, decision.organization_id, 'rfq', rfq.id, 'contract_registered', userId, { provider: contract.provider_name });
      processRenewals(state, decision.organization_id, userId);
      return { ok: true, id: contract.id };
    },
    'POST renewals': (state, { userId, body }) => {
      const { organization } = memberOrganization(state, userId, body.organization_id, ['BUYER']);
      requireRole(state, userId, organization.id, ['admin', 'finance_manager']);
      return { ok: true, tasks_created: processRenewals(state, organization.id, userId) };
    },
    'POST contract-renewal-rfq': (state, { userId, body }) => {
      const { organization } = memberOrganization(state, userId, body.organization_id, ['BUYER']);
      requireRole(state, userId, organization.id, ['admin', 'finance_manager']);
      const contract = state.data.contracts.find((row) => row.id === clean(body.contract_id) && row.organization_id === organization.id);
      if (!contract) fail(404, 'Contrato não encontrado.', 'not_found');
      const existing = state.data.rfqs.find((row) => row.source_contract_id === contract.id && !['cancelled', 'closed'].includes(row.status));
      if (existing) return { ok: true, id: existing.id, existing: true };
      const source = rfqById(state, contract.rfq_id);
      const product = contract.product;
      const label = product === 'credit' ? 'Renovação de crédito' : 'Renovação de adquirência';
      const rfq = { id: uuid(), organization_id: organization.id, owner_id: userId, product, source_contract_id: contract.id,
        title: `${label} — ${contract.provider_name.replace(/ — DEMO$/, '')} (vence ${contract.ends_on.split('-').reverse().join('/')})`.slice(0, 200),
        description: `Nova concorrência para substituir ou renovar o contrato vigente com ${contract.provider_name}. Demanda copiada da solicitação anterior.`,
        status: 'draft', demand: clone(source?.demand || {}), response_deadline: new Date(now().getTime() + 14 * DAY).toISOString().slice(0, 10),
        revision: 1, created_at: nowIso(), updated_at: nowIso() };
      state.data.rfqs.push(rfq);
      state.data.rfq_revisions.push({ rfq_id: rfq.id, revision: 1, snapshot: snapshotOf(rfq), changed_by: userId, published_at: nowIso() });
      if (contract.status === 'active') contract.status = 'renewing';
      event(state, organization.id, 'rfq', rfq.id, 'rfq_created', userId, { source_contract: contract.id });
      event(state, organization.id, 'contract', contract.id, 'renewal_rfq_started', userId, { rfq: rfq.id });
      return { ok: true, id: rfq.id };
    },

    'GET comments': (state, { userId, query }) => {
      const { organization } = memberOrganization(state, userId, query.get('organization_id'));
      const objectType = clean(query.get('object_type'));
      const objectId = clean(query.get('object_id'));
      if (!['rfq', 'proposal', 'approval', 'decision', 'contract', 'task'].includes(objectType)) fail(400, 'Objeto inválido.', 'invalid_object');
      let rows = state.data.comments.filter((row) => row.object_type === objectType && row.object_id === objectId);
      if (organization.kind === 'BUYER') rows = rows.filter((row) => row.organization_id === organization.id);
      else {
        if (objectType !== 'rfq' || !providerCanSee(state, userId, objectId)) rows = [];
        rows = rows.filter((row) => row.visibility === 'provider_visible');
      }
      const author = (id) => {
        const user = state.data.users.find((row) => row.id === id);
        const membership = state.data.members.find((row) => row.user_id === id);
        const home = membership && org(state, membership.organization_id);
        return { author_name: user?.name || 'Membro', author_org: home?.legal_name || null, author_is_provider: home?.kind === 'PROVIDER' };
      };
      return { ok: true, rows: rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).map((row) => ({ ...clone(row), ...author(row.author_id) })), has_more: false };
    },
    'POST comments': (state, { userId, body }) => {
      const { organization } = memberOrganization(state, userId, body.organization_id);
      const objectType = clean(body.object_type);
      const objectId = clean(body.object_id);
      const visibility = clean(body.visibility);
      const text = String(body.body ?? '').trim();
      if (text.length < 1 || text.length > 4000 || /[<>]/.test(text)) fail(400, 'Escreva texto simples sem HTML, entre 1 e 4.000 caracteres.', 'invalid_comment');
      if (!['internal', 'provider_visible'].includes(visibility)) fail(400, 'Escolha uma visibilidade permitida para este objeto.', 'invalid_visibility');
      if (objectType !== 'rfq') fail(400, 'Objeto inválido.', 'invalid_object');
      const rfq = loadRfq(state, userId, objectId);
      const provider = organization.kind === 'PROVIDER';
      if (provider && (visibility !== 'provider_visible' || !providerCanSee(state, userId, rfq.id))) fail(400, 'Escolha uma visibilidade permitida para este objeto.', 'invalid_visibility');
      const clientId = clean(body.client_id);
      const replay = clientId && state.data.comments.find((row) => row.client_id === clientId);
      if (replay) {
        if (replay.author_id !== userId || replay.object_id !== objectId || replay.body !== text) fail(409, 'Este comentário já foi registrado com outra autoria ou objeto.', 'comment_conflict');
        return { ok: true, id: replay.id };
      }
      const mentions = Array.isArray(body.mention_ids) ? [...new Set(body.mention_ids.map(clean))].slice(0, 10) : [];
      if (mentions.length && (provider || visibility !== 'internal')) fail(400, 'Mencione somente membros desta organização.', 'invalid_mention');
      if (mentions.some((id) => id === userId || !hasRole(state, id, rfq.organization_id))) fail(400, 'Mencione somente membros desta organização.', 'invalid_mention');
      const parentId = clean(body.parent_id) || null;
      if (parentId) {
        const parent = state.data.comments.find((row) => row.id === parentId && row.object_id === objectId);
        if (!parent || (parent.visibility === 'internal' && (provider || visibility !== 'internal'))) fail(400, 'Resposta inválida para este comentário.', 'invalid_parent');
      }
      const row = { id: uuid(), client_id: clientId || null, organization_id: rfq.organization_id, object_type: 'rfq', object_id: objectId,
        author_id: userId, visibility, body: text, created_at: nowIso(), parent_id: parentId, mention_ids: mentions };
      state.data.comments.push(row);
      event(state, rfq.organization_id, 'rfq', rfq.id, 'comment_added', userId, { visibility });
      const author = userName(state, userId);
      const parentRow = parentId && state.data.comments.find((item) => item.id === parentId);
      if (parentRow && parentRow.author_id !== userId && hasRole(state, parentRow.author_id, rfq.organization_id)) {
        notify(state, { organizationId: rfq.organization_id, userId: parentRow.author_id, eventType: 'comment', objectType: 'rfq', objectId: rfq.id,
          title: 'Responderam ao seu comentário', body: `${author} · ${rfq.title}` });
      }
      for (const mentioned of mentions) {
        notify(state, { organizationId: rfq.organization_id, userId: mentioned, eventType: 'mention', objectType: 'rfq', objectId: rfq.id,
          title: `${author} mencionou você`, body: rfq.title });
      }
      if (provider && rfq.owner_id) {
        notify(state, { organizationId: rfq.organization_id, userId: rfq.owner_id, eventType: 'comment', objectType: 'rfq', objectId: rfq.id,
          title: 'Novo comentário de provedor', body: `${org(state, organization.id)?.legal_name} · ${rfq.title}` });
      } else if (visibility === 'provider_visible') {
        for (const invite of state.data.invites.filter((item) => item.rfq_id === rfq.id && item.status === 'accepted')) {
          for (const member of state.data.members.filter((item) => item.organization_id === invite.provider_organization_id)) {
            notify(state, { organizationId: invite.provider_organization_id, userId: member.user_id, eventType: 'comment', objectType: 'rfq', objectId: rfq.id,
              title: 'A empresa respondeu no processo', body: rfq.title });
          }
        }
      }
      return { ok: true, id: row.id };
    },

    'GET notifications': (state, { userId, query }) => {
      const { organization } = memberOrganization(state, userId, query.get('organization_id'));
      const rows = state.data.notifications.filter((row) => row.organization_id === organization.id && row.user_id === userId)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).map(clone);
      return { ok: true, rows: rows.slice(0, 50), has_more: rows.length > 50 };
    },
    'PATCH notifications': (state, { userId, body }) => {
      const { organization } = memberOrganization(state, userId, body.organization_id);
      const ids = body.ids == null ? null : (Array.isArray(body.ids) ? body.ids.map(clean) : []);
      let count = 0;
      for (const row of state.data.notifications) {
        if (row.organization_id !== organization.id || row.user_id !== userId || row.read_at) continue;
        if (ids && !ids.includes(row.id)) continue;
        row.read_at = nowIso();
        count += 1;
      }
      return { ok: true, count };
    },
    'GET notification-preferences': (state, { userId, query }) => {
      const { organization } = memberOrganization(state, userId, query.get('organization_id'));
      return { ok: true, rows: clone(state.data.preferences.filter((row) => row.organization_id === organization.id && row.user_id === userId))
        .map(({ event_type, in_app, email }) => ({ event_type, in_app, email })) };
    },
    'POST notification-preferences': (state, { userId, body }) => {
      const { organization } = memberOrganization(state, userId, body.organization_id);
      if (typeof body.in_app !== 'boolean' || typeof body.email !== 'boolean') fail(400, 'Preferência inválida.', 'invalid_preference');
      const eventType = clean(body.event_type);
      let row = state.data.preferences.find((item) => item.organization_id === organization.id && item.user_id === userId && item.event_type === eventType);
      if (!row) { row = { organization_id: organization.id, user_id: userId, event_type: eventType }; state.data.preferences.push(row); }
      Object.assign(row, { in_app: body.in_app, email: body.email });
      return { ok: true };
    },

    'GET events': (state, { userId, query }) => {
      const { organization } = memberOrganization(state, userId, query.get('organization_id'));
      const type = clean(query.get('entity_type'));
      const id = clean(query.get('entity_id'));
      const rows = state.data.events.filter((row) => row.organization_id === organization.id && (!type || !id || (row.entity_type === type && row.entity_id === id)))
        .sort((a, b) => String(b.happened_at).localeCompare(String(a.happened_at))).slice(0, 50)
        .map((row) => ({ ...clone(row), actor_name: row.actor_id ? userName(state, row.actor_id) : 'Arandu (automático)' }));
      return { ok: true, rows };
    },

    'GET search': (state, { userId, query }) => {
      const { organization } = memberOrganization(state, userId, query.get('organization_id'), ['BUYER']);
      const term = clean(query.get('q'));
      if (term.length < 2 || term.length > 100) fail(400, 'Informe uma busca de 2 a 100 caracteres e um filtro válido.', 'invalid_search');
      const fold = (value) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');
      const terms = fold(term).split(/\s+/).filter(Boolean);
      const match = (...values) => { const hay = fold(values.join(' ')); return terms.every((item) => hay.includes(item)); };
      const rows = [];
      const rfqs = state.data.rfqs.filter((row) => row.organization_id === organization.id);
      for (const rfq of rfqs) if (match(rfq.title, rfq.description, PRODUCTS[rfq.product]?.label)) rows.push({ kind: 'rfq', id: rfq.id, title: rfq.title, detail: rfq.status, href: `/finance/rfq.html?id=${rfq.id}` });
      for (const proposal of proposalsWithTerms(state, rfqs.map((row) => row.id))) {
        const rfq = rfqs.find((row) => row.id === proposal.rfq_id);
        if (match(proposal.provider_name, rfq.title)) rows.push({ kind: 'proposal', id: proposal.id, title: `${proposal.provider_name} · v${proposal.version}`, detail: rfq.title, href: `/finance/rfq.html?id=${rfq.id}#propostas` });
      }
      for (const providerRow of state.data.providers.filter((row) => row.organization_id === organization.id)) {
        if (match(providerRow.name, providerRow.region, providerRow.kind)) rows.push({ kind: 'provider', id: providerRow.id, title: providerRow.name, detail: providerRow.region || '', href: `/finance/providers.html#provider-${providerRow.id}` });
      }
      for (const contract of state.data.contracts.filter((row) => row.organization_id === organization.id)) {
        if (match(contract.provider_name, PRODUCTS[contract.product]?.label, contract.cost_summary)) rows.push({ kind: 'contract', id: contract.id, title: contract.provider_name, detail: `vence ${contract.ends_on}`, href: `/finance/contracts.html#contract-${contract.id}` });
      }
      for (const task of state.data.tasks.filter((row) => row.organization_id === organization.id && row.status === 'open')) {
        if (match(task.title)) rows.push({ kind: 'task', id: task.id, title: task.title, detail: task.due_on ? `prazo ${task.due_on}` : '', href: `/finance/tasks.html#task-${task.id}` });
      }
      return { ok: true, rows: rows.slice(0, 20), has_more: rows.length > 20 };
    },

    'POST providers': (state, { userId, body }) => {
      const { organization } = memberOrganization(state, userId, body.organization_id, ['BUYER']);
      requireRole(state, userId, organization.id, ['admin', 'finance_manager']);
      const kind = clean(body.kind);
      if (!['bank', 'fintech', 'acquirer', 'subacquirer', 'credit_provider', 'payment_provider', 'other'].includes(kind)) fail(400, 'Tipo de provedor inválido.', 'invalid_provider_kind');
      const name = limited(body.name, 200);
      if (name.length < 2) fail(400, 'Informe o nome do provedor.', 'invalid_provider_name');
      const website = clean(body.website);
      if (website && !/^https:\/\//.test(website)) fail(400, 'O site do provedor precisa usar https.', 'invalid_website');
      const row = { id: uuid(), organization_id: organization.id, provider_organization_id: null, name, kind, status: 'active', verification_state: 'NAO_VERIFICADO',
        region: limited(body.region, 120) || null, website: website || null, notes: limited(body.notes, 1000) || null, products: [], created_at: nowIso() };
      state.data.providers.push(row);
      return { ok: true, row: clone(row) };
    },
    'POST profile': (state, { userId, body }) => {
      const { organization } = memberOrganization(state, userId, body.organization_id, ['BUYER']);
      requireRole(state, userId, organization.id, ['admin', 'finance_manager']);
      const key = clean(body.field_key).toLowerCase();
      if (!/^[a-z][a-z0-9_]{1,48}$/.test(key)) fail(400, 'Identificador de campo inválido.', 'invalid_field_key');
      const value = limited(body.field_value, 500);
      if (!value) fail(400, 'Informe um valor para o campo.', 'invalid_field_value');
      let row = state.data.profile.find((item) => item.organization_id === organization.id && item.field_key === key);
      if (!row) { row = { id: uuid(), organization_id: organization.id, field_key: key, valid_until: null }; state.data.profile.push(row); }
      Object.assign(row, { field_value: value, source: clean(body.source) || 'declarado_pela_empresa', status: 'informado', updated_at: nowIso() });
      return { ok: true, row: clone(row) };
    },
    'POST terms': (state, { userId, body }) => {
      const { organization } = memberOrganization(state, userId, body.organization_id);
      const version = clean(body.terms_version);
      if (!/^\d{4}-\d{2}-\d{2}(-[a-z0-9-]{1,40})?$/.test(version)) fail(400, 'Versão de termos inválida.', 'invalid_terms_version');
      state.data.terms.unshift({ organization_id: organization.id, terms_version: version, context: 'test', accepted_at: nowIso(), user_id: userId });
      return { ok: true, terms_version: version, legal_review_required: true };
    },
    'GET tasks': (state, { userId, query }) => {
      const { organization } = memberOrganization(state, userId, query.get('organization_id'));
      return { ok: true, rows: clone(state.data.tasks.filter((row) => row.organization_id === organization.id))
        .sort((a, b) => String(a.due_on || '9999').localeCompare(String(b.due_on || '9999')))
        .map((row) => ({ ...row, assignee_name: row.assignee_id ? userName(state, row.assignee_id) : null })) };
    },
    'POST tasks': (state, { userId, body }) => {
      const { organization } = memberOrganization(state, userId, body.organization_id, ['BUYER']);
      const title = limited(body.title, 200);
      if (title.length < 2) fail(400, 'Informe um título para a tarefa.', 'invalid_title');
      const due = clean(body.due_on);
      if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) fail(400, 'Data da tarefa inválida.', 'invalid_due_on');
      const row = { id: uuid(), organization_id: organization.id, title, due_on: due || null, status: 'open', related_type: ['rfq', 'proposal', 'contract'].includes(clean(body.related_type)) ? clean(body.related_type) : null,
        related_id: clean(body.related_id) || null, assignee_id: userId, created_at: nowIso() };
      state.data.tasks.push(row);
      return { ok: true, row: clone(row) };
    },
    'PATCH tasks': (state, { userId, body }) => {
      const { organization } = memberOrganization(state, userId, body.organization_id, ['BUYER']);
      const status = clean(body.status);
      if (!['open', 'done', 'cancelled'].includes(status)) fail(400, 'Estado de tarefa inválido.', 'invalid_task_status');
      const row = state.data.tasks.find((item) => item.id === clean(body.task_id) && item.organization_id === organization.id);
      if (!row) fail(404, 'Tarefa não encontrada.', 'not_found');
      row.status = status;
      return { ok: true };
    },
    'GET export': (state, { userId, query }) => {
      const rfq = loadRfq(state, userId, query.get('rfq_id'));
      memberOrganization(state, userId, rfq.organization_id, ['BUYER']);
      const decision = state.data.decisions.find((row) => row.rfq_id === rfq.id) || null;
      return { ok: true, export: { generated_at: nowIso(), demonstration: true, notice: NEUTRAL_RANKING_NOTICE,
        rfq: { id: rfq.id, product: rfq.product, title: rfq.title, description: rfq.description, status: rfq.status, revision: rfq.revision,
          response_deadline: rfq.response_deadline, demand: clone(rfq.demand), created_at: rfq.created_at },
        proposals: proposalsWithTerms(state, [rfq.id]), decision: clone(decision),
        disclaimer: 'DADOS FICTÍCIOS DE DEMONSTRAÇÃO. Registro factual do processo. O Arandu não emite recomendação, parecer nem classificação de instituições.' } };
    },
    // O modo demonstração não produz métrica: nada sai do navegador.
    'POST signals': () => ({ ok: true, recorded: false }),
    'GET documents': () => ({ ok: true, rows: [], upload_supported: false })
  };

  function approvalStale(state, request) {
    if (request.status !== 'pending' && request.status !== 'approved') return false;
    const proposal = state.data.proposals.find((row) => row.id === request.proposal_id);
    const rfq = rfqById(state, request.rfq_id);
    if (!proposal || !rfq) return true;
    if (proposal.current_version !== request.proposal_version || !['submitted', 'revised'].includes(proposal.status)) return true;
    return request.rfq_revision !== undefined && request.rfq_revision !== rfq.revision;
  }

  /**
   * Marcos de renovação: 90, 60 e 30 dias antes do fim e a data de aviso
   * prévio. Idempotente por (contrato, marco) — chamar duas vezes no mesmo dia
   * não duplica tarefa, evento nem notificação.
   */
  function processRenewals(state, organizationId, actorId) {
    let created = 0;
    const todayDate = Date.parse(`${today()}T00:00:00Z`);
    for (const contract of state.data.contracts.filter((row) => row.organization_id === organizationId && ['active', 'renewing'].includes(row.status))) {
      const ends = Date.parse(`${contract.ends_on}T00:00:00Z`);
      if (!Number.isFinite(ends)) continue;
      const marks = [['d90', 90], ['d60', 60], ['d30', 30], ['notice', Number(contract.renewal_notice_days || 0)]]
        .map(([key, days]) => [key, ends - days * DAY]).filter(([, due]) => due <= todayDate);
      // Só o marco mais recente vira tarefa; os anteriores ficam registrados como alcançados.
      marks.sort((a, b) => b[1] - a[1]);
      marks.forEach(([key], index) => {
        if (state.data.renewal_milestones.some((row) => row.contract_id === contract.id && row.milestone === key)) return;
        const milestone = { contract_id: contract.id, milestone: key, due_on: new Date(ends).toISOString().slice(0, 10), processed_at: nowIso(), task_id: null };
        if (index === 0 && !state.data.tasks.some((row) => row.related_id === contract.id && row.status === 'open')) {
          const task = { id: uuid(), organization_id: organizationId, title: `Revisar renovação — ${contract.provider_name}`, due_on: milestone.due_on,
            status: 'open', related_type: 'contract', related_id: contract.id, assignee_id: contract.owner_id, created_at: nowIso() };
          state.data.tasks.push(task);
          milestone.task_id = task.id;
          created += 1;
          event(state, organizationId, 'contract', contract.id, 'renewal_task_created', actorId, { milestone: key });
          notify(state, { organizationId, userId: contract.owner_id, eventType: 'renewal_due', objectType: 'contract', objectId: contract.id,
            title: 'Contrato em revisão de renovação', body: `${contract.provider_name} · vence em ${contract.ends_on.split('-').reverse().join('/')}` });
        }
        state.data.renewal_milestones.push(milestone);
      });
    }
    return created;
  }

  // -------------------------------------------------------------- interface
  async function request(path, options = {}) {
    const method = String(options.method || 'GET').toUpperCase();
    const url = new URL(String(path), 'https://demo.arandu.invalid/');
    const segments = url.pathname.split('/').filter(Boolean);
    const key = `${method} ${segments.slice(0, 2).join('/')}`;
    const handler = routes[key] || routes[`${method} ${segments[0]}`];
    let body = {};
    if (options.body) {
      try { body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body; } catch { body = {}; }
    }
    if (latency) await new Promise((resolve) => setTimeout(resolve, latency));
    const state = load();
    if (!handler) throw new DemoError(404, 'Recurso financeiro não encontrado.', 'finance_route_not_found');
    // Falha simulada, ligada pelo painel da demonstração, para exercitar os
    // estados de erro e de nova tentativa da interface.
    if (method !== 'GET' && state.simulate?.fail_next) {
      state.simulate.fail_next = false;
      save(state);
      throw new DemoError(503, 'Falha simulada de rede (demonstração). Nada foi salvo — tente novamente.', 'simulated_failure');
    }
    const result = handler(state, { ...context(state), query: url.searchParams, body: body && typeof body === 'object' ? body : {}, method });
    if (method !== 'GET') save(state);
    return clone(result);
  }

  return {
    mode: 'demo',
    storageKey: DEMO_STORAGE_KEY,
    request,
    persistent: () => persistent,
    recovered: () => recovered,
    snapshot: () => clone(load()),
    persona: () => {
      const state = load();
      const { persona, user } = context(state);
      const membership = state.data.members.find((row) => row.user_id === persona.user);
      return { ...persona, name: user?.name, title: user?.title, role: membership?.role, organization_name: org(state, persona.organization)?.legal_name };
    },
    setPersona(key) {
      if (!PERSONAS[key]) throw new DemoError(400, 'Persona desconhecida.', 'invalid_persona');
      const state = load();
      state.persona = key;
      save(state);
      return PERSONAS[key];
    },
    simulateFailure() {
      const state = load();
      state.simulate = { fail_next: true };
      save(state);
    },
    reset() {
      const state = fresh(load().persona);
      recovered = false;
      save(state);
      return state;
    },
    counts() {
      const state = load();
      return { emails: state.data.simulated_emails.length, events: state.data.events.length };
    }
  };
}
