#!/usr/bin/env node
// Capturas do site público SEMPRE a partir do produto real com dados
// fictícios da Demo canônica (Guideline v3.3 §35.12; Constitution §14). Gera
// recortes em site/*.png que o site exibe com o selo "Demonstração · dados
// fictícios". Nunca rodar contra Production ou com dados de cliente.
//
//   npm run demo:setup && set -a; . scripts/pilot-local/.state/demo.env; set +a
//   node scripts/design/capture-marketing.mjs
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = process.env.ARANDU_DEMO_APP_URL || 'https://localhost:4443';
if (!/^https:\/\/localhost(:\d+)?$/.test(base) && process.env.ARANDU_MARKETING_CAPTURE_CONFIRM !== 'demo') {
  console.error('Capturas de marketing só da Demo canônica local (ou ARANDU_MARKETING_CAPTURE_CONFIRM=demo para a Demo hospedada).');
  process.exit(2);
}
const password = process.env.ARANDU_DEMO_PASSWORD;
if (!password) { console.error('Defina ARANDU_DEMO_PASSWORD.'); process.exit(2); }
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
// Sessão já salva (storageState) evita logins repetidos: o login tem limite legítimo.
const storageState = process.env.ARANDU_CAPTURE_STATE || undefined;
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, ignoreHTTPSErrors: true, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', reducedMotion: 'reduce', storageState });
const page = await context.newPage();
if (!storageState) {
  await page.goto(`${base}/login.html`);
  await page.getByLabel('E-mail corporativo').fill('juliana.ramos@vittafoods.example');
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL(/\/finance\//);
}
await mkdir('site', { recursive: true });
// O limite de requisições da API real é legítimo: tela de erro espera e tenta de novo.
const settle = async () => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.waitForLoadState('networkidle').catch(() => null);
    await page.waitForTimeout(900);
    const failed = await page.evaluate(() => /Não foi possível carregar|Muitas tentativas/.test(document.querySelector('#view')?.textContent || ''));
    if (!failed) return;
    await page.waitForTimeout(35000);
    await page.reload();
  }
  throw new Error('A Demo respondeu com erro em três tentativas; captura abortada.');
};
async function shot(path, selector, file) {
  await page.goto(`${base}${path}`);
  await settle();
  const target = page.locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  await target.screenshot({ path: `site/${file}.png` });
  console.log(`site/${file}.png ← ${path} ${selector}`);
}
// Início: lista de trabalho com motivo, prazo e ação.
await shot('/finance/dashboard.html', '.card:has(h2:text("Precisa de você"))', 'workspace');
// Comparação factual da solicitação em avaliação.
await page.goto(`${base}/finance/dashboard.html`);
await page.waitForFunction(() => Array.isArray(window.__aranduCtx?.data?.rfqs));
const rfq = await page.evaluate(() => window.__aranduCtx.data.rfqs.find((row) => row.status === 'comparing')?.id);
if (rfq) {
  await page.goto(`${base}/finance/rfq.html?id=${rfq}#comparacao`);
  await settle();
  await page.locator('#tab-comparacao, [role=tab]:has-text("Comparação")').first().click().catch(() => null);
  await settle();
  // A grade rola dentro da tela; para a captura, mostra a tabela inteira.
  await page.evaluate(() => { const box = document.querySelector('.matrix-scroll'); if (box) box.style.maxHeight = 'none'; document.querySelector('.topbar')?.style.setProperty('position', 'static'); });
  const matrix = page.locator('.matrix-scroll').first();
  await matrix.scrollIntoViewIfNeeded();
  await matrix.screenshot({ path: 'site/comparison.png' });
  console.log('site/comparison.png ← comparação');
}
// Contrato vivo: linha do tempo de renovação e próxima ação.
await shot('/finance/contracts.html', '.contract-card', 'contract');
await browser.close();
// Converta para WebP (o site usa .webp): for f in site/*.png; do convert "$f" -quality 82 "${f%.png}.webp"; done
