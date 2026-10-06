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
  assert.equal(templates.length, 9);
  assert.equal(templates.includes('finance_notification'), true);
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
  // Aviso por preferência: link só para tela do portal, sem conteúdo do processo.
  const notice = await prepareFinancialEmail({ template: 'finance_notification',
    payload: { kind: 'approval', event: 'approval_requested', path: '/finance/rfq.html?id=00000000-0000-4000-8000-00000000cb03', title: 'Capital de giro R$ 3 mi' } },
  { baseUrl: 'https://arandu.example' });
  assert.deepEqual(Object.keys(notice).sort(), ['kind', 'link']);
  const noticeEmail = renderTransactionalEmail('finance_notification', notice);
  assert.match(noticeEmail.subject, /aprovação/);
  assert.match(noticeEmail.text, /https:\/\/arandu\.example\/finance\/rfq\.html\?id=/);
  assert.doesNotMatch(noticeEmail.text, /Capital de giro|R\$/);
  // Os quatro tipos com e-mail: assunto próprio e link para a tela certa, inclusive o contrato com âncora.
  for (const [kind, path, subject] of [
    ['mention', '/finance/rfq.html?id=00000000-0000-4000-8000-00000000cb03', /mencionado/],
    ['proposal', '/finance/rfq.html?id=00000000-0000-4000-8000-00000000cb03', /proposta/],
    ['renewal_due', '/finance/contracts.html#contract-00000000-0000-4000-8000-00000000cb04', /renovação/]
  ]) {
    const email = renderTransactionalEmail('finance_notification', await prepareFinancialEmail({ template: 'finance_notification', payload: { kind, path } }, { baseUrl: 'https://arandu.example' }));
    assert.match(email.subject, subject);
    assert.ok(email.text.includes(`https://arandu.example${path}`), `${kind}: link incorreto`);
  }
  for (const path of ['https://evil.example/x', '//evil.example', '/finance/../admin.html', 'javascript:alert(1)']) {
    await assert.rejects(prepareFinancialEmail({ template: 'finance_notification', payload: { kind: 'mention', path } }, { baseUrl: 'https://arandu.example' }), /invalid_notification_path/);
  }
  await assert.rejects(prepareFinancialEmail({ template: 'finance_notification', payload: { kind: 'mention', path: '/finance/notifications.html' } }, { baseUrl: 'http://insecure.example' }), /base_url/);
  // Só modelos financeiros: os da antiga vertical de arte não renderizam.
  assert.ok(templates.length > 0 && templates.every((template) => template.startsWith('finance_')));
  for (const retired of ['order_created', 'order_shipped', 'reservation_received', 'proposal_received', 'contact_received', 'admin_alert']) {
    assert.equal(templates.includes(retired), false);
    assert.throws(() => renderTransactionalEmail(retired, {}), /desconhecido/);
  }

  const escaped = renderTransactionalEmail('finance_member_invite', {
    organization: '<script>alert(1)</script>', role: 'viewer', link: 'https://arandu.example/x'
  });
  assert.equal(escaped.html.includes('<script>'), false);
  assert.equal(escaped.html.includes('&lt;script&gt;'), true);

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
    template: 'finance_member_invite',
    to: 'buyer@example.com',
    data: { organization: 'Grupo Teste', role: 'viewer', link: 'https://arandu.example/x' },
    idempotencyKey: 'email-test-member-invite',
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
  const malformed = await sendTransactionalEmail({ template: 'finance_member_invite', to: 'fixture@example.invalid', data: { organization: 'Grupo', role: 'viewer', link: 'https://arandu.example/x' }, fetchImpl: async () => Response.json({}) });
  assert.equal(malformed.delivered, false);
  assert.equal(malformed.reason, 'invalid_response');
  assert.equal(delivered.providerReference, 'email-provider-ref-1');
  assert.match(delivered.event.recipientRef, /^v1:[0-9a-f]{24}$/);
  assert.equal(JSON.stringify(delivered).includes('buyer@example.com'), false);
  assert.deepEqual(outboundBody.to, ['buyer@example.com']);
  assert.equal(outboundHeaders['Idempotency-Key'], 'email-test-member-invite');

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
