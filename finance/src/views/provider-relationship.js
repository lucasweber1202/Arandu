// Provider / Bank Relationship Management: memória institucional do provedor.
//
// Tudo aqui é fato do histórico da própria empresa (convites, propostas,
// contratos, facilities, issues) ou avaliação definida por ela. O Arandu não
// atribui nota nem recomenda instituição; o scorecard é do cliente, com
// critérios e pesos dele, e o resultado é rotulado assim.

import { el, icon, formatDate, formatDateTime, percent } from '../core.js';
import { button, tag, field, drawer, toast, loading, errorState, onSubmit } from '../ui.js';
import { CONTRACT_CATEGORIES } from '../../../lib/finance/contract-terms.mjs';
import { relationshipContext, relationshipSummary } from './relationship-context.js';
import { entityTree } from '../../../lib/finance/entities.mjs';
import { loadEntities, entityName } from './entities.js';

const ISSUE_SEVERITY = { low: ['Baixa', 'neutral'], medium: ['Média', 'warning'], high: ['Alta', 'danger'] };
const ISSUE_STATUS = { open: 'Aberta', in_progress: 'Em andamento', resolved: 'Resolvida', cancelled: 'Cancelada' };
const ISSUE_CATEGORY = { service: 'Serviço', billing: 'Cobrança', implementation: 'Implantação', compliance: 'Compliance', documentation: 'Documentação', other: 'Outra' };
const REL_STATUS = { prospect: 'Prospecção', active: 'Ativo', inactive: 'Inativo' };

function metric(label, value, definition) {
  return el('div', { class: 'portfolio-stat' }, [el('span', { class: 'portfolio-stat-label', text: label }), el('strong', { class: 'portfolio-stat-value', text: value }), el('span', { class: 'muted small', text: definition })]);
}

export async function openProviderRelationship(ctx, provider) {
  const entities = await loadEntities(ctx);
  const body = el('div', { class: 'stack contract-center' }, loading('Carregando relacionamento…'));
  const dialog = drawer({ title: provider.name, subtitle: 'Relacionamento da sua empresa com esta instituição: contratos, negociações, contatos e pendências.', body, className: 'drawer-wide', onClose: () => { const url = new URL(location.href); if (url.searchParams.get('provider_id') === provider.id) { url.searchParams.delete('provider_id'); history.replaceState(null, '', url.pathname + url.search + url.hash); } } });
  const write = ctx.can('edit_profile');
  const load = () => ctx.api(`provider-relationship?organization_id=${encodeURIComponent(ctx.organization.id)}&provider_id=${encodeURIComponent(provider.id)}`)
    .then((detail) => body.replaceChildren(...render(detail))).catch((error) => body.replaceChildren(errorState({ error, onRetry: load })));
  const after = (message) => { toast(message); load(); };

  function render(detail) {
    const m = detail.metrics;
    const d = m.definitions;
    const summary = relationshipSummary(detail);
    // Começo buyer-first: sem contrato vigente, registrar o que a empresa já tem.
    const live = (detail.contracts || []).some((row) => ['active', 'renewing'].includes(row.status));
    const start = !live && ctx.can('create_rfq') ? el('div', { class: 'callout callout-info compact rel-start' }, [icon('briefcase', { size: 14 }),
      el('span', { text: 'Nenhum contrato vigente registrado com esta instituição. Registre o contrato que a empresa já tem para acompanhar condições, prazo e renovação, sem depender da adesão da instituição.' }),
      button('Registrar contrato existente', { size: 'sm', variant: 'primary', iconName: 'plus', onClick: async () => { const { importContractButton } = await import('./contract-center.js'); importContractButton(ctx, entities, { providerId: provider.id })?.click(); } })]) : null;
    const sections = [el('div', { class: 'cc-head' }, [workspaceHead(summary), button('Atualizar relacionamento', { size: 'sm', iconName: 'refresh', onClick: () => { body.replaceChildren(loading('Atualizando relacionamento…')); load(); } })]), start, attentionSection(summary.attention, detail),
      el('p', { class: 'muted small', text: detail.coverage?.tasks_truncated ? 'Exibindo as primeiras 200 tarefas abertas dos contratos deste recorte. Consulte Tarefas para continuar a revisão.' : 'Tarefas abertas dos contratos deste recorte, consultadas ao abrir ou atualizar o relacionamento.' }),
      el('section', { class: 'cc-section', 'aria-labelledby': 'rel-records' }, [el('h3', { id: 'rel-records', text: 'Contratos, limites e negociações' }), relationshipContext(ctx, detail)])];
    // Nível 4: indicadores, mapa, relação por entidade e avaliações — consulta, não trabalho.
    const advanced = [];
    advanced.push(el('p', { class: 'callout callout-info compact' }, [icon('shield', { size: 14 }), el('span', { text: detail.neutrality })]));
    advanced.push(el('section', { class: 'cc-section' }, [el('h3', { text: 'Indicadores do recorte carregado' }), el('div', { class: 'portfolio-stats' }, [
      metric('Convites', `${m.responded} de ${m.invited} respondidos`, d.response_rate),
      metric('Taxa de resposta', m.response_rate === null ? 'Sem convites' : percent(m.response_rate), d.responded),
      metric('Tempo de resposta (mediana)', m.median_response_days === null ? '—' : `${m.median_response_days} dias`, d.median_response_days),
      metric('Contratos ativos', String(m.active_contracts), d.active_contracts),
      metric('Issues abertas', String(m.open_issues), d.open_issues),
      metric('Resolução (mediana)', m.median_resolution_days === null ? '—' : `${m.median_resolution_days} dias`, d.median_resolution_days)
    ])]));

    // Mapa por entidade × categoria.
    advanced.push(el('section', { class: 'cc-section' }, [el('h3', { text: 'Mapa do relacionamento' }),
      detail.map.length ? el('table', { class: 'data-table compact' }, [
        el('thead', {}, el('tr', {}, ['Entidade', 'Categoria', 'Contratos', 'Facilities', 'Limites', 'Próximo vencimento'].map((label) => el('th', { scope: 'col', text: label })))),
        el('tbody', {}, detail.map.map((row) => el('tr', {}, [
          el('td', { 'data-label': 'Entidade', text: entityName(entities, row.legal_entity_id) }),
          el('td', { 'data-label': 'Categoria', text: CONTRACT_CATEGORIES[row.category] || row.category }),
          el('td', { 'data-label': 'Contratos', text: String(row.contracts) }), el('td', { 'data-label': 'Facilities', text: String(row.facilities) }),
          el('td', { 'data-label': 'Limites', text: row.limits.map((limit) => `${limit.currency} ${limit.approved.toLocaleString('pt-BR')}${limit.used === null ? ' (uso não registrado)' : ` · usado ${limit.used.toLocaleString('pt-BR')}`}`).join('; ') || '—' }),
          el('td', { 'data-label': 'Próximo vencimento', text: row.next_end ? formatDate(row.next_end) : '—' })
        ])))
      ]) : el('p', { class: 'muted', text: 'Sem contratos ou facilities com este provedor no seu escopo.' })]));

    if (!__ARANDU_DEMO__) advanced.push(el('p', {}, el('a', {href:`/finance/performance.html?provider_id=${encodeURIComponent(provider.id)}`,text:'Performance: períodos, metas e fontes'})));
    if (!__ARANDU_DEMO__) advanced.push(el('p', {}, el('a', {href:`/finance/spend.html?provider_id=${encodeURIComponent(provider.id)}`,text:'Spend do provedor: moedas e fontes'})));
    // Relação por entidade.
    const relList = el('ul', { class: 'plain-list' }, detail.relationships.map((row) => el('li', {}, [el('strong', { text: entityName(entities, row.legal_entity_id) }),
      el('span', { text: ` · ${REL_STATUS[row.status]}${row.categories.length ? ` · ${row.categories.map((item) => CONTRACT_CATEGORIES[item] || item).join(', ')}` : ''}${row.since_on ? ` · desde ${formatDate(row.since_on)}` : ''}` })])));
    advanced.push(el('section', { class: 'cc-section' }, [el('div', { class: 'cc-head' }, [el('h3', { text: 'Relação por entidade' }),
      write && entities.rows.length ? button('Definir relação', { size: 'sm', iconName: 'edit', onClick: () => relationshipForm() }) : null]),
      detail.relationships.length ? relList : el('p', { class: 'muted', text: entities.rows.length ? 'Nenhuma relação registrada por entidade.' : 'Cadastre entidades do grupo para registrar a relação por entidade.' })]));

    // Contatos.
    sections.push(el('section', { class: 'cc-section' }, [el('div', { class: 'cc-head' }, [el('h3', { text: 'Contatos' }), write ? button('Adicionar contato', { size: 'sm', iconName: 'plus', onClick: () => contactForm() }) : null]),
      detail.contacts.length ? el('ul', { class: 'plain-list' }, detail.contacts.map((row) => el('li', { class: 'contact-row' }, [
        el('strong', { text: row.name }), el('span', { text: [row.title, row.email, row.phone, row.legal_entity_id ? entityName(entities, row.legal_entity_id) : null].filter(Boolean).join(' · ') }),
        row.is_primary ? tag('principal', 'accent') : null,
        write ? button('Arquivar', { size: 'sm', variant: 'ghost', onClick: async () => { try { await ctx.api('provider-contacts', { method: 'DELETE', body: JSON.stringify({ contact_id: row.id }) }); after('Contato arquivado.'); } catch (error) { toast(error.message, 'error'); } } }) : null
      ]))) : el('p', { class: 'muted', text: 'Nenhum contato registrado.' })]));

    // Issues.
    sections.push(el('section', { class: 'cc-section' }, [el('div', { class: 'cc-head' }, [el('h3', { text: 'Questões e follow-ups' }), write ? button('Registrar questão', { size: 'sm', iconName: 'plus', onClick: () => issueForm(detail) }) : null]),
      detail.issues.length ? el('ul', { class: 'milestone-list', role: 'list' }, detail.issues.map((row) => {
        const [severity, tone] = ISSUE_SEVERITY[row.severity];
        const open = ['open', 'in_progress'].includes(row.status);
        return el('li', { class: 'milestone-row' }, [
          el('div', { class: 'milestone-main' }, [el('strong', { text: row.title }), el('span', { class: 'muted small', text: `${ISSUE_CATEGORY[row.category]} · ${ISSUE_STATUS[row.status]} · aberta em ${formatDate(row.opened_on)}${row.due_on ? ` · prazo ${formatDate(row.due_on)}` : ''}${row.resolution ? ` · ${row.resolution}` : ''}` })]),
          tag(severity, tone),
          write && open ? button('Resolver', { size: 'sm', onClick: () => resolveIssue(row) }) : null
        ]);
      })) : el('p', { class: 'muted', text: 'Nenhuma questão registrada.' })]));

    // Scorecards da empresa.
    const reviews = detail.reviews.map((row) => {
      const template = detail.templates.find((item) => item.id === row.template_id);
      return el('li', {}, [el('strong', { text: row.weighted_result === null ? '—' : `${Number(row.weighted_result).toLocaleString('pt-BR')} de 100` }),
        el('span', { text: ` · ${template?.name || 'Scorecard'} · ${formatDate(row.period_start)} → ${formatDate(row.period_end)} · cobertura ${percent(row.answered_weight)}${row.comment ? ` · ${row.comment}` : ''}` })]);
    });
    advanced.push(el('section', { class: 'cc-section' }, [el('div', { class: 'cc-head' }, [el('h3', { text: 'Avaliações definidas pela sua empresa' }),
      write && detail.templates.length ? button('Registrar avaliação', { size: 'sm', iconName: 'plus', onClick: () => reviewForm(detail) }) : null]),
      el('p', { class: 'muted small', text: m.definitions.review }),
      reviews.length ? el('ul', { class: 'plain-list' }, reviews) : el('p', { class: 'muted', text: detail.templates.length ? 'Nenhuma avaliação registrada.' : 'Crie um scorecard em Configurações → Scorecards para avaliar provedores com critérios da sua empresa.' })]));

    // Memória: histórico sob demanda.
    sections.push(disclosure('rel-historico', `Histórico (${detail.timeline.length})`, [
      detail.timeline.length ? el('ol', { class: 'plain-list timeline-list' }, detail.timeline.map((row) => el('li', { text: `${formatDateTime(row.at)} — ${row.text}` }))) : el('p', { class: 'muted', text: 'Sem histórico.' })]));
    // Tarifas: fatos contratado × observado, carregados sob demanda (sem score).
    const fees = el('div');
    import('./fees.js').then((m) => m.providerFeeFacts(ctx, provider.id)).then((node) => fees.replaceWith(node)).catch(() => fees.remove());
    advanced.push(fees);
    sections.push(disclosure('rel-indicadores', 'Indicadores, mapa e avaliações', advanced));
    return sections.filter(Boolean);
  }

  function workspaceHead(summary) {
    const fact = (label, value, missing) => el('div', {}, [el('dt', { text: label }), el('dd', { class: value ? '' : 'muted', text: value || missing })]);
    return el('section', { class: 'rel-head', 'aria-label': 'Resumo do relacionamento' }, el('dl', { class: 'rel-facts' }, [
      fact('Relação', summary.status, ''),
      fact('Contato principal', summary.contact, 'Não registrado'),
      fact('Produtos', summary.products.join(', '), 'Nenhum contrato ou limite no recorte'),
      fact('Próximo prazo', summary.next ? summary.next.title : null, 'Nenhum prazo futuro registrado')
    ]));
  }

  // Cada pendência leva à tela canônica do registro ou à ação permitida aqui.
  function attentionSection(items, detail) {
    const KIND = { overdue: ['Vencido', 'danger'], soon: ['Próximo', 'warning'], open: ['Em andamento', 'accent'], missing: ['Não informado', 'neutral'] };
    const action = (item) => {
      if (item.target.type === 'contract') return el('a', { class: 'btn btn-sm btn-secondary', href: ctx.href(`/finance/contracts.html?abrir=contrato#contract-${item.target.id}`), text: 'Abrir contrato' });
      if (item.target.type === 'rfq') return el('a', { class: 'btn btn-sm btn-secondary', href: ctx.href(`/finance/rfq.html?id=${item.target.id}`), text: 'Abrir negociação' });
      if (item.target.type === 'issue' && write) { const issue = detail.issues.find((row) => row.id === item.target.id); return button('Resolver', { size: 'sm', onClick: () => resolveIssue(issue) }); }
      if (item.target.type === 'task') return el('a', { class: 'btn btn-sm btn-secondary', href: ctx.href(`/finance/tasks.html#task-${item.target.id}`), text: 'Abrir tarefa' });
      if (item.target.type === 'contact' && write) return button('Adicionar contato', { size: 'sm', iconName: 'plus', onClick: () => contactForm() });
      return null;
    };
    const row = (item) => el('li', { class: 'milestone-row' }, [tag(...KIND[item.kind]), el('div', { class: 'milestone-main' }, [el('strong', { text: item.title }), el('span', { class: 'muted small', text: item.detail })]), action(item)]);
    return el('section', { class: 'cc-section rel-attention', 'aria-labelledby': 'rel-attention-title' }, [
      el('h3', { id: 'rel-attention-title', text: 'O que pede atenção' }),
      items.length ? el('ul', { class: 'milestone-list', role: 'list' }, items.slice(0, 6).map(row)) : el('p', { class: 'muted', text: 'Nenhum vencimento, questão aberta ou negociação em andamento no recorte carregado. Isso não substitui a revisão dos contratos.' }),
      items.length > 6 ? el('details', {}, [el('summary', { text: `Ver mais ${items.length - 6} pendências deste recorte` }), el('ul', { class: 'milestone-list' }, items.slice(6).map(row))]) : null
    ]);
  }

  function disclosure(id, title, children) {
    return el('details', { class: 'cc-section rel-more', id }, [el('summary', { text: title }), ...children]);
  }

  function entityOptions(control, { allowGroup = true } = {}) {
    if (allowGroup && entities.scope === 'group') control.add(new Option('Nível de grupo', ''));
    for (const row of entityTree(entities.rows)) if (row.status === 'active') control.add(new Option(`${row.depth ? '— ' : ''}${row.short_name || row.legal_name}`, row.id));
    return control;
  }

  function inline(title, form) {
    body.replaceChildren(el('h3', { text: title }), form, button('Voltar', { variant: 'ghost', onClick: load }));
  }

  function contactForm() {
    const name = el('input', { maxlength: '120' });
    const title = el('input', { maxlength: '120' });
    const email = el('input', { type: 'email', maxlength: '254' });
    const phone = el('input', { maxlength: '40' });
    const entity = entityOptions(el('select'));
    const primary = el('input', { type: 'checkbox' });
    const form = el('form', { class: 'field-grid', novalidate: true }, [field({ label: 'Nome', control: name, required: true }), field({ label: 'Cargo', control: title, optionalLabel: true }),
      field({ label: 'E-mail', control: email, optionalLabel: true }), field({ label: 'Telefone', control: phone, optionalLabel: true }),
      entities.rows.length ? field({ label: 'Entidade', control: entity }) : null, el('label', { class: 'check-row' }, [primary, el('span', { text: 'Contato principal' })]),
      el('div', { class: 'form-actions span-2' }, button('Salvar contato', { variant: 'primary', type: 'submit', iconName: 'check' }))]);
    onSubmit(form, async (event) => {
      event.preventDefault();
      try {
        await ctx.api('provider-contacts', { method: 'POST', body: JSON.stringify({ organization_id: ctx.organization.id, provider_id: provider.id, name: name.value.trim(), title: title.value.trim() || null,
          email: email.value.trim() || null, phone: phone.value.trim() || null, legal_entity_id: entity.value || null, is_primary: primary.checked }) });
        after('Contato adicionado.');
      } catch (error) { toast(error.message, 'error'); }
    });
    inline('Adicionar contato', form);
  }

  function relationshipForm() {
    const entity = entityOptions(el('select'), { allowGroup: false });
    const status = el('select');
    for (const [value, label] of Object.entries(REL_STATUS)) status.add(new Option(label, value));
    const categories = el('fieldset', { class: 'scope-entities' }, [el('legend', { class: 'small', text: 'Categorias atendidas' }),
      ...Object.entries(CONTRACT_CATEGORIES).map(([value, label]) => el('label', { class: 'check-row' }, [el('input', { type: 'checkbox', value }), el('span', { text: label })]))]);
    const since = el('input', { type: 'date' });
    const form = el('form', { class: 'stack', novalidate: true }, [field({ label: 'Entidade', control: entity }), field({ label: 'Estado', control: status }), categories,
      field({ label: 'Relacionamento desde', control: since, optionalLabel: true }), el('div', { class: 'form-actions' }, button('Salvar relação', { variant: 'primary', type: 'submit', iconName: 'check' }))]);
    onSubmit(form, async (event) => {
      event.preventDefault();
      try {
        await ctx.api('provider-relationships', { method: 'POST', body: JSON.stringify({ organization_id: ctx.organization.id, provider_id: provider.id, legal_entity_id: entity.value,
          status: status.value, categories: [...categories.querySelectorAll('input:checked')].map((input) => input.value), since_on: since.value || null }) });
        after('Relação registrada.');
      } catch (error) { toast(error.message, 'error'); }
    });
    inline('Relação por entidade', form);
  }

  function issueForm(detail) {
    const title = el('input', { maxlength: '200' });
    const category = el('select');
    for (const [value, label] of Object.entries(ISSUE_CATEGORY)) category.add(new Option(label, value));
    const severity = el('select');
    for (const [value, [label]] of Object.entries(ISSUE_SEVERITY)) severity.add(new Option(label, value));
    severity.value = 'medium';
    const contract = el('select');
    contract.add(new Option('Sem contrato específico', ''));
    for (const row of detail.contracts) contract.add(new Option(row.title || CONTRACT_CATEGORIES[row.product] || 'Contrato', row.id));
    const entity = entityOptions(el('select'));
    const due = el('input', { type: 'date' });
    const description = el('textarea', { rows: '3', maxlength: '4000' });
    const form = el('form', { class: 'field-grid', novalidate: true }, [field({ label: 'Título', control: title, required: true }), field({ label: 'Categoria', control: category }),
      field({ label: 'Severidade', control: severity }), field({ label: 'Contrato', control: contract }), entities.rows.length ? field({ label: 'Entidade', control: entity, hint: 'Com contrato, vale a entidade do contrato.' }) : null,
      field({ label: 'Prazo', control: due, optionalLabel: true }), field({ label: 'Descrição', control: description, optionalLabel: true, className: 'span-2' }),
      el('div', { class: 'form-actions span-2' }, button('Registrar questão', { variant: 'primary', type: 'submit', iconName: 'check' }))]);
    onSubmit(form, async (event) => {
      event.preventDefault();
      if (title.value.trim().length < 3) { toast('Dê um título à questão.', 'error'); return; }
      try {
        await ctx.api('provider-issues', { method: 'POST', body: JSON.stringify({ organization_id: ctx.organization.id, provider_id: provider.id, title: title.value.trim(), category: category.value,
          severity: severity.value, contract_id: contract.value || null, legal_entity_id: contract.value ? null : entity.value || null, due_on: due.value || null, description: description.value.trim() || null }) });
        after('Questão registrada.');
      } catch (error) { toast(error.message, 'error'); }
    });
    inline('Registrar questão', form);
  }

  function resolveIssue(issue) {
    const resolution = el('textarea', { rows: '3', maxlength: '2000' });
    const form = el('form', { class: 'stack', novalidate: true }, [field({ label: 'Como foi resolvida', control: resolution, required: true }),
      el('div', { class: 'form-actions' }, button('Marcar como resolvida', { variant: 'primary', type: 'submit', iconName: 'check' }))]);
    onSubmit(form, async (event) => {
      event.preventDefault();
      try { await ctx.api('provider-issues', { method: 'PATCH', body: JSON.stringify({ issue_id: issue.id, status: 'resolved', resolution: resolution.value.trim() }) }); after('Questão resolvida.'); }
      catch (error) { toast(error.message, 'error'); }
    });
    inline(`Resolver: ${issue.title}`, form);
  }

  function reviewForm(detail) {
    const template = el('select');
    for (const row of detail.templates) template.add(new Option(`${row.name} (v${row.version})`, row.id));
    const scores = el('div', { class: 'field-grid' });
    const drawScores = () => {
      const current = detail.templates.find((row) => row.id === template.value);
      scores.replaceChildren(...current.criteria.map((criterion) => field({ label: `${criterion.label} (peso ${criterion.weight}, 0 a ${criterion.scale_max})`,
        control: el('input', { type: 'number', min: '0', max: String(criterion.scale_max), step: 'any', name: criterion.key }), optionalLabel: true })));
    };
    template.addEventListener('change', drawScores);
    drawScores();
    const start = el('input', { type: 'date' });
    const end = el('input', { type: 'date' });
    const comment = el('textarea', { rows: '2', maxlength: '2000' });
    const form = el('form', { class: 'stack', novalidate: true }, [field({ label: 'Scorecard', control: template }), scores,
      el('div', { class: 'field-grid' }, [field({ label: 'Início do período', control: start, required: true }), field({ label: 'Fim do período', control: end, required: true })]),
      field({ label: 'Comentário', control: comment, optionalLabel: true }),
      el('p', { class: 'muted small', text: 'O resultado é a média ponderada pelos pesos do seu scorecard, só sobre os critérios respondidos, com a cobertura exibida. Avaliação registrada não é editada.' }),
      el('div', { class: 'form-actions' }, button('Registrar avaliação', { variant: 'primary', type: 'submit', iconName: 'check' }))]);
    onSubmit(form, async (event) => {
      event.preventDefault();
      const values = Object.fromEntries([...scores.querySelectorAll('input')].filter((input) => input.value !== '').map((input) => [input.name, Number(input.value)]));
      if (!Object.keys(values).length || !start.value || !end.value) { toast('Informe o período e ao menos uma nota.', 'error'); return; }
      try {
        await ctx.api('provider-reviews', { method: 'POST', body: JSON.stringify({ organization_id: ctx.organization.id, provider_id: provider.id, template_id: template.value,
          period_start: start.value, period_end: end.value, scores: values, comment: comment.value.trim() || null }) });
        after('Avaliação registrada.');
      } catch (error) { toast(error.message, 'error'); }
    });
    inline('Registrar avaliação', form);
  }

  load();
  return dialog;
}

/** Configurações → Scorecards: critérios e pesos da empresa, versionados. */
export function scorecardSettings(ctx) {
  const box = el('div', {}, loading());
  const load = () => ctx.api(`scorecard-templates?organization_id=${encodeURIComponent(ctx.organization.id)}`).then((result) => {
    const active = result.rows.filter((row) => row.status === 'active');
    const list = active.length ? el('ul', { class: 'plain-list' }, active.map((row) => el('li', {}, [el('strong', { text: `${row.name} (v${row.version})` }),
      el('span', { text: ` · ${row.criteria.map((item) => `${item.label} ${item.weight}`).join(' · ')}` })]))) : el('p', { class: 'muted', text: 'Nenhum scorecard criado.' });
    const parts = [el('p', { class: 'muted small', text: result.notice }), list];
    if (ctx.can('create_rfq')) {
      const name = el('input', { maxlength: '120', value: 'Relacionamento bancário' });
      const criteria = el('textarea', { rows: '4', placeholder: 'Um critério por linha: rótulo; peso; escala (5, 10 ou 100)', value: '' });
      criteria.value = 'Atendimento; 40; 5\nPrazo de resposta; 30; 5\nQualidade da implantação; 30; 5';
      const form = el('form', { class: 'stack', novalidate: true }, [field({ label: 'Nome do scorecard', control: name }), field({ label: 'Critérios', control: criteria, hint: 'Salvar com o mesmo nome cria uma nova versão; avaliações antigas mantêm a versão delas.' }),
        el('div', { class: 'form-actions' }, button('Salvar scorecard', { type: 'submit', iconName: 'check' }))]);
      onSubmit(form, async (event) => {
        event.preventDefault();
        const slug = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^([0-9])/, 'c_$1').slice(0, 40);
        const items = criteria.value.split('\n').map((line) => line.split(';').map((part) => part.trim())).filter((parts) => parts[0]).map(([label, weight, scale]) => ({ key: slug(label), label, weight: Number(weight), scale_max: Number(scale || 5) }));
        try {
          await ctx.api('scorecard-templates', { method: 'POST', body: JSON.stringify({ organization_id: ctx.organization.id, template_key: slug(name.value) || 'scorecard', name: name.value.trim(), criteria: items }) });
          toast('Scorecard salvo.');
          box.replaceChildren(loading());
          load();
        } catch (error) { toast(error.message, 'error'); }
      });
      parts.push(el('details', {}, [el('summary', { text: 'Criar ou nova versão de scorecard' }), form]));
    }
    box.replaceChildren(...parts);
  }).catch((error) => box.replaceChildren(errorState({ error })));
  load();
  return box;
}
