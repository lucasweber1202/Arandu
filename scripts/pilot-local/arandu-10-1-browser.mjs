// Arandu 10.1 — jornada de NAVEGADOR REAL contra a stack local descartável
// (API do repositório + Auth/PostgREST/Storage/PostgreSQL locais). Sem mocks de
// rota. Usuários e dados sintéticos; recusa qualquer alvo fora de loopback.
// Uso: bash scripts/pilot-local/arandu-10-1-browser.sh (após up.sh).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { localDemoCertificateArgs } from '../ci-demo/browser-tls.mjs';

const APP = process.env.PILOT_APP_URL || 'https://localhost:4443', SB = process.env.SUPABASE_URL, DB = process.env.PILOT_DB_URL;
for (const value of [APP, SB, DB]) assert(value && ['localhost', '127.0.0.1'].includes(new URL(value).hostname), 'loopback local fixture only');
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const run = randomBytes(4).toString('hex'), password = `A101-${randomBytes(16).toString('hex')}`;
const sql = (q) => execFileSync('psql', [DB, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8' }).trim();
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
let checks = 0;
const ok = (value, message) => { assert(value, message); checks++; };

async function api(who, method, path, body, expected = 200) {
  const response = await fetch(`${APP}/api/${path}`, { method, headers: { Origin: APP, 'Content-Type': 'application/json', ...(who?.cookie ? { Cookie: who.cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  const cookie = response.headers.getSetCookie().find((c) => c.startsWith('arandu_session=')); if (who && cookie) who.cookie = cookie.split(';')[0];
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`); return data;
}
const people = {};
for (const name of ['buyer', 'viewer', 'bankA', 'bankB']) {
  const email = `a101-${name}-${run}@example.invalid`;
  const response = await fetch(`${SB}/auth/v1/admin/users`, { method: 'POST', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, email_confirm: true }) });
  assert(response.ok, 'synthetic user provisioning'); people[name] = { id: (await response.json()).id };
  sql(`insert into public.fin_pilot_allowlist(pattern,created_by,note) values('${email}','${people[name].id}','Synthetic loopback Arandu 10.1 browser journey')`);
  await api(people[name], 'POST', 'auth/login', { email, password });
}
const { buyer, viewer } = people;
const org = (await api(buyer, 'POST', 'finance/organizations', { legal_name: `A101 ${run}`, kind: 'BUYER' }, 201)).id;
sql(`insert into public.fin_members(organization_id,user_id,role) values('${org}','${viewer.id}','viewer')`);
// RFQ com duas propostas reais de instituições (para o estúdio montar).
const rfq = (await api(buyer, 'POST', 'finance/rfqs', { organization_id: org, product: 'credit', title: `A101 comparação ${run}`, demand: { amount: 80000, purpose: 'capital_de_giro', term_months: 12 } }, 201)).id;
const proposals = [];
for (const [index, who] of [['1', people.bankA], ['2', people.bankB]]) {
  const institutionOrg = (await api(who, 'POST', 'finance/organizations', { legal_name: `A101 banco ${index} ${run}`, kind: 'PROVIDER' }, 201)).id;
  const provider = (await api(buyer, 'POST', 'finance/providers', { organization_id: org, name: `A101 Banco ${index}`, kind: 'bank' }, 201)).id;
  const invite = randomUUID(), proposal = randomUUID();
  sql(`update public.fin_rfqs set status='collecting' where id='${rfq}';
   insert into public.fin_rfq_invites(id,buyer_organization_id,rfq_id,provider_id,provider_organization_id,token_hash,created_by,status,recipient_mode)
   values('${invite}','${org}','${rfq}','${provider}','${institutionOrg}','${randomBytes(32).toString('hex')}','${buyer.id}','accepted','organization_open');
   insert into public.fin_proposals(id,invite_id,rfq_id,buyer_organization_id,provider_id,provider_organization_id,product)
   values('${proposal}','${invite}','${rfq}','${org}','${provider}','${institutionOrg}','credit')`);
  await api(who, 'POST', 'finance/proposals', { proposal_id: proposal, terms: { institution: `A101 Banco ${index}`, product_name: 'Capital de giro', offered_amount: 80000, interest_rate_month: index === '1' ? 1.4 : 1.2, term_months: index === '1' ? 18 : 12 } }, 201);
  proposals.push({ proposal, provider });
}
const draft = (await api(buyer, 'POST', 'finance/rfqs', { organization_id: org, product: 'credit', title: `A101 rascunho ${run}`, demand: { amount: 1000, purpose: 'capital_de_giro', term_months: 6 } }, 201)).id;
// Rascunho legado/importado sem um campo obrigatório (a API atual não cria assim).
sql(`update public.fin_rfqs set demand = demand - 'amount' where id='${draft}'`);
const contract = (await api(buyer, 'POST', 'finance/contract-import', { organization_id: org, provider_id: proposals[0].provider, product: 'credit', title: 'A101 contrato a renovar', starts_on: day(-200), ends_on: day(20), renewal_notice_days: 30, currency: 'BRL', terms: { currency: 'BRL' } }, 201)).id;

const browser = await chromium.launch({ ...(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {}), args: localDemoCertificateArgs(APP, fs.readFileSync(process.env.NODE_EXTRA_CA_CERTS, 'utf8')) });
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const cookie = (who) => ({ name: 'arandu_session', value: who.cookie.slice('arandu_session='.length), url: APP, httpOnly: true, secure: true, sameSite: 'Lax' });
  await context.addCookies([cookie(buyer)]);
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  const studio = page.locator('#estudio-decisao');

  // 1. Decision Studio: salvar, recarregar, editar com versão, histórico, comparar no servidor, arquivar.
  await page.goto(`${APP}/finance/rfq.html?id=${rfq}#comparacao`);
  await studio.getByText('Nenhum cenário salvo nesta solicitação.').waitFor();
  const name = studio.locator('.studio-scenario').first().locator('input.input').first();
  await name.fill('Taxa real'); await name.dispatchEvent('change');
  await studio.getByRole('slider', { name: /peso de Taxa \(% a\.m\.\)$/ }).first().evaluate((n) => { n.value = '70'; n.dispatchEvent(new Event('input', { bubbles: true })); });
  await studio.getByRole('button', { name: 'Salvar Taxa real' }).click();
  await studio.locator('.scenario-save-state').filter({ hasText: 'Salvo na empresa · versão 1' }).waitFor();
  ok(sql(`select count(*) from public.fin_decision_scenarios where rfq_id='${rfq}'`) === '1', 'cenário persistido no PostgreSQL');
  ok(sql(`select weights::text from public.fin_decision_scenarios where rfq_id='${rfq}'`) === '{"interest_rate_month": 70}', 'somente pesos persistidos');
  await page.reload();
  const saved = studio.locator('.scenario-saved').filter({ hasText: 'Taxa real' });
  await saved.waitFor(); ok((await saved.textContent()).includes('Versão 1'), 'cenário recuperado após reload');
  await saved.getByRole('button', { name: 'Editar Taxa real' }).click();
  await studio.getByRole('slider', { name: /peso de Prazo \(meses\)$/ }).first().evaluate((n) => { n.value = '30'; n.dispatchEvent(new Event('input', { bubbles: true })); });
  await studio.getByRole('button', { name: 'Salvar Taxa real' }).click();
  await studio.locator('.scenario-save-state').filter({ hasText: 'Salvo na empresa · versão 2' }).waitFor();
  ok(sql(`select version from public.fin_decision_scenarios where rfq_id='${rfq}'`) === '2', 'versão 2 no banco');
  // Concorrência real: outra sessão (API) grava a versão 3; a tela recebe 409 e não sobrescreve.
  const id = sql(`select id from public.fin_decision_scenarios where rfq_id='${rfq}'`);
  await api(buyer, 'PATCH', 'finance/decision-scenarios', { id, expected_version: 2, name: 'Taxa real (outra sessão)', weights: { term_months: 50 } });
  await studio.getByRole('slider', { name: /peso de Prazo \(meses\)$/ }).first().evaluate((n) => { n.value = '40'; n.dispatchEvent(new Event('input', { bubbles: true })); });
  await studio.getByRole('button', { name: 'Salvar Taxa real' }).click();
  await studio.locator('.scenario-save-state[role=alert]').waitFor();
  ok(sql(`select name from public.fin_decision_scenarios where id='${id}'`) === 'Taxa real (outra sessão)', '409 real não sobrescreve');
  await studio.getByRole('button', { name: 'Carregar versão atual' }).click();
  await studio.locator('.scenario-save-state').filter({ hasText: 'Salvo · versão 3' }).waitFor(); checks++;
  await studio.getByRole('button', { name: /^Histórico de/ }).first().click();
  await page.getByRole('dialog').locator('.scenario-history-row').nth(2).waitFor();
  ok((await page.getByRole('dialog').locator('.scenario-history-row').count()) === 3, 'histórico real com 3 eventos');
  await page.keyboard.press('Escape');
  await studio.locator('.scenario-saved').getByRole('button', { name: /^Duplicar/ }).click();
  await studio.locator('.scenario-saved').nth(1).waitFor();
  for (const box of await studio.locator('.scenario-saved input[type=checkbox]').all()) await box.check();
  await studio.getByRole('button', { name: 'Comparar 2 selecionado(s)' }).click();
  await studio.locator('.studio-source').filter({ hasText: 'Comparação de cenários salvos' }).waitFor()
    .catch(async (error) => { throw new Error(`comparação: ${await studio.locator('.scenario-library-status').textContent()} | ${await studio.locator('.studio-comparison').textContent()}`, { cause: error }); });
  ok((await studio.locator('.studio-table tbody tr').count()) === 2, 'comparação real do motor com 2 propostas');
  // A primeira versão (taxa sem indexador) foi recusada pelo motor canônico real; a tela mostra o motivo.
  await studio.locator('.scenario-saved').first().getByRole('button', { name: /^Arquivar/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Arquivar' }).click();
  await page.waitForFunction(() => document.querySelectorAll('#estudio-decisao .scenario-saved').length === 1);
  ok(sql(`select count(*) from public.fin_decision_scenarios where rfq_id='${rfq}' and status='archived'`) === '1', 'arquivamento real');

  // 2. Prontidão do rascunho pelo servidor.
  await page.goto(`${APP}/finance/rfq.html?id=${draft}`);
  await page.locator('#prontidao [data-state="incomplete"]').waitFor(); checks++;

  // 3. Caixa de trabalho real: quatro seções sem erro.
  await page.goto(`${APP}/finance/dashboard.html#caixa-de-trabalho`);
  const box = page.locator('#caixa-de-trabalho');
  for (const tab of ['Tarefas', 'Aprovações', 'Demandas', 'Contratos']) {
    await box.getByRole('tab', { name: new RegExp(tab) }).click();
    await box.locator('.work-panel').filter({ hasNotText: 'Carregando…' }).waitFor();
    ok((await box.locator('.section-error').count()) === 0, `seção ${tab} carregou do servidor`);
  }
  await box.getByRole('tab', { name: /Demandas/ }).click();
  ok((await box.locator('.work-row').filter({ hasText: 'A101 rascunho' }).count()) === 1, 'rascunho aparece em Demandas');

  // 4. Plano de renovações real e renovação idempotente pela rota canônica.
  await page.goto(`${APP}/finance/contracts.html?plano=renovacoes`);
  const row = page.locator(`#plano-renovacoes [data-contract="${contract}"]`);
  await row.waitFor(); ok((await row.textContent()).includes('Aviso prévio no prazo'), 'urgência calculada no servidor');
  await row.getByRole('button', { name: /concorrência/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Criar rascunho|Continuar/ }).click();
  await page.waitForURL(new RegExp(`contrato=${contract}`));
  ok(sql(`select count(*) from public.fin_events where entity_id='${contract}' and event_type='renewal_rfq_started'`) === '1', 'uma RFQ de renovação');
  await page.goto(`${APP}/finance/contracts.html?plano=renovacoes`);
  await page.locator(`#plano-renovacoes [data-contract="${contract}"] .renewal-links a`).first().waitFor();
  ok((await page.locator(`#plano-renovacoes [data-contract="${contract}"] .renewal-links`).textContent()).includes('Concorrência de renovação'), 'vínculo da renovação visível');

  // 5. Viewer: estúdio somente leitura; 320 px sem rolagem horizontal.
  await context.clearCookies(); await context.addCookies([cookie(viewer)]);
  await page.goto(`${APP}/finance/rfq.html?id=${rfq}#comparacao`);
  await studio.getByText('Seu papel permite consultar e comparar cenários').waitFor();
  ok((await studio.getByRole('button', { name: /^Salvar/ }).count()) === 0, 'viewer sem escrita');
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(`${APP}/finance/dashboard.html#caixa-de-trabalho`);
  await page.locator('#caixa-de-trabalho').waitFor();
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '320 px sem rolagem horizontal');
  ok(!errors.length, `erros de página: ${errors.join(' | ')}`);
} finally { await browser.close(); }
console.log(`Arandu 10.1 navegador real local: ${checks} checks PASS (Decision Studio persistente/409/histórico/comparação/arquivo, prontidão, caixa de trabalho, plano de renovações idempotente, viewer, 320 px).`);
