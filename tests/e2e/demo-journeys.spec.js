import { test, expect } from '@playwright/test';

// Demonstração interativa (/demo). Roda contra o build de apresentação
// (`npm run test:e2e:presentation`), que habilita a demonstração fora da
// produção. Cada teste começa de um navegador limpo, ou seja, do conjunto
// fictício inicial.

const CAPITAL = 'de000000-0000-4000-8000-000400000001';

/** Toda requisição que sai do navegador; a demo não pode tocar o servidor real. */
function watchNetwork(page) {
  const offending = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== 'http://127.0.0.1:4173' || url.pathname.startsWith('/api/')) offending.push(`${request.method()} ${request.url()}`);
  });
  return offending;
}
const banner = (page) => page.getByRole('region', { name: 'Ambiente demonstrativo' });
async function asPersona(page, label) {
  await banner(page).getByRole('radio', { name: label }).click();
  await page.waitForEvent('load');
  await expect(banner(page).getByRole('radio', { name: label })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#view [role=status].loading-state')).toHaveCount(0);
}
async function confirm(page, label) {
  const dialog = page.getByRole('dialog').last();
  await dialog.getByRole('button', { name: label, exact: true }).click();
  await expect(dialog).toBeHidden();
}
const tab = (page, name) => page.getByRole('tab', { name: new RegExp(`^${name}`) });

test('abre /demo sem login e deixa claro que é demonstrativo', async ({ page }) => {
  const offending = watchNetwork(page);
  await page.goto('/demo/index.html');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Explorar demonstração');
  await expect(banner(page)).toContainText('Dados fictícios. Nenhuma operação financeira real será executada.');
  await page.getByRole('link', { name: 'Explorar demonstração' }).click();
  await expect(page).toHaveURL(/\/demo\/finance\/dashboard\.html$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Painel');
  await expect(page.locator('#precisa-de-voce')).toContainText('Precisa de você');
  await expect(banner(page).getByRole('radio', { name: 'Comprador' })).toHaveAttribute('aria-checked', 'true');
  for (const path of ['/demo/finance/rfqs.html', '/demo/finance/contracts.html', '/demo/finance/approvals.html', '/demo/provider/index.html']) {
    await page.goto(path);
    await expect(banner(page)).toContainText('Ambiente demonstrativo');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
  await expect(page.locator('script[src*="speed-insights"]')).toHaveCount(0);
  expect(offending, 'a demonstração não pode chamar API real nem terceiros').toEqual([]);
});

test('jornada completa: comprador → provedor → comprador → aprovador → decisão → contrato → renovação', async ({ page }) => {
  test.setTimeout(150000);
  const offending = watchNetwork(page);
  await page.goto('/demo/index.html');
  await page.getByRole('link', { name: 'Explorar demonstração' }).click();

  // Comprador cria a solicitação pelo assistente.
  await page.goto('/demo/finance/new-rfq.html');
  const form = page.locator('#rfq-form');
  await form.getByLabel('Título da solicitação').fill('Giro E2E — R$ 1,5 milhão');
  await expect(page.locator('.save-indicator').first()).toContainText(/Salvo às/);
  await page.reload();
  await expect(form.getByLabel('Título da solicitação')).toHaveValue('Giro E2E — R$ 1,5 milhão');
  await expect(page.locator('#view')).toContainText('Recuperamos o rascunho');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await form.getByLabel('Valor desejado (R$)').fill('1500000');
  await form.getByLabel('Finalidade').selectOption('capital_de_giro');
  await form.getByLabel('Prazo desejado (meses)').fill('18');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('#rfq-review')).toContainText('R$ 1.500.000');
  await page.getByRole('button', { name: 'Criar solicitação' }).click();
  await expect(page).toHaveURL(/\/demo\/finance\/rfq\.html\?id=/);
  const rfqUrl = page.url().replace(/&created=1.*$/, '');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Giro E2E — R$ 1,5 milhão');

  // Edita, convida e abre.
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Editar solicitação' });
  await drawer.getByLabel('Valor desejado (R$)').fill('1600000');
  await drawer.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.locator('.page-meta')).toContainText('Revisão 2');
  await page.getByLabel('Convidar provedor').selectOption({ label: 'Atlas Bank — DEMO · Banco' });
  await page.getByRole('button', { name: 'Convidar', exact: true }).click();
  await expect(page.locator('#convites')).toContainText('Atlas Bank — DEMO');
  await page.getByRole('button', { name: 'Abrir para propostas' }).click();
  await confirm(page, 'Abrir solicitação');
  await expect(page.locator('.page-meta')).toContainText('Aberta');

  // Provedor aceita e responde.
  await asPersona(page, 'Provedor');
  await expect(page).toHaveURL(/\/demo\/provider\/index\.html/);
  const invite = page.locator('#convites li', { hasText: 'Giro E2E' });
  await invite.getByRole('button', { name: 'Aceitar' }).click();
  await expect(page).toHaveURL(/\/demo\/provider\/proposal\.html\?proposal=/);
  await expect(page.locator('.page-meta')).toContainText('Revisão 2 da solicitação');
  const proposal = page.locator('#proposal-form');
  await proposal.getByLabel('Produto ofertado').fill('Giro Atlas E2E');
  await proposal.getByLabel('Valor ofertado (R$)').fill('1600000');
  await proposal.getByLabel('Taxa (% a.m.)').fill('1.35');
  await proposal.getByLabel('Prazo (meses)').fill('18');
  await expect(page.locator('.save-indicator')).toContainText(/Rascunho salvo/);
  await proposal.getByRole('button', { name: 'Revisar e enviar proposta' }).click();
  await confirm(page, 'Enviar proposta');
  await expect(page.locator('.proposal-status')).toContainText('Proposta enviada · versão 1');

  // Comprador compara e pede aprovação ao CFO.
  await asPersona(page, 'Comprador');
  await page.goto(`${rfqUrl}#comparacao`);
  await expect(page.locator('#comparison-notice')).toBeVisible();
  await expect(page.locator('#view')).toContainText('Atlas Bank — DEMO');
  await tab(page, 'Aprovações').click();
  await page.getByRole('checkbox', { name: /Ricardo Alves/ }).check();
  await page.getByLabel('Contexto para quem aprova').fill('Única proposta com o valor integral.');
  await page.getByRole('button', { name: 'Solicitar aprovação' }).click();
  await expect(page.locator('.approval-card')).toContainText('Etapa 1 de 1');

  // Aprovador aprova com contexto.
  await asPersona(page, 'Aprovador');
  await page.goto('/demo/finance/approvals.html');
  const row = page.locator('.inbox-row', { hasText: 'Giro E2E' });
  await expect(row).toContainText('Aguardando você');
  await row.getByRole('button', { name: 'Ver contexto' }).click();
  const context = page.getByRole('dialog', { name: /Giro E2E/ });
  await expect(context).toContainText('Por que esta proposta');
  await context.getByRole('button', { name: 'Aprovar' }).click();
  await confirm(page, 'Aprovar');
  await expect(page.locator('.inbox-row', { hasText: 'Giro E2E' })).toHaveCount(0);

  // Comprador decide, registra contrato e vê a renovação.
  await asPersona(page, 'Comprador');
  await page.goto(`${rfqUrl}#decisao`);
  await page.getByRole('button', { name: 'Registrar decisão' }).click();
  await confirm(page, 'Registrar decisão');
  await expect(page.locator('#decisao-registrada')).toContainText('Atlas Bank — DEMO');
  await page.locator('#contract-form').getByRole('button', { name: 'Registrar contrato' }).click();
  await expect(page).toHaveURL(/\/demo\/finance\/contracts\.html#contract-/);
  await expect(page.locator('.contract-card.highlighted')).toContainText('Atlas Bank — DEMO');
  await expect(page.locator('.contract-card.highlighted .lifecycle-bar')).toBeVisible();
  const renewal = page.locator('.contract-card', { hasText: 'Cadência Adquirência — DEMO' }).first();
  await expect(renewal).toContainText('Janela de renovação aberta. Decida até');
  await renewal.getByRole('button', { name: 'Iniciar nova concorrência' }).click();
  await confirm(page, 'Criar rascunho');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Renovação de adquirência');
  expect(offending, 'a demonstração não pode chamar API real nem terceiros').toEqual([]);
});

test('comentário com menção gera notificação com deep link para o mencionado', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/demo/finance/dashboard.html');
  await page.goto(`/demo/finance/rfq.html?id=${CAPITAL}#atividade`);
  const box = page.getByLabel('Comentário', { exact: true });
  await box.fill('Podemos fechar hoje? @Ric');
  await page.getByRole('option', { name: /Ricardo Alves/ }).click();
  await expect(box).toHaveValue(/@Ricardo Alves/);
  await expect(page.locator('.composer').first()).toContainText('Somente sua empresa');
  await page.getByRole('button', { name: 'Publicar comentário' }).click();
  await expect(page.locator('.thread')).toContainText('Podemos fechar hoje?');
  await asPersona(page, 'Aprovador');
  await page.goto('/demo/finance/dashboard.html');
  await page.getByRole('button', { name: /Notificações, \d+ não lidas/ }).click();
  const panel = page.getByRole('dialog', { name: 'Notificações' });
  const mention = panel.getByRole('link', { name: /Marina Costa mencionou você/ }).first();
  await mention.click();
  await expect(page).toHaveURL(new RegExp(`rfq\\.html\\?id=${CAPITAL}#atividade`));
  await expect(tab(page, 'Atividade')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.thread')).toContainText('Podemos fechar hoje?');
  await page.goto('/demo/finance/notifications.html');
  const unreadMention = page.locator('#view .notice.unread', { hasText: 'Marina Costa mencionou você' });
  await expect(unreadMention).toHaveCount(1); // a menção antiga do conjunto inicial; a nova já foi lida
  await page.getByRole('button', { name: 'Marcar todas como lidas' }).click();
  await expect(page.locator('#view .notice.unread')).toHaveCount(0);
});

test('o estado da demo sobrevive a recarregar e o reset restaura o conjunto inicial', async ({ page }) => {
  await page.goto('/demo/finance/tasks.html');
  await page.getByLabel('Nova tarefa').fill('Tarefa criada no teste de persistência');
  await page.getByRole('button', { name: 'Adicionar' }).click();
  await expect(page.locator('.task-list')).toContainText('Tarefa criada no teste de persistência');
  await page.reload();
  await expect(page.locator('.task-list')).toContainText('Tarefa criada no teste de persistência');
  await page.goBack();
  await page.goForward();
  await expect(page.locator('.task-list')).toContainText('Tarefa criada no teste de persistência');
  await banner(page).getByRole('button', { name: 'Restaurar demonstração' }).click();
  await confirm(page, 'Restaurar dados iniciais');
  await expect(page).toHaveURL(/\/demo\/finance\/dashboard\.html$/);
  await page.goto('/demo/finance/tasks.html');
  await expect(page.locator('.task-list')).toContainText('Conferir garantias exigidas pela Atlas');
  await expect(page.locator('.task-list')).not.toContainText('Tarefa criada no teste de persistência');
});

test('estado adulterado no navegador volta ao conjunto inicial e nada é executado', async ({ page }) => {
  await page.goto('/demo/index.html');
  await page.evaluate(() => localStorage.setItem('arandu_demo_state_v1', JSON.stringify({ schema: 1, seed: 'acme-2026-09-v1', persona: 'root', data: { rfqs: '<script>' } })));
  await page.goto('/demo/finance/dashboard.html');
  await expect(page.locator('.toast')).toContainText('restaurado para o conjunto inicial');
  await expect(page.locator('#precisa-de-voce')).toBeVisible();
  // Campo editável com HTML: vira texto, nunca elemento.
  await page.goto('/demo/finance/new-rfq.html');
  await page.locator('#rfq-form').getByLabel('Título da solicitação').fill('<img src=x onerror="window.__xss=1">Teste');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.locator('#rfq-form').getByLabel('Valor desejado (R$)').fill('100000');
  await page.locator('#rfq-form').getByLabel('Finalidade').selectOption('outro');
  await page.locator('#rfq-form').getByLabel('Prazo desejado (meses)').fill('6');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Criar solicitação' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('<img src=x');
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  await expect(page.locator('main img[src="x"]')).toHaveCount(0);
});

test('persona muda superfície, não credencial', async ({ page, context }) => {
  await page.goto('/demo/finance/dashboard.html');
  await expect(page.getByRole('link', { name: 'Nova solicitação' }).first()).toBeVisible();
  await asPersona(page, 'Aprovador');
  await page.goto('/demo/finance/dashboard.html');
  await expect(page.getByRole('link', { name: 'Nova solicitação' })).toHaveCount(0);
  await expect(page.locator('#precisa-de-voce')).toContainText('Aprovar: Capital de giro');
  await page.goto('/demo/finance/new-rfq.html');
  await expect(page.locator('#view')).toContainText('Seu papel não cria solicitações');
  // Nenhum cookie ou token é criado pela troca de persona.
  expect(await context.cookies()).toEqual([]);
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys).toEqual(['arandu_demo_state_v1']);
});

test('busca global e central de comando funcionam por teclado na demo', async ({ page }) => {
  await page.goto('/demo/finance/dashboard.html');
  await expect(page.getByRole('button', { name: /Buscar/ })).toBeVisible();
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Buscar no espaço da empresa' });
  await dialog.getByRole('combobox').fill('adquirencia');
  await expect(dialog.getByRole('option', { name: /Revisão de adquirência/ }).first()).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/demo\/finance\/(rfq|contracts)\.html/);
});

const OVERDRAFT = 'de000000-0000-4000-8000-000400000008';

test('provedor aceita convite do conjunto inicial, salva parcial, recarrega e vê processo encerrado só para leitura', async ({ page }) => {
  const offending = watchNetwork(page);
  await page.goto('/demo/index.html');
  await page.getByRole('link', { name: 'Explorar demonstração' }).click();
  await asPersona(page, 'Provedor');
  // O rascunho que vence antes (3 dias) é a próxima ação, não o convite que vence em 6.
  await expect(page.locator('#provider-status')).toContainText('Revisão de adquirência');
  const invite = page.locator('#convites li', { hasText: 'Antecipação de recebíveis' });
  await invite.getByRole('button', { name: 'Aceitar' }).click();
  await expect(page).toHaveURL(/\/demo\/provider\/proposal\.html\?proposal=/);
  const form = page.locator('#proposal-form');
  await form.getByLabel('Produto ofertado').fill('Antecipação Atlas QA');
  await form.getByLabel('Valor ofertado (R$)').fill('1200000');
  await expect(page.locator('.save-indicator')).toContainText(/Rascunho salvo/);
  await page.reload();
  await expect(form.getByLabel('Valor ofertado (R$)')).toHaveValue('1200000');
  await expect(page.locator('.completion')).toContainText('falta Taxa, Prazo');
  // Processo em avaliação: nada editável, nada de botão de envio.
  await page.goto('/demo/provider/rfqs.html');
  await page.locator('#view').getByRole('link', { name: /Capital de giro — R\$ 3 milhões/ }).click();
  await expect(page.locator('#view')).toContainText('Condições enviadas (versão 2)');
  await expect(page.locator('#proposal-form')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Revisar e enviar/ })).toHaveCount(0);
  expect(offending).toEqual([]);
});

test('aprovador pede alterações em um caso e aprova outro; o comprador vê cada retorno uma vez', async ({ page }) => {
  await page.goto('/demo/index.html');
  await page.getByRole('link', { name: 'Explorar demonstração' }).click();
  await asPersona(page, 'Aprovador');
  await page.goto('/demo/finance/approvals.html');
  const overdraft = page.locator('.inbox-row', { hasText: 'Conta garantida' });
  await overdraft.getByRole('button', { name: 'Ver contexto' }).click();
  const context = page.getByRole('dialog', { name: /Conta garantida/ });
  // O aprovador decide sem sair do painel: demanda, motivo, comparação e histórico.
  await expect(context).toContainText('Por que esta proposta');
  await expect(context).toContainText('Mesma taxa nas duas propostas');
  await expect(context).toContainText('Nexa Crédito — DEMO');
  await expect(context).toContainText('Mudanças na solicitação');
  await context.getByRole('button', { name: 'Pedir alterações' }).click();
  const reason = page.getByRole('dialog').last();
  await reason.getByRole('button', { name: 'Pedir alterações' }).click();
  await expect(reason.getByLabel('Motivo')).toHaveAttribute('aria-invalid', 'true');
  await reason.getByLabel('Motivo').fill('Peça à Nexa o CET e confirme o limite de R$ 800 mil.');
  await reason.getByRole('button', { name: 'Pedir alterações' }).click();
  await expect(page.locator('.inbox-row', { hasText: 'Conta garantida' })).toHaveCount(0);
  const capital = page.locator('.inbox-row', { hasText: 'Capital de giro' });
  await capital.getByRole('button', { name: 'Aprovar' }).click();
  await confirm(page, 'Aprovar');
  await expect(page.locator('#view')).toContainText('Nenhuma decisão esperando por você');

  await asPersona(page, 'Comprador');
  await page.goto('/demo/finance/dashboard.html');
  const attention = page.locator('#precisa-de-voce');
  await expect(attention).toContainText('Alterações pedidas: Conta garantida');
  await expect(attention).toContainText('Peça à Nexa o CET');
  await expect(attention).toContainText('Registrar decisão: Capital de giro');
  await expect(attention).not.toContainText('Avaliar propostas: Conta garantida');
  await page.goto(`/demo/finance/rfq.html?id=${OVERDRAFT}`);
  await expect(page.locator('.next-step')).toContainText('Alterações pedidas na aprovação');
});

test('confidencialidade entre provedores: pergunta de concorrente e documentos internos nunca chegam ao Atlas', async ({ page }) => {
  const offending = watchNetwork(page);
  await page.goto('/demo/index.html');
  await page.getByRole('link', { name: 'Explorar demonstração' }).click();
  // Comprador anexa um arquivo compartilhado; só metadados existem na demonstração.
  await page.goto(`/demo/finance/rfq.html?id=${CAPITAL}`);
  const docs = page.locator('#documentos');
  await expect(docs).toContainText('Balanço patrimonial 2025');
  await docs.getByText('Anexar documento', { exact: true }).first().click();
  await docs.locator('.document-form input[type=file]').setInputFiles({ name: 'Cronograma de garantias.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
  await docs.getByRole('radio', { name: /Visível aos provedores/ }).check();
  await docs.locator('.document-form').getByRole('button', { name: 'Anexar documento' }).click();
  await expect(docs.locator('.document-status')).toContainText('Documento anexado');
  await docs.getByRole('button', { name: /Baixar Cronograma de garantias/ }).click();
  await expect(page.locator('.toast-region')).toContainText('nenhum arquivo é armazenado');

  await asPersona(page, 'Provedor');
  await page.goto('/demo/provider/rfqs.html');
  await page.locator('#view').getByRole('link', { name: /Capital de giro — R\$ 3 milhões/ }).click();
  const view = page.locator('#view');
  await expect(view).toContainText('Minuta de garantias aceitas');
  await expect(view).toContainText('Cronograma de garantias');
  await expect(view).not.toContainText('Balanço patrimonial 2025');
  await expect(view).not.toContainText('Vocês aceitam garantia 100%');
  await expect(view).toContainText('Resposta da empresa a uma pergunta enviada por outra instituição');
  await expect(view).toContainText('Da empresa a todos os provedores convidados');
  const stored = await page.evaluate(() => localStorage.getItem('arandu_demo_state_v1'));
  expect(stored).not.toContain('%PDF');
  expect(offending).toEqual([]);
});

test('console operacional de exemplo mostra saúde, não dados de clientes', async ({ page }) => {
  await page.goto('/demo/index.html');
  await page.getByRole('link', { name: 'Explorar demonstração' }).click();
  await page.goto('/demo/finance/ops.html');
  const view = page.locator('#view');
  await expect(view).toContainText('Execuções de jobs');
  await expect(view).toContainText('upstream_unavailable');
  await expect(view).toContainText('Outbox de e-mail');
  await expect(view).not.toContainText(/R\$|Capital de giro|Atlas Bank|%/);
  await view.getByLabel('Rastrear').fill('demo-req-0930');
  await view.getByRole('button', { name: 'Rastrear' }).click();
  await expect(view).toContainText('Nenhum evento para este identificador');
});
