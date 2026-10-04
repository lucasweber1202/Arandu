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
const iconSprite = new URL('./icons.svg', import.meta.url).href;
const SVG = 'http://www.w3.org/2000/svg';
const ICONS = Object.fromEntries(["home","inbox","file","check","checkCircle","layers","briefcase","users","settings","bell","search","plus","chevronRight","chevronDown","chevronUp","chevronLeft","alert","clock","lock","eye","message","at","calendar","refresh","x","menu","arrowRight","download","send","building","repeat","more","scale","flag","info","edit","reply","shield","swap","tasks","logout","sparkles"].map(name => [name, iconSprite + '#' + name]));

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
  const source = Object.hasOwn(ICONS, name) ? ICONS[name] : ICONS.info;
  if (typeof source === 'string') {
    const use = document.createElementNS(SVG, 'use');
    use.setAttribute('href', source);
    svg.append(use);
    return svg;
  }
  for (const d of source) {
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
