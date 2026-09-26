// Lista operacional de solicitações e assistente de criação.

import { PRODUCTS, PRODUCT_IDS, checkAcquiringShares } from '../../../lib/finance/products.mjs';
import { el, icon, fold, daysUntil, relativeDays, formatDate, formatDateTime, productLabel, demandHeadline, RFQ_STATUS, fieldValue, todayIso } from '../core.js';
import { pill, linkButton, button, emptyState, person, progress, field, catalogControl, saveIndicator, toast, confirmDialog, tag } from '../ui.js';

const NEXT_ACTION = {
  draft: 'Convidar e abrir', open: 'Aguardar respostas', collecting: 'Acompanhar respostas', comparing: 'Avaliar e decidir',
  decided: 'Registrar contrato', contracted: 'Acompanhar contrato', closed: '—', cancelled: '—'
};
function nextAction(rfq) {
  if (rfq.pending_approval) return 'Aguardando aprovação';
  if (['open', 'collecting'].includes(rfq.status) && !(rfq.invites || []).length && !rfq.invites_count) return 'Convidar provedores';
  return NEXT_ACTION[rfq.status] || '—';
}

export async function rfqList(ctx) {
  const rfqs = ctx.data.rfqs || [];
  ctx.header({
    title: 'Solicitações', subtitle: 'Todas as concorrências de crédito e adquirência da empresa.',
    actions: ctx.can('create_rfq') ? [linkButton('Nova solicitação', ctx.href('/finance/new-rfq.html'), { variant: 'primary', iconName: 'plus' })] : []
  });
  const root = el('div', { class: 'list-page' });
  if (!rfqs.length) {
    root.append(emptyState({ title: 'Nenhuma solicitação ainda', text: 'Estruture uma necessidade de crédito ou de adquirência; o Arandu organiza convites, propostas, comparação e aprovação.', iconName: 'file',
      action: ctx.can('create_rfq') ? linkButton('Criar a primeira solicitação', ctx.href('/finance/new-rfq.html'), { variant: 'primary', iconName: 'plus' }) : null }));
    return root;
  }
  const params = new URLSearchParams(location.search);
  const search = el('input', { type: 'search', class: 'input', placeholder: 'Buscar por título…', value: params.get('q') || '', 'aria-label': 'Buscar solicitação por título' });
  const status = el('div', { class: 'chips', role: 'group', 'aria-label': 'Filtrar por status' });
  const statuses = [['', 'Todas'], ['draft', 'Rascunho'], ['open', 'Abertas'], ['collecting', 'Em coleta'], ['comparing', 'Em avaliação'], ['decided', 'Decididas'], ['contracted', 'Contratadas']];
  let activeStatus = params.get('status') || '';
  for (const [value, label] of statuses) {
    const count = value ? rfqs.filter((rfq) => rfq.status === value).length : rfqs.length;
    const chip = el('button', { type: 'button', class: 'chip', 'aria-pressed': String(value === activeStatus), dataset: { status: value } }, [el('span', { text: label }), el('span', { class: 'chip-count', text: String(count) })]);
    chip.addEventListener('click', () => { activeStatus = value; for (const node of status.children) node.setAttribute('aria-pressed', String(node.dataset.status === value)); draw(); });
    status.append(chip);
  }
  const product = el('select', { class: 'input', 'aria-label': 'Filtrar por produto' });
  product.add(new Option('Todos os produtos', ''));
  for (const id of PRODUCT_IDS) product.add(new Option(productLabel(id, { short: true }), id));
  product.value = params.get('product') || '';
  const owners = [...new Map(rfqs.map((rfq) => [rfq.owner_id, rfq.owner_name])).entries()].filter(([id]) => id);
  const owner = el('select', { class: 'input', 'aria-label': 'Filtrar por responsável' });
  owner.add(new Option('Qualquer responsável', ''));
  for (const [id, name] of owners) owner.add(new Option(name || 'Membro', id));
  owner.value = params.get('owner') || '';
  const sort = el('select', { class: 'input', 'aria-label': 'Ordenar solicitações' });
  for (const [value, label] of [['deadline', 'Prazo mais próximo'], ['recent', 'Mais recentes'], ['responses', 'Mais respostas']]) sort.add(new Option(label, value));
  sort.value = params.get('sort') || 'deadline';
  const count = el('span', { class: 'result-count', role: 'status', 'aria-live': 'polite' });
  const clear = button('Limpar filtros', { variant: 'ghost', size: 'sm', onClick: () => { search.value = ''; product.value = ''; owner.value = ''; activeStatus = ''; for (const node of status.children) node.setAttribute('aria-pressed', String(node.dataset.status === '')); draw(); } });

  const table = el('table', { class: 'data-table rfq-table' });
  table.append(el('thead', {}, el('tr', {}, ['Solicitação', 'Status', 'Responsável', 'Prazo', 'Respostas', 'Próxima ação'].map((label) => el('th', { scope: 'col', text: label })))));
  const body = el('tbody');
  table.append(body);
  const empty = el('div', { hidden: true }, emptyState({ title: 'Nenhuma solicitação com esses filtros', text: 'Ajuste a busca ou limpe os filtros para ver tudo.', iconName: 'search', action: clear }));

  function draw() {
    const term = fold(search.value.trim());
    const visible = rfqs.filter((rfq) => (!activeStatus || rfq.status === activeStatus)
      && (!product.value || rfq.product === product.value) && (!owner.value || rfq.owner_id === owner.value)
      && (!term || fold(`${rfq.title} ${rfq.description || ''}`).includes(term)));
    visible.sort((a, b) => sort.value === 'recent' ? String(b.created_at).localeCompare(String(a.created_at))
      : sort.value === 'responses' ? (b.proposals || []).length - (a.proposals || []).length
        : String(['open', 'collecting', 'comparing', 'draft'].includes(a.status) ? a.response_deadline || '9999' : 'z').localeCompare(String(['open', 'collecting', 'comparing', 'draft'].includes(b.status) ? b.response_deadline || '9999' : 'z')));
    body.replaceChildren();
    for (const rfq of visible) {
      const days = daysUntil(rfq.response_deadline);
      const live = ['open', 'collecting'].includes(rfq.status);
      const invited = (rfq.invites || []).length || rfq.invites_count || 0;
      body.append(el('tr', { class: 'row-link' }, [
        el('td', { 'data-label': 'Solicitação', class: 'cell-primary' }, [
          el('a', { class: 'row-title stretched', href: ctx.href(`/finance/rfq.html?id=${encodeURIComponent(rfq.id)}`), text: rfq.title }),
          el('span', { class: 'row-sub', text: `${productLabel(rfq.product, { short: true })} · ${demandHeadline(rfq)} · rev. ${rfq.revision || 1}` })
        ]),
        el('td', { 'data-label': 'Status' }, pill(RFQ_STATUS[rfq.status], { size: 'sm' })),
        el('td', { 'data-label': 'Responsável' }, person(rfq.owner_name || 'Membro')),
        el('td', { 'data-label': 'Prazo', class: live && days !== null && days <= 2 ? 'urgent' : '' }, rfq.response_deadline
          ? el('span', { class: 'date-cell' }, [el('span', { text: formatDate(rfq.response_deadline, { withYear: false }) }), live ? el('span', { class: 'date-rel', text: relativeDays(rfq.response_deadline) }) : null])
          : el('span', { class: 'muted', text: 'sem prazo' })),
        el('td', { 'data-label': 'Respostas' }, invited || (rfq.proposals || []).length ? progress((rfq.proposals || []).length, Math.max(invited, (rfq.proposals || []).length), { label: `${(rfq.proposals || []).length} de ${invited} provedores responderam` }) : el('span', { class: 'muted', text: 'sem convites' })),
        el('td', { 'data-label': 'Próxima ação', class: 'next-action' }, [el('span', { text: nextAction(rfq) }), icon('chevronRight', { size: 14 })])
      ]));
    }
    count.textContent = `${visible.length} de ${rfqs.length}`;
    table.hidden = !visible.length;
    empty.hidden = Boolean(visible.length);
    const next = new URLSearchParams();
    if (search.value.trim()) next.set('q', search.value.trim());
    if (activeStatus) next.set('status', activeStatus);
    if (product.value) next.set('product', product.value);
    if (owner.value) next.set('owner', owner.value);
    if (sort.value !== 'deadline') next.set('sort', sort.value);
    history.replaceState(null, '', `${location.pathname}${next.toString() ? `?${next}` : ''}`);
  }
  for (const control of [search, product, owner, sort]) control.addEventListener(control === search ? 'input' : 'change', draw);
  root.append(
    el('div', { class: 'toolbar' }, [el('div', { class: 'toolbar-search' }, [icon('search'), search]), product, owner, sort, count]),
    el('div', { class: 'toolbar-chips' }, status),
    el('div', { class: 'table-card' }, [table, empty])
  );
  draw();
  return root;
}

// ------------------------------------------------------------- assistente
const NEED_KEYS = {
  credit: ['amount', 'purpose', 'term_months', 'grace_months'],
  acquiring: ['monthly_volume', 'average_ticket', 'share_debit', 'share_credit_cash', 'share_credit_installment', 'share_pix', 'average_installments']
};
const HINTS = {
  amount: 'Valor total da operação que a empresa quer contratar.',
  purpose: 'Ajuda o provedor a escolher o produto certo.',
  term_months: 'Prazo total, incluindo a carência.',
  grace_months: 'Meses iniciais sem pagar principal. Deixe em branco se não precisar.',
  monthly_volume: 'Soma mensal das vendas em cartão, em reais.',
  share_debit: 'As quatro fatias (débito, crédito à vista, parcelado e PIX) devem somar 100%.',
  current_acquirer: 'Não é enviado como avaliação — só contexto para o provedor.',
  collateral: 'Garantias que a empresa pode oferecer. Evite dados pessoais.'
};
const PROFILE_TO_DEMAND = { sector: 'setor', collateral: 'garantias_disponiveis', current_acquirer: 'adquirente_atual' };
const STEPS = ['Produto', 'Necessidade', 'Condições', 'Revisão'];

export async function newRfq(ctx) {
  ctx.header({ title: 'Nova solicitação', subtitle: 'Quatro etapas. O rascunho é salvo automaticamente enquanto você preenche.',
    crumbs: [{ label: 'Solicitações', href: ctx.href('/finance/rfqs.html') }, { label: 'Nova' }] });
  if (!ctx.can('create_rfq')) {
    return emptyState({ title: 'Seu papel não cria solicitações', text: 'Aprovadores e leitores acompanham e decidem. Peça a alguém da gestão financeira para criar a solicitação.', iconName: 'lock' });
  }
  const params = new URLSearchParams(location.search);
  const source = (ctx.data.rfqs || []).find((rfq) => rfq.id === params.get('clone')) || null;
  const profile = ctx.data.profile || [];
  const root = el('div', { class: 'wizard' });
  if (params.get('clone') && !source) root.append(el('p', { class: 'callout callout-warning' }, [icon('alert'), el('span', { text: 'A solicitação de origem não está disponível nesta organização. Comece uma nova demanda sem dados copiados.' })]));

  const form = el('form', { id: 'rfq-form', class: 'wizard-form', novalidate: true });
  const stepper = el('ol', { class: 'steps stepper', 'aria-label': 'Etapas da solicitação' });
  const progressBar = el('div', { class: 'wizard-progress', role: 'progressbar', 'aria-valuemin': '1', 'aria-valuemax': '4', 'aria-label': 'Progresso' }, el('span', { class: 'wizard-progress-fill' }));
  const fieldsets = STEPS.map((label, index) => el('fieldset', { 'data-step': String(index), class: 'wizard-step' }, el('legend', { class: 'step-legend', text: `${label}` })));
  const [productStep, needStep, conditionStep, reviewStep] = fieldsets;
  const wraps = new Map();
  let current = 0;
  let highest = 0;

  // Etapa 1 — produto e título. Rádios nativos: teclado e leitor de tela de graça.
  form.append(...fieldsets);
  const productCards = el('div', { class: 'choice-cards', role: 'radiogroup', 'aria-label': 'Produto financeiro' });
  for (const id of PRODUCT_IDS) {
    const input = el('input', { type: 'radio', name: 'product', value: id, class: 'choice-input', id: `product-${id}` });
    productCards.append(el('label', { class: 'choice-card', for: `product-${id}` }, [
      input,
      el('span', { class: 'choice-icon' }, icon(id === 'credit' ? 'briefcase' : 'layers', { size: 20 })),
      el('span', { class: 'choice-title', text: PRODUCTS[id].label }),
      el('span', { class: 'choice-text', text: PRODUCTS[id].summary })
    ]));
  }
  const productSelect = {
    get value() { return form.elements.namedItem('product')?.value || PRODUCT_IDS[0]; },
    set value(id) { for (const input of productCards.querySelectorAll('input')) input.checked = input.value === id; },
    addEventListener: (type, handler) => productCards.addEventListener(type, handler)
  };
  const title = el('input', { name: 'title', type: 'text', maxlength: '200', autocomplete: 'off', placeholder: 'Ex.: Capital de giro — R$ 3 milhões' });
  const titleField = field({ label: 'Título da solicitação', control: title, required: true, hint: 'Os provedores veem este título. Seja específico e evite dados sigilosos.' });
  const description = el('textarea', { name: 'description', rows: '3', maxlength: '4000', placeholder: 'Contexto que ajuda o provedor a ofertar melhor.' });
  const descriptionField = field({ label: 'Contexto da necessidade', control: description, optionalLabel: true });
  productStep.append(productCards, titleField, descriptionField);
  wraps.set('title', titleField);

  const deadline = el('input', { name: 'response_deadline', type: 'date', min: todayIso() });
  const deadlineField = field({ label: 'Prazo de resposta dos provedores', control: deadline, hint: 'Depois desta data a solicitação deixa de aparecer como aberta para resposta.' });
  wraps.set('response_deadline', deadlineField);

  function renderFields() {
    const spec = PRODUCTS[productSelect.value];
    const previous = Object.fromEntries(new FormData(form));
    needStep.replaceChildren(el('legend', { class: 'step-legend', text: 'Necessidade' }), el('p', { class: 'step-intro', text: productSelect.value === 'credit' ? 'O essencial para qualquer provedor cotar crédito.' : 'O perfil de recebimentos define quanto cada taxa pesa no custo.' }));
    conditionStep.replaceChildren(el('legend', { class: 'step-legend', text: 'Condições' }), el('p', { class: 'step-intro', text: 'Detalhes que refinam a proposta. Tudo aqui é opcional, exceto o que estiver marcado.' }));
    const needKeys = new Set(NEED_KEYS[productSelect.value]);
    const needGrid = el('div', { class: 'field-grid' });
    const conditionGrid = el('div', { class: 'field-grid' });
    for (const spec2 of spec.demandFields) {
      const control = catalogControl(spec2, previous[spec2.key] ?? null);
      control.setAttribute('aria-label', spec2.label);
      const reused = profile.find((row) => row.field_key === PROFILE_TO_DEMAND[spec2.key]);
      if (reused && !control.value && spec2.type === 'text') control.value = reused.field_value;
      const wrap = field({ label: spec2.label, control, required: Boolean(spec2.required),
        hint: reused ? `Preenchido com o perfil da empresa (atualizado em ${formatDate(reused.updated_at)}).` : HINTS[spec2.key] || null,
        className: spec2.type === 'text' && (spec2.max ?? 0) > 400 ? 'span-2' : '' });
      wraps.set(spec2.key, wrap);
      (needKeys.has(spec2.key) ? needGrid : conditionGrid).append(wrap);
    }
    conditionGrid.prepend(deadlineField);
    needStep.append(needGrid);
    if (productSelect.value === 'acquiring') needStep.append(el('p', { class: 'share-meter', id: 'share-meter', role: 'status', 'aria-live': 'polite' }));
    conditionStep.append(conditionGrid);
    updateShares();
  }
  function updateShares() {
    const meter = form.querySelector('#share-meter');
    if (!meter) return;
    const values = Object.fromEntries(['share_debit', 'share_credit_cash', 'share_credit_installment', 'share_pix'].map((key) => [key, form.elements.namedItem(key)?.value]).filter(([, value]) => value !== '' && value !== undefined).map(([key, value]) => [key, Number(value)]));
    const result = checkAcquiringShares(values);
    const total = Object.values(values).reduce((sum, value) => sum + value, 0);
    meter.dataset.state = !Object.keys(values).length ? 'idle' : result.errors.length ? 'error' : result.warnings.length ? 'warn' : 'ok';
    meter.replaceChildren(icon(meter.dataset.state === 'ok' ? 'checkCircle' : meter.dataset.state === 'idle' ? 'info' : 'alert', { size: 14 }),
      el('span', { text: Object.keys(values).length ? `Mix declarado: ${total.toLocaleString('pt-BR')}% de 100%` : 'Preencha as fatias do mix de recebimentos (devem somar 100%).' }));
  }

  // Revisão.
  const review = el('div', { id: 'rfq-review', role: 'status', 'aria-live': 'polite' });
  reviewStep.append(el('p', { class: 'step-intro', text: 'Confira antes de criar. Nada é enviado a provedores até você convidar e abrir a solicitação.' }), review);
  function payload() {
    const entries = Object.fromEntries(new FormData(form));
    const product = entries.product;
    const demand = {};
    for (const spec of PRODUCTS[product].demandFields) if (entries[spec.key] !== undefined && entries[spec.key] !== '') demand[spec.key] = entries[spec.key];
    return { product, title: (entries.title || '').trim(), description: (entries.description || '').trim(), response_deadline: entries.response_deadline || null, demand };
  }
  const submit = el('button', { type: 'submit', id: 'rfq-submit', class: 'btn btn-primary' }, [icon('check'), el('span', { class: 'btn-label', text: 'Criar solicitação' })]);
  function renderReview() {
    const data = payload();
    const spec = PRODUCTS[data.product];
    review.replaceChildren();
    const sections = [
      ['Produto', 0, [['Produto', spec.label], ['Título', data.title || '—'], ['Contexto', data.description || 'Não informado']]],
      ['Necessidade', 1, spec.demandFields.filter((item) => NEED_KEYS[data.product].includes(item.key)).map((item) => [item.label, fieldValue(item, data.demand[item.key]) ?? 'Não informado'])],
      ['Condições', 2, [['Prazo de resposta', data.response_deadline ? formatDate(data.response_deadline) : 'Sem prazo definido'],
        ...spec.demandFields.filter((item) => !NEED_KEYS[data.product].includes(item.key) && data.demand[item.key] !== undefined).map((item) => [item.label, fieldValue(item, data.demand[item.key])])]]
    ];
    for (const [label, step, rows] of sections) {
      const edit = el('button', { type: 'button', class: 'link-btn', 'aria-label': `Editar ${label}` }, [icon('edit', { size: 14 }), el('span', { text: 'Editar' })]);
      edit.addEventListener('click', () => show(step, { focus: true }));
      review.append(el('section', { class: 'review-block' }, [
        el('div', { class: 'review-head' }, [el('h3', { text: label }), edit]),
        el('dl', { class: 'deflist deflist-2' }, rows.map(([key, value]) => el('div', { class: 'deflist-row' }, [el('dt', { text: key }), el('dd', { class: value === 'Não informado' ? 'missing' : '', text: value })])))
      ]));
    }
    let blocked = false;
    if (data.product === 'acquiring') {
      const shares = checkAcquiringShares(Object.fromEntries(Object.entries(data.demand).map(([key, value]) => [key, Number(value)])));
      for (const message of shares.errors) review.append(el('p', { class: 'callout callout-danger' }, [icon('alert'), el('span', { text: message })]));
      for (const message of shares.warnings) review.append(el('p', { class: 'callout callout-warning' }, [icon('alert'), el('span', { text: message })]));
      blocked = !shares.ok;
    }
    submit.disabled = blocked;
  }

  // Navegação entre etapas.
  const back = button('Voltar', { variant: 'ghost', iconName: 'chevronLeft', attrs: { id: 'rfq-back' } });
  const next = el('button', { type: 'button', id: 'rfq-next', class: 'btn btn-primary' }, [el('span', { class: 'btn-label', text: 'Continuar' }), icon('arrowRight')]);
  const errorSummary = el('div', { class: 'callout callout-danger', role: 'alert', hidden: true, tabindex: '-1' });
  for (const [index, label] of STEPS.entries()) {
    const item = el('li', { 'data-step': String(index), class: 'stepper-item' }, [
      el('button', { type: 'button', class: 'stepper-button', disabled: true }, [el('span', { class: 'stepper-index', text: String(index + 1) }), el('span', { class: 'stepper-label', text: `${index + 1}. ${label}` })])
    ]);
    item.querySelector('button').addEventListener('click', () => { if (index <= highest) show(index, { focus: true }); });
    stepper.append(item);
  }
  function validate(step) {
    const scope = fieldsets[step];
    const problems = [];
    for (const control of scope.querySelectorAll('input, select, textarea')) {
      const wrap = control.closest('.field');
      let message = '';
      if (control.required && !String(control.value).trim()) message = 'Campo obrigatório.';
      else if (control.name === 'title' && control.value.trim().length < 3) message = 'Use pelo menos 3 caracteres.';
      else if (control.type === 'number' && control.value !== '' && !control.checkValidity()) message = control.validationMessage || 'Valor fora do permitido.';
      else if (control.name === 'response_deadline' && control.value && control.value < todayIso()) message = 'O prazo não pode estar no passado.';
      wrap?.setError?.(message);
      if (message) problems.push({ control, label: wrap?.querySelector('.field-label')?.firstChild?.textContent || control.name, message });
    }
    if (problems.length) {
      errorSummary.replaceChildren(icon('alert'), el('span', { text: `${problems.length === 1 ? 'Corrija 1 campo' : `Corrija ${problems.length} campos`} para continuar: ${problems.map((item) => item.label).join(', ')}.` }));
      errorSummary.hidden = false;
      problems[0].control.focus();
      return false;
    }
    errorSummary.hidden = true;
    return true;
  }
  function show(index, { focus = false } = {}) {
    current = Math.max(0, Math.min(3, index));
    highest = Math.max(highest, current);
    fieldsets.forEach((node, position) => { node.hidden = position !== current; });
    for (const item of stepper.children) {
      const position = Number(item.dataset.step);
      item.classList.toggle('done', position < current);
      item.querySelector('button').disabled = position > highest;
      if (position === current) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
    }
    progressBar.setAttribute('aria-valuenow', String(current + 1));
    progressBar.setAttribute('aria-valuetext', `Etapa ${current + 1} de 4: ${STEPS[current]}`);
    progressBar.firstChild.style.width = `${((current + 1) / 4) * 100}%`;
    back.hidden = current === 0;
    next.hidden = current === 3;
    submit.hidden = current !== 3;
    if (current === 3) renderReview();
    if (focus) fieldsets[current].querySelector('input, select, textarea, button')?.focus();
    updateSummary();
  }
  next.addEventListener('click', () => { if (validate(current)) show(current + 1, { focus: true }); });
  back.addEventListener('click', () => show(current - 1, { focus: true }));
  productSelect.addEventListener('change', () => { renderFields(); updateSummary(); });

  // Resumo lateral.
  const summaryBody = el('div', { class: 'summary-body' });
  const indicator = saveIndicator('idle', ctx.mode === 'demo' ? 'Rascunho salvo neste navegador (demonstração)' : 'Carregando rascunho…');
  const retry = button('Tentar novamente', { size: 'sm', iconName: 'refresh', attrs: { hidden: true } });
  const summary = el('aside', { class: 'wizard-summary', 'aria-label': 'Resumo da solicitação' }, [
    el('div', { class: 'summary-head' }, [el('h2', { class: 'summary-title', text: 'Resumo' }), indicator.node]),
    summaryBody, retry,
    el('p', { class: 'summary-foot' }, [icon('lock', { size: 12 }), el('span', { text: 'Só a sua empresa vê o rascunho. Provedores recebem a solicitação apenas quando convidados.' })])
  ]);
  function updateSummary() {
    const data = payload();
    const spec = PRODUCTS[data.product];
    const required = spec.demandFields.filter((item) => item.required);
    const filled = required.filter((item) => data.demand[item.key] !== undefined).length + (data.title.length >= 3 ? 1 : 0);
    summaryBody.replaceChildren(
      el('p', { class: 'summary-product' }, [icon(data.product === 'credit' ? 'briefcase' : 'layers', { size: 14 }), el('span', { text: spec.label })]),
      el('p', { class: 'summary-name', text: data.title || 'Sem título ainda' }),
      el('dl', { class: 'summary-list' }, spec.demandFields.filter((item) => data.demand[item.key] !== undefined).slice(0, 6).map((item) =>
        el('div', {}, [el('dt', { text: item.label }), el('dd', { text: fieldValue(item, data.demand[item.key]) })]))),
      el('p', { class: 'summary-meta', text: `${filled} de ${required.length + 1} campos obrigatórios · prazo ${data.response_deadline ? formatDate(data.response_deadline) : 'não definido'}` })
    );
  }

  // Autosave no servidor (ou no motor da demonstração).
  let editorRevision = 0;
  let dirty = false;
  let conflicted = false;
  let pending = null;
  let timer;
  let sequence = 0;
  const save = async () => {
    if (!dirty || conflicted || pending) return;
    if (!navigator.onLine) { indicator.set('offline', 'Sem conexão — salvaremos quando a rede voltar'); return; }
    const mark = sequence;
    indicator.set('saving', 'Salvando…');
    retry.hidden = true;
    const data = payload();
    pending = ctx.api('rfq-editor', { method: 'PATCH', body: JSON.stringify({ organization_id: ctx.organization.id, ...data, expected_revision: editorRevision }) });
    try {
      const result = await pending;
      editorRevision = result.revision;
      if (sequence === mark) { dirty = false; indicator.set('saved', `Salvo às ${new Date(result.updated_at || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`); }
      else indicator.set('dirty', 'Alterações não salvas…');
    } catch (error) {
      if (error.status === 409) {
        conflicted = true;
        indicator.set('conflict', 'Rascunho alterado em outra aba');
        showConflict();
      } else {
        indicator.set('error', 'Falha ao salvar');
        retry.hidden = false;
      }
    } finally {
      pending = null;
      if (dirty && !conflicted && retry.hidden) timer = setTimeout(save, 650);
    }
  };
  retry.addEventListener('click', () => save());
  window.addEventListener('online', () => { if (dirty) save(); });
  window.addEventListener('offline', () => indicator.set('offline', 'Sem conexão — salvaremos quando a rede voltar'));
  const conflictBox = el('div', { class: 'callout callout-warning conflict', role: 'alert', hidden: true });
  function showConflict() {
    const reload = button('Carregar a versão da outra aba', { variant: 'primary', size: 'sm', iconName: 'refresh', onClick: () => location.reload() });
    const keep = button('Manter o que está aqui', { size: 'sm', onClick: async () => {
      try {
        const { draft } = await ctx.api(`rfq-editor?organization_id=${encodeURIComponent(ctx.organization.id)}`);
        editorRevision = draft?.revision ?? 0;
        conflicted = false;
        dirty = true;
        conflictBox.hidden = true;
        await save();
        toast('Esta versão substituiu o rascunho da outra aba.');
      } catch (error) { toast(error.message, 'error'); }
    } });
    conflictBox.replaceChildren(icon('alert'), el('div', {}, [
      el('strong', { text: 'Este rascunho foi alterado em outra aba ou janela.' }),
      el('p', { text: 'Para não apagar o trabalho feito lá, esta aba parou de salvar. Escolha qual versão continua.' }),
      el('div', { class: 'callout-actions' }, [reload, keep])
    ]));
    conflictBox.hidden = false;
  }
  form.addEventListener('input', (event) => {
    if (event.target.name?.startsWith('share_')) updateShares();
    const wrap = event.target.closest?.('.field');
    wrap?.setError?.('');
    updateSummary();
    dirty = true;
    sequence += 1;
    if (conflicted) return;
    indicator.set('dirty', 'Alterações não salvas…');
    clearTimeout(timer);
    timer = setTimeout(save, 650);
  });

  // Montagem.
  productSelect.value = source?.product || PRODUCT_IDS[0];
  renderFields();
  deadline.value = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  const recovered = el('div', { class: 'callout callout-info', hidden: true, role: 'status' });
  if (source) {
    title.value = `Nova solicitação — ${source.title}`.slice(0, 200);
    description.value = source.description || '';
    for (const spec of PRODUCTS[source.product].demandFields) {
      const input = form.elements.namedItem(spec.key);
      const value = source.demand?.[spec.key];
      if (input && value !== null && value !== undefined) input.value = String(value);
    }
    if (source.response_deadline && source.response_deadline > todayIso()) deadline.value = source.response_deadline;
    root.append(el('p', { class: 'callout callout-info' }, [icon('info'), el('span', { text: 'Dados da demanda anterior pré-preenchidos. Revise tudo antes de criar o novo rascunho. Convites, propostas e decisões não são copiados.' })]));
  }
  ctx.api(`rfq-editor?organization_id=${encodeURIComponent(ctx.organization.id)}`).then(({ draft }) => {
    editorRevision = draft?.revision ?? 0;
    if (draft?.payload && !source && !dirty && PRODUCTS[draft.payload.product]) {
      productSelect.value = draft.payload.product;
      renderFields();
      for (const [key, value] of Object.entries({ title: draft.payload.title, description: draft.payload.description, response_deadline: draft.payload.response_deadline, ...draft.payload.demand })) {
        const input = form.elements.namedItem(key);
        if (input && value !== null && value !== undefined) input.value = String(value);
      }
      updateShares();
      updateSummary();
      indicator.set('saved', `Rascunho recuperado (salvo ${formatDateTime(draft.updated_at)})`);
      const discard = button('Descartar e começar do zero', { size: 'sm', variant: 'ghost', onClick: async () => {
        if (!await confirmDialog({ title: 'Descartar o rascunho?', description: 'Os campos preenchidos serão apagados. Esta ação não afeta nenhuma solicitação já criada.', confirmLabel: 'Descartar', tone: 'danger' })) return;
        try {
          await ctx.api('rfq-editor', { method: 'DELETE', body: JSON.stringify({ organization_id: ctx.organization.id, expected_revision: editorRevision }) });
          location.reload();
        } catch (error) { toast(error.message, 'error'); }
      } });
      recovered.replaceChildren(icon('refresh'), el('span', { text: `Recuperamos o rascunho que você deixou em ${formatDateTime(draft.updated_at)}.` }), discard);
      recovered.hidden = false;
    } else {
      indicator.set('idle', draft ? 'Rascunho anterior disponível' : 'Salvamento automático ativo');
    }
  }).catch(() => {
    indicator.set('error', 'Não foi possível carregar o rascunho');
    retry.hidden = false;
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    for (const step of [0, 1, 2]) if (!validate(step)) { show(step, { focus: true }); validate(step); return; }
    if (conflicted) { toast('Resolva o conflito com a outra aba antes de criar.', 'error'); return; }
    submit.disabled = true;
    submit.querySelector('.btn-label').textContent = 'Criando…';
    try {
      clearTimeout(timer);
      if (pending) await pending.catch(() => {});
      const result = await ctx.api('rfqs', { method: 'POST', body: JSON.stringify({ organization_id: ctx.organization.id, ...payload() }) });
      if (editorRevision) await ctx.api('rfq-editor', { method: 'DELETE', body: JSON.stringify({ organization_id: ctx.organization.id, expected_revision: editorRevision }) }).catch(() => {});
      dirty = false;
      toast(['Solicitação criada como rascunho.', ...(result.warnings || [])].join(' '));
      location.assign(ctx.href(`/finance/rfq.html?id=${encodeURIComponent(result.id)}&created=1`));
    } catch (error) {
      toast(error.status === 401 ? 'Entre na sua conta para criar uma solicitação.' : error.message, 'error');
      submit.disabled = false;
      submit.querySelector('.btn-label').textContent = 'Criar solicitação';
    }
  });
  window.addEventListener('beforeunload', (event) => { if (dirty && (pending || !conflicted)) { save(); if (dirty && ctx.mode !== 'demo') event.preventDefault(); } });

  const nav = el('div', { class: 'wizard-nav' }, [back, el('span', { class: 'spacer' }), next, submit]);
  form.append(nav);
  const mobileSummary = el('details', { class: 'wizard-summary-mobile' }, [el('summary', {}, [el('span', { text: 'Resumo e salvamento' })])]);
  root.append(recovered, conflictBox, el('div', { class: 'wizard-layout' }, [
    el('div', { class: 'wizard-main card' }, [stepper, progressBar, errorSummary, form]),
    summary
  ]));
  // No celular o resumo vira um bloco recolhível acima do formulário.
  const media = window.matchMedia('(max-width: 959px)');
  const placeSummary = () => {
    if (media.matches) { if (!mobileSummary.contains(summary)) { mobileSummary.append(summary); root.querySelector('.wizard-main').before(mobileSummary); } }
    else if (mobileSummary.contains(summary)) { root.querySelector('.wizard-layout').append(summary); mobileSummary.remove(); }
  };
  media.addEventListener?.('change', placeSummary);
  queueMicrotask(placeSummary);
  show(0);
  return root;
}

export { tag };
