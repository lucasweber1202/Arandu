// Primitivas compartilhadas pela interface financeira.
//
// Todo texto vindo de dado (servidor ou demonstração) entra no DOM por
// `textContent`/`setAttribute`. Não existe `innerHTML` com conteúdo dinâmico
// neste cliente — é o que torna inofensivo um título de RFQ com `<script>`.

import { PRODUCTS } from '../../lib/finance/products.mjs';

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'text') node.textContent = value;
    else if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : String(child));
  }
  return node;
}

export function frag(children = []) {
  const node = document.createDocumentFragment();
  for (const child of [].concat(children)) if (child) node.append(child);
  return node;
}

// ------------------------------------------------------------------ ícones
const SVG = 'http://www.w3.org/2000/svg';
const ICONS = {
  home: ['M3 10.5 12 3l9 7.5', 'M5 9.5V21h14V9.5'],
  inbox: ['M3 13h5l1.5 3h5L16 13h5', 'M5 5h14l2 8v6H3v-6z'],
  file: ['M14 3H6v18h12V7z', 'M14 3v4h4', 'M9 12h6', 'M9 16h6'],
  check: ['M5 12.5 10 17l9-10'],
  checkCircle: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'm8 12.5 3 3 5-6'],
  layers: ['m12 3 9 5-9 5-9-5z', 'm3 13 9 5 9-5'],
  briefcase: ['M4 7h16v13H4z', 'M9 7V4h6v3', 'M4 12h16'],
  users: ['M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M2 21v-1a6 6 0 0 1 12 0v1', 'M16 3.5a4 4 0 0 1 0 7.5', 'M18 14a6 6 0 0 1 4 6v1'],
  settings: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'],
  bell: ['M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9', 'M13.7 21a2 2 0 0 1-3.4 0'],
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'm20 20-3.5-3.5'],
  plus: ['M12 5v14', 'M5 12h14'],
  chevronRight: ['m9 6 6 6-6 6'],
  chevronDown: ['m6 9 6 6 6-6'],
  chevronUp: ['m6 15 6-6 6 6'],
  chevronLeft: ['m15 6-6 6 6 6'],
  alert: ['M12 3 2 20h20z', 'M12 10v4', 'M12 17h.01'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v5l3 2'],
  lock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 8 0v4'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  message: ['M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z'],
  at: ['M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z', 'M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1'],
  calendar: ['M4 6h16v15H4z', 'M4 10h16', 'M8 3v4', 'M16 3v4'],
  refresh: ['M20 11a8 8 0 0 0-14.3-4.9L4 8', 'M4 3v5h5', 'M4 13a8 8 0 0 0 14.3 4.9L20 16', 'M20 21v-5h-5'],
  x: ['M6 6l12 12', 'M18 6 6 18'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  arrowRight: ['M5 12h14', 'm13 6 6 6-6 6'],
  download: ['M12 4v12', 'm7 11 5 5 5-5', 'M5 20h14'],
  send: ['m22 2-7 20-4-9-9-4z', 'M22 2 11 13'],
  building: ['M5 21V4h10v17', 'M15 9h4v12', 'M8 8h4', 'M8 12h4', 'M8 16h4', 'M3 21h18'],
  repeat: ['m17 2 4 4-4 4', 'M3 11V9a3 3 0 0 1 3-3h15', 'm7 22-4-4 4-4', 'M21 13v2a3 3 0 0 1-3 3H3'],
  more: ['M12 6h.01', 'M12 12h.01', 'M12 18h.01'],
  scale: ['M12 3v18', 'M5 7h14', 'm5 7-3 7a3 3 0 0 0 6 0z', 'm19 7-3 7a3 3 0 0 0 6 0z', 'M8 21h8'],
  flag: ['M4 21V4', 'M4 4h13l-2 4 2 4H4'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 11v5', 'M12 8h.01'],
  edit: ['M4 20h4L19 9l-4-4L4 16z', 'm13.5 6.5 4 4'],
  reply: ['m9 17-5-5 5-5', 'M20 18v-2a4 4 0 0 0-4-4H4'],
  shield: ['M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z'],
  swap: ['M7 4 3 8l4 4', 'M3 8h14', 'm17 20 4-4-4-4', 'M21 16H7'],
  tasks: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'm3 6 1 1 2-2', 'm3 12 1 1 2-2', 'm3 18 1 1 2-2'],
  logout: ['M9 21H4V3h5', 'm16 17 5-5-5-5', 'M21 12H9'],
  sparkles: ['M12 3v4', 'M12 17v4', 'M3 12h4', 'M17 12h4']
};

/** Ícones extras de uma camada de interface (ex.: a demonstração) sem inflar o pacote real. */
export function registerIcons(extra) { Object.assign(ICONS, extra); }

export function icon(name, { size = 16, label = null, className = '' } = {}) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', `icon ${className}`.trim());
  if (label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label); }
  else svg.setAttribute('aria-hidden', 'true');
  for (const d of ICONS[name] || ICONS.info) {
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

// ---------------------------------------------------------------- formatos
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
const BRL0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export function money(value, { compact = false } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  if (compact && Math.abs(number) >= 1e6) return `R$ ${(number / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (compact && Math.abs(number) >= 1e3) return `R$ ${(number / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  return (Number.isInteger(number) ? BRL0 : BRL).format(number);
}
export function percent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%` : '—';
}

const ENUM_LABELS = {
  capital_de_giro: 'Capital de giro', investimento: 'Investimento', expansao: 'Expansão', refinanciamento: 'Refinanciamento',
  antecipacao_recebiveis: 'Antecipação de recebíveis', outro: 'Outro', baixa: 'Baixa', media: 'Média', alta: 'Alta',
  pre: 'Pré-fixado', cdi: 'CDI', ipca: 'IPCA', selic: 'Selic', tr: 'TR', price: 'PRICE', sac: 'SAC', bullet: 'Bullet', customizada: 'Customizada'
};
export function enumLabel(value) { return ENUM_LABELS[value] || String(value); }

/** Chave técnica (faturamento_anual) em texto legível (Faturamento anual). */
export function humanizeKey(key) {
  const text = String(key || '').replaceAll('_', ' ').trim();
  return text ? text[0].toUpperCase() + text.slice(1) : '';
}
/** Texto livre (Faturamento anual) na chave estável usada pela API (faturamento_anual). */
export function slugKey(label) {
  return String(label || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^([0-9])/, 'campo_$1').slice(0, 49);
}

/** Valor de campo do catálogo formatado para leitura; ausência é explícita. */
export function fieldValue(field, value) {
  if (value === null || value === undefined || value === '') return null;
  switch (field?.type) {
    case 'money': return money(value);
    case 'percent': return percent(value);
    case 'bool': return value === true || value === 'true' ? 'Sim' : 'Não';
    case 'date': return formatDate(value);
    case 'enum': return enumLabel(value);
    case 'int': case 'number': return Number(value).toLocaleString('pt-BR');
    default: return String(value);
  }
}

export function parseDay(value) {
  if (!value) return null;
  const text = String(value);
  const time = /^\d{4}-\d{2}-\d{2}$/.test(text) ? Date.parse(`${text}T12:00:00`) : Date.parse(text);
  return Number.isFinite(time) ? new Date(time) : null;
}
export function formatDate(value, { withYear = true } = {}) {
  const date = parseDay(value);
  if (!date) return '—';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', ...(withYear ? { year: 'numeric' } : {}) }).replace('.', '');
}
export function formatDateTime(value) {
  const date = parseDay(value);
  if (!date) return '—';
  return date.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', '');
}
export function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
/** Dias inteiros entre hoje e a data (negativo = passado). */
export function daysUntil(value) {
  const date = parseDay(value);
  if (!date) return null;
  const today = parseDay(todayIso());
  return Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
}
export function relativeDays(value) {
  const days = daysUntil(value);
  if (days === null) return '';
  if (days === 0) return 'hoje';
  if (days === 1) return 'amanhã';
  if (days === -1) return 'ontem';
  return days > 0 ? `em ${days} dias` : `há ${-days} dias`;
}
export function timeAgo(value) {
  const date = parseDay(value);
  if (!date) return '';
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `há ${days} ${days === 1 ? 'dia' : 'dias'}`;
  return formatDate(value);
}
export function initials(name) {
  return String(name || '?').replace(/—.*$/, '').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
}
export const fold = (value) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');

// ----------------------------------------------------------------- rótulos
export const RFQ_STATUS = Object.freeze({
  draft: { label: 'Rascunho', tone: 'neutral', icon: 'edit' },
  open: { label: 'Aberta', tone: 'info', icon: 'send' },
  collecting: { label: 'Em coleta', tone: 'info', icon: 'inbox' },
  comparing: { label: 'Em avaliação', tone: 'accent', icon: 'scale' },
  decided: { label: 'Decidida', tone: 'success', icon: 'checkCircle' },
  contracted: { label: 'Contratada', tone: 'success', icon: 'briefcase' },
  closed: { label: 'Encerrada', tone: 'neutral', icon: 'check' },
  cancelled: { label: 'Cancelada', tone: 'neutral', icon: 'x' }
});
export const CONTRACT_STATUS = Object.freeze({
  active: { label: 'Vigente', tone: 'success', icon: 'checkCircle' },
  renewing: { label: 'Em renovação', tone: 'warning', icon: 'repeat' },
  expired: { label: 'Encerrado', tone: 'neutral', icon: 'clock' },
  terminated: { label: 'Rescindido', tone: 'neutral', icon: 'x' }
});
export const PROPOSAL_STATUS = Object.freeze({
  draft: { label: 'Em preparação', tone: 'neutral', icon: 'edit' },
  submitted: { label: 'Enviada', tone: 'success', icon: 'send' },
  revised: { label: 'Revisada', tone: 'success', icon: 'repeat' },
  withdrawn: { label: 'Retirada', tone: 'neutral', icon: 'x' }
});
export const APPROVAL_STATUS = Object.freeze({
  pending: { label: 'Em aprovação', tone: 'warning', icon: 'clock' },
  approved: { label: 'Aprovada', tone: 'success', icon: 'checkCircle' },
  rejected: { label: 'Rejeitada', tone: 'danger', icon: 'x' },
  changes_requested: { label: 'Alterações pedidas', tone: 'warning', icon: 'edit' },
  cancelled: { label: 'Cancelada', tone: 'neutral', icon: 'x' },
  expired: { label: 'Expirada', tone: 'danger', icon: 'clock' },
  superseded: { label: 'Substituída', tone: 'neutral', icon: 'more' }
});
export const ROLE_LABELS = Object.freeze({
  admin: 'Administrador', finance_manager: 'Gestão financeira', analyst: 'Análise financeira', viewer: 'Leitura e aprovação', provider_user: 'Provedor'
});
export const PROVIDER_KINDS = Object.freeze({
  bank: 'Banco', fintech: 'Fintech', acquirer: 'Adquirente', subacquirer: 'Subadquirente',
  credit_provider: 'Crédito', payment_provider: 'Pagamentos', other: 'Outro'
});
export function productLabel(id, { short = false } = {}) {
  if (short) return id === 'credit' ? 'Crédito' : id === 'acquiring' ? 'Adquirência' : String(id || '');
  return PRODUCTS[id]?.label || String(id || '');
}

/** Resumo de uma linha da demanda, usado em listas e na caixa de aprovação. */
export function demandHeadline(rfq) {
  const demand = rfq?.demand || {};
  if (rfq?.product === 'credit' && demand.amount) return `${money(demand.amount, { compact: true })}${demand.term_months ? ` · ${demand.term_months} meses` : ''}`;
  if (rfq?.product === 'acquiring' && demand.monthly_volume) return `${money(demand.monthly_volume, { compact: true })}/mês em cartões`;
  return productLabel(rfq?.product);
}

export function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
}

/**
 * Estágio de renovação de um contrato.
 *
 * O prazo que importa é o do aviso prévio (fim − dias de aviso): depois dele,
 * a empresa já não consegue avisar a não renovação dentro do contrato. A
 * janela de decisão abre 30 dias antes desse prazo (ou 90 dias antes do fim,
 * o que vier primeiro) e fecha no próprio prazo.
 */
export const RENEWAL_WINDOW_DAYS = 30;
export function renewalStage(contract) {
  const ends = parseDay(contract?.ends_on);
  if (!ends || !['active', 'renewing'].includes(contract?.status)) return { stage: 'inactive' };
  const iso = (date) => new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())).toISOString().slice(0, 10);
  const deadline = new Date(ends.getTime() - Number(contract.renewal_notice_days || 0) * 86400000);
  const opensAt = new Date(Math.min(deadline.getTime() - RENEWAL_WINDOW_DAYS * 86400000, ends.getTime() - 90 * 86400000));
  const today = parseDay(todayIso());
  const stage = today > ends ? 'expired' : today > deadline ? 'past_notice' : today >= opensAt ? 'window' : 'upcoming';
  return { stage, deadline: iso(deadline), opensAt: iso(opensAt), endsOn: contract.ends_on, daysToDeadline: daysUntil(iso(deadline)), daysToEnd: daysUntil(contract.ends_on) };
}
export function needsRenewalAttention(contract) {
  return ['window', 'past_notice'].includes(renewalStage(contract).stage);
}
