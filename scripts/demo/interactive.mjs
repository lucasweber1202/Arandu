// Ensaio da demonstração INTERATIVA (gravações reais) na Demo canônica local.
// Cada operação passa pela interface do produto e só conta como demonstrável se
// o resultado reaparece depois de recarregar a página (persistência no backend).
//
//   npm run demo:setup            # ou npm run demo:local:reset para voltar ao estado inicial
//   set -a; . scripts/pilot-local/.state/demo.env; set +a
//   node scripts/demo/interactive.mjs
//
// ALTERA a Demo (cria e conclui uma tarefa, registra um impedimento de
// implantação, aprova a etapa da CFO, envia e revisa a proposta da Meridian na
// concorrência aberta). Rode `npm run demo:local:reset` depois.
// Recusa-se a rodar fora do app local (nunca contra Demo hospedada).
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { RFQ_OPEN } from './dataset.mjs';

const APP = process.env.ARANDU_DEMO_APP_URL || 'https://localhost:4443';
const PASSWORD = process.env.ARANDU_DEMO_PASSWORD;
const OUT = process.env.DEMO_INTERACTIVE_DIR || 'reports/demo-interactive';
if (!PASSWORD) { console.error('Defina ARANDU_DEMO_PASSWORD (scripts/pilot-local/.state/demo.env).'); process.exit(2); }
if (!/^https:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(APP)) { console.error('Só roda contra a Demo local: as operações gravam dados.'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

const EMAILS = { juliana: 'juliana.ramos@vittafoods.example', helena: 'helena.duarte@vittafoods.example',
  patricia: 'patricia.alves@meridianfinancial.example', bruno: 'bruno.sato@orbecapital.example' };
const VIEWPORT = process.env.DEMO_VIEWPORT === 'mobile' ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } };
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const stamp = new Date().toISOString().slice(11, 16).replace(':', 'h');
const results = [];
const LIVE = RFQ_OPEN.liveProposal;

async function session(who) {
  const context = await browser.newContext({ ...VIEWPORT, ignoreHTTPSErrors: true, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const page = await context.newPage();
  // O login tem limite legítimo por IP (12 em 10 min): quando a tela pede espera,
  // o ensaio espera e tenta de novo em vez de contar a falha como defeito.
  for (let attempt = 1; ; attempt += 1) {
    await page.goto(`${APP}/login.html`);
    await page.getByLabel('E-mail corporativo').fill(EMAILS[who]);
    await page.getByLabel('Senha').fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    const entered = await page.waitForURL(/\/(finance|provider)\//, { timeout: 20000 }).then(() => true, () => false);
    if (entered) return { context, page };
    if (attempt >= 12) throw new Error(`login de ${who} não concluído`);
    console.log(`  · login de ${who} aguardando o limite de tentativas (60 s)`);
    await page.waitForTimeout(60_000);
  }
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
// A sessão da Juliana continua aberta (economiza login): o Painel é relido do servidor.
const j2 = j;
await step('Painel da gestora reflete a aprovação', j2.page, async () => {
  await j2.page.goto(`${APP}/finance/dashboard.html`); await settle(j2.page);
  const item = j2.page.locator('#precisa-de-voce .action-row', { hasText: 'Registrar decisão' });
  await item.first().waitFor();
  return (await item.first().locator('.action-title').innerText());
});

// 6–9. Ciclo comprador ↔ instituição na concorrência com coleta aberta (RFQ_OPEN do dataset).
// A Meridian (Patrícia) envia a proposta pelo portal, a Orbe (Bruno) não alcança essa
// proposta nem pelo link direto, a Meridian revisa (versão 2) e a Juliana recebe as duas versões.
const OPEN_TITLE = 'Capital de giro sazonal — safra de inverno (R$ 5 milhões / 12 meses)';
const p = await session('patricia');
let meridianProposal = null;
await step('Instituição envia proposta pelo portal', p.page, async () => {
  await p.page.goto(`${APP}/provider/rfqs.html`); await settle(p.page);
  await p.page.getByRole('link', { name: OPEN_TITLE }).click();
  await p.page.waitForURL(/proposal\.html\?proposal=/); await settle(p.page);
  meridianProposal = new URL(p.page.url()).searchParams.get('proposal');
  const form = p.page.locator('#proposal-form');
  // Validação real: sem os obrigatórios, nada é enviado.
  await form.getByRole('button', { name: 'Revisar e enviar proposta' }).click();
  await form.getByText('Obrigatório para enviar.').first().waitFor();
  const live = LIVE.meridian;
  await form.getByLabel('Produto ofertado').fill('Giro safra — mesa agro');
  await form.getByLabel('Valor ofertado (R$)').fill(live.offered_amount);
  await form.getByLabel('Taxa (% a.m.)').fill(live.interest_rate_month);
  await form.getByLabel('Prazo (meses)').fill(live.term_months);
  await form.locator('summary', { hasText: 'Custo e amortização' }).click();
  await form.getByLabel('CET informado (% a.a.)').fill(live.cet_year);
  await form.getByLabel('Carência (meses)').fill(live.grace_months);
  await form.getByLabel('Nota para a empresa').fill(live.note);
  await form.getByRole('button', { name: 'Revisar e enviar proposta' }).click();
  await p.page.getByRole('dialog', { name: 'Enviar proposta?' }).getByRole('button', { name: 'Enviar proposta' }).click();
  await p.page.getByText('Proposta enviada como versão 1.').waitFor();
  await p.page.waitForLoadState('load'); await p.page.reload(); await settle(p.page);
  await p.page.getByText('Proposta enviada · versão 1').waitFor();
  await p.page.locator('#versao-1').waitFor();
  return 'versão 1 registrada e visível após recarregar';
});

const b = await session('bruno');
await step('Outra instituição não alcança a proposta', b.page, async () => {
  if (!meridianProposal) throw new Error('sem proposta da Meridian para testar');
  await b.page.goto(`${APP}/provider/proposal.html?proposal=${encodeURIComponent(meridianProposal)}`); await settle(b.page);
  await b.page.getByText('Proposta não encontrada').waitFor();
  const text = await b.page.locator('main').innerText();
  for (const leak of ['Meridian', '1,29', 'mesa agro']) if (text.includes(leak)) throw new Error(`a tela da Orbe mostrou "${leak}"`);
  return 'link direto da proposta da Meridian: "Proposta não encontrada", sem condição vazada';
});
await b.context.close();

await step('Instituição revisa e envia a versão 2', p.page, async () => {
  const form = p.page.locator('#proposal-form');
  await form.getByLabel('Taxa (% a.m.)').fill('1.27');
  await form.getByLabel('Nota para a empresa').fill('Versão 2: taxa revista após conversa com a tesouraria (fictício).');
  await form.getByRole('button', { name: 'Revisar e enviar proposta' }).click();
  await p.page.getByRole('dialog', { name: 'Enviar a versão 2?' }).getByRole('button', { name: 'Enviar proposta' }).click();
  await p.page.getByText('Proposta enviada como versão 2.').waitFor();
  await p.page.waitForLoadState('load'); await p.page.reload(); await settle(p.page);
  await p.page.getByText('Proposta enviada · versão 2').waitFor();
  const diff = await p.page.locator('#versao-2').innerText();
  if (!/1,29.*→.*1,27/s.test(diff)) throw new Error(`histórico sem a mudança de taxa: ${diff.slice(0, 120)}`);
  return 'versão 2 com "Taxa: 1,29% → 1,27%" no histórico após recarregar';
});
await p.context.close();

const j3 = j;
await step('Empresa recebe a proposta com versão e origem', j3.page, async () => {
  await j3.page.goto(`${APP}/finance/rfqs.html`); await settle(j3.page);
  await j3.page.getByRole('link', { name: OPEN_TITLE }).first().click();
  await j3.page.waitForURL(/rfq\.html/); await settle(j3.page);
  await j3.page.getByRole('tab', { name: /^Propostas/ }).click();
  const card = j3.page.locator('.proposal-card', { hasText: 'Meridian Financial' });
  await card.waitFor();
  const head = await card.locator('.proposal-head').innerText();
  if (!/versão 2 de 2/.test(head)) throw new Error(`cabeçalho da proposta: ${head}`);
  // Só o painel visível (a aba Visão geral também lista convidados, escondida).
  const waiting = j3.page.locator('[role=tabpanel]:not([hidden]) .card', { has: j3.page.getByRole('heading', { name: 'Ainda sem resposta' }) });
  if (await waiting.count() && (await waiting.innerText()).includes('Meridian')) throw new Error('Meridian continua em "Ainda sem resposta"');
  return `"${head.replace(/\s+/g, ' ').trim()}"`;
});
await j3.context.close();
await browser.close();
fs.writeFileSync(`${OUT}/result.json`, `${JSON.stringify(results, null, 2)}\n`);
const failed = results.filter((row) => !row.ok).length;
console.log(`${results.length - failed}/${results.length} operações persistidas e verificadas. Rode npm run demo:local:reset antes da apresentação.`);
process.exit(failed ? 1 : 0);
