import { graphContextCard } from './graph-context.js';
// Financial Passport: o perfil financeiro reutilizável da empresa.
//
// Cada dado mostra valor, origem, quem gravou, quando, até quando vale e se foi
// confirmado. Cobertura é contagem de campos preenchidos — nunca nota. A tela
// não calcula nada sobre a empresa: só organiza o que a própria empresa
// declarou ou anexou.

import { el, icon, money, formatDate, formatDateTime, timeAgo } from '../core.js';
import { card, tag, button, linkButton, emptyState, errorState, toast, drawer, field, progress } from '../ui.js';
import { buildPassport, SOURCE_LABELS, WRITABLE_SOURCES, FRESHNESS, MIN_REVIEW_DAYS, MAX_REVIEW_DAYS, catalogField, fieldLabel } from '../../../lib/finance/passport.mjs';
import { loadEntities } from './entities.js';
import { lazyDocuments } from './rfq.js';

const REVENUE_BANDS = { ate_360k: 'Até R$ 360 mil', '360k_4_8m': 'R$ 360 mil a R$ 4,8 mi', '4_8m_30m': 'R$ 4,8 mi a R$ 30 mi', '30m_300m': 'R$ 30 mi a R$ 300 mi', acima_300m: 'Acima de R$ 300 mi' };

/** Valor legível, sem reinterpretar texto livre. */
export function passportValue(item) {
  if (item.value === null || item.value === undefined || item.value === '') return null;
  if (item.key === 'tax_identifier' && /^\d{14}$/.test(item.value)) return item.value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (item.key === 'revenue_band') return REVENUE_BANDS[item.value] || item.value;
  const spec = catalogField(item.key);
  if (!spec || item.typed === false) return String(item.value);
  if (spec.type === 'enum') return spec.options[item.value] || item.value;
  const number = Number(item.value);
  if (spec.type === 'money') return money(number);
  if (spec.type === 'percent') return `${number.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}% a.m.`;
  if (spec.type === 'number' && item.key === 'divida_liquida_ebitda') return `${number.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}x`;
  if (['number', 'int'].includes(spec.type)) return number.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  return String(item.value);
}

export function freshnessTag(state, dueOn = null) {
  const meta = FRESHNESS[state] || FRESHNESS.untracked;
  const text = state === 'stale' && dueOn ? `${meta.label} desde ${formatDate(dueOn)}` : state === 'review_due' && dueOn ? `${meta.label} · até ${formatDate(dueOn)}` : meta.label;
  return el('span', { class: `tag tag-${meta.tone} passport-fresh`, 'data-freshness': state }, [icon(state === 'current' ? 'checkCircle' : state === 'untracked' ? 'info' : 'alert', { size: 12 }), el('span', { text })]);
}

export async function passport(ctx) {
  ctx.header({ title: 'Financial Passport', subtitle: 'O perfil financeiro reutilizável da empresa: cada dado com origem, responsável, data e revisão.' });
  if (ctx.audience !== 'company') return emptyState({ title: 'Disponível só para a empresa compradora', iconName: 'lock' });
  const org = ctx.organization.id;
  const entities = await loadEntities(ctx);
  const requested = new URLSearchParams(location.search).get('legal_entity_id');
  const entityId = entities.rows.some(row => row.id === requested && row.kind === 'legal_entity') ? requested : null;
  ctx.passportEntityId = entityId;
  let payload;
  try {
    payload = await ctx.api(`profile?organization_id=${encodeURIComponent(org)}${entityId ? `&legal_entity_id=${encodeURIComponent(entityId)}` : ''}`);
  } catch (error) {
    return errorState({ error, onRetry: () => ctx.reload() });
  }
  // O transporte real devolve o Passport montado no servidor; o motor da
  // demonstração legada pode devolver só as linhas.
  const view = payload.passport || buildPassport({ organization: ctx.organization, rows: payload.rows || [], documents: payload.documents || [] });
  const documents = payload.documents || [];
  const canEdit = ctx.can('edit_profile') && (Boolean(entityId) || entities.scope === 'group');
  const root = el('div', { class: 'stack passport' });
  const scopeSelect = el('select', { 'aria-label': 'Escopo do Passport' });
  scopeSelect.add(new Option('Grupo', ''));
  for (const row of entities.rows.filter(row => row.kind === 'legal_entity')) scopeSelect.add(new Option(row.legal_name, row.id));
  scopeSelect.value = entityId || '';
  scopeSelect.addEventListener('change', () => {
    const url = new URL(location.href);
    if (scopeSelect.value) url.searchParams.set('legal_entity_id', scopeSelect.value); else url.searchParams.delete('legal_entity_id');
    location.assign(url.href);
  });
  root.append(field({ label: 'Escopo do Passport', control: scopeSelect, hint: 'A entidade substitui apenas defaults descritivos permitidos do grupo. Identidade, saldos, garantias e documentos nunca são herdados.' }));

  const search = el('input', { type: 'search', 'aria-label': 'Buscar campos no Passport', placeholder: 'Buscar campo ou valor neste escopo' });
  search.addEventListener('input', () => {
    const text = search.value.trim().toLocaleLowerCase('pt-BR');
    for (const row of root.querySelectorAll('.passport-field')) row.hidden = !row.textContent.toLocaleLowerCase('pt-BR').includes(text);
  });
  root.append(field({ label: 'Buscar neste escopo', control: search }));
  // Cobertura factual por contexto.
  const summary = el('ul', { class: 'passport-coverage', role: 'list', 'aria-label': 'Cobertura do Passport por contexto' }, view.domains.map((domain) => {
    const status = domain.stale ? `${domain.stale} desatualizado${domain.stale > 1 ? 's' : ''}` : domain.review_due ? `${domain.review_due} a revisar` : 'Nada vencido';
    return el('li', {}, el('a', {
      class: 'passport-coverage-item', href: `#passport-${domain.id}`,
      'aria-label': `${domain.label}: ${domain.coverage.filled} de ${domain.coverage.relevant} campos preenchidos, ${status.toLowerCase()}`
    }, [
      el('span', { class: 'passport-coverage-label', text: domain.label }),
      progress(domain.coverage.filled, domain.coverage.relevant, { label: `${domain.coverage.filled} de ${domain.coverage.relevant} campos preenchidos` }),
      el('span', { class: 'passport-coverage-meta', text: status })
    ]));
  }));
  root.append(card({
    title: 'Cobertura',
    subtitle: `${view.coverage.filled} de ${view.coverage.relevant} campos do catálogo preenchidos.`,
    body: [summary, el('p', { class: 'muted small passport-notice' }, [icon('info', { size: 14 }), el('span', { text: view.notice })])]
  }));

  if (view.attention.length) {
    root.append(el('div', { class: 'callout callout-warning', role: 'status' }, [icon('alert'), el('div', {}, [
      el('p', { class: 'callout-title', text: `${view.attention.length} campo${view.attention.length > 1 ? 's' : ''} pede${view.attention.length > 1 ? 'm' : ''} revisão antes do próximo uso` }),
      el('ul', { class: 'passport-attention' }, view.attention.map((item) => el('li', {}, [
        el('a', { href: `#field-${item.key}`, text: item.label }), el('span', { text: ' · ' }), freshnessTag(item.freshness, item.due_on)
      ])))
    ])]));
  }

  for (const domain of view.domains) {
    const list = el('ul', { class: 'passport-fields', role: 'list' }, domain.fields.map((item) => fieldRow(ctx, item, { canEdit, documents })));
    const body = [list];
    if (domain.id === 'documentacao') {
      body.push(el('p', { class: 'muted small', text: 'Os arquivos ficam no armazenamento privado da empresa e são baixados por link temporário. Um campo só conta como preenchido com arquivo disponível vinculado.' }));
      body.push(lazyDocuments(ctx, 'profile', entityId || org, `Arquivos do perfil (${documents.length})`, { canUpload: ctx.can('upload_document') && canEdit }));
    }
    root.append(card({ id: `passport-${domain.id}`, title: domain.label, subtitle: domain.summary, body,
      actions: [el('span', { class: 'passport-domain-count', text: `${domain.coverage.filled}/${domain.coverage.relevant}` })] }));
  }

  if (view.custom.length) {
    root.append(card({ id: 'passport-outros', title: 'Outros campos', subtitle: 'Campos livres criados antes do catálogo. Aparecem aqui, mas não entram na cobertura.',
      body: el('ul', { class: 'passport-fields', role: 'list' }, view.custom.map((item) => fieldRow(ctx, { ...item, custom: true, filled: true }, { canEdit, documents }))) }));
  }
  if (canEdit) {
    root.append(card({ title: 'Novo campo livre', subtitle: 'Use apenas quando nenhum campo do catálogo servir. Campos livres não preenchem solicitações.', body: customForm(ctx) }));
  }
  root.append(graphContextCard(ctx, { type: 'organization', id: ctx.organization.id, entity: entityId, kind: 'passport_snapshot', title: 'Processos que usaram o Passport' }));
  return root;
}

function fieldRow(ctx, item, { canEdit, documents }) {
  const shown = passportValue(item);
  const meta = [el('span', { text: item.scope === 'entity' ? 'Entidade legal' : item.inherited ? 'Default do grupo (herdado)' : 'Grupo' })];
  if (item.origin === 'organization') {
    meta.push(el('span', { text: item.filled ? SOURCE_LABELS.cadastro_organizacao : 'Não informado no cadastro' }));
  } else if (item.filled || item.value) {
    meta.push(el('span', { text: SOURCE_LABELS[item.source] || item.source || 'Origem não registrada' }));
    if (item.updated_at) meta.push(el('span', { text: `${item.updated_by_name ? `${item.updated_by_name}, ` : ''}${formatDate(item.updated_at)}` }));
    if (item.verified_at) meta.push(el('span', { text: `confirmado ${timeAgo(item.verified_at)}${item.verified_by_name ? ` por ${item.verified_by_name}` : ''}` }));
    if (item.valid_until) meta.push(el('span', { text: `validade ${formatDate(item.valid_until)}` }));
    meta.push(el('span', { text: `revisão a cada ${item.review_days} dias` }));
  }
  const actions = [];
  if (item.origin === 'organization') {
    if (ctx.can('admin') || canEdit) actions.push(linkButton('Editar no cadastro', ctx.href('/finance/settings.html#empresa'), { variant: 'ghost', size: 'sm' }));
  } else if (canEdit) {
    actions.push(button(item.value ? 'Editar' : 'Preencher', { size: 'sm', variant: item.value ? 'ghost' : 'secondary', attrs: { 'aria-label': `${item.value ? 'Editar' : 'Preencher'} ${item.label}` }, onClick: () => editField(ctx, item, documents) }));
    if (!item.inherited && item.value && ['review_due', 'stale'].includes(item.freshness)) {
      actions.push(button('Confirmar como atual', { size: 'sm', variant: 'ghost', iconName: 'check', attrs: { 'aria-label': `Confirmar ${item.label} como atual` }, onClick: (event) => confirmField(ctx, item, event.currentTarget) }));
    }
  }
  if (item.value && item.origin !== 'organization') actions.push(button('Histórico', { size: 'sm', variant: 'ghost', attrs: { 'aria-label': `Histórico de ${item.label}` }, onClick: () => showHistory(ctx, item) }));

  const valueNode = shown === null
    ? el('span', { class: 'passport-value missing', text: 'Não informado' })
    : el('span', { class: 'passport-value', text: shown });
  return el('li', { class: `passport-field${item.filled ? '' : ' passport-field-empty'}`, id: `field-${item.key}`, 'data-field': item.key }, [
    el('div', { class: 'passport-field-main' }, [
      el('span', { class: 'passport-label', text: item.label }),
      valueNode,
      item.typed === false ? el('span', { class: 'passport-warning', text: 'Formato livre: não preenche solicitações até ser revisado.' }) : null,
      item.document ? el('span', { class: 'passport-doc' }, [icon('file', { size: 12 }), el('span', { text: `${item.document.title} · v${item.document.version}` })]) : null,
      item.document_missing ? el('span', { class: 'passport-warning', text: 'Arquivo vinculado removido: vincule outro arquivo.' }) : null,
      meta.length ? el('span', { class: 'passport-meta' }, meta) : null
    ]),
    el('div', { class: 'passport-field-side' }, [
      item.filled && item.freshness ? freshnessTag(item.freshness, item.due_on) : null,
      actions.length ? el('div', { class: 'passport-actions' }, actions) : null
    ])
  ]);
}

function valueControl(spec, value) {
  if (spec?.type === 'enum') {
    const select = el('select', { name: 'field_value', required: true });
    select.add(new Option('Selecione…', ''));
    for (const [key, label] of Object.entries(spec.options)) select.add(new Option(label, key));
    select.value = value || '';
    return select;
  }
  if (spec && ['money', 'number', 'int', 'percent'].includes(spec.type)) {
    return el('input', { name: 'field_value', type: 'text', inputmode: 'decimal', autocomplete: 'off', required: true, maxlength: '20',
      value: value ?? '', pattern: spec.type === 'int' ? '[0-9]+' : '-?[0-9]+([.,][0-9]+)?' });
  }
  const area = el('textarea', { name: 'field_value', rows: '3', maxlength: '500', required: true });
  area.value = value || '';
  return area;
}

function editField(ctx, item, documents) {
  const spec = catalogField(item.key);
  const form = el('form', { class: 'stack', novalidate: true });
  const value = valueControl(spec, item.typed === false ? '' : item.value);
  const hint = spec?.type === 'money' ? 'Em reais, só números (ex.: 182000000).' : spec?.type === 'percent' ? 'Percentual ao mês (ex.: 1,45).' : spec?.hint || null;
  const source = el('select', { name: 'source', required: true });
  for (const key of WRITABLE_SOURCES) source.add(new Option(SOURCE_LABELS[key], key));
  source.value = WRITABLE_SOURCES.includes(item.source) ? item.source : 'declarado_pela_empresa';
  const fields = [
    field({ label: spec?.type === 'document' ? 'Descrição do documento' : 'Valor', control: value, required: true, hint }),
    field({ label: 'Origem do dado', control: source, required: true, hint: 'Diga de onde veio o número. O Arandu não altera nem reinterpreta o valor informado.' })
  ];
  let documentSelect = null;
  if (spec?.type === 'document' || item.document_id) {
    documentSelect = el('select', { name: 'document_id', required: spec?.type === 'document' });
    documentSelect.add(new Option(documents.length ? 'Selecione o arquivo…' : 'Nenhum arquivo enviado ainda', ''));
    for (const doc of documents) documentSelect.add(new Option(`${doc.title} (v${doc.current_version})`, doc.id));
    documentSelect.value = item.document?.id || '';
    fields.push(field({ label: 'Arquivo vinculado', control: documentSelect, required: spec?.type === 'document', hint: 'Envie o arquivo em Documentação → Arquivos do perfil antes de vincular.' }));
  }
  const validUntil = el('input', { name: 'valid_until', type: 'date', value: item.valid_until || '' });
  const review = el('input', { name: 'review_after_days', type: 'number', inputmode: 'numeric', min: String(MIN_REVIEW_DAYS), max: String(MAX_REVIEW_DAYS), step: '1', value: String(item.review_days || spec?.review_days || 180) });
  fields.push(
    field({ label: 'Validade', control: validUntil, optionalLabel: true, hint: 'Só quando o próprio documento ou fonte traz uma data de validade.' }),
    field({ label: 'Revisar a cada (dias)', control: review, hint: 'Política de revisão da empresa para este campo. Depois do prazo ele aparece como desatualizado.' })
  );
  const error = el('p', { class: 'field-error', role: 'alert', hidden: true });
  form.append(...fields, error);
  const save = button('Salvar', { variant: 'primary', type: 'submit', attrs: { form: 'passport-edit-form' } });
  form.id = 'passport-edit-form';
  const panel = drawer({ title: item.label, subtitle: item.value ? 'Uma nova gravação fica no histórico; a confirmação anterior deixa de valer se o valor mudar.' : 'Preencha uma vez; as próximas solicitações reaproveitam.', body: form, footer: [button('Cancelar', { variant: 'ghost', onClick: () => panel.close() }), save] });
  value.focus();
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;
    if (!form.reportValidity()) return;
    save.disabled = true;
    try {
      await ctx.api('profile', { method: 'POST', body: JSON.stringify({
        organization_id: ctx.organization.id, legal_entity_id: ctx.passportEntityId || null, field_key: item.key, field_value: value.value, source: source.value,
        document_id: documentSelect?.value || null, valid_until: validUntil.value || null, review_after_days: Number(review.value)
      }) });
      panel.close();
      toast(`${item.label} salvo no Passport.`);
      ctx.reload();
    } catch (problem) {
      error.textContent = problem.message;
      error.hidden = false;
      save.disabled = false;
    }
  });
}

async function confirmField(ctx, item, trigger) {
  trigger.disabled = true;
  try {
    await ctx.api('profile/confirm', { method: 'POST', body: JSON.stringify({ organization_id: ctx.organization.id, legal_entity_id: item.legal_entity_id || null, field_key: item.key }) });
    toast(`${item.label} confirmado como atual.`);
    ctx.reload();
  } catch (error) {
    toast(error.message, 'error');
    trigger.disabled = false;
  }
}

const CHANGE_LABELS = { created: 'Criado', updated: 'Alterado', confirmed: 'Confirmado como atual' };
async function showHistory(ctx, item) {
  const body = el('div', { class: 'stack' }, el('p', { class: 'muted', text: 'Carregando histórico…' }));
  drawer({ title: `Histórico — ${item.label}`, subtitle: 'Registro append-only: nenhuma linha é editada ou apagada.', body });
  try {
    const { rows } = await ctx.api(`profile/history?organization_id=${encodeURIComponent(ctx.organization.id)}&field_key=${encodeURIComponent(item.key)}${item.legal_entity_id ? `&legal_entity_id=${encodeURIComponent(item.legal_entity_id)}` : ''}`);
    body.replaceChildren(rows?.length ? el('ol', { class: 'passport-history' }, rows.map((row) => el('li', { class: 'passport-history-item' }, [
      el('p', {}, [el('strong', { text: CHANGE_LABELS[row.change_type] || row.change_type }), el('span', { class: 'muted', text: ` · ${formatDateTime(row.changed_at)}${row.changed_by_name ? ` · ${row.changed_by_name}` : ''}` })]),
      row.change_type === 'updated' ? el('p', { class: 'small', text: `${passportValue({ ...item, value: row.previous_value, typed: undefined }) ?? '—'} → ${passportValue({ ...item, value: row.new_value, typed: undefined }) ?? '—'}` })
        : el('p', { class: 'small', text: passportValue({ ...item, value: row.new_value, typed: undefined }) ?? '—' }),
      el('p', { class: 'small muted', text: `Origem: ${SOURCE_LABELS[row.new_source] || row.new_source || '—'}${row.previous_source && row.previous_source !== row.new_source ? ` (antes: ${SOURCE_LABELS[row.previous_source] || row.previous_source})` : ''}` })
    ]))) : emptyState({ title: 'Sem histórico registrado', text: 'Campos gravados antes do Passport v2 começam o histórico na próxima alteração.', compact: true }));
  } catch (error) {
    body.replaceChildren(errorState({ error }));
  }
}

function customForm(ctx) {
  const form = el('form', { class: 'inline-form', novalidate: true });
  const label = el('input', { name: 'label', maxlength: '48', required: true, placeholder: 'Ex.: Seguro de crédito vigente' });
  const value = el('input', { name: 'value', maxlength: '500', required: true });
  const source = el('select', { name: 'source' });
  for (const key of WRITABLE_SOURCES) source.add(new Option(SOURCE_LABELS[key], key));
  form.append(field({ label: 'Campo', control: label }), field({ label: 'Valor', control: value }), field({ label: 'Origem', control: source }), button('Salvar campo', { type: 'submit' }));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const key = label.value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[^a-z]+/, '').slice(0, 48);
    if (key.length < 2) { toast('Dê um nome com letras ao campo.', 'error'); return; }
    if (catalogField(key)) { toast(`${fieldLabel(key)} já existe no catálogo: preencha pelo campo correspondente.`, 'error'); return; }
    try {
      await ctx.api('profile', { method: 'POST', body: JSON.stringify({ organization_id: ctx.organization.id, legal_entity_id: ctx.passportEntityId || null, field_key: key, field_value: value.value, source: source.value }) });
      toast('Campo salvo.');
      ctx.reload();
    } catch (error) { toast(error.message, 'error'); }
  });
  return form;
}
