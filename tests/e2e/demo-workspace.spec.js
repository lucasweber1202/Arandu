import { test, expect } from '@playwright/test';

// Camada de experiência da demonstração: shell, preferências, painel
// personalizável, quick view, central de comando, favoritos, visualizações e
// isolamento. Roda no build de apresentação (`npm run test:e2e:presentation`).

const KEY = 'arandu-demo-workspace';
const stored = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), KEY);
const html = (page) => page.locator('html');
function watchNetwork(page) {
  const offending = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== 'http://127.0.0.1:4173' || url.pathname.startsWith('/api/')) offending.push(`${request.method()} ${request.url()}`);
  });
  return offending;
}
async function ready(page, path) {
  await page.goto(path);
  await expect(page.locator('#view')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#view [role=status].loading-state')).toHaveCount(0);
}
const isMobile = (testInfo) => /mobile/.test(testInfo.project.name);

test('troca de persona pelo topo é instantânea e adapta o painel', async ({ page }) => {
  const offending = watchNetwork(page);
  await ready(page, '/demo/finance/dashboard.html');
  await expect(page.locator('#precisa-de-voce')).toBeVisible();
  await expect(page.locator('[data-module="inflight"]')).toBeVisible();
  let loads = 0;
  page.on('load', () => { loads += 1; });
  await page.locator('#persona-trigger').click();
  const menu = page.getByRole('menu', { name: 'Conta, persona e preferências' });
  await expect(menu.getByRole('menuitemradio')).toHaveCount(4);
  await expect(menu.getByRole('menuitemradio', { name: /^Comprador: Marina Costa/ })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitemradio', { name: /^Aprovador: Ricardo Alves/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#persona-trigger')).toHaveAttribute('aria-label', /Ricardo Alves/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Ricardo$/);
  // CFO: aprovações em destaque, pipeline fora do painel padrão, nada de "Nova solicitação".
  await expect(page.locator('[data-module="approvals"]')).toContainText('Capital de giro');
  await expect(page.locator('[data-module="pipeline"]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Nova solicitação' })).toHaveCount(0);
  expect(loads, 'a troca na mesma área não recarrega a página').toBe(0);
  // Administração: governança.
  await page.locator('#persona-trigger').click();
  await page.getByRole('menuitemradio', { name: /^Administração: Helena Prado/ }).click();
  await expect(page.locator('[data-module="governance"]')).toContainText('Política de aprovação');
  // Provedor: outro portal.
  await page.locator('#persona-trigger').click();
  await page.getByRole('menuitemradio', { name: /^Provedor: Camila Rocha/ }).click();
  await expect(page).toHaveURL(/\/demo\/provider\/index\.html$/);
  await expect(page.locator('#persona-trigger')).toHaveAttribute('aria-label', /Camila Rocha/);
  expect(offending).toEqual([]);
});

test('tema, densidade e cor persistem após recarregar e ficam só na demonstração', async ({ page }) => {
  await ready(page, '/demo/finance/dashboard.html');
  await expect(html(page)).toHaveAttribute('data-theme', 'light');
  await page.locator('#persona-trigger').click();
  await page.getByRole('menuitem', { name: 'Aparência e preferências…' }).click();
  const panel = page.getByRole('dialog', { name: 'Aparência e preferências' });
  await panel.getByRole('radio', { name: 'Escuro' }).check();
  await panel.getByRole('radio', { name: 'Compacta' }).first().check();
  // Cor e movimento ficam nas preferências avançadas: a superfície principal é só tema e densidade.
  await expect(panel.getByRole('radio', { name: 'Esmeralda' })).toBeHidden();
  await panel.getByText('Preferências avançadas').click();
  await panel.getByRole('radio', { name: 'Esmeralda' }).check();
  await panel.getByRole('radio', { name: 'Reduzido' }).check();
  await expect(html(page)).toHaveAttribute('data-theme', 'dark');
  await expect(html(page)).toHaveAttribute('data-density', 'compact');
  await expect(html(page)).toHaveAttribute('data-accent', 'emerald');
  await expect(html(page)).toHaveAttribute('data-motion', 'reduced');
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.reload();
  await expect(html(page)).toHaveAttribute('data-theme', 'dark');
  await expect(html(page)).toHaveAttribute('data-density', 'compact');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(background);
  expect((await stored(page)).appearance).toMatchObject({ theme: 'dark', density: 'compact', accent: 'emerald', motion: 'reduced' });
  // Página real no mesmo navegador: nenhuma preferência da demo é aplicada.
  await page.goto('/finance/dashboard.html');
  await expect(html(page)).not.toHaveAttribute('data-theme', /.*/);
  await expect(html(page)).not.toHaveClass(/\bdw\b/);
  await expect(page.locator('link[href*="experience"], script[src*="workspace"]')).toHaveCount(0);
});

test('preferência adulterada no navegador volta ao padrão', async ({ page }) => {
  await page.goto('/demo/index.html');
  await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ version: 1, appearance: { theme: '<script>', accent: '#ff0000', density: 'huge' }, favorites: [{ type: 'rfq', id: '../../x', title: '<img>' }] })), KEY);
  await ready(page, '/demo/finance/dashboard.html');
  await expect(html(page)).toHaveAttribute('data-theme', 'light');
  await expect(html(page)).toHaveAttribute('data-accent', 'indigo');
  await expect(html(page)).toHaveAttribute('data-density-pref', 'auto');
  await expect(page.locator('.side-personal')).not.toContainText('<img>');
});

test('barra lateral compacta com tooltip, persistida, e modo foco', async ({ page }, testInfo) => {
  test.skip(isMobile(testInfo), 'No celular a navegação fica na barra inferior.');
  await ready(page, '/demo/finance/rfqs.html');
  const collapse = page.locator('.side-collapse');
  await expect(collapse).toHaveAttribute('aria-expanded', 'true');
  await collapse.click();
  await expect(html(page)).toHaveAttribute('data-sidebar-state', 'compact');
  // A largura anima (180 ms): espera a transição terminar em vez de medir no meio.
  await expect.poll(() => page.locator('.sidebar').evaluate((node) => node.getBoundingClientRect().width)).toBeLessThan(80);
  // Rótulo acessível continua; tooltip visual ao focar.
  const link = page.getByRole('navigation', { name: 'Navegacao do portal' }).getByRole('link', { name: 'Contratos' });
  await link.focus();
  await expect(page.getByRole('tooltip')).toHaveText('Contratos');
  await ready(page, '/demo/finance/rfqs.html');
  await expect(html(page)).toHaveAttribute('data-sidebar-state', 'compact');
  await page.keyboard.press('Control+b');
  await expect(html(page)).toHaveAttribute('data-sidebar-state', 'expanded');
  // Modo foco: barra lateral oculta, saída explícita; Escape não desfaz nada.
  await page.locator('#persona-trigger').click();
  await page.getByRole('menuitemcheckbox', { name: 'Modo foco' }).click();
  await expect(html(page)).toHaveAttribute('data-focus', 'on');
  await page.keyboard.press('Escape');
  await expect(page.locator('.sidebar')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(html(page)).toHaveAttribute('data-focus', 'on');
  await page.getByRole('button', { name: 'Sair do modo foco' }).click();
  await expect(html(page)).toHaveAttribute('data-focus', 'off');
  await expect(page.locator('.sidebar')).toBeVisible();
});

test('painel personalizável: ocultar, mover, redimensionar, persistir e restaurar', async ({ page }) => {
  await ready(page, '/demo/finance/dashboard.html');
  const order = () => page.locator('.dash-modules > [data-module]').evaluateAll((nodes) => nodes.map((node) => node.dataset.module));
  // Trabalho primeiro: fila pessoal, processos em andamento; números só depois.
  expect((await order()).slice(0, 3)).toEqual(['attention', 'inflight', 'renewals']);
  expect((await order()).indexOf('summary')).toBeGreaterThan(2);
  await page.getByRole('button', { name: 'Personalizar' }).click();
  await page.getByRole('button', { name: 'Mover Renovações para cima' }).click();
  expect((await order()).slice(0, 3)).toEqual(['attention', 'renewals', 'inflight']);
  await expect(page.getByRole('button', { name: 'Mover Renovações para cima' })).toBeFocused();
  await page.getByRole('button', { name: 'Ocultar Indicadores' }).click();
  await page.getByRole('button', { name: 'Exibir Aprovações' }).click();
  await page.getByRole('button', { name: 'Largura inteira: Tarefas' }).click();
  await expect(page.getByRole('button', { name: 'Largura inteira: Tarefas' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Concluir' }).click();
  await page.reload();
  await expect(page.locator('#precisa-de-voce')).toBeVisible();
  const after = await order();
  expect(after.slice(0, 3)).toEqual(['attention', 'renewals', 'inflight']);
  expect(after).not.toContain('summary');
  expect(after).toContain('approvals');
  await expect(page.locator('[data-module="tasks"]')).toHaveClass(/dm-full/);
  expect((await stored(page)).dashboard.buyer.hidden).toContain('summary');
  // Cada persona tem o seu layout: o do comprador não vaza para o aprovador.
  await page.locator('#persona-trigger').click();
  await page.getByRole('menuitemradio', { name: /^Aprovador:/ }).click();
  await expect(page.locator('#dashboard')).toHaveAttribute('data-persona', 'approver');
  await expect(page.locator('[data-module="summary"]')).toBeVisible();
  await page.locator('#persona-trigger').click();
  await page.getByRole('menuitemradio', { name: /^Comprador:/ }).click();
  await expect(page.locator('#dashboard')).toHaveAttribute('data-persona', 'buyer');
  await page.getByRole('button', { name: 'Personalizar' }).click();
  await page.getByRole('button', { name: 'Restaurar layout padrão' }).click();
  expect((await order()).slice(0, 3)).toEqual(['attention', 'inflight', 'renewals']);
  await expect(page.locator('[data-module="summary"]')).toBeVisible();
});

test('quick view de solicitação preserva filtros e rolagem, fecha com Escape e devolve o foco', async ({ page }, testInfo) => {
  await ready(page, '/demo/finance/rfqs.html?product=credit');
  const rows = page.locator('tr[data-entity="rfq"]');
  await expect(rows.first()).toBeVisible();
  const count = await rows.count();
  const link = page.getByRole('link', { name: 'Capital de giro — R$ 3 milhões' });
  await link.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => scrollY);
  await link.click();
  const drawer = page.getByRole('dialog', { name: 'Capital de giro — R$ 3 milhões' });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText('R$ 3.000.000');
  await expect(drawer).toContainText('Atlas Bank — DEMO');
  await expect(drawer).toContainText('Ordem alfabética');
  await expect(drawer.getByRole('link', { name: 'Abrir solicitação completa' })).toBeVisible();
  // Foco preso no painel: Tab não sai para a página.
  for (let index = 0; index < 8; index += 1) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog.quick-view')))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(page.locator('dialog.quick-view')).toHaveCount(0);
  await expect(page).toHaveURL(/\/demo\/finance\/rfqs\.html\?product=credit$/);
  await expect(rows).toHaveCount(count);
  expect(Math.abs(await page.evaluate(() => scrollY) - before)).toBeLessThanOrEqual(2);
  await expect(link).toBeFocused();
  if (isMobile(testInfo)) {
    await link.click();
    const box = await drawer.boundingBox();
    const viewport = page.viewportSize();
    expect(box.width).toBeGreaterThanOrEqual(viewport.width - 2);
    expect(box.y + box.height).toBeGreaterThanOrEqual(viewport.height - 2);
    await page.keyboard.press('Escape');
  }
  // Abrir completo e voltar: filtros e posição continuam.
  await link.click();
  await drawer.getByRole('link', { name: 'Abrir solicitação completa' }).click();
  await expect(page).toHaveURL(/rfq\.html\?id=/);
  // Desktop volta pela trilha (que lembra os filtros); no celular, pelo botão voltar.
  if (isMobile(testInfo)) await page.goBack();
  else {
    const breadcrumb = page.locator('#breadcrumbs').getByRole('link', { name: 'Solicitações' });
    // The center used by a real pointer click must belong to the link, even
    // when the current-page title needs ellipsis in a crowded topbar.
    await expect.poll(() => breadcrumb.evaluate((link) => {
      const rect = link.getBoundingClientRect();
      return link.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    })).toBe(true);
    await breadcrumb.click();
  }
  await expect(page).toHaveURL(/rfqs\.html\?product=credit$/);
  await expect(rows).toHaveCount(count);
});

test('quick views de proposta, provedor e contrato; favoritos na barra lateral', async ({ page }, testInfo) => {
  await ready(page, '/demo/finance/proposals.html');
  await page.locator('tr[data-entity="proposal"] a.row-title').first().click();
  await expect(page.getByRole('dialog').filter({ hasText: 'Condições informadas' })).toBeVisible();
  await page.keyboard.press('Escape');
  await ready(page, '/demo/finance/providers.html');
  // A linha inteira abre o resumo; pelo teclado, o botão da linha faz o mesmo.
  const region = await page.locator('tr', { hasText: 'Atlas Bank — DEMO' }).getByRole('cell', { name: 'Nacional' }).boundingBox();
  await page.mouse.click(region.x + region.width / 2, region.y + region.height / 2);
  await expect(page.getByRole('dialog', { name: 'Atlas Bank — DEMO' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Ver resumo de Atlas Bank — DEMO' }).focus();
  await page.keyboard.press('Enter');
  const provider = page.getByRole('dialog', { name: 'Atlas Bank — DEMO' });
  await expect(provider).toContainText('Participações');
  await provider.getByRole('button', { name: 'Favoritar' }).click();
  await expect(provider.getByRole('button', { name: 'Favorito' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await ready(page, '/demo/finance/contracts.html');
  const card = page.locator('article[data-entity="contract"]', { hasText: 'Cadência Adquirência — DEMO' }).first();
  await card.getByRole('button', { name: /Mais ações/ }).click();
  await page.getByRole('menuitem', { name: 'Ver resumo' }).click();
  await expect(page.getByRole('dialog', { name: 'Cadência Adquirência — DEMO' })).toContainText('Aviso prévio');
  await page.keyboard.press('Escape');
  if (!isMobile(testInfo)) {
    const favorites = page.locator('.sidebar .side-section', { hasText: 'Favoritos' });
    await expect(favorites.getByRole('link', { name: 'Atlas Bank — DEMO' })).toBeVisible();
  }
  expect((await stored(page)).favorites.map((entry) => entry.type)).toEqual(['provider']);
});

test('central de comando: ações, tema, persona e busca por teclado', async ({ page }) => {
  await ready(page, '/demo/finance/dashboard.html');
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Central de comando' });
  await expect(palette).toBeVisible();
  await expect(palette.getByRole('option', { name: /Ver como Ricardo Alves/ })).toBeVisible();
  await page.keyboard.type('tema escuro');
  await expect(palette.getByRole('option').first()).toContainText('Tema escuro');
  await page.keyboard.press('Enter');
  await expect(palette).toBeHidden();
  await expect(html(page)).toHaveAttribute('data-theme', 'dark');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('contratos');
  await expect(palette.getByRole('option').first()).toContainText('Contratos');
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();
  // Shift+Enter espia sem sair da página.
  await page.keyboard.press('Control+k');
  await page.keyboard.type('capital de giro 3 milhoes');
  await page.keyboard.press('Shift+Enter');
  await expect(page.getByRole('dialog', { name: 'Capital de giro — R$ 3 milhões' })).toBeVisible();
  await expect(page).toHaveURL(/dashboard\.html/);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('ver como ricardo');
  await page.keyboard.press('Enter');
  await expect(page.locator('#persona-trigger')).toHaveAttribute('aria-label', /Ricardo Alves/);
});

test('filtros salvos: sugeridos, filtrar como frase, salvar, renomear, fixar na barra, excluir com desfazer', async ({ page }, testInfo) => {
  await ready(page, '/demo/finance/rfqs.html');
  const views = page.getByRole('navigation', { name: 'Filtros rápidos e salvos' });
  await expect(views.getByRole('button', { name: 'Todas' })).toHaveAttribute('aria-pressed', 'true');
  // Ninguém precisa aprender "visões" antes de filtrar: sem filtro, nada de "Salvar filtro".
  await expect(page.getByRole('button', { name: 'Salvar filtro' })).toBeHidden();
  await views.getByRole('button', { name: 'Urgentes' }).click();
  await expect(views.getByRole('button', { name: 'Urgentes' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('tr[data-entity="rfq"]:not([hidden])')).toHaveCount(2);
  await views.getByRole('button', { name: 'Todas' }).click();
  // Filtro como frase: [Status: Em avaliação].
  await page.getByRole('button', { name: /^Status: Todos/ }).click();
  await page.getByRole('menuitemradio', { name: /Em avaliação/ }).click();
  await expect(page).toHaveURL(/status=comparing/);
  await expect(page.getByRole('button', { name: /^Status: Em avaliação/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Limpar filtro Status' })).toBeVisible();
  // "Em avaliação" já é um filtro rápido: só aparece "Salvar filtro" para uma combinação nova.
  await expect(page.getByRole('button', { name: 'Salvar filtro' })).toBeHidden();
  await page.getByRole('button', { name: /^Produto: Todos/ }).click();
  await page.getByRole('menuitemradio', { name: 'Crédito' }).click();
  await expect(page).toHaveURL(/product=credit/);
  await page.getByRole('button', { name: 'Salvar filtro' }).click();
  await page.getByLabel('Nome do filtro').fill('Fila de avaliação');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(views.getByRole('button', { name: 'Fila de avaliação', exact: true })).toBeVisible();
  await page.goto('/demo/finance/rfqs.html');
  await views.getByRole('button', { name: 'Fila de avaliação', exact: true }).click();
  await expect(page).toHaveURL(/status=comparing/);
  await expect(page.locator('tr[data-entity="rfq"]')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Salvar filtro' })).toBeHidden();
  await page.getByRole('button', { name: /Gerenciar filtro salvo/ }).click();
  await page.getByRole('menuitem', { name: 'Renomear…' }).click();
  await page.getByLabel('Nome do filtro').fill('Avaliação CFO');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(views.getByRole('button', { name: 'Avaliação CFO', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Gerenciar filtro salvo/ }).click();
  await page.getByRole('menuitem', { name: 'Fixar na barra lateral' }).click();
  if (!isMobile(testInfo)) {
    const pinned = page.locator('.sidebar .side-section', { hasText: 'Filtros salvos' });
    await pinned.getByRole('link', { name: 'Avaliação CFO' }).click();
    await expect(page).toHaveURL(/status=comparing/);
    await expect(page.locator('.sidebar').getByRole('link', { name: 'Avaliação CFO' })).toHaveAttribute('aria-current', 'page');
  }
  await page.getByRole('button', { name: /Gerenciar filtro salvo/ }).click();
  await page.getByRole('menuitem', { name: 'Excluir filtro' }).click();
  expect((await stored(page)).savedViews).toEqual([]);
  await page.locator('.toast').getByRole('button', { name: 'Desfazer' }).click();
  expect((await stored(page)).savedViews.map((view) => view.name)).toEqual(['Avaliação CFO']);
});

test('restaurar só aparência preserva os dados; restaurar dados preserva a aparência', async ({ page }) => {
  await ready(page, '/demo/finance/tasks.html');
  await page.getByLabel('Nova tarefa').fill('Tarefa que deve sobreviver');
  await page.getByRole('button', { name: 'Adicionar' }).click();
  await expect(page.locator('.task-list')).toContainText('Tarefa que deve sobreviver');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('tema escuro');
  await page.keyboard.press('Enter');
  await expect(html(page)).toHaveAttribute('data-theme', 'dark');
  const restore = async (label) => {
    await page.locator('#demo-indicator').click();
    await page.getByRole('button', { name: 'Restaurar demonstração…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Restaurar a demonstração' });
    await dialog.getByRole('radio', { name: new RegExp(label) }).check();
    await dialog.getByRole('button', { name: 'Restaurar', exact: true }).click();
  };
  await restore('Aparência e layout');
  await expect(html(page)).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('.task-list')).toContainText('Tarefa que deve sobreviver');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('tema escuro');
  await page.keyboard.press('Enter');
  await restore('Dados demonstrativos');
  await expect(page).toHaveURL(/dashboard\.html$/);
  await expect(html(page)).toHaveAttribute('data-theme', 'dark');
  await page.goto('/demo/finance/tasks.html');
  await expect(page.locator('.task-list')).not.toContainText('Tarefa que deve sobreviver');
});

test('layout móvel e desktop sem rolagem horizontal, com e sem tema escuro', async ({ page }) => {
  for (const theme of ['light', 'dark']) {
    await page.goto('/demo/index.html');
    await page.evaluate(([key, value]) => localStorage.setItem(key, JSON.stringify({ version: 1, appearance: { theme: value, density: 'spacious' } })), [KEY, theme]);
    for (const path of ['/demo/index.html', '/demo/finance/dashboard.html', '/demo/finance/rfqs.html', '/demo/finance/contracts.html', '/demo/finance/settings.html', '/demo/provider/index.html']) {
      await page.goto(path);
      await page.waitForTimeout(250);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${theme} ${path}`).toBeLessThanOrEqual(1);
    }
  }
});

// Evidência visual (não é regressão por pixel): `ARANDU_DEMO_SCREENSHOTS=1`.
// Desktop 1440×900 e tablet 1024×768 no projeto de desktop; celular 390×844.
test('capturas de evidência da nova experiência', async ({ page }, testInfo) => {
  test.skip(!process.env.ARANDU_DEMO_SCREENSHOTS, 'Só quando ARANDU_DEMO_SCREENSHOTS=1.');
  test.setTimeout(180000);
  const dir = process.env.ARANDU_DEMO_SCREENSHOTS_DIR || 'reports/demo-ux';
  const RFQ = '/demo/finance/rfq.html?id=de000000-0000-4000-8000-000400000001';
  const settle = () => page.waitForTimeout(350);
  const shot = async (device, name) => { await settle(); await page.screenshot({ path: `${dir}/${device}-${name}.png` }); };
  const reset = async () => page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  const persona = async (key) => {
    await page.locator('#persona-trigger').click();
    await page.locator(`.persona-item[data-persona="${key}"]`).click();
    await expect(page.locator('#view.is-switching')).toHaveCount(0);
  };

  if (isMobile(testInfo)) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/demo/index.html');
    await reset();
    await page.goto('/demo/index.html');
    await shot('mobile', '01-landing');
    await ready(page, '/demo/finance/dashboard.html');
    await shot('mobile', '02-dashboard');
    await ready(page, RFQ);
    await shot('mobile', '03-solicitacao');
    await ready(page, '/demo/finance/rfqs.html');
    await page.getByRole('link', { name: 'Capital de giro — R$ 3 milhões' }).click();
    await shot('mobile', '04-quick-view');
    await page.keyboard.press('Escape');
    await persona('approver');
    await ready(page, '/demo/finance/approvals.html');
    await shot('mobile', '05-aprovacoes');
    await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Mais' }).click();
    await shot('mobile', '06-navegacao-inferior-mais');
    await page.keyboard.press('Escape');
    await ready(page, `${RFQ}#comparacao`);
    await shot('mobile', '07-comparacao');
    return;
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/demo/index.html');
  await reset();
  await page.goto('/demo/index.html');
  await shot('desktop', '01-landing');
  await ready(page, '/demo/finance/dashboard.html');
  await shot('desktop', '02-dashboard-comprador');
  await page.getByRole('button', { name: 'Personalizar' }).click();
  const presets = page.getByRole('group', { name: 'Preset do workspace' });
  await presets.getByRole('button', { name: 'Executivo' }).click();
  await page.getByRole('button', { name: 'Concluir' }).click();
  await shot('desktop', '03-dashboard-executivo');
  await page.getByRole('button', { name: 'Personalizar' }).click();
  await presets.getByRole('button', { name: 'Operacional' }).click();
  await page.getByRole('button', { name: 'Concluir' }).click();
  await shot('desktop', '04-dashboard-operacional');
  await page.getByRole('button', { name: 'Personalizar' }).click();
  await presets.getByRole('button', { name: 'Equilibrado' }).click();
  await page.getByRole('button', { name: 'Concluir' }).click();
  await ready(page, RFQ);
  await shot('desktop', '05-solicitacao-visao-geral');
  await ready(page, `${RFQ}#propostas`);
  await shot('desktop', '06-solicitacao-propostas');
  await ready(page, `${RFQ}#comparacao`);
  await shot('desktop', '07-comparacao-foco');
  await page.locator('#compare-back').click();
  await ready(page, '/demo/finance/rfqs.html');
  await shot('desktop', '08-solicitacoes-tabela');
  await page.getByRole('link', { name: 'Capital de giro — R$ 3 milhões' }).click();
  await shot('desktop', '09-quick-view');
  await page.keyboard.press('Escape');
  await ready(page, '/demo/finance/contracts.html');
  await shot('desktop', '10-contratos');
  await page.keyboard.press('Control+k');
  await shot('desktop', '11-central-de-comando');
  await page.keyboard.press('Escape');
  await page.locator('#persona-trigger').click();
  await page.getByRole('menuitem', { name: 'Aparência e preferências…' }).click();
  await shot('desktop', '12-preferencias-workspace');
  await page.keyboard.press('Escape');
  await persona('approver');
  await ready(page, '/demo/finance/approvals.html');
  await page.locator('.dinbox-item', { hasText: 'Capital de giro' }).click();
  await shot('desktop', '13-aprovacao');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('tema escuro');
  await page.keyboard.press('Enter');
  await ready(page, '/demo/finance/dashboard.html');
  await shot('desktop', '14-dark-mode');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('tema claro');
  await page.keyboard.press('Enter');
  await persona('buyer');

  await page.setViewportSize({ width: 1024, height: 768 });
  await ready(page, '/demo/finance/dashboard.html');
  await shot('tablet', '01-dashboard');
  await ready(page, RFQ);
  await shot('tablet', '02-solicitacao');
  await page.locator('.side-collapse').click();
  await expect(page.locator('html')).toHaveAttribute('data-sidebar-overlay', 'on');
  await shot('tablet', '03-barra-lateral-sobreposta');
  await page.keyboard.press('Escape');
  await ready(page, `${RFQ}#comparacao`);
  await shot('tablet', '04-comparacao');
});
