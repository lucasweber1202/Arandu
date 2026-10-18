import {test,expect} from '@playwright/test';
test('persona entry is server-driven and names render as text',async({page})=>{
 const name='<img src=x onerror="window.personaXss=1">';
 await page.route('**/api/auth/demo-personas',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,personas:[{key:'juliana',name,title:'Tesouraria'}]})}));
 await page.route('**/api/auth/demo-login',async r=>{
  expect(r.request().postDataJSON()).toEqual({persona:'juliana'});
  await r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Demonstração indisponível.'})});
 });
 await page.goto('/login.html');
 const panel=page.getByRole('region',{name:'Conheça o Arandu por dentro'});
 await expect(panel.locator('[data-persona="juliana"] .demo-persona-name')).toHaveText(name);
 await expect(panel.locator('[data-persona="juliana"] .demo-persona-meta')).toHaveText('Tesouraria · Vitta Foods');
 await expect(panel.locator('img')).toHaveCount(0);
 await panel.locator('[data-persona="juliana"]').click();
 await expect(panel.getByRole('status')).toHaveText('Demonstração indisponível.');
 expect(await page.evaluate(()=>window.personaXss)).toBeUndefined();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
});
test('no persona capability keeps standard account login',async({page})=>{
 await page.route('**/api/auth/demo-personas',r=>r.fulfill({status:404,body:'{}'}));
 await page.goto('/login.html');
 await expect(page.getByRole('heading',{name:'Entrar na conta'})).toBeVisible();
 await expect(page.locator('#demonstracao')).toHaveCount(0);
});

// ------------------------------------------------------------------------
// Entrada canônica da Demo: escolha de persona com jornada, que entra no
// produto real pelo login do servidor e cai no portal certo.
import { BUYERS, PROVIDERS } from '../../lib/finance/demo-personas.mjs';
import { PERSONA_GUIDE } from '../../financial-demo-entry.js';
import { readFileSync } from 'node:fs';

const SERVER_PERSONAS = [
  ...Object.entries(BUYERS).map(([key, p]) => ({ key, name: p.name, title: p.title })),
  ...Object.entries(PROVIDERS).map(([key, p]) => ({ key, name: p.person.name, title: p.person.title }))
];

test('toda persona do seed tem jornada descrita e o lado certo (comprador × instituição)', () => {
  for (const key of Object.keys(BUYERS)) expect(PERSONA_GUIDE[key]?.side, key).toBe('buyer');
  for (const key of Object.keys(PROVIDERS)) expect(PERSONA_GUIDE[key]?.side, key).toBe('provider');
  for (const key of Object.keys(PERSONA_GUIDE)) expect(Boolean(BUYERS[key] || PROVIDERS[key]), `guia sem persona no seed: ${key}`).toBe(true);
});

async function personaServer(page, { login = () => ({ status: 200, body: { ok: true, authenticated: true } }) } = {}) {
  const posts = [];
  await page.route('**/api/auth/demo-personas', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, personas: SERVER_PERSONAS }) }));
  await page.route('**/api/auth/demo-login', async (r) => {
    posts.push(r.request().postDataJSON());
    const reply = login(posts.length);
    if (reply === 'abort') return r.abort('failed');
    await r.fulfill({ status: reply.status, contentType: 'application/json', headers: reply.headers || {}, body: JSON.stringify(reply.body) });
  });
  // O destino do login é o produto real; aqui só registramos a navegação.
  await page.route('**/finance/dashboard.html', (r) => r.fulfill({ contentType: 'text/html', body: '<h1>Painel</h1>' }));
  await page.route('**/provider/index.html', (r) => r.fulfill({ contentType: 'text/html', body: '<h1>Portal</h1>' }));
  return posts;
}

test('entrada da Demo: comprador e instituições separados, dados fictícios ditos, comprador vai ao Painel', async ({ page }) => {
  const posts = await personaServer(page);
  await page.goto('/login.html#demonstracao');
  const entry = page.getByRole('region', { name: 'Conheça o Arandu por dentro' });
  await expect(entry).toContainText('produto real');
  await expect(entry).toContainText('Dados fictícios');
  await expect(entry).toContainText('Um espaço só seu');
  const buyers = entry.locator('.demo-entry-group', { hasText: 'Empresa compradora' });
  const providers = entry.locator('.demo-entry-group', { hasText: 'Instituições financeiras' });
  await expect(buyers.locator('.demo-persona')).toHaveCount(Object.keys(BUYERS).length);
  await expect(providers.locator('.demo-persona')).toHaveCount(Object.keys(PROVIDERS).length);
  await expect(buyers.locator('[data-persona="carlos"]')).toContainText('Leitura');
  await expect(page.getByRole('heading', { name: 'Entrar na conta' })).toBeVisible();
  // Foco no primeiro cartão quando se chega por #demonstracao (troca de persona).
  await expect(buyers.locator('.demo-persona').first()).toBeFocused();
  await buyers.locator('[data-persona="juliana"]').click();
  await page.waitForURL('**/finance/dashboard.html');
  // Só a chave sai do navegador: nada de e-mail, papel ou workspace.
  expect(posts).toEqual([{ persona: 'juliana' }]);
});

test('entrada da Demo: instituição vai direto ao portal da instituição', async ({ page }) => {
  await personaServer(page);
  await page.goto('/login.html');
  await page.locator('[data-persona="meridian"]').click();
  await page.waitForURL('**/provider/index.html');
});

test('entrada da Demo: recusas e queda de rede não dizem que entrou e liberam a escolha', async ({ page }) => {
  const replies = [
    { status: 503, body: { ok: false, code: 'demo_capacity', error: 'A demonstração está cheia no momento. Tente novamente em alguns minutos.' } },
    { status: 429, headers: { 'Retry-After': '344' }, body: { ok: false, code: 'rate_limited', error: 'Muitas tentativas.' } },
    'abort',
    { status: 200, body: { ok: true, authenticated: false } }
  ];
  await personaServer(page, { login: (n) => replies[n - 1] });
  await page.goto('/login.html');
  const status = page.locator('.demo-entry-status');
  const juliana = page.locator('[data-persona="juliana"]');
  await juliana.click();
  await expect(status).toHaveText('A demonstração está cheia no momento. Tente novamente em alguns minutos.');
  await expect(juliana).toBeEnabled();
  await juliana.click();
  await expect(status).toHaveText('Muitas entradas em pouco tempo a partir desta rede. Tente de novo em 6 minutos.');
  await juliana.click();
  await expect(status).toContainText('Sem conexão com o servidor');
  // 200 sem sessão confirmada não é entrada.
  await juliana.click();
  await expect(status).toHaveAttribute('data-tone', 'error');
  await expect(page).toHaveURL(/login\.html/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test('entrada da Demo: persona nova do servidor aparece com nome e cargo, sem jornada inventada', async ({ page }) => {
  await page.route('**/api/auth/demo-personas', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, personas: [...SERVER_PERSONAS, { key: 'nova', name: 'Pessoa Nova', title: 'Cargo novo' }] }) }));
  await page.goto('/login.html');
  const other = page.locator('.demo-entry-group', { hasText: 'Outras personas' });
  await expect(other.locator('[data-persona="nova"]')).toHaveText(/Pessoa Nova\s*Cargo novo/);
  await expect(other.locator('.demo-persona-journey')).toHaveCount(0);
});

// A Vercel responde caminho inexistente com o 404.html do build (status 404);
// o servidor estático de teste devolve texto puro, então servimos o mesmo arquivo.
async function vercelNotFound(page, pattern) {
  const html = readFileSync('dist/404.html', 'utf8');
  await page.route(pattern, (r) => r.fulfill({ status: 404, contentType: 'text/html', body: html }));
}

test('link antigo do sandbox numa Demo canônica: 404 honesto que oferece a entrada por persona', async ({ page }) => {
  await page.route('**/api/auth/demo-personas', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, personas: SERVER_PERSONAS }) }));
  await vercelNotFound(page, '**/demo/finance/dashboard.html');
  const response = await page.goto('/demo/finance/dashboard.html');
  expect(response?.status()).toBe(404);
  await expect(page.locator('#demo-moved')).toContainText('o próprio produto');
  await expect(page.getByRole('link', { name: 'Entrar na demonstração' })).toHaveAttribute('href', '/login.html#demonstracao');
});

test('fora da Demo, o 404 de /demo não promete demonstração', async ({ page }) => {
  await page.route('**/api/auth/demo-personas', (r) => r.fulfill({ status: 404, body: '{}' }));
  await vercelNotFound(page, '**/demo/index.html');
  await page.goto('/demo/index.html');
  await expect(page.getByRole('heading', { name: 'Não encontramos esta página.' })).toBeVisible();
  await expect(page.locator('#demo-moved')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Entrar na demonstração' })).toHaveCount(0);
});

test('entrada da Demo: ordem da jornada — gestora primeiro; entre as instituições, quem responde ao vivo', async ({ page }) => {
  await personaServer(page);
  await page.goto('/login.html');
  await expect(page.locator('.demo-entry-group').first().locator('.demo-persona').first()).toHaveAttribute('data-persona', 'juliana');
  await expect(page.locator('.demo-entry-group').nth(1).locator('.demo-persona').first()).toHaveAttribute('data-persona', 'meridian');
});
