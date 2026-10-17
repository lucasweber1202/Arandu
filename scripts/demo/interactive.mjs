// Ensaio da demonstração INTERATIVA (gravações reais) na Demo canônica local.
// Cada operação passa pela interface do produto e só conta como demonstrável se
// o resultado reaparece depois de recarregar a página (persistência no backend).
//
//   npm run demo:setup            # ou npm run demo:local:reset para voltar ao estado inicial
//   set -a; . scripts/pilot-local/.state/demo.env; set +a
//   node scripts/demo/interactive.mjs
//
// ALTERA a Demo (cria e conclui uma tarefa, registra um impedimento de
// implantação, aprova a etapa da CFO). Rode `npm run demo:local:reset` depois.
// Recusa-se a rodar fora do app local (nunca contra Demo hospedada).
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const APP = process.env.ARANDU_DEMO_APP_URL || 'https://localhost:4443';
const PASSWORD = process.env.ARANDU_DEMO_PASSWORD;
const OUT = process.env.DEMO_INTERACTIVE_DIR || 'reports/demo-interactive';
if (!PASSWORD) { console.error('Defina ARANDU_DEMO_PASSWORD (scripts/pilot-local/.state/demo.env).'); process.exit(2); }
if (!/^https:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(APP)) { console.error('Só roda contra a Demo local: as operações gravam dados.'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

const EMAILS = { juliana: 'juliana.ramos@vittafoods.example', helena: 'helena.duarte@vittafoods.example' };
const VIEWPORT = process.env.DEMO_VIEWPORT === 'mobile' ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } };
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const stamp = new Date().toISOString().slice(11, 16).replace(':', 'h');
const results = [];

async function session(who) {
  const context = await browser.newContext({ ...VIEWPORT, ignoreHTTPSErrors: true, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const page = await context.newPage();
  await page.goto(`${APP}/login.html`);
  await page.getByLabel('E-mail corporativo').fill(EMAILS[who]);
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL(/\/finance\//, { timeout: 30000 });
  return { context, page };
}
const settle = async (page) => { await page.waitForLoadState('networkidle').catch(() => null); await page.waitForTimeout(700); };
async function step(name, page, fn) {
  const row = { name, ok: false, detail: '' };
  try { row.detail = await fn(); row.ok = true; } catch (error) { row.detail = String(error.message).split('\n')[0]; }
  await page.screenshot({ path: `${OUT}/${results.length + 1}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png` }).catch(() => null);
  results.push(row);
  console.log(`${row.ok ? 'PASS' : 'FAIL'}  ${name} — ${row.detail}`);
}

// 1–2. Tarefa: criar com responsável e concluir (Juliana, gestora).
const j = await session('juliana');
const title = `Pedir à Lumina o cronograma de remessa dos terminais (${stamp})`;
await step('Criar tarefa com responsável', j.page, async () => {
  await j.page.goto(`${APP}/finance/tasks.html`); await settle(j.page);
  const form = j.page.locator('#task-new');
  await form.getByLabel(/^Nova tarefa/).fill(title);
  await form.getByLabel(/^Responsável/).selectOption({ label: 'Rafael Menezes' });
  await form.getByRole('button', { name: 'Adicionar' }).click();
  await j.page.getByText('Tarefa criada.').waitFor();
  await j.page.reload(); await settle(j.page);
  const row = j.page.locator('.task-item', { hasText: title });
  await row.waitFor();
  const owner = await row.locator('select.task-assignee option:checked').innerText();
  if (owner !== 'Rafael Menezes') throw new Error(`responsável depois de recarregar: ${owner}`);
  return 'reaparece após recarregar com Rafael Menezes';
});
await step('Concluir a tarefa', j.page, async () => {
  const row = j.page.locator('.task-item', { hasText: title });
  await row.getByRole('checkbox').click();
  await j.page.getByText('Tarefa concluída.').waitFor();
  await j.page.goto(`${APP}/finance/tasks.html?filtro=concluidas`); await settle(j.page);
  await j.page.locator('.task-item', { hasText: title }).waitFor();
  return 'aparece em Concluídas após recarregar';
});

// 3. Implantação: registrar impedimento no plano da Lumina.
const issue = `Transportadora sem data para os 60 terminais (${stamp})`;
await step('Registrar impedimento na implantação', j.page, async () => {
  await j.page.goto(`${APP}/finance/implementations.html`); await settle(j.page);
  await j.page.getByRole('button', { name: 'Detalhe' }).first().click();
  await j.page.getByRole('dialog').getByRole('button', { name: 'Registrar impedimento' }).click();
  const form = j.page.getByRole('dialog').last();
  await form.getByLabel('Impedimento').fill(issue);
  const due = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  await form.getByLabel('Resolver até').fill(due);
  await form.getByRole('button', { name: 'Registrar' }).click();
  await j.page.getByRole('dialog').last().waitFor({ state: 'detached', timeout: 10000 }).catch(() => null);
  await j.page.reload(); await settle(j.page);
  await j.page.getByRole('button', { name: 'Detalhe' }).first().click();
  await j.page.getByRole('dialog').getByText(issue).first().waitFor();
  return 'impedimento aparece no detalhe após recarregar';
});
await j.context.close();

// 4. Aprovação: a CFO aprova a etapa pendente da nova linha de capital de giro.
const h = await session('helena');
await step('CFO aprova a etapa pendente', h.page, async () => {
  await h.page.goto(`${APP}/finance/approvals.html`); await settle(h.page);
  const row = h.page.locator('.inbox-row.mine').first();
  await row.waitFor();
  const what = await row.locator('.inbox-title').innerText();
  await row.getByRole('button', { name: 'Aprovar' }).click();
  await h.page.getByRole('dialog', { name: 'Aprovar esta proposta?' }).getByRole('button', { name: 'Aprovar' }).click();
  await h.page.getByText(/Aprovação registrada/).waitFor();
  await h.page.goto(`${APP}/finance/approvals.html#concluidas`); await settle(h.page);
  await h.page.getByRole('tab', { name: /Concluídas/ }).click();
  await h.page.locator('.inbox-row', { hasText: what }).first().waitFor();
  return `"${what}" passa para Concluídas após recarregar`;
});
await h.context.close();

// 5. O efeito aparece para quem conduz: o Painel da Juliana passa a pedir o registro da decisão.
const j2 = await session('juliana');
await step('Painel da gestora reflete a aprovação', j2.page, async () => {
  await settle(j2.page);
  const item = j2.page.locator('#precisa-de-voce .action-row', { hasText: 'Registrar decisão' });
  await item.first().waitFor();
  return (await item.first().locator('.action-title').innerText());
});
await j2.context.close();
await browser.close();
fs.writeFileSync(`${OUT}/result.json`, `${JSON.stringify(results, null, 2)}\n`);
const failed = results.filter((row) => !row.ok).length;
console.log(`${results.length - failed}/${results.length} operações persistidas e verificadas. Rode npm run demo:local:reset antes da apresentação.`);
process.exit(failed ? 1 : 0);
