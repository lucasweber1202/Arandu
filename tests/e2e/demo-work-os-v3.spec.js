import { test, expect } from '@playwright/test';

// Ultimate Financial Work OS (demonstração): estado local-first, decisão
// otimista com fila offline, colaboração com escopo, menções, notificações,
// políticas versionadas, intake, integrações simuladas, Open Finance, ERP,
// uso/auditoria, central de comando, atalhos, conflito e fronteiras de
// privacidade. Build de apresentação; nada sai do navegador.

const CAPITAL = 'de000000-0000-4000-8000-000400000001';
const CAPITAL_APPROVAL = 'de000000-0000-4000-8000-000700000001';
const ATLAS_CAPITAL = 'de000000-0000-4000-8000-000600000001';
const FORBIDDEN = /vencedor|melhor proposta|melhor banco|recomendad|ranking|ideal para você/i;
const isMobile = (testInfo) => /mobile/.test(testInfo.project.name);

async function ready(page, path) {
  await page.goto(path);
  await expect(page.locator('#view')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#view [role=status].loading-state')).toHaveCount(0);
}
async function persona(page, key) {
  // Persona gravada direto no estado fictício do motor (como o roteiro faz).
  await page.evaluate((value) => { const state = JSON.parse(localStorage.getItem('arandu_demo_state_v1')); state.persona = value; localStorage.setItem('arandu_demo_state_v1', JSON.stringify(state)); sessionStorage.removeItem('arandu-demo-swr'); }, key);
}
async function as(page, key, path) {
  await ready(page, '/demo/finance/dashboard.html');
  await persona(page, key);
  await ready(page, path);
}
async function confirm(page, label) {
  await page.getByRole('dialog').last().getByRole('button', { name: label, exact: true }).click();
}
// Nenhuma requisição sai do servidor local da demonstração.
test.beforeEach(async ({ page }) => {
  const external = [];
  page.on('request', (request) => { const url = new URL(request.url()); if (!['127.0.0.1', 'localhost'].includes(url.hostname) && !url.protocol.startsWith('data') && !url.protocol.startsWith('blob')) external.push(request.url()); });
  page.external = external;
});
test.afterEach(async ({ page }) => { expect(page.external, 'nenhuma chamada externa').toEqual([]); });

test('páginas do Work OS existem na demo, com governança na navegação', async ({ page }, testInfo) => {
  await as(page, 'admin', '/demo/finance/policies.html');
  await expect(page.getByRole('heading', { name: 'Políticas de aprovação', level: 1 })).toBeVisible();
  if (!isMobile(testInfo)) {
    const nav = page.locator('.sidebar');
    for (const label of ['Políticas', 'Integrações', 'Uso da demo', 'Nova solicitação']) await expect(nav.getByRole('link', { name: label })).toBeVisible();
  }
  for (const [path, heading] of [['/demo/finance/integrations.html', 'Integrações'], ['/demo/finance/usage.html', 'Uso da demonstração'], ['/demo/finance/intake.html', 'O que você precisa fazer?'], ['/demo/finance/notifications.html', 'Notificações']]) {
    await ready(page, path);
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    await expect(page.locator('#view')).not.toContainText(FORBIDDEN);
  }
});

test('decisão otimista: offline entra na fila, reconectar sincroniza e o motor registra', async ({ page }, testInfo) => {
  test.skip(isMobile(testInfo), 'fila offline coberta no desktop; o celular usa a mesma camada');
  await as(page, 'approver', `/demo/finance/approvals.html#request-${CAPITAL_APPROVAL}`);
  const pill = page.locator('#sync-indicator');
  await expect(pill).toContainText('Sincronizado');
  await pill.click();
  await page.locator('#network-toggle').click();
  await expect(pill).toContainText('Offline');
  await page.keyboard.press('Escape');
  const context = page.locator('#decision-actions');
  await context.getByRole('button', { name: 'Aprovar' }).click();
  await confirm(page, 'Aprovar');
  await expect(page.locator('.toast').last()).toContainText('salvo neste dispositivo');
  await expect(pill).toContainText('Offline · 1');
  // A decisão já saiu da fila "Aguardando você" (otimista).
  await expect(page.locator('.dinbox-item', { hasText: 'Capital de giro' })).toHaveCount(0);
  await pill.click();
  await expect(page.locator('.sync-list')).toContainText('Capital de giro');
  await page.locator('#network-toggle').click();
  await expect(pill).toContainText('Sincronizado');
  // O motor registrou: a solicitação sai da fase de aprovação.
  await ready(page, `/demo/finance/rfq.html?id=${CAPITAL}`);
  await expect(page.locator('#stage-panel')).not.toContainText('Aguardando Ricardo');
});

test('comentários com escopo: provedor vê só o que é dele; interno nunca vaza', async ({ page }) => {
  await ready(page, `/demo/finance/rfq.html?id=${CAPITAL}`);
  await page.locator('#tab-propostas').click();
  await page.locator(`#proposal-${ATLAS_CAPITAL}`).getByRole('button', { name: 'Ver resumo' }).click();
  const thread = page.locator(`.cthread[data-object="proposal:${ATLAS_CAPITAL}"]`);
  await thread.locator('textarea').fill('Nota interna: comparar com a garantia do Horizonte.');
  await thread.getByRole('button', { name: 'Comentar' }).click();
  await expect(thread.locator('.cmt')).toHaveCount(1);
  await thread.getByRole('radio', { name: 'Visível ao provedor' }).click();
  await thread.locator('textarea').fill('Camila, vocês conseguem confirmar a carência de 3 meses?');
  await thread.getByRole('button', { name: 'Comentar' }).click();
  await expect(thread.locator('.cmt[data-scope=provider]')).toHaveCount(1);
  await persona(page, 'provider');
  await ready(page, `/demo/provider/proposal.html?proposal=${ATLAS_CAPITAL}`);
  const inbox = page.locator('#provider-conversation');
  await expect(inbox).toContainText('confirmar a carência de 3 meses');
  await expect(page.locator('body')).not.toContainText('Nota interna');
  await expect(page.locator('body')).not.toContainText('Horizonte');
  // O provedor responde; a empresa vê a resposta no mesmo escopo.
  await inbox.locator('textarea').fill('Confirmamos: 3 meses de carência.');
  await inbox.getByRole('button', { name: 'Comentar' }).click();
  await expect(inbox.locator('.cmt')).toHaveCount(2);
});

test('menção com autocomplete notifica a pessoa na central, na categoria Menções', async ({ page }) => {
  await ready(page, `/demo/finance/approvals.html#request-${CAPITAL_APPROVAL}`);
  const thread = page.locator(`.cthread[data-object="approval:${CAPITAL_APPROVAL}"]`).first();
  const box = thread.locator('textarea');
  await box.fill('Pode olhar a garantia, @Ric');
  await expect(thread.getByRole('listbox', { name: 'Mencionar' })).toBeVisible();
  await expect(box).toHaveAttribute('aria-expanded', 'true');
  await box.press('Enter');
  await expect(box).toHaveValue(/@Ricardo Alves /);
  await box.press('Control+Enter');
  await expect(thread.locator('.cmt', { hasText: 'Pode olhar a garantia, @Ricardo Alves' })).toHaveCount(1);
  await persona(page, 'approver');
  await ready(page, '/demo/finance/notifications.html');
  await page.locator('.ncenter-cat[data-category=mentions]').click();
  await expect(page.locator('.ncenter-item').first()).toContainText('Marina Costa mencionou você');
  await page.locator('#notifications-mark-all').click();
  await expect(page.locator('.ncenter-item:not(.is-read)')).toHaveCount(0);
});

test('atividade do processo com filtros e política v2 no contexto', async ({ page }) => {
  await ready(page, `/demo/finance/rfq.html?id=${CAPITAL}`);
  await expect(page.locator('#stage-panel #policy-line')).toContainText('Política v2');
  await expect(page.locator('#stage-panel #policy-line')).toContainText('A atual é a v3');
  await expect(page.locator('.rfq-head .presence')).toContainText('Ricardo');
  await page.locator('#tab-atividade').click();
  const stream = page.locator('.astream');
  await expect(stream.locator('.astream-item').first()).toBeVisible();
  await stream.getByRole('button', { name: 'Propostas' }).click();
  await expect(stream.locator('.astream-item.cat-proposals').first()).toBeVisible();
  await expect(stream.locator('.astream-item:not(.cat-proposals)')).toHaveCount(0);
});

test('política versionada: rascunho, prévia, publicar v4; processos em andamento continuam na v2', async ({ page }) => {
  await as(page, 'admin', '/demo/finance/policies.html');
  await page.locator('#policy-edit').click();
  const first = page.locator('.rule').first();
  await first.getByRole('textbox', { name: 'Nome da regra 1' }).fill('Crédito acima de R$ 4 milhões');
  await first.getByRole('textbox', { name: 'Nome da regra 1' }).blur();
  await page.locator('.rule').first().getByRole('spinbutton', { name: 'Valor da condição' }).fill('4000000');
  await page.locator('.rule').first().getByRole('spinbutton', { name: 'Valor da condição' }).blur();
  await page.locator('#policy-preview-rfq').selectOption({ label: 'Financiamento da expansão da fábrica 2' });
  await expect(page.locator('#policy-preview')).toContainText('CEO');
  await page.locator('#policy-publish').click();
  await expect(page.getByRole('dialog').last()).toContainText('Alterada: Crédito acima de R$ 4 milhões');
  await confirm(page, 'Publicar');
  await expect(page.locator('.policy-version[aria-current=true]')).toContainText('Política v4');
  await ready(page, `/demo/finance/rfq.html?id=${CAPITAL}`);
  await expect(page.locator('#policy-line')).toContainText('Política v2');
  await expect(page.locator('#policy-line')).toContainText('A atual é a v4');
});

test('intake: necessidade → formulário determinístico → política → rascunho no editor do produto', async ({ page }) => {
  await ready(page, '/demo/finance/intake.html');
  await page.locator('.intake-card[data-template=capital]').click();
  await page.getByRole('spinbutton', { name: /Quanto você precisa/ }).fill('6000000');
  const summary = page.locator('.intake-summary');
  await expect(summary).toContainText(/Capital de giro — R\$\s6\.000\.000/);
  await expect(summary).toContainText('CEO');
  await expect(summary.locator('#intake-prefill')).toContainText('perfil financeiro');
  await expect(page.locator('#view')).not.toContainText(FORBIDDEN);
  await page.locator('#intake-continue').click();
  await expect(page).toHaveURL(/new-rfq\.html/);
  await expect(page.locator('input[name=title]')).toHaveValue(/^Capital de giro — R\$\s6\.000\.000$/);
  await expect(page.locator('input[name=amount]')).toHaveValue('6000000');
});

test('integrações simuladas: Slack avisa sem aprovar, ERP reconhece fornecedores, SSO/SCIM, Open Finance e auditoria por origem', async ({ page }, testInfo) => {
  test.slow();
  await as(page, 'admin', '/demo/finance/integrations.html');
  // Slack
  await page.locator('#connect-slack').click();
  await expect(page.getByRole('dialog').last()).toContainText('nenhuma credencial é pedida');
  await confirm(page, 'Autorizar (simulado)');
  const slack = page.locator('#int-slack');
  await expect(slack.locator('.int-status')).toContainText('Conectado');
  await expect(slack.locator('.msg-preview')).toContainText('aguarda você');
  await expect(slack.locator('.msg-preview')).toContainText('Aprovar, rejeitar e pedir alterações acontecem só no Arandu');
  await expect(slack.locator('.msg-preview').getByRole('button', { name: /^Aprovar/ })).toHaveCount(0);
  // ERP
  await page.locator('#connect-omie').click();
  await confirm(page, 'Autorizar (simulado)');
  await page.locator('#erp-import-omie').click();
  await expect(page.locator('#erp-recognition')).toContainText('Reconhecido: Atlas Bank — DEMO');
  // Identidade
  await page.locator('#connect-workos').click();
  await confirm(page, 'Autorizar (simulado)');
  await page.locator('#int-workos').getByRole('radio', { name: 'Okta' }).click();
  await page.locator('#directory-import').click();
  await expect(page.locator('#directory-summary')).toContainText('23 usuários');
  await expect(page.locator('#directory-summary')).toContainText('4 grupos');
  await expect(page.locator('#group-mapping')).toContainText('Finance-Team');
  await expect(page.locator('#rbac-matrix')).toContainText('O que este papel pode fazer?');
  // Open Finance
  await page.locator('#connect-pluggy').click();
  await expect(page.getByRole('dialog').last()).toContainText('Nenhum banco real será acessado');
  await confirm(page, 'Autorizar (simulado)');
  await expect(page.locator('#of-filled')).toContainText('17 de 20 campos');
  await ready(page, '/demo/finance/settings.html#perfil');
  await expect(page.locator('#provenance-table')).toContainText('Open Finance · Pluggy');
  await expect(page.locator('#provenance-table thead')).toContainText('Responsável');
  // Auditoria com origem
  await ready(page, '/demo/finance/usage.html');
  const audit = page.locator('#audit-log');
  await expect(audit).toContainText('Conectou integração');
  await audit.getByRole('button', { name: 'ERP', exact: true }).click();
  await expect(audit).toContainText('Importou do ERP');
  await expect(page.locator('#usage-funnel')).toBeVisible();
  // Contrato: registro no ERP preparado, sem enviar.
  if (!isMobile(testInfo)) {
    await ready(page, '/demo/finance/contracts.html');
    await page.locator('#view article[data-entity="contract"] .contract-status button[aria-label^="Mais ações"]').first().click();
    await page.getByRole('menuitem', { name: 'Preparar registro no ERP' }).click();
    await expect(page.locator('#erp-preview')).toContainText('nada foi enviado ao ERP');
  }
});

test('central de comando 3.0: pessoas, integrações, configurações, destaque e buscas recentes', async ({ page }) => {
  await ready(page, '/demo/finance/dashboard.html');
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Central de comando' });
  await palette.locator('#command-query').fill('ricardo');
  await expect(palette.locator('.command-group', { hasText: 'Pessoas' })).toBeVisible();
  await expect(palette.locator('mark.command-mark').first()).toHaveText(/ricardo/i);
  await palette.locator('#command-query').fill('pluggy');
  await expect(palette.getByRole('option', { name: /Pluggy/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/integrations\.html#int-pluggy/);
  await expect(page.locator('#view')).toHaveAttribute('aria-busy', 'false');
  await page.keyboard.press('Control+k');
  await expect(page.locator('.command-group', { hasText: 'Buscas recentes' })).toBeVisible();
  await expect(page.getByRole('option', { name: /pluggy/ })).toBeVisible();
});

test('atalhos: ? abre ajuda com glossário e limites; G R vai para solicitações', async ({ page }, testInfo) => {
  test.skip(isMobile(testInfo), 'atalhos de teclado são de desktop');
  await ready(page, '/demo/finance/dashboard.html');
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('Shift+?');
  const help = page.getByRole('dialog', { name: 'Ajuda' });
  await expect(help.locator('.help-keys')).toContainText(['Solicitações']);
  await expect(help.locator('.help-keys kbd')).not.toHaveCount(0);
  await help.getByRole('tab', { name: 'Glossário' }).click();
  await expect(help.locator('#help-glossary')).toContainText('CET');
  await expect(help.locator('#help-glossary')).toContainText('Aviso prévio');
  await help.getByRole('tab', { name: 'Limites da demo' }).click();
  await expect(help).toContainText('nenhum serviço externo é chamado');
  await page.keyboard.press('Escape');
  await expect(help).toHaveCount(0);
  await page.keyboard.press('g');
  await page.keyboard.press('r');
  await expect(page).toHaveURL(/\/demo\/finance\/rfqs\.html/);
});

test('conflito de edição: duas versões lado a lado e a escolha vai para a auditoria', async ({ page }) => {
  await as(page, 'admin', '/demo/finance/usage.html');
  await page.locator('#usage-conflict').click();
  const dialog = page.getByRole('dialog', { name: /Duas alterações no mesmo campo/ });
  await expect(dialog).toContainText('Versão atual');
  await expect(dialog).toContainText('36 meses');
  await expect(dialog).toContainText('Sua alteração');
  await expect(dialog).toContainText('48 meses');
  await dialog.locator('#conflict-mine').click();
  await expect(page.locator('#audit-log')).toContainText('Resolveu conflito');
});

test('Precisa de você: dependências e agrupamento Hoje · Em breve · Depois', async ({ page }) => {
  await ready(page, '/demo/finance/dashboard.html');
  const queue = page.locator('#precisa-de-voce');
  await expect(queue.locator('.wq-horizon-title').first()).toBeVisible();
  await expect(queue).toContainText('Aguardando Atlas Bank.');
  await expect(queue.locator('.dep').first()).toBeVisible();
  await queue.locator('#queue-group').click();
  await expect(queue.locator('.wq-horizon')).toHaveCount(0);
  await expect(queue.locator('.wq-row').first()).toBeVisible();
});

test('feature flag desliga a presença; restaurar a demo limpa o Work OS', async ({ page }) => {
  await as(page, 'admin', '/demo/finance/usage.html');
  await page.locator('#flag-presence').uncheck();
  await ready(page, `/demo/finance/rfq.html?id=${CAPITAL}`);
  await expect(page.locator('.rfq-head .presence')).toBeHidden();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('arandu-demo-os')).flags.presence);
  expect(stored).toBe(false);
  await page.evaluate(() => { localStorage.removeItem('arandu-demo-os'); });
  await ready(page, `/demo/finance/rfq.html?id=${CAPITAL}`);
  await expect(page.locator('.rfq-head .presence')).toBeVisible();
});

test('inspector adaptativo: decide pela largura útil medida', async ({ page }, testInfo) => {
  test.skip(isMobile(testInfo), 'inspector é de desktop');
  for (const [width, expected] of [[1440, true], [1366, null], [1280, null], [1200, null], [1100, false]]) {
    await page.setViewportSize({ width, height: 850 });
    await ready(page, '/demo/finance/rfqs.html');
    const fits = await page.evaluate(() => { const sidebar = document.querySelector('.sidebar')?.getBoundingClientRect().width || 0; return innerWidth >= 1180 && innerWidth - sidebar >= 1100; });
    if (expected !== null) expect(fits, `largura ${width}`).toBe(expected);
    await page.locator('tr[data-entity="rfq"] a.row-title').first().click();
    await expect(page.locator('html')).toHaveAttribute('data-inspector', fits ? 'on' : 'off');
    await page.keyboard.press('Escape');
  }
});

test('320 px: páginas novas sem rolagem horizontal (WCAG reflow)', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await as(page, 'admin', '/demo/finance/integrations.html');
  for (const path of ['/demo/finance/integrations.html', '/demo/finance/policies.html', '/demo/finance/usage.html', '/demo/finance/notifications.html', `/demo/finance/approvals.html#request-${CAPITAL_APPROVAL}`]) {
    await ready(page, path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
  await persona(page, 'buyer');
  await ready(page, '/demo/finance/intake.html');
  await page.locator('.intake-card[data-template=capital]').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test('desempenho: sem ouvintes acumulando entre re-renders; medições dentro do orçamento; painel de depuração escondido', async ({ page }, testInfo) => {
  test.skip(isMobile(testInfo), 'medição de desktop');
  await ready(page, `/demo/finance/rfq.html?id=${CAPITAL}`);
  await page.locator('#tab-atividade').click();
  await expect(page.locator('.astream')).toBeVisible();
  const count = () => page.evaluate(() => globalThis.__aranduWorkOS.listenerCount());
  const before = await count();
  for (let round = 0; round < 4; round += 1) {
    await page.evaluate(() => window.__aranduCtx.reload());
    await expect(page.locator('#view')).toHaveAttribute('aria-busy', 'false');
    await page.locator('#tab-atividade').click();
    await expect(page.locator('.astream')).toBeVisible();
  }
  // Ouvintes de telas que saíram se desligam no próximo evento; nada cresce por render.
  await page.evaluate(() => { window.__aranduCtx && document.dispatchEvent(new Event('noop')); });
  expect(await count()).toBeLessThanOrEqual(before + 2);
  const route = await page.evaluate(() => globalThis.__aranduWorkOS.perfSummary().find((row) => row.name === 'route'));
  expect(route.p95).toBeLessThan(1500);
  await page.keyboard.press('Alt+Shift+D');
  await expect(page.locator('#perf-debug')).toContainText('Ouvintes');
  await page.keyboard.press('Alt+Shift+D');
  await expect(page.locator('#perf-debug')).toHaveCount(0);
});
