import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '@playwright/test';
import { localDemoCertificateArgs } from '../ci-demo/browser-tls.mjs';
import { prepareFinancialEmail } from '../../lib/email-outbox.mjs';

// Real browser + repository API + local Auth/PostgREST/Storage. No route mocks.
// Receives synthetic sessions in memory, never writes cookies or passwords.
export async function browserJourney({ app, people, ctx, password, certificate, emailPath }) {
  if (new URL(app).hostname !== 'localhost') throw new Error('Browser rehearsal requires disposable loopback');
  const browser = await chromium.launch({ args: localDemoCertificateArgs(app, fs.readFileSync(certificate, 'utf8')) });
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.name));
  const cookie = person => ({ name: 'arandu_session', value: person.cookie.slice('arandu_session='.length), url: app, httpOnly: true, secure: true, sameSite: 'Lax' });
  const read = async (path, id) => {
    const response = await page.request.get(`${app}/api/finance/${path}`);
    assert.equal(response.status(), 200, `real browser API ${path.split('?')[0]}`);
    const data = await response.json();
    if (id) assert.equal(data.contract?.id || data.rfq?.id, id);
    return data;
  };
  try {
    await context.addCookies([cookie(people.buyer)]);
    await page.goto(`${app}/finance/rfqs.html`);
    await page.getByRole('button', { name: 'Próxima página', exact: true }).waitFor();
    const seen = new Set();
    let pages = 0;
    for (;;) {
      await page.locator('.result-count').filter({ hasText: 'nesta página' }).waitFor();
      const ids = await page.locator('tr[data-entity="rfq"]').evaluateAll(nodes => nodes.map(n => n.dataset.id));
      for (const id of ids) { assert(!seen.has(id), 'duplicate RFQ across pages'); seen.add(id); }
      pages++;
      const next = page.getByRole('button', { name: 'Próxima página', exact: true });
      if (await next.isDisabled()) break;
      const changed = page.waitForResponse(r => r.url().includes('/api/finance/rfqs?') && r.request().method() === 'GET');
      await next.click(); await changed;
      await page.waitForFunction(old => document.querySelector('tr[data-entity="rfq"]')?.dataset.id !== old, ids[0]);
      assert(pages < 20, 'unbounded RFQ pagination');
    }
    assert(seen.has(ctx.rfq) && seen.size > 100, 'browser did not traverse the persisted RFQs');
    await page.goto(`${app}/finance/rfq.html?id=${ctx.rfq}`);
    const rfq = await read(`rfq/${ctx.rfq}`, ctx.rfq);
    await page.getByRole('heading', { name: rfq.rfq.title, exact: true }).waitFor();
    const email = await prepareFinancialEmail({ template: 'finance_notification', payload: { kind: 'renewal_due', path: emailPath } }, { baseUrl: app });
    assert(email.link.includes(`?abrir=contrato#contract-${ctx.contract}`));
    await page.goto(email.link);
    await page.getByRole('dialog').waitFor();
    await read(`contract-detail?id=${ctx.contract}`, ctx.contract);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole('dialog').getByRole('button', { name: /Fechar/ }).first().click();
    await page.goto(`${app}/finance/tasks.html`);
    await page.getByRole('heading', { name: /Tarefas/ }).first().waitFor();
    const detail = await read(`contract-detail?id=${ctx.contract}`);
    const institution = await read(`provider-relationship?organization_id=${ctx.buyerOrg}&provider_id=${detail.contract.provider_id}`);
    assert(institution.contracts.some(row => row.id === ctx.contract));
    await context.addCookies([cookie(people.providerA)]);
    await page.goto(`${app}/provider/rfqs.html`);
    await page.getByRole('heading', { name: 'Oportunidades', exact: true }).waitFor();
    const own = await read(`assignments?organization_id=${ctx.orgA}&paged=1`);
    assert(own.rows.some(row => row.rfq_id === ctx.rfq));
    const denied = await page.request.get(`${app}/api/finance/contract-detail?id=${ctx.contract}`);
    assert([403, 404].includes(denied.status()), 'institution accessed another institution contract');
    await context.addCookies([cookie(people.buyer)]);
    const logout = await page.request.post(`${app}/api/auth/logout`, { headers: { Origin: app }, data: {} });
    assert.equal(logout.status(), 200);
    await page.goto(`${app}/login.html?next=${encodeURIComponent(`/finance/contracts.html?abrir=contrato#contract-${ctx.contract}`)}`);
    await page.getByLabel('E-mail corporativo').fill(people.buyer.email);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.locator('form[data-finance-auth="login"] button[type="submit"]').click();
    await page.waitForURL(url => url.pathname.startsWith('/finance/'));
    await page.goto(email.link);
    await page.getByRole('dialog').waitFor();
    await read(`contract-detail?id=${ctx.contract}`, ctx.contract);
    assert.deepEqual(errors, []);
    return `${pages} páginas, ${seen.size} RFQs persistidas; RFQ/Contract 360/tarefas/relacionamento, link renderizado da outbox, isolamento e logout/login com mesmo contrato; Chromium real, sem mocks`;
  } finally { await browser.close(); }
}
