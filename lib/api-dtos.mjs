import { cleanEmail, cleanPhone, limited } from './api-core.mjs';

const PUBLIC_SELECTION_STATUSES = new Set(['open', 'sent', 'reviewed']);

function safeSelectionUrl(value) {
  const raw = limited(value, 500);
  if (!raw) return '';
  try {
    const url = new URL(raw, 'https://arandu.local');
    return ['http:', 'https:'].includes(url.protocol) ? raw : '';
  } catch { return ''; }
}

function minimalFormPayload(type, body, consentVersion) {
  return {
    form_type: limited(type, 80),
    source_page: limited(body.page || body.source_page, 240) || null,
    consent_version: consentVersion || null
  };
}

export function normalizeFormPayload(body, { consentVersion = '' } = {}) {
  const type = limited(body.type || body.form_type || 'contato', 80);
  const data = body.data && typeof body.data === 'object' && !Array.isArray(body.data) ? body.data : body;
  let table = 'leads';
  let record = {
    type,
    name: limited(data.nome || data.name || data.nome_completo, 160) || null,
    email: cleanEmail(data.email) || null,
    whatsapp: cleanPhone(data.whatsapp || data.telefone || data.phone) || null,
    company: limited(data.empresa || data.company, 180) || null,
    message: limited(data.mensagem || data.message, 4000) || null,
    source_page: limited(body.page || body.source_page, 240) || null,
    status: 'new',
    payload: minimalFormPayload(type, body, consentVersion)
  };
  if (type === 'submissao-artista') {
    table = 'artist_submissions';
    record = {
      name: limited(data.nome_completo || data.nome, 160) || null,
      artist_name: limited(data.nome_artistico || data.artist_name || data.nome, 160) || null,
      city: limited(data.cidade, 120) || null,
      state: limited(data.estado || data.uf, 40) || null,
      portfolio_url: limited(data.portfolio || data.portfolio_url, 500) || null,
      instagram: limited(data.instagram, 180) || null,
      email: cleanEmail(data.email) || null,
      whatsapp: cleanPhone(data.whatsapp || data.telefone) || null,
      languages: limited(data.linguagens || data.languages, 500) || null,
      price_range: limited(data.faixa_preco || data.orcamento, 160) || null,
      message: limited(data.mensagem, 4000) || null,
      status: 'received',
      payload: minimalFormPayload(type, body, consentVersion)
    };
  }
  if (type === 'empresa-intencao' || type === 'proposta-empresa') {
    table = 'company_briefs';
    record = {
      ...record,
      project_type: limited(data.tipo_projeto || data.espaco, 160) || null,
      environment: limited(data.ambiente, 500) || null,
      budget: limited(data.orcamento || data.budget, 160) || null,
      deadline: limited(data.prazo, 160) || null,
      status: 'received'
    };
    delete record.type;
  }
  if (type === 'newsletter') {
    table = 'newsletter_subscriptions';
    record = {
      email: cleanEmail(data.email),
      name: limited(data.nome || data.name, 160) || null,
      source_page: limited(body.page, 240) || null,
      payload: minimalFormPayload(type, body, consentVersion)
    };
  }
  return { table, record };
}

export function normalizeReservation(body) {
  return {
    artwork_id: limited(body.artwork_id || body.artworkId || body.id, 180) || null,
    name: limited(body.name, 160) || null,
    whatsapp: cleanPhone(body.whatsapp) || null,
    deadline: limited(body.deadline, 160) || null,
    notes: limited(body.notes, 3000) || null,
    origin: limited(body.origin || body.source || body.source_page, 120) || 'website'
  };
}

export function normalizeProposal(body) {
  const artworkIds = Array.isArray(body.items)
    ? body.items.map((item) => limited(item?.id || item?.artwork_id, 180)).filter(Boolean)
    : [];
  return {
    artworkIds,
    client: limited(body.client || body.name, 240) || null,
    leadId: limited(body.lead_id, 80) || null,
    companyBriefId: limited(body.company_brief_id, 80) || null,
    space: limited(body.space, 500) || null,
    goal: limited(body.goal, 1000) || null,
    budget: limited(body.budget, 160) || null,
    deadline: limited(body.deadline, 160) || null,
    notes: limited(body.notes, 3000) || null
  };
}

function normalizeSelectionItem(item) {
  return {
    id: limited(item?.id || item?.artwork_id, 180),
    title: limited(item?.title, 240),
    artist: limited(item?.artist || item?.artist_name, 180),
    context: limited(item?.context, 500),
    url: safeSelectionUrl(item?.url),
    price: Number.isFinite(Number(item?.price)) && Number(item.price) >= 0 ? Number(item.price) : null,
    priceLabel: limited(item?.priceLabel || item?.price_label, 120),
    technique: limited(item?.technique, 180),
    dimensions: limited(item?.dimensions, 120),
    status: limited(item?.status, 80),
    thumb: limited(item?.thumb, 500).replace(/[^a-zA-Z0-9 _-]/g, ''),
    note: limited(item?.note, 1000)
  };
}

function normalizeBriefing(value) {
  const briefing = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(Object.entries(briefing).slice(0, 30).map(([key, item]) => [limited(key, 80), limited(item, 1200)]));
}

export function normalizeSelection(body) {
  const briefing = normalizeBriefing(body.briefing);
  const items = Array.isArray(body.items)
    ? body.items.slice(0, 40).map(normalizeSelectionItem).filter((item) => item.id)
    : [];
  return {
    name: limited(body.name || briefing.nome || briefing.name, 160) || null,
    email: cleanEmail(body.email || briefing.email) || null,
    whatsapp: cleanPhone(body.whatsapp || briefing.whatsapp || briefing.telefone) || null,
    items,
    briefing: {
      ...briefing,
      source: limited(body.source || briefing.source || 'minha-selecao', 120),
      shared_at: limited(body.createdAt, 80) || new Date().toISOString()
    },
    status: 'open'
  };
}

function withoutPersonalBriefingFields(value) {
  const briefing = normalizeBriefing(value);
  ['nome', 'name', 'email', 'whatsapp', 'telefone', 'phone'].forEach((key) => delete briefing[key]);
  return briefing;
}

export function publicSelection(record) {
  if (!record || !PUBLIC_SELECTION_STATUSES.has(record.status)) return null;
  return {
    public_token: record.public_token,
    status: record.status,
    items: Array.isArray(record.items) ? record.items.map(normalizeSelectionItem) : [],
    briefing: withoutPersonalBriefingFields(record.briefing),
    updated_at: record.updated_at || record.created_at || null
  };
}

export function accountSelection(record) {
  if (!record) return null;
  return {
    id: record.id,
    public_token: record.public_token,
    status: record.status,
    items: Array.isArray(record.items) ? record.items.map(normalizeSelectionItem) : [],
    briefing: normalizeBriefing(record.briefing),
    created_at: record.created_at || null,
    updated_at: record.updated_at || null
  };
}

export function accountReservation(record) {
  if (!record) return null;
  return {
    id: record.id,
    artwork_id: record.artwork_id,
    status: record.status,
    deadline: record.deadline,
    notes: record.notes,
    expires_at: record.expires_at || null,
    created_at: record.created_at || null,
    updated_at: record.updated_at || null
  };
}
