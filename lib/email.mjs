import { createHash } from 'node:crypto';

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

function recipientRef(email) {
  return createHash('sha256').update(clean(email, 254).toLowerCase()).digest('hex').slice(0, 16);
}

const TEMPLATE_BUILDERS = Object.freeze({
  reservation_received: ({ artwork = 'obra selecionada' } = {}) => ({
    subject: 'Recebemos sua solicitação de reserva',
    text: `Recebemos sua solicitação de reserva para ${clean(artwork, 160)}. A curadoria confirmará disponibilidade, valor e condições antes de qualquer pagamento.`,
    html: `<p>Recebemos sua solicitação de reserva para <strong>${escapeHtml(artwork)}</strong>.</p><p>A curadoria confirmará disponibilidade, valor e condições antes de qualquer pagamento.</p>`
  }),
  reservation_confirmed: ({ artwork = 'obra selecionada', expiresAt = '' } = {}) => ({
    subject: 'Sua reserva foi confirmada',
    text: `A reserva de ${clean(artwork, 160)} foi confirmada.${expiresAt ? ` Prazo: ${clean(expiresAt, 80)}.` : ''}`,
    html: `<p>A reserva de <strong>${escapeHtml(artwork)}</strong> foi confirmada.</p>${expiresAt ? `<p>Prazo: ${escapeHtml(expiresAt)}</p>` : ''}`
  }),
  reservation_expired: ({ artwork = 'obra selecionada' } = {}) => ({
    subject: 'Sua reserva expirou',
    text: `A reserva de ${clean(artwork, 160)} expirou. Se ainda houver interesse, faça uma nova solicitação para confirmarmos a disponibilidade.`,
    html: `<p>A reserva de <strong>${escapeHtml(artwork)}</strong> expirou.</p><p>Se ainda houver interesse, faça uma nova solicitação para confirmarmos a disponibilidade.</p>`
  }),
  proposal_received: () => ({
    subject: 'Recebemos seu pedido de proposta',
    text: 'Recebemos seu pedido de proposta curatorial. A equipe da Arandu fará a revisão antes de responder.',
    html: '<p>Recebemos seu pedido de proposta curatorial.</p><p>A equipe da Arandu fará a revisão antes de responder.</p>'
  }),
  proposal_updated: ({ reference = '' } = {}) => ({
    subject: 'Sua proposta foi atualizada',
    text: `Sua proposta Arandu foi atualizada.${reference ? ` Referência: ${clean(reference, 100)}.` : ''}`,
    html: `<p>Sua proposta Arandu foi atualizada.</p>${reference ? `<p>Referência: ${escapeHtml(reference)}</p>` : ''}`
  }),
  contact_received: () => ({
    subject: 'Recebemos seu contato',
    text: 'Sua mensagem foi recebida pela Arandu. Retornaremos pelo canal informado.',
    html: '<p>Sua mensagem foi recebida pela Arandu.</p><p>Retornaremos pelo canal informado.</p>'
  }),
  order_created: ({ orderNumber = 'pedido Arandu' } = {}) => ({
    subject: 'Seu pedido Arandu foi criado',
    text: `O ${clean(orderNumber, 120)} foi criado a partir da sua reserva confirmada. Acompanhe pagamento, preparação, envio e certificado na sua conta.`,
    html: `<p>O <strong>${escapeHtml(orderNumber)}</strong> foi criado a partir da sua reserva confirmada.</p><p>Acompanhe pagamento, preparação, envio e certificado na sua conta.</p>`
  }),
  payment_confirmed: ({ orderNumber = 'pedido Arandu' } = {}) => ({
    subject: 'Pagamento confirmado',
    text: `O pagamento do ${clean(orderNumber, 120)} foi confirmado. A Arandu seguirá com a preparação e a logística da obra.`,
    html: `<p>O pagamento do <strong>${escapeHtml(orderNumber)}</strong> foi confirmado.</p><p>A Arandu seguirá com a preparação e a logística da obra.</p>`
  }),
  order_shipped: ({ orderNumber = 'pedido Arandu', trackingCode = '' } = {}) => ({
    subject: 'Sua obra foi enviada',
    text: `O ${clean(orderNumber, 120)} foi enviado.${trackingCode ? ` Rastreio: ${clean(trackingCode, 160)}.` : ''}`,
    html: `<p>O <strong>${escapeHtml(orderNumber)}</strong> foi enviado.</p>${trackingCode ? `<p>Rastreio: <strong>${escapeHtml(trackingCode)}</strong></p>` : ''}`
  }),
  admin_alert: ({ event = 'evento operacional', requestId = '' } = {}) => ({
    subject: 'Alerta operacional Arandu',
    text: `Evento: ${clean(event, 160)}.${requestId ? ` Request ID: ${clean(requestId, 80)}.` : ''}`,
    html: `<p>Evento: <strong>${escapeHtml(event)}</strong></p>${requestId ? `<p>Request ID: <code>${escapeHtml(requestId)}</code></p>` : ''}`
  })
});

export function listTransactionalTemplates() {
  return Object.keys(TEMPLATE_BUILDERS);
}

export function renderTransactionalEmail(template, data = {}) {
  const builder = TEMPLATE_BUILDERS[clean(template, 80)];
  if (!builder) throw new Error('Template transacional desconhecido.');
  const rendered = builder(data);
  return {
    subject: clean(rendered.subject, MAX_SUBJECT),
    text: clean(rendered.text, MAX_BODY),
    html: String(rendered.html || '').slice(0, MAX_BODY)
  };
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

export async function sendTransactionalEmail({ template, to, data = {}, fetchImpl = globalThis.fetch } = {}) {
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
        'Content-Type': 'application/json'
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
    return {
      delivered: response.ok,
      reason: response.ok ? null : `http_${response.status}`,
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
