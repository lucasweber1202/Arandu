import assert from 'node:assert/strict';
import {
  inspectEmailConfiguration,
  listTransactionalTemplates,
  renderTransactionalEmail,
  sendTransactionalEmail
} from '../lib/email.mjs';
import { dispatchTransactionalOutbox, prepareFinancialEmail } from '../lib/email-outbox.mjs';

const original = {
  provider: process.env.ARANDU_EMAIL_PROVIDER,
  ready: process.env.ARANDU_TRANSACTIONAL_EMAIL_READY,
  from: process.env.ARANDU_EMAIL_FROM,
  replyTo: process.env.ARANDU_EMAIL_REPLY_TO,
  key: process.env.RESEND_API_KEY,
  hmac: process.env.ARANDU_RECIPIENT_HMAC_SECRET
};

function restore(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

try {
  const templates = listTransactionalTemplates();
  assert.equal(templates.length, 23);
  assert.equal(templates.includes('finance_provider_invite'), true);
  const financial = renderTransactionalEmail('finance_provider_invite', {
    buyer: 'Empresa Exemplo', product: 'crédito empresarial', deadline: '2026-10-01',
    link: 'https://arandu.example/provider/invite.html#token=' + 'a'.repeat(64)
  });
  assert.match(financial.text, /Empresa Exemplo/);
  assert.match(financial.text, /#token=/);
  assert.equal(financial.html.includes('<script>'), false);
  const inviteRef = '00000000-0000-4000-8000-00000000cb02';
  const prepared = await prepareFinancialEmail({
    template: 'finance_provider_invite',
    payload: { buyer: 'Empresa Exemplo', product: 'credit', invite_ref: inviteRef }
  }, {
    baseUrl: 'https://arandu.example',
    resolveInviteToken: async (ref) => {
      assert.equal(ref, inviteRef);
      return 'a'.repeat(64);
    }
  });
  const readyEmail = renderTransactionalEmail('finance_provider_invite', prepared);
  assert.match(readyEmail.text, /#token=/);
  assert.ok(!readyEmail.text.includes('?token='));
  assert.ok(!JSON.stringify({ invite_ref: inviteRef }).includes('a'.repeat(64)));
  for (const template of ['order_created', 'order_confirmed', 'payment_confirmed', 'order_shipped', 'order_delivered', 'order_completed', 'order_cancelled', 'order_refunded']) {
    assert.equal(templates.includes(template), true);
  }

  const escaped = renderTransactionalEmail('order_shipped', {
    orderNumber: '<pedido>',
    trackingCode: '<script>alert(1)</script>'
  });
  assert.equal(escaped.html.includes('<script>'), false);
  assert.equal(escaped.html.includes('&lt;pedido&gt;'), true);

  process.env.ARANDU_EMAIL_PROVIDER = 'disabled';
  delete process.env.ARANDU_TRANSACTIONAL_EMAIL_READY;
  const disabledConfig = inspectEmailConfiguration();
  assert.equal(disabledConfig.safeToTest, true);
  let sendCalled = false;
  const disabledDispatch = await dispatchTransactionalOutbox({
    send: async () => { sendCalled = true; return { delivered: true }; }
  });
  assert.equal(disabledDispatch.reason, 'disabled');
  assert.equal(disabledDispatch.processed, 0);
  assert.equal(sendCalled, false);

  process.env.ARANDU_EMAIL_PROVIDER = 'resend';
  process.env.ARANDU_TRANSACTIONAL_EMAIL_READY = 'true';
  process.env.ARANDU_EMAIL_FROM = 'no-reply@arandu.test.br';
  process.env.ARANDU_EMAIL_REPLY_TO = 'contato@arandu.test.br';
  process.env.RESEND_API_KEY = 're_test_key_1234567890';
  process.env.ARANDU_RECIPIENT_HMAC_SECRET = 'test-recipient-hmac-secret-at-least-32-characters';
  const resendConfig = inspectEmailConfiguration();
  assert.equal(resendConfig.ready, true);

  let outboundBody = null;
  let outboundHeaders = null;
  const delivered = await sendTransactionalEmail({
    template: 'order_created',
    to: 'buyer@example.com',
    data: { orderNumber: 'ARANDU-20260807-ABC123' },
    idempotencyKey: 'email-test-order-created',
    fetchImpl: async (_url, options) => {
      outboundBody = JSON.parse(options.body);
      outboundHeaders = options.headers;
      return new Response(JSON.stringify({ id: 'email-provider-ref-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });
  assert.equal(delivered.delivered, true);
  assert.equal(delivered.providerReference, 'email-provider-ref-1');
  assert.match(delivered.event.recipientRef, /^v1:[0-9a-f]{24}$/);
  assert.equal(JSON.stringify(delivered).includes('buyer@example.com'), false);
  assert.deepEqual(outboundBody.to, ['buyer@example.com']);
  assert.equal(outboundHeaders['Idempotency-Key'], 'email-test-order-created');

  console.log('Arandu Transactional Email & Outbox Tests');
  console.log('Templates, escaping, disabled-by-default e provider reference validados.');
} finally {
  restore('ARANDU_EMAIL_PROVIDER', original.provider);
  restore('ARANDU_TRANSACTIONAL_EMAIL_READY', original.ready);
  restore('ARANDU_EMAIL_FROM', original.from);
  restore('ARANDU_EMAIL_REPLY_TO', original.replyTo);
  restore('RESEND_API_KEY', original.key);
  restore('ARANDU_RECIPIENT_HMAC_SECRET', original.hmac);
}
