// Intake da demonstração (/finance/intake.html): "O que você precisa fazer?"
//
// Formulários inteligentes DETERMINÍSTICOS: cada necessidade pergunta só o
// que muda a cotação, pré-preenche o que o perfil financeiro já sabe (com a
// origem do dado) e mostra, antes de começar, qual política de aprovação vai
// valer. Nenhuma sugestão de instituição, nenhuma IA: regras fixas, visíveis.
// Ao continuar, o rascunho vai para o editor do produto (PATCH rfq-editor) e a
// pessoa revisa tudo no formulário completo antes de criar.

import { el, icon, money, fold } from '../../../src/core.js';
import { button, card, emptyState, toast, promptDialog } from '../../../src/ui.js';
import { readOS, updateOS, uid } from '../platform/os-store.js';
import { track } from '../platform/telemetry.js';
import { evaluatePolicy, currentPolicy } from './policy.js';
import { flowDiagram } from './builder.js';

const credit = (purpose, extra = {}) => ({ product: 'credit', demand: { purpose, ...extra } });
export const TEMPLATES = Object.freeze([
  { id: 'capital', label: 'Capital de giro', text: 'Recompor caixa para o ciclo operacional.', icon: 'repeat', ...credit('capital_de_giro', { term_months: 24, grace_months: 3, urgency: 'media' }),
    ask: ['amount', 'term_months', 'grace_months', 'urgency'], title: (d) => `Capital de giro — ${money(d.amount)}` },
  { id: 'financing', label: 'Financiamento', text: 'Máquinas, obras ou expansão, com prazo longo.', icon: 'building', ...credit('expansao', { term_months: 60, grace_months: 6, urgency: 'baixa' }),
    ask: ['amount', 'term_months', 'grace_months', 'collateral'], title: (d) => `Financiamento — ${money(d.amount)}` },
  { id: 'refinancing', label: 'Refinanciamento', text: 'Alongar prazo ou trocar dívida existente.', icon: 'swap', ...credit('refinanciamento', { term_months: 36, urgency: 'baixa' }),
    ask: ['amount', 'term_months', 'notes'], title: (d) => `Refinanciamento — ${money(d.amount)}` },
  { id: 'acquiring', label: 'Adquirência', text: 'Revisar MDR, PIX, antecipação e liquidação.', icon: 'scale', product: 'acquiring', demand: { settlement_days_target: 2, channel_presencial: true },
    ask: ['monthly_volume', 'average_ticket', 'settlement_days_target'], title: (d) => `Adquirência — ${money(d.monthly_volume)}/mês` },
  { id: 'renewal', label: 'Renovação', text: 'Cotar de novo um contrato que está na janela de aviso prévio.', icon: 'calendar', product: 'acquiring', demand: {}, ask: ['contract'], title: (d) => d.title || 'Renovação de contrato' }
]);
const QUESTIONS = {
  amount: { label: 'Quanto você precisa?', type: 'money', why: 'Define a política de aprovação e o porte dos provedores convidados.', required: true },
  term_months: { label: 'Em quantos meses quer pagar?', type: 'int', why: 'Prazo muda taxa e parcela; os provedores respondem sobre este prazo.', required: true },
  grace_months: { label: 'Precisa de carência? (meses)', type: 'int', why: 'Carência alinha o início dos pagamentos à geração de caixa.' },
  urgency: { label: 'Qual a urgência?', type: 'enum', options: [['baixa', 'Baixa'], ['media', 'Média'], ['alta', 'Alta']], why: 'Define o prazo sugerido para respostas.' },
  collateral: { label: 'Quais garantias você pode oferecer?', type: 'text', why: 'Garantia disponível muda o apetite e as condições.' },
  notes: { label: 'O que motiva o refinanciamento?', type: 'text', why: 'Contexto que ajuda o provedor a propor a estrutura certa.' },
  monthly_volume: { label: 'Quanto você fatura por mês em cartões?', type: 'money', why: 'Base para MDR e antecipação.', required: true },
  average_ticket: { label: 'Ticket médio (R$)', type: 'money', why: 'Influencia MDR e custos por transação.' },
  settlement_days_target: { label: 'Em quantos dias quer receber?', type: 'int', why: 'Prazo de liquidação desejado.' }
};
// O que o perfil financeiro já sabe (chave do perfil → campo da demanda).
const FROM_PROFILE = { faturamento_anual: ['annual_revenue', (value) => (/186/.test(value) ? 186000000 : null)], setor: ['sector', (value) => value], garantias_disponiveis: ['collateral', (value) => value] };

/** Demanda determinística a partir do modelo e das respostas (testável). */
export function buildDemand(template, answers, profileRows = []) {
  const demand = { ...template.demand };
  const provenance = {};
  if (template.product === 'credit') {
    for (const row of profileRows) {
      const map = FROM_PROFILE[row.field_key];
      if (!map) continue;
      const value = map[1](row.field_value);
      if (value !== null && value !== undefined && demand[map[0]] === undefined) { demand[map[0]] = value; provenance[map[0]] = { source: 'Perfil financeiro', updated_at: row.updated_at }; }
    }
  }
  for (const [key, value] of Object.entries(answers)) {
    if (value === '' || value === null || value === undefined || key === 'contract') continue;
    demand[key] = QUESTIONS[key]?.type === 'money' || QUESTIONS[key]?.type === 'int' ? Number(value) : value;
    delete provenance[key];
  }
  return { demand, provenance };
}

export async function intakePage(ctx) {
  ctx.header({ title: 'O que você precisa fazer?', subtitle: 'Escolha a necessidade: o formulário pergunta só o que importa e já traz o que o perfil financeiro sabe.' });
  if (!ctx.can('create_rfq')) return emptyState({ title: 'Seu papel não abre solicitações', text: 'Aprovadores e leitores acompanham os processos; quem abre solicitações é a gerência financeira ou a administração.', iconName: 'lock',
    action: button('Ver solicitações', { onClick: () => location.assign(ctx.href('/finance/rfqs.html')) }) });
  track('intake_started');
  const root = el('div', { class: 'intake' });
  let chosen = null;
  let answers = {};
  const renewals = (ctx.data.contracts || []).filter((row) => row.status === 'active');
  const allTemplates = () => [...TEMPLATES, ...readOS().templates.map((row) => ({ ...TEMPLATES.find((base) => base.id === row.base) || TEMPLATES[0], ...row, custom: true, title: () => row.label }))];

  const drawChooser = () => {
    const search = el('input', { type: 'search', class: 'input intake-search', placeholder: 'Buscar modelo…', 'aria-label': 'Buscar modelo' });
    const grid = el('ul', { class: 'intake-grid', role: 'list' });
    const fill = () => grid.replaceChildren(...allTemplates().filter((row) => fold(`${row.label} ${row.text}`).includes(fold(search.value))).map((row) => el('li', {}, el('button', { type: 'button', class: 'intake-card', dataset: { template: row.id }, onclick: () => { chosen = row; answers = { ...(row.answers || {}) }; draw(); } }, [
      el('span', { class: 'intake-icon', 'aria-hidden': 'true' }, icon(row.icon || 'file', { size: 18 })), el('strong', { text: row.label }), el('span', { class: 'intake-text', text: row.text }),
      row.custom ? el('span', { class: 'tag tag-neutral', text: 'Modelo da equipe' }) : null]))));
    search.addEventListener('input', fill);
    fill();
    return [el('div', { class: 'intake-head' }, [search]), grid,
      el('p', { class: 'intake-foot' }, [el('a', { href: ctx.href('/finance/new-rfq.html'), text: 'Prefiro o formulário completo em branco' })])];
  };

  const input = (key) => {
    const spec = QUESTIONS[key];
    const id = `intake-${key}`;
    let control;
    if (key === 'contract') {
      control = el('select', { class: 'input', id, required: true }, [el('option', { value: '', text: 'Escolha o contrato' }), ...renewals.map((row) => el('option', { value: row.id, text: `${row.provider_name || 'Contrato'} · ${row.title || row.product}`, selected: answers.contract === row.id }))]);
      control.addEventListener('change', () => { answers.contract = control.value; refresh(); });
      return el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Qual contrato quer renovar?' }), control, el('span', { class: 'field-hint', text: 'Os dados da demanda original vêm junto; convites e propostas não.' })]);
    }
    if (spec.type === 'enum') {
      control = el('div', { class: 'seg', role: 'radiogroup', 'aria-label': spec.label }, spec.options.map(([value, label]) => el('button', { type: 'button', role: 'radio', class: 'seg-item', 'aria-checked': String((answers[key] ?? chosen.demand[key]) === value), dataset: { value }, onclick: (event) => {
        answers[key] = value;
        for (const node of event.currentTarget.parentElement.children) node.setAttribute('aria-checked', String(node.dataset.value === value));
        refresh();
      }, text: label })));
      return el('div', { class: 'field' }, [el('span', { class: 'field-label', text: spec.label }), control, el('span', { class: 'field-hint', text: spec.why })]);
    }
    control = spec.type === 'text' ? el('textarea', { class: 'input', id, rows: '2', maxlength: '1000' }) : el('input', { class: 'input num', id, type: 'number', min: '0', inputmode: 'numeric', required: spec.required || null });
    control.value = answers[key] ?? chosen.demand[key] ?? '';
    control.addEventListener('input', () => { answers[key] = control.value; refresh(); });
    return el('label', { class: 'field', for: id }, [el('span', { class: 'field-label', text: `${spec.label}${spec.required ? '' : ' (opcional)'}` }), control, el('span', { class: 'field-hint', text: spec.why })]);
  };

  let refresh = () => {};
  const summary = () => {
    const contract = chosen.id === 'renewal' ? renewals.find((row) => row.id === answers.contract) : null;
    const source = contract ? (ctx.data.rfqs || []).find((row) => row.id === contract.rfq_id) : null;
    const template = source ? { ...chosen, product: source.product, demand: { ...source.demand } } : chosen;
    const { demand, provenance } = buildDemand(template, answers, ctx.data.profile || []);
    const title = source ? `Renovação — ${source.title}` : chosen.title(demand);
    const draftRfq = { product: template.product, demand };
    const outcome = evaluatePolicy(currentPolicy(readOS().policies), draftRfq);
    const missing = chosen.ask.filter((key) => (key === 'contract' ? !answers.contract : QUESTIONS[key]?.required && !(Number(demand[key]) > 0)));
    const filled = Object.keys(provenance);
    const cont = button('Continuar no formulário completo', { variant: 'primary', iconName: 'arrowRight', attrs: { id: 'intake-continue', disabled: missing.length ? 'true' : null }, onClick: async () => {
      cont.disabled = true;
      try {
        const current = await ctx.api(`rfq-editor?organization_id=${encodeURIComponent(ctx.organization.id)}`);
        await ctx.api('rfq-editor', { method: 'PATCH', body: JSON.stringify({ organization_id: ctx.organization.id, product: template.product, title, description: null, response_deadline: null, demand, expected_revision: current.draft?.revision || 0 }) });
        location.assign(ctx.href('/finance/new-rfq.html'));
      } catch (error) { toast(`Não foi possível preparar o rascunho: ${error.message}`, 'error'); cont.disabled = false; }
    } });
    const save = button('Salvar como modelo', { variant: 'ghost', iconName: 'bookmark', attrs: { id: 'intake-save-template' }, onClick: async () => {
      const label = await promptDialog({ title: 'Salvar como modelo da equipe', label: 'Nome do modelo', minLength: 3, confirmLabel: 'Salvar', placeholder: `${chosen.label} — padrão` });
      if (!label) return;
      updateOS((draft) => { draft.templates.push({ id: uid('tpl'), base: TEMPLATES.find((row) => row.id === chosen.id)?.id || chosen.base || 'capital', label, text: `Modelo salvo a partir de ${chosen.label}.`, answers: { ...answers }, icon: chosen.icon }); });
      toast(`Modelo “${label}” salvo neste navegador.`);
    } });
    const duplicate = chosen.custom ? button('Duplicar', { variant: 'ghost', iconName: 'copy', onClick: () => { updateOS((draft) => { draft.templates.push({ id: uid('tpl'), base: chosen.base, label: `${chosen.label} (cópia)`, text: chosen.text, answers: { ...answers }, icon: chosen.icon }); }); toast('Modelo duplicado.'); } }) : null;
    return card({ title: 'Vai sair assim', headingLevel: 3, body: [
            el('p', { class: 'intake-rfq-title', text: title }),
            filled.length ? el('p', { class: 'intake-prefill', id: 'intake-prefill' }, [icon('database', { size: 14 }), ` ${filled.length} campo${filled.length === 1 ? '' : 's'} vindo${filled.length === 1 ? '' : 's'} do perfil financeiro (${filled.map((key) => ({ annual_revenue: 'faturamento', sector: 'setor', collateral: 'garantias' }[key] || key)).join(', ')}). Você revisa no formulário.`]) : null,
            el('h4', { class: 'intake-h', text: 'Aprovação pela política atual' }),
            el('p', { class: 'muted', text: outcome.reason }),
            outcome.stages.length ? flowDiagram(outcome.stages, { compact: true }) : null,
            missing.length ? el('p', { class: 'intake-missing', role: 'status', text: `Falta: ${missing.map((key) => (key === 'contract' ? 'o contrato' : QUESTIONS[key].label.toLowerCase())).join(', ')}` }) : null,
            el('div', { class: 'intake-actions' }, [cont, save, duplicate].filter(Boolean))
          ].filter(Boolean) });
  };
  const drawForm = () => {
    const aside = el('aside', { class: 'intake-summary', 'aria-label': 'Resumo da solicitação' });
    refresh = () => aside.replaceChildren(summary());
    refresh();
    return [
      el('div', { class: 'intake-crumb' }, [el('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'intake-back', onclick: () => { chosen = null; draw(); } }, [icon('chevronLeft', { size: 14 }), el('span', { class: 'btn-label', text: 'Trocar necessidade' })]), el('h2', { class: 'intake-title', text: chosen.label })]),
      el('div', { class: 'intake-body' }, [
        el('form', { class: 'intake-form stack', onsubmit: (event) => event.preventDefault() }, chosen.ask.map(input)),
        aside
      ])
    ];
  };
  const draw = () => root.replaceChildren(...(chosen ? drawForm() : drawChooser()));
  draw();
  return root;
}
