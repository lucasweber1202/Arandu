import { test, expect } from '@playwright/test';

// Workspace Architecture & Design System 2.0 (demonstração): gramática da
// próxima ação, inspector, continuidade entre personas, comparação como
// workspace de decisão, caixa de decisão, portal do provedor, configurações,
// roteiro guiado, central de comando, celular e semântica de acessibilidade.
// Build de apresentação.

const KEY = 'arandu-demo-workspace';
const CAPITAL = 'de000000-0000-4000-8000-000400000001';
const ACQUIRING = 'de000000-0000-4000-8000-000400000002';
const ATLAS_ACQUIRING = 'de000000-0000-4000-8000-000600000006';
const FORBIDDEN = /vencedor|melhor proposta|recomendad|ranking/i;
const isMobile = (testInfo) => /mobile/.test(testInfo.project.name);
const stored = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), KEY);
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
async function confirm(page, label) {
  await page.getByRole('dialog').last().getByRole('button', { name: label, exact: true }).click();
}

test('próxima ação: o mesmo objeto diz a mesma coisa no início, na lista, no resumo e no detalhe', async ({ page }) => {
  await ready(page, '/demo/finance/dashboard.html');
  // Início: trabalho primeiro, sem cara de BI.
  const queue = page.locator('#precisa-de-voce');
  const row = queue.locator('.wq-row', { hasText: 'Revisão de adquirência' });
  await expect(row).toContainText('Aguardando 1 provedor');
  await expect(row).toContainText('2 de 3 responderam');
  await expect(row).toContainText(/Prazo em \d+ dias/);
  await expect(row).toContainText('Em coleta');
  const firstModules = await page.locator('.dash-modules > [data-module]').evaluateAll((nodes) => nodes.slice(0, 2).map((node) => node.dataset.module));
  expect(firstModules).toEqual(['attention', 'inflight']);
  await expect(page.locator('#em-andamento')).toContainText('Aguardando Ricardo Alves');
  // Lista: mesma ação na coluna "Próxima ação".
  await ready(page, '/demo/finance/rfqs.html');
  const listRow = page.locator('tr[data-entity="rfq"]', { hasText: 'Revisão de adquirência' });
  await expect(listRow.locator('td.next-action')).toContainText('Aguardando 1 provedor');
  await expect(listRow.locator('td[data-label="Status"]')).toContainText('Em coleta');
  // Detalhe: a fase atual em destaque, com a mesma ação.
  await ready(page, `/demo/finance/rfq.html?id=${ACQUIRING}`);
  const stage = page.locator('#stage-panel');
  await expect(stage).toContainText('Aguardando 1 provedor');
  await expect(stage).toContainText('Fase: Coleta');
  await expect(stage.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
  // Capital de giro: aprovação na etapa 2 de 2, aguardando Ricardo.
  await ready(page, `/demo/finance/rfq.html?id=${CAPITAL}`);
  await expect(page.locator('#stage-panel')).toContainText('Aguardando Ricardo Alves');
  await expect(page.locator('#stage-panel')).toContainText('Etapa 2 de 2');
  await expect(page.locator('#view')).not.toContainText(FORBIDDEN);
});

test('inspector: lista | resumo em tela larga, ↑↓ trocam o item, Esc fecha e devolve o foco', async ({ page }, testInfo) => {
  test.skip(isMobile(testInfo), 'Inspector é do desktop largo; no celular é a folha inferior.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await ready(page, '/demo/finance/rfqs.html');
  const link = page.getByRole('link', { name: 'Capital de giro — R$ 3 milhões' });
  await link.click();
  const inspector = page.getByRole('complementary', { name: 'Capital de giro — R$ 3 milhões' });
  await expect(inspector).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-inspector', 'on');
  await expect(page.locator('dialog.quick-view[open]')).toHaveCount(0);
  await expect(inspector).toContainText('Próxima ação');
  await expect(inspector.getByRole('link', { name: 'Abrir solicitação completa' })).toBeVisible();
  // A lista continua ali, com o item marcado.
  await expect(page.locator('tr.is-inspected')).toContainText('Capital de giro');
  await expect(link).toHaveAttribute('aria-current', 'true');
  const box = await inspector.boundingBox();
  const table = await page.locator('#view .table-card').boundingBox();
  expect(box.x).toBeGreaterThan(table.x + table.width - 1);
  // Teclado: ↓ troca o item sem abrir outra página.
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#inspector')).not.toHaveAttribute('data-entity', `rfq:${CAPITAL}`);
  await expect(page).toHaveURL(/rfqs\.html/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#inspector')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-inspector', 'off');
  expect(await page.evaluate(() => document.activeElement?.matches('a[data-quick]'))).toBe(true);
  // Em notebook (1280 px), o mesmo clique abre a quick view.
  await page.setViewportSize({ width: 1280, height: 800 });
  await ready(page, '/demo/finance/rfqs.html');
  await page.getByRole('link', { name: 'Capital de giro — R$ 3 milhões' }).click();
  await expect(page.getByRole('dialog', { name: 'Capital de giro — R$ 3 milhões' })).toBeVisible();
  await expect(page.locator('#inspector')).toHaveCount(0);
});

test('continuidade entre personas: da solicitação da Marina para a caixa do Ricardo, no mesmo pedido', async ({ page }) => {
  await ready(page, `/demo/finance/rfq.html?id=${CAPITAL}`);
  await page.getByRole('button', { name: /Continuar como Ricardo/ }).click();
  await expect(page).toHaveURL(/\/demo\/finance\/approvals\.html#request-/);
  await expect(page.locator('#persona-trigger')).toHaveAttribute('aria-label', /Ricardo Alves/);
  await expect(page.locator('#view')).toHaveAttribute('aria-busy', 'false');
  const item = page.locator('.dinbox-item', { hasText: 'Capital de giro' });
  if ((page.viewportSize()?.width || 0) >= 1100) {
    await expect(item).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('#decision-context')).toContainText('Capital de giro — R$ 3 milhões');
  } else {
    await expect(page.getByRole('dialog', { name: 'Capital de giro — R$ 3 milhões' })).toBeVisible();
  }
});

test('comparação como workspace de decisão: síntese factual, modos e estimativas separadas', async ({ page }, testInfo) => {
  test.skip(isMobile(testInfo), 'No celular a comparação usa duas propostas lado a lado (outro teste).');
  await ready(page, `/demo/finance/rfq.html?id=${CAPITAL}#comparacao`);
  const synthesis = page.getByRole('region', { name: 'Síntese factual da comparação' });
  await expect(synthesis).toContainText('3 propostas');
  await expect(synthesis).toContainText('2 completas');
  await expect(synthesis).toContainText('1 com campos ausentes');
  await expect(synthesis).toContainText('1 responde à revisão anterior');
  await expect(synthesis).toContainText(/validade mais próxima: \d+ dias?/);
  await expect(synthesis).toContainText('Onde as propostas mais diferem');
  const modes = page.getByRole('group', { name: 'Modo da comparação' });
  await expect(modes.getByRole('button', { name: 'Diferenças' })).toHaveAttribute('aria-pressed', 'true');
  const visibleRows = () => page.locator('table.matrix tbody tr:not(.matrix-group):not([hidden])').count();
  const diff = await visibleRows();
  await modes.getByRole('button', { name: 'Todos os critérios' }).click();
  await expect(modes.getByRole('button', { name: 'Todos os critérios' })).toHaveAttribute('aria-pressed', 'true');
  const all = await visibleRows();
  expect(all).toBeGreaterThan(diff);
  await modes.getByRole('button', { name: 'Campos ausentes' }).click();
  await expect(page.locator('table.matrix tbody tr:not(.matrix-group):not([hidden])', { hasText: 'CET informado' })).toBeVisible();
  expect(await visibleRows()).toBeLessThan(all);
  // Estimativa do Arandu: separada, com hipóteses e o que não entra; não é CET.
  const estimates = page.locator('#compare-estimates');
  await expect(estimates).toContainText('Calculado pelo Arandu com hipóteses');
  await expect(estimates).toContainText('não é CET');
  await expect(estimates).toContainText('Não considerado');
  await estimates.locator('summary').first().click();
  await expect(estimates.locator('details[open]').first()).toContainText(/Hipóteses|Estimativa não calculável/);
  // Números tabulares e nenhuma linguagem de vencedor.
  expect(await page.locator('table.matrix td').first().evaluate((node) => getComputedStyle(node).fontVariantNumeric)).toContain('tabular-nums');
  await expect(page.locator('#panel-comparacao')).not.toContainText(FORBIDDEN);
});

test('caixa de decisão por teclado: Enter revisa, o foco vai ao contexto e as ações só existem lá', async ({ page }, testInfo) => {
  test.skip(isMobile(testInfo), 'No celular o contexto abre como folha (outro teste).');
  await page.setViewportSize({ width: 1440, height: 900 });
  await ready(page, '/demo/finance/dashboard.html');
  await asPersona(page, 'approver', 'Ricardo Alves');
  await ready(page, '/demo/finance/approvals.html');
  const filter = page.getByRole('group', { name: 'Filtrar aprovações' });
  await expect(filter.getByRole('button', { name: /Aguardando você/ })).toHaveAttribute('aria-pressed', 'true');
  const item = page.locator('.dinbox-item', { hasText: 'Capital de giro' });
  await item.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#decision-context')).toBeFocused();
  await expect(page).toHaveURL(/#request-/);
  await expect(page.locator('#decision-context')).toContainText('Quais diferenças materiais existem?');
  await expect(page.locator('#decision-actions').getByRole('button', { name: 'Aprovar' })).toBeVisible();
  await filter.getByRole('button', { name: /Concluídas/ }).click();
  await expect(page.locator('#decision-context').getByRole('button', { name: 'Aprovar' })).toHaveCount(0);
});

test('provedor: nomes coerentes, estado de sucesso depois de enviar e "A solicitação mudou" com o que mudou', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  await ready(page, '/demo/finance/dashboard.html');
  await asPersona(page, 'provider', 'Camila Rocha');
  if (!isMobile(testInfo)) {
    const nav = page.getByRole('navigation', { name: 'Navegacao do portal' });
    await expect(nav.getByRole('link', { name: 'Oportunidades' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Convites' })).toBeVisible();
  }
  await expect(page.locator('#convites .card-title')).toHaveText('Convites');
  // Enviar a proposta de adquirência (rascunho já completo no conjunto inicial).
  await ready(page, `/demo/provider/proposal.html?proposal=${ATLAS_ACQUIRING}`);
  await page.getByRole('button', { name: 'Revisar e enviar proposta' }).click();
  await confirm(page, 'Enviar proposta');
  const sent = page.locator('#proposal-sent');
  await expect(sent).toContainText('Proposta v1 enviada');
  await expect(sent).toContainText('Responde à revisão 1');
  await expect(sent).toContainText('Você ainda pode revisar enquanto a coleta estiver aberta');
  // A empresa publica a revisão 2.
  await asPersona(page, 'buyer', 'Marina Costa');
  await ready(page, `/demo/finance/rfq.html?id=${ACQUIRING}`);
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Editar solicitação' });
  await drawer.getByLabel('Faturamento mensal em cartões (R$)').fill('9000000');
  await drawer.getByRole('button', { name: 'Publicar revisão' }).click();
  await expect(page.locator('.page-meta')).toContainText('Revisão 2');
  // O provedor vê exatamente o que mudou e o caminho para atualizar.
  await asPersona(page, 'provider', 'Camila Rocha');
  await ready(page, `/demo/provider/proposal.html?proposal=${ATLAS_ACQUIRING}`);
  const changed = page.locator('#rfq-changed');
  await expect(changed).toContainText('A solicitação mudou');
  await expect(changed).toContainText('Sua proposta respondeu à revisão 1. A empresa publicou a revisão 2.');
  await expect(changed.locator('.rev-diff')).toContainText('Faturamento mensal em cartões');
  await expect(changed.locator('.rev-diff')).toContainText('9.000.000');
  await changed.getByRole('button', { name: 'Atualizar proposta' }).click();
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('#proposal-form')))).toBe(true);
});

test('configurações: minha conta, empresa, governança e demonstração, com as mesmas âncoras', async ({ page }) => {
  await ready(page, '/demo/finance/dashboard.html');
  await asPersona(page, 'admin', 'Helena Prado');
  await ready(page, '/demo/finance/settings.html#equipe');
  const groups = await page.locator('.settings-group-title').allTextContents();
  expect(groups).toEqual(['Minha conta', 'Empresa', 'Governança', 'Demonstração']);
  const order = await page.locator('.settings-layout .stack > .card').evaluateAll((nodes) => nodes.map((node) => node.id));
  expect(order).toEqual(['voce', 'notificacoes', 'aparencia', 'empresa', 'perfil', 'equipe', 'aprovacao', 'demonstracao']);
  await expect(page.locator('#equipe h3.card-title')).toHaveText('Equipe e papéis');
  await expect(page.locator('#demonstracao').getByRole('button', { name: 'Restaurar demonstração…' })).toBeVisible();
  // Aparência enxuta: tema e densidade; o resto em "Preferências avançadas".
  const appearance = page.locator('#aparencia');
  await expect(appearance.getByRole('radio', { name: 'Sistema' })).toBeVisible();
  await expect(appearance.getByRole('radio', { name: 'Confortável' }).first()).toBeVisible();
  await expect(appearance.getByRole('radio', { name: 'Violeta' })).toBeHidden();
  await appearance.getByText('Preferências avançadas').click();
  await expect(appearance.getByRole('radio', { name: 'Violeta' })).toBeVisible();
});

test('roteiro "Ver processo completo" percorre o mesmo pedido pelas quatro personas', async ({ page }) => {
  await page.goto('/demo/index.html');
  await expect(page.getByRole('link', { name: 'Explorar livremente' })).toBeVisible();
  await expect(page.locator('.dl-flow-list li')).toHaveCount(7);
  await page.getByRole('link', { name: 'Ver processo completo' }).click();
  await expect(page).toHaveURL(/\/demo\/finance\/dashboard\.html$/);
  const bar = page.getByRole('region', { name: 'Roteiro: processo completo' });
  await expect(bar).toContainText('1/7');
  await bar.getByRole('button', { name: 'Próximo passo' }).click();
  await expect(page).toHaveURL(new RegExp(`rfq\\.html\\?id=${CAPITAL}$`));
  await expect(bar).toContainText('2/7');
  await bar.getByRole('button', { name: 'Próximo passo' }).click();
  await expect(bar).toContainText('3/7');
  await bar.getByRole('button', { name: 'Continuar como Camila' }).click();
  await expect(page).toHaveURL(/\/demo\/provider\/proposal\.html/);
  await expect(page.locator('#persona-trigger')).toHaveAttribute('aria-label', /Camila Rocha/);
  await expect(bar).toContainText('4/7');
  await bar.getByRole('button', { name: 'Sair do roteiro' }).click();
  await expect(bar).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Roteiro: processo completo' })).toHaveCount(0);
});

test('central de comando: trabalho antes de páginas e de aparência; aprovações são buscáveis', async ({ page }) => {
  await ready(page, '/demo/finance/dashboard.html');
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Central de comando' });
  const groups = await palette.locator('.command-group').allTextContents();
  expect(groups[0]).toBe('Seu trabalho');
  expect(groups).not.toContain('Aparência');
  await page.keyboard.type('capital');
  await expect(palette.locator('.command-group').first()).toHaveText('Solicitações');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('aprovação capital');
  await expect(palette.getByRole('option', { name: /Aprovação: Capital de giro/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();
});

test('registro v2 migra para v3 sem perder o layout personalizado', async ({ page }) => {
  await page.goto('/demo/index.html');
  await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({
    version: 2, appearance: { theme: 'light', density: 'compact', sidebar: 'auto', motion: 'normal', accent: 'emerald', preset: 'custom', detail: 'full' },
    behavior: { rfqClick: 'page', home: 'overview', afterCreate: 'stay' }, shell: { focus: false },
    dashboard: { buyer: { order: ['attention', 'tasks', 'summary'], hidden: ['pipeline'], sizes: {} } }, favorites: [],
    savedViews: [{ id: 'v-abcd1234', name: 'Minha fila', page: 'rfqs', query: 'status=comparing', extra: '', hiddenColumns: [], pinned: true }], recents: [], tables: {}
  })), KEY);
  await ready(page, '/demo/finance/dashboard.html');
  const state = await stored(page);
  expect(state.version).toBe(3);
  expect(state.dashboard.buyer.order.slice(0, 4)).toEqual(['attention', 'inflight', 'tasks', 'summary']);
  expect(state.behavior.rfqClick).toBe('page');
  expect(state.savedViews[0]).toMatchObject({ name: 'Minha fila', pinned: true });
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'emerald');
  await expect(page.locator('[data-module="inflight"]')).toBeVisible();
});

test('celular: contexto compacto no lugar de esconder, alvos de toque e navegação por persona', async ({ page }, testInfo) => {
  test.skip(!isMobile(testInfo), 'Só no celular.');
  await ready(page, '/demo/finance/dashboard.html');
  await expect(page.locator('#em-andamento .pl-progress').first()).toBeVisible();
  await expect(page.locator('#em-andamento')).toContainText(/\d\/\d respostas/);
  await ready(page, '/demo/finance/rfqs.html');
  const acquiring = page.locator('tr[data-entity="rfq"]', { hasText: 'Revisão de adquirência' });
  await expect(acquiring.locator('.responses-compact')).toBeVisible();
  await expect(acquiring.locator('.responses-compact')).toHaveText(/^2\/3 respostas · \d+d$/);
  for (const selector of ['.ft-token', '.dw-tabbar .tab-item', '.page-actions .btn-primary']) {
    const height = await page.locator(selector).first().evaluate((node) => node.getBoundingClientRect().height);
    expect(height, selector).toBeGreaterThanOrEqual(44);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  // Aprovação no celular: folha com o contexto e as ações.
  await asPersona(page, 'approver', 'Ricardo Alves');
  await ready(page, '/demo/finance/approvals.html');
  await page.locator('.dinbox-item', { hasText: 'Capital de giro' }).click();
  const sheet = page.getByRole('dialog', { name: 'Capital de giro — R$ 3 milhões' });
  await expect(sheet).toContainText('Quanto?');
  await expect(sheet.getByRole('button', { name: 'Aprovar' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
});

test('larguras estreitas (360 e 320 px) sem rolagem horizontal nas telas de trabalho', async ({ page }, testInfo) => {
  test.skip(!isMobile(testInfo), 'Só no celular.');
  for (const width of [360, 320]) {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 800 });
    for (const path of ['/demo/finance/dashboard.html', '/demo/finance/rfqs.html', `/demo/finance/rfq.html?id=${CAPITAL}`, '/demo/finance/approvals.html', '/demo/provider/index.html', '/demo/index.html']) {
      await page.goto(path);
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${width}px ${path}`).toBeLessThanOrEqual(1);
    }
  }
});

test('semântica: navegação agrupada com aria-current, modos com aria-pressed e reduced motion respeitado', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page, '/demo/finance/rfqs.html');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  if (!isMobile(testInfo)) {
    const nav = page.getByRole('navigation', { name: 'Navegacao do portal' });
    await expect(nav.getByRole('list', { name: 'Meu trabalho' })).toBeVisible();
    await expect(nav.getByRole('list', { name: 'Processos' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Solicitações' })).toHaveAttribute('aria-current', 'page');
  }
  const status = page.getByRole('button', { name: /^Status: Todos/ });
  await expect(status).toHaveAttribute('aria-haspopup', 'menu');
  await status.click();
  await expect(status).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(status).toHaveAttribute('aria-expanded', 'false');
  await expect(status).toBeFocused();
  // Página oficial no mesmo navegador: nada da camada 2.0.
  await page.goto('/finance/rfqs.html');
  await expect(page.locator('html')).not.toHaveClass(/\bdw\b/);
  await expect(page.locator('.ft-bar, #inspector, .wq, #stage-panel, .route-bar')).toHaveCount(0);
});

test('zoom 200% e 400% (1440 px → 720 e 360 px úteis) sem rolagem horizontal e com a próxima ação visível', async ({ page }, testInfo) => {
  test.skip(isMobile(testInfo), 'Zoom de navegador de desktop.');
  for (const [width, height] of [[720, 450], [360, 225]]) {
    await page.setViewportSize({ width, height });
    for (const path of ['/demo/finance/dashboard.html', '/demo/finance/rfqs.html', `/demo/finance/rfq.html?id=${CAPITAL}`, '/demo/finance/approvals.html', '/demo/finance/settings.html']) {
      await ready(page, path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `zoom ${width}px ${path}`).toBeLessThanOrEqual(1);
    }
    await ready(page, `/demo/finance/rfq.html?id=${CAPITAL}`);
    await expect(page.locator('#stage-panel .na-action')).toHaveText('Aguardando Ricardo Alves');
  }
});
