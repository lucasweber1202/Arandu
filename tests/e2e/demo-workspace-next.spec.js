import { test, expect } from '@playwright/test';
import { layoutEvidence } from './layout-evidence.js';

// Próxima geração da demonstração: presets, comportamento, migração do
// registro local, bandeja e workspace de comparação, tela de solicitação,
// aprovação, navegação móvel por persona e checagens visuais (zoom, texto
// grande, movimento reduzido, tema escuro). Build de apresentação.

const KEY = 'arandu-demo-workspace';
const CAPITAL = 'de000000-0000-4000-8000-000400000001';
const stored = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), KEY);
const html = (page) => page.locator('html');
const isMobile = (testInfo) => /mobile/.test(testInfo.project.name);
async function ready(page, path) {
  await page.goto(path);
  await expect(page.locator('#view')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#view [role=status].loading-state')).toHaveCount(0);
}
async function asPersona(page, key, name) {
  await page.locator('#persona-trigger').click();
  await page.locator(`.persona-item[data-persona="${key}"]`).click();
  await expect(page.locator('#persona-trigger')).toHaveAttribute('aria-label', new RegExp(name));
  await expect(page.locator('#view.is-switching')).toHaveCount(0);
}
async function noOverflow(page, label) {
  const evidence = await layoutEvidence(page);
  expect(evidence.overflow, `rolagem horizontal em ${label}: ${JSON.stringify(evidence)}`).toBeLessThanOrEqual(1);
}

test('registro v1 (PR #86) migra até v3 sem perder escolhas', async ({ page }) => {
  await page.goto('/demo/index.html');
  await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({
    version: 1, appearance: { theme: 'dark', density: 'compact', sidebar: 'compact', motion: 'normal', accent: 'violet' }, shell: { focus: false },
    dashboard: { buyer: { order: ['attention', 'tasks'], hidden: ['pipeline'], sizes: { tasks: 'full' } } },
    favorites: [{ type: 'rfq', id: 'de000000-0000-4000-8000-000400000001', title: 'Capital de giro' }],
    savedViews: [{ id: 'v-abcd1234', name: 'Fila antiga', page: 'rfqs', query: 'status=comparing', pinned: true }], recents: []
  })), KEY);
  await ready(page, '/demo/finance/dashboard.html');
  await expect(html(page)).toHaveAttribute('data-theme', 'dark');
  await expect(html(page)).toHaveAttribute('data-accent', 'violet');
  await expect(html(page)).toHaveAttribute('data-density', 'compact');
  const state = await stored(page);
  expect(state.version).toBe(3);
  // v3: "Em andamento" entra logo depois de "Precisa de você", mesmo em layout personalizado.
  expect(state.dashboard.buyer.order.slice(0, 3)).toEqual(['attention', 'inflight', 'tasks']);
  expect(state.appearance).toMatchObject({ theme: 'dark', density: 'compact', sidebar: 'compact', accent: 'violet', preset: 'custom' });
  expect(state.behavior).toEqual({ rfqClick: 'quick', home: 'overview', afterCreate: 'stay' });
  expect(state.dashboard.buyer.hidden).toContain('pipeline');
  expect(state.favorites).toHaveLength(1);
  expect(state.savedViews[0]).toMatchObject({ name: 'Fila antiga', pinned: true, extra: '', hiddenColumns: [] });
  await expect(page.locator('[data-module="pipeline"]')).toHaveCount(0);
  await expect(page.locator('[data-module="inflight"]')).toBeVisible();
});

test('presets de workspace: executivo reduz o painel, operacional adensa, e mexer à mão vira personalizado', async ({ page }) => {
  await ready(page, '/demo/finance/dashboard.html');
  await page.getByRole('button', { name: 'Personalizar' }).click();
  const picker = page.getByRole('group', { name: 'Preset do workspace' });
  await picker.getByRole('button', { name: 'Executivo' }).click();
  await expect(html(page)).toHaveAttribute('data-detail', 'essential');
  const modules = () => page.locator('.dash-modules > [data-module]').evaluateAll((nodes) => nodes.map((node) => node.dataset.module));
  expect(await modules()).toEqual(['attention', 'inflight', 'renewals']);
  await picker.getByRole('button', { name: 'Operacional' }).click();
  await expect(html(page)).toHaveAttribute('data-density', 'compact');
  expect(await modules()).toEqual(['attention', 'inflight', 'pipeline', 'tasks', 'recent-rfqs', 'renewals', 'activity']);
  await page.getByRole('button', { name: 'Ocultar Atividade recente' }).click();
  expect((await stored(page)).appearance.preset).toBe('custom');
  await picker.getByRole('button', { name: 'Equilibrado' }).click();
  expect((await stored(page)).appearance.preset).toBe('balanced');
  expect((await modules()).slice(0, 3)).toEqual(['attention', 'inflight', 'renewals']);
});

test('comportamento: abrir página em vez do resumo, página inicial e voltar para a lista após criar', async ({ page }) => {
  await ready(page, '/demo/finance/dashboard.html');
  await page.locator('#persona-trigger').click();
  await page.getByRole('menuitem', { name: 'Aparência e preferências…' }).click();
  const panel = page.getByRole('dialog', { name: 'Aparência e preferências' });
  await panel.getByText('Preferências avançadas').click();
  await panel.getByRole('radio', { name: 'Abrir a página' }).check();
  await panel.getByRole('radio', { name: 'Aprovações' }).check();
  await panel.getByRole('radio', { name: 'Voltar para a lista' }).check();
  await page.keyboard.press('Escape');
  expect((await stored(page)).behavior).toEqual({ rfqClick: 'page', home: 'approvals', afterCreate: 'list' });
  await ready(page, '/demo/finance/rfqs.html');
  await page.getByRole('link', { name: 'Capital de giro — R$ 3 milhões' }).click();
  await expect(page).toHaveURL(/rfq\.html\?id=/);
  await expect(page.locator('dialog.quick-view')).toHaveCount(0);
  await expect(page.locator('.topbar-brand, .side-head .brand').first()).toHaveAttribute('href', /approvals\.html$/);
  // Criar solicitação e voltar para a lista.
  await ready(page, '/demo/finance/new-rfq.html');
  const form = page.locator('#rfq-form');
  await form.getByLabel('Título da solicitação').fill('Giro para voltar à lista');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await form.getByLabel('Valor desejado (R$)').fill('500000');
  await form.getByLabel('Finalidade').selectOption('capital_de_giro');
  await form.getByLabel('Prazo desejado (meses)').fill('12');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Criar solicitação' }).click();
  await expect(page).toHaveURL(/\/demo\/finance\/rfqs\.html$/);
  await expect(page.locator('.toast')).toContainText('Giro para voltar à lista');
});

test('tela de solicitação: cabeçalho, Arandu Timeline, abas com deep link e favorito', async ({ page }) => {
  await ready(page, `/demo/finance/rfq.html?id=${CAPITAL}`);
  const head = page.locator('.rfq-head');
  await expect(head.locator('h1')).toHaveText('Capital de giro — R$ 3 milhões');
  await expect(head.locator('.rfq-figure')).toHaveText('R$ 3.000.000');
  await expect(head.locator('.page-meta')).toContainText('Revisão 3');
  const timeline = page.getByRole('list', { name: 'Onde a solicitação está' });
  await expect(timeline.locator('[aria-current=step]')).toContainText('Aprovação');
  await expect(timeline.locator('.is-done')).toHaveCount(4);
  const tabs = page.getByRole('tablist', { name: 'Seções da solicitação' });
  await expect(tabs.getByRole('tab')).toHaveText([/^Visão geral/, /^Propostas/, /^Comparação/, /^Aprovação/, /^Decisão/, /^Histórico/]);
  await tabs.getByRole('tab', { name: /^Histórico/ }).click();
  await expect(page).toHaveURL(/#atividade$/);
  await page.goto(`/demo/finance/rfq.html?id=${CAPITAL}#propostas`);
  await expect(page.getByRole('tab', { name: /^Propostas/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Favoritar Capital de giro — R$ 3 milhões' }).click();
  expect((await stored(page)).favorites[0]).toMatchObject({ type: 'rfq', id: CAPITAL });
});

test('bandeja de comparação: selecionar em listas e resumo, persistir na navegação e abrir o workspace', async ({ page }, testInfo) => {
  await ready(page, '/demo/finance/proposals.html');
  const pick = (name) => page.locator('tr[data-entity="proposal"]', { hasText: name }).filter({ hasText: 'Capital de giro — R$ 3 milhões' }).getByRole('checkbox');
  await pick('Atlas Bank').check();
  const tray = page.getByRole('region', { name: 'Bandeja de comparação' });
  await expect(tray).toContainText('1 proposta');
  await expect(tray).toContainText('Selecione mais uma');
  // Continua ao navegar; marcar pelo resumo lateral também conta.
  await ready(page, '/demo/finance/rfqs.html');
  await expect(tray).toBeVisible();
  await page.getByRole('link', { name: 'Capital de giro — R$ 3 milhões' }).click();
  const drawer = page.getByRole('dialog', { name: 'Capital de giro — R$ 3 milhões' });
  await drawer.getByRole('checkbox', { name: /Banco Horizonte Sul/ }).check();
  await page.keyboard.press('Escape');
  await expect(tray).toContainText('2 propostas');
  await tray.getByRole('button', { name: /Remover Atlas Bank/ }).click();
  await expect(tray).toContainText('1 proposta');
  await ready(page, `/demo/finance/rfq.html?id=${CAPITAL}#propostas`);
  await page.locator('#panel-propostas').getByRole('checkbox', { name: /Nexa Crédito/ }).check();
  await tray.getByRole('link', { name: 'Comparar' }).click();
  await expect(page).toHaveURL(/comparar=.*#comparacao$/);
  await expect(html(page)).toHaveAttribute('data-compare', 'on');
  await expect(page.locator('.cmp-count')).toHaveText('Comparando 2 de 3 propostas');
  await expect(tray).toBeHidden();
  if (!isMobile(testInfo)) await expect(page.locator('.sidebar')).toBeHidden();
});

test('workspace de comparação: mostrar/ocultar propostas e critérios, destacar ausências, voltar sem perder nada', async ({ page }, testInfo) => {
  test.skip(isMobile(testInfo), 'No celular a comparação usa duas propostas lado a lado (coberto no teste móvel).');
  await ready(page, `/demo/finance/rfq.html?id=${CAPITAL}#comparacao`);
  await expect(html(page)).toHaveAttribute('data-compare', 'on');
  await expect(page.locator('#comparison-notice')).toBeVisible();
  const matrix = page.locator('table.matrix');
  await expect(matrix.locator('thead th:not([hidden])')).toHaveCount(4);
  await page.locator('#compare-providers').click();
  await page.getByRole('dialog', { name: 'Propostas visíveis' }).getByRole('checkbox', { name: 'Nexa Crédito — DEMO' }).uncheck();
  await expect(matrix.locator('thead th:not([hidden])')).toHaveCount(3);
  await expect(page.locator('.cmp-count')).toHaveText('Comparando 2 de 3 propostas');
  await page.keyboard.press('Escape');
  await page.locator('#compare-criteria').click();
  await page.getByRole('dialog', { name: 'Critérios visíveis' }).getByRole('checkbox', { name: 'Custo' }).uncheck();
  await expect(matrix.locator('tr.matrix-group:not([hidden])', { hasText: 'Custo' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.locator('#compare-missing-toggle').click();
  await expect(page.locator('.matrix-scroll')).toHaveClass(/is-missing-on/);
  await expect(page.locator('#compare-missing')).toContainText('Calculado a partir dos dados');
  // Sem vencedor: nenhuma palavra de recomendação na tela de comparação.
  await expect(page.locator('#panel-comparacao')).not.toContainText(/recomendad|melhor proposta|vencedor/i);
  // Cabeçalho da matriz fica visível ao rolar a tabela.
  await page.locator('.matrix-scroll').evaluate((node) => { node.scrollTop = 400; });
  const header = await matrix.locator('thead th').nth(1).boundingBox();
  const scroller = await page.locator('.matrix-scroll').boundingBox();
  expect(Math.abs(header.y - scroller.y)).toBeLessThanOrEqual(2);
  await page.locator('#compare-back').click();
  await expect(html(page)).toHaveAttribute('data-compare', 'off');
  await expect(page.getByRole('tab', { name: /^Visão geral/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.sidebar')).toBeVisible();
});

test('aprovação do CFO: revisar antes de agir, contexto na ordem da decisão e ações com peso distinto', async ({ page }, testInfo) => {
  await ready(page, '/demo/finance/dashboard.html');
  await asPersona(page, 'approver', 'Ricardo Alves');
  await ready(page, '/demo/finance/approvals.html');
  const row = page.locator('.dinbox-item', { hasText: 'Capital de giro' });
  // A linha da caixa não aprova: só leva à revisão.
  await expect(row).toContainText('Revisar decisão');
  await expect(page.locator('.dinbox-list').getByRole('button', { name: /Aprovar|Rejeitar/ })).toHaveCount(0);
  await row.click();
  const view = isMobile(testInfo) ? page.getByRole('dialog', { name: 'Capital de giro — R$ 3 milhões' }) : page.locator('#decision-context');
  if (!isMobile(testInfo)) await expect(row).toHaveAttribute('aria-current', 'true');
  await expect(view.locator('.dc-amount')).toHaveText('R$ 3.000.000');
  await expect(view).toContainText('Atlas Bank — DEMO');
  await expect(view).toContainText('1,39% a.m.');
  // Ordem: quanto → proposta → condições → por quê → diferenças → quem pediu → etapa → decisão.
  const questions = await view.locator('.dc-q').evaluateAll((nodes) => nodes.map((node) => node.textContent.replace(/^\d+/, '').trim()).filter(Boolean));
  const expected = ['Quanto?', 'Qual proposta?', 'Quais condições?', 'Por que esta proposta?', 'Quais diferenças materiais existem?', 'Quem pediu?', 'Em que etapa está?'];
  expect(questions.slice(0, expected.length)).toEqual(expected);
  await expect(view.locator('.dx')).toContainText('Horizonte');
  await expect(view).not.toContainText(/vencedor|recomendad/i);
  const approve = view.getByRole('button', { name: 'Aprovar' });
  const reject = view.getByRole('button', { name: 'Rejeitar' });
  const changes = view.getByRole('button', { name: 'Pedir alterações' });
  expect(await approve.evaluate((node) => node.classList.contains('btn-primary'))).toBe(true);
  expect(await reject.evaluate((node) => node.classList.contains('btn-danger-ghost'))).toBe(true);
  // Ordem de leitura: pedir alterações, rejeitar e, por último, aprovar (à direita no desktop).
  const labels = await view.locator('.approval-actions .btn').evaluateAll((nodes) => nodes.map((node) => node.textContent.trim()));
  expect(labels).toEqual(['Pedir alterações', 'Rejeitar', 'Aprovar']);
  if (!isMobile(testInfo)) {
    const [a, r, c] = [await approve.boundingBox(), await reject.boundingBox(), await changes.boundingBox()];
    expect(c.x).toBeLessThan(r.x);
    expect(r.x).toBeLessThan(a.x);
  }
  // Aprovar ainda pede confirmação.
  await approve.click();
  await expect(page.getByRole('dialog', { name: 'Aprovar esta proposta?' })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('quick view universal: contrato e tarefa seguem o mesmo modelo', async ({ page }) => {
  await ready(page, '/demo/finance/tasks.html');
  await page.getByRole('button', { name: /Ver resumo: Conferir garantias/ }).click();
  const task = page.getByRole('dialog', { name: /Conferir garantias/ });
  await expect(task.locator('.qv-hero')).toBeVisible();
  await expect(task.getByRole('link', { name: 'Abrir em Tarefas' })).toBeVisible();
  await page.keyboard.press('Escape');
  await ready(page, '/demo/finance/contracts.html');
  const card = page.locator('article[data-entity="contract"]', { hasText: 'Cadência Adquirência — DEMO' }).first();
  await expect(card.getByRole('list', { name: /Ciclo de vida/ })).toContainText('Aviso prévio');
  await page.getByRole('navigation', { name: 'Filtros rápidos e salvos' }).getByRole('button', { name: 'Encerrados' }).click();
  await expect(page.locator('article[data-entity="contract"]:not([hidden])')).toHaveCount(1);
});

test('navegação móvel deriva da persona e o "Mais" traz o restante', async ({ page }, testInfo) => {
  test.skip(!isMobile(testInfo), 'Só no celular.');
  await ready(page, '/demo/finance/dashboard.html');
  const nav = page.getByRole('navigation', { name: 'Navegação principal' });
  await expect(nav.locator('.tab-label')).toHaveText(['Início', 'Solicitações', 'Propostas', 'Mais']);
  await expect(page.locator('.sidebar')).toBeHidden();
  await asPersona(page, 'approver', 'Ricardo Alves');
  await expect(nav.locator('.tab-label')).toHaveText(['Início', 'Aprovações', 'Solicitações', 'Mais']);
  await asPersona(page, 'admin', 'Helena Prado');
  await expect(nav.locator('.tab-label')).toHaveText(['Início', 'Equipe', 'Configuração', 'Mais']);
  await nav.getByRole('button', { name: 'Mais' }).click();
  const sheet = page.getByRole('dialog', { name: /Acme Indústria/ });
  await expect(sheet.getByRole('link', { name: 'Contratos' })).toBeVisible();
  await page.keyboard.press('Escape');
  await asPersona(page, 'provider', 'Camila Rocha');
  await expect(page).toHaveURL(/provider\/index\.html/);
  await expect(page.getByRole('navigation', { name: 'Navegação principal' }).locator('.tab-label')).toHaveText(['Início', 'Oportunidades', 'Convites', 'Mais']);
  await noOverflow(page, 'portal do provedor');
});

test('comparação no celular usa duas propostas lado a lado, sem espremer a tabela', async ({ page }, testInfo) => {
  test.skip(!isMobile(testInfo), 'Só no celular.');
  const height = page.viewportSize().height;
  for (const width of [...new Set([page.viewportSize().width, 390, 375, 360, 320])]) {
    await page.setViewportSize({ width, height });
    await ready(page, `/demo/finance/rfq.html?id=${CAPITAL}#comparacao`);
    await expect(page.locator('.compare-mobile')).toBeVisible();
    await expect(page.locator('.comparison-wide')).toBeHidden();
    for (const picker of await page.locator('.pair-picker select').all()) {
      expect(await picker.evaluate((select) => {
        const control = select.getBoundingClientRect();
        const parent = select.closest('.pair-picker').getBoundingClientRect();
        return control.left >= parent.left - 1 && control.right <= parent.right + 1;
      }), 'seletor de proposta cabe na própria coluna').toBe(true);
    }
    await expect(page.getByRole('combobox', { name: 'Segunda proposta' }).locator('option').filter({ hasText: 'Banco Horizonte Sul — DEMO' })).toHaveText('Banco Horizonte Sul — DEMO');
    await noOverflow(page, `comparação ${width}px`);
    await page.getByRole('combobox', { name: 'Primeira proposta' }).selectOption('2');
    await expect(page.getByRole('combobox', { name: 'Primeira proposta' })).toHaveValue('2');
    await noOverflow(page, `comparação após troca ${width}px`);
    if (width === 393 || width === 320) {
      const capture = testInfo.outputPath(`comparison-${width}.png`);
      await page.screenshot({ path: capture, fullPage: true, animations: 'disabled' });
      await testInfo.attach(`comparação-${width}px`, { path: capture, contentType: 'image/png' });
    }
  }
});

test('checagens visuais: zoom 125%, texto grande, movimento reduzido e tema escuro sem vazamento', async ({ page }, testInfo) => {
  test.skip(isMobile(testInfo), 'Checagens de desktop.');
  // Zoom de 125% em 1440 px equivale a 1152 px de largura útil.
  await page.setViewportSize({ width: 1152, height: 720 });
  for (const path of ['/demo/finance/dashboard.html', `/demo/finance/rfq.html?id=${CAPITAL}`, '/demo/finance/rfqs.html', '/demo/finance/contracts.html']) {
    await ready(page, path);
    await noOverflow(page, `zoom 125% ${path}`);
  }
  // Texto grande: fonte base maior não pode empurrar a página para os lados.
  await ready(page, '/demo/finance/rfqs.html');
  await page.addStyleTag({ content: 'html{font-size:20px} body{font-size:18px}' });
  await noOverflow(page, 'texto grande');
  // Movimento reduzido: sem animação perceptível no painel lateral.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page, '/demo/finance/rfqs.html');
  await expect(html(page)).toHaveAttribute('data-motion', 'reduced');
  await page.getByRole('link', { name: 'Capital de giro — R$ 3 milhões' }).click();
  const duration = await page.locator('dialog.quick-view').evaluate((node) => parseFloat(getComputedStyle(node).animationDuration));
  expect(duration).toBeLessThan(0.01);
  await page.keyboard.press('Escape');
  // Tema escuro: fundo, superfícies e texto vêm dos tokens escuros.
  await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ version: 2, appearance: { theme: 'dark' } })), KEY);
  await ready(page, `/demo/finance/rfq.html?id=${CAPITAL}`);
  const colors = await page.evaluate(() => ({ body: getComputedStyle(document.body).backgroundColor, h1: getComputedStyle(document.querySelector('h1')).color, table: getComputedStyle(document.querySelector('.topbar')).borderBottomColor }));
  expect(colors.body).toBe('rgb(15, 16, 18)');
  expect(colors.h1).toBe('rgb(236, 236, 238)');
});

test('tablet: barra compacta automática abre sobre o conteúdo e fecha com Esc sem mudar a preferência', async ({ page }, testInfo) => {
  test.skip(isMobile(testInfo), 'Tablet é simulado no projeto de desktop.');
  await page.setViewportSize({ width: 1024, height: 768 });
  await ready(page, `/demo/finance/rfq.html?id=${CAPITAL}`);
  await expect(html(page)).toHaveAttribute('data-sidebar-state', 'compact');
  await expect(page.locator('.topbar-sidebar-toggle')).toBeHidden();
  const before = await page.locator('main#main').boundingBox();
  await page.locator('.side-collapse').click();
  await expect(html(page)).toHaveAttribute('data-sidebar-overlay', 'on');
  await expect(page.locator('.sidebar .side-label', { hasText: 'Solicitações' })).toBeVisible();
  const during = await page.locator('main#main').boundingBox();
  expect(Math.abs(during.x - before.x)).toBeLessThanOrEqual(1);
  await page.keyboard.press('Escape');
  await expect(html(page)).not.toHaveAttribute('data-sidebar-overlay', 'on');
  await expect(html(page)).toHaveAttribute('data-sidebar-state', 'compact');
  expect((await stored(page))?.appearance?.sidebar ?? 'auto').toBe('auto');
  // No celular a etapa atual da timeline aparece mesmo com a linha rolável.
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page, `/demo/finance/rfq.html?id=${CAPITAL}`);
  await expect(page.locator('.rfq-timeline [aria-current=step], ol.at [aria-current=step]').first()).toBeInViewport();
});
