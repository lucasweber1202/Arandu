import assert from 'node:assert/strict';
import {
  inspectEmailConfiguration,
  listTransactionalTemplates,
  renderTransactionalEmail,
  sendTransactionalEmail
} from '../lib/email.mjs';
import { dispatchTransactionalOutbox } from '../lib/email-outbox.mjs';

const original = {
  provider: process.env.ARANDU_EMAIL_PROVIDER,
  ready: process.env.ARANDU_TRANSACTIONAL_EMAIL_READY,
  from: process.env.ARANDU_EMAIL_FROM,
  replyTo: process.env.ARANDU_EMAIL_REPLY_TO,
  key: process.env.RESEND_API_KEY
};

function restore(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

try {
  const templates = listTransactionalTemplates();
  assert.equal(templates.length, 10);
  for (const template of ['order_created', 'payment_confirmed', 'order_shipped']) {
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
  const resendConfig = inspectEmailConfiguration();
  assert.equal(resendConfig.ready, true);

  let outboundBody = null;
  const delivered = await sendTransactionalEmail({
    template: 'order_created',
    to: 'buyer@example.com',
    data: { orderNumber: 'ARANDU-20260807-ABC123' },
    fetchImpl: async (_url, options) => {
      outboundBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ id: 'email-provider-ref-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });
  assert.equal(delivered.delivered, true);
  assert.equal(delivered.providerReference, 'email-provider-ref-1');
  assert.equal(delivered.event.recipientRef.length, 16);
  assert.equal(JSON.stringify(delivered).includes('buyer@example.com'), false);
  assert.deepEqual(outboundBody.to, ['buyer@example.com']);

  console.log('Arandu Transactional Email & Outbox Tests');
  console.log('Templates, escaping, disabled-by-default e provider reference validados.');
} finally {
  restore('ARANDU_EMAIL_PROVIDER', original.provider);
  restore('ARANDU_TRANSACTIONAL_EMAIL_READY', original.ready);
  restore('ARANDU_EMAIL_FROM', original.from);
  restore('ARANDU_EMAIL_REPLY_TO', original.replyTo);
  restore('RESEND_API_KEY', original.key);
}
