import { createHmac } from 'node:crypto';
import { TEMPLATES as FINANCIAL_TEMPLATES } from './finance/email-templates.mjs';

const PROVIDERS = new Set(['disabled', 'mock', 'resend']);
const MAX_SUBJECT = 180;
const MAX_BODY = 12000;

const clean = (value, max = 500) => String(value ?? '')
  .replace(/[\r\n\t]/g, ' ')
  .trim()
  .slice(0, max);

const escapeHtml = (value) => clean(value, 4000)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value, 254));

function recipientRef(email, env = process.env) {
  const secret = clean(env.ARANDU_RECIPIENT_HMAC_SECRET, 1000);
  const version = clean(env.ARANDU_RECIPIENT_HMAC_VERSION || 'v1', 20);
  if (secret.length < 32) return null;
  const digest = createHmac('sha256', secret).update(clean(email, 254).toLowerCase()).digest('hex').slice(0, 24);
  return `${version}:${digest}`;
}

// Só os avisos do procurement financeiro (lib/finance/email-templates.mjs). Os
// modelos de reserva, pedido e proposta curatorial da vertical de arte foram
// aposentados (docs/LEGACY_ART_RETIREMENT.md): uma linha antiga da fila com
// esses nomes falha ao renderizar e vai para retry/dead, sem envio.
export function listTransactionalTemplates() {
  return Object.keys(FINANCIAL_TEMPLATES).map(name => 'finance_' + name);
}

export function renderTransactionalEmail(template, data = {}) {
  if (String(template).startsWith('finance_')) {
    const financial = FINANCIAL_TEMPLATES[String(template).slice(8)];
    if (!financial) throw new Error('Template financeiro desconhecido.');
    const subject = clean(financial.subject(data), MAX_SUBJECT);
    const body = clean(financial.body(data), MAX_BODY);
    return { subject, text: body, html: '<p>' + escapeHtml(body).replace(/\n/g, '<br>') + '</p>' };
  }
  throw new Error('Template transacional desconhecido.');
}

export function inspectEmailConfiguration(env = process.env) {
  const provider = clean(env.ARANDU_EMAIL_PROVIDER || 'disabled', 30).toLowerCase();
  const from = clean(env.ARANDU_EMAIL_FROM, 254);
  const replyTo = clean(env.ARANDU_EMAIL_REPLY_TO, 254);
  const readyFlag = ['1', 'true', 'yes', 'sim'].includes(clean(env.ARANDU_TRANSACTIONAL_EMAIL_READY).toLowerCase());
  const problems = [];
  if (!PROVIDERS.has(provider)) problems.push('ARANDU_EMAIL_PROVIDER inválido.');
  if (provider === 'resend') {
    if (!validEmail(from)) problems.push('ARANDU_EMAIL_FROM inválido.');
    if (replyTo && !validEmail(replyTo)) problems.push('ARANDU_EMAIL_REPLY_TO inválido.');
    if (clean(env.RESEND_API_KEY, 1000).length < 12) problems.push('RESEND_API_KEY ausente.');
    if (clean(env.ARANDU_RECIPIENT_HMAC_SECRET, 1000).length < 32) problems.push('ARANDU_RECIPIENT_HMAC_SECRET ausente ou curto.');
    if (!readyFlag) problems.push('ARANDU_TRANSACTIONAL_EMAIL_READY não está aprovado.');
  }
  return {
    provider,
    from: validEmail(from) ? from : null,
    replyTo: validEmail(replyTo) ? replyTo : null,
    ready: provider === 'resend' && problems.length === 0,
    safeToTest: provider === 'disabled' || provider === 'mock',
    problems
  };
}

export async function sendTransactionalEmail({ template, to, data = {}, idempotencyKey = '', fetchImpl = globalThis.fetch } = {}) {
  if (!validEmail(to)) throw new Error('Destinatário inválido.');
  const rendered = renderTransactionalEmail(template, data);
  const config = inspectEmailConfiguration();
  const event = {
    provider: config.provider,
    template: clean(template, 80),
    recipientRef: recipientRef(to)
  };

  if (config.provider === 'disabled') return { delivered: false, reason: 'disabled', event };
  if (config.provider === 'mock') return { delivered: false, reason: 'mock', event, rendered };
  if (!config.ready) return { delivered: false, reason: 'unconfigured', event, problems: config.problems };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${clean(process.env.RESEND_API_KEY, 1000)}`,
        'Content-Type': 'application/json',
        ...(clean(idempotencyKey, 256) ? { 'Idempotency-Key': clean(idempotencyKey, 256) } : {})
      },
      body: JSON.stringify({
        from: config.from,
        to: [clean(to, 254)],
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        ...(config.replyTo ? { reply_to: config.replyTo } : {})
      }),
      signal: controller.signal
    });
    const responseBody = await response.json().catch(() => ({}));
    const valid = typeof responseBody?.id === 'string' && responseBody.id.length > 0 && responseBody.id.length <= 160;
    return {
      delivered: response.ok && valid,
      reason: response.ok ? valid ? null : 'invalid_response' : `http_${response.status}`,
      providerReference: response.ok ? clean(responseBody?.id, 160) || null : null,
      event
    };
  } catch (error) {
    return {
      delivered: false,
      reason: error?.name === 'AbortError' ? 'timeout' : 'network_error',
      providerReference: null,
      event
    };
  } finally {
    clearTimeout(timeout);
  }
}
