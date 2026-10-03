// Multi-entity na interface: contexto de entidade, administração do grupo,
// escopo dos membros e consolidado por entidade.
//
// Quem decide o que cada pessoa enxerga é o banco (RLS). O contexto escolhido
// aqui é só um filtro de tela sobre linhas que a pessoa já pode ler; trocar o
// contexto nunca amplia acesso. Sem entidades cadastradas (ou num transporte
// que não as conhece), tudo continua funcionando como antes.

import { el, icon, formatDate } from '../core.js';
import { card, button, tag, field, emptyState, errorState, loading, toast, confirmDialog, person } from '../ui.js';
import { entityLabel, entityTree } from '../../../lib/finance/entities.mjs';

const CONTEXT_KEY = 'arandu-finance-entity';
export const ALL = '';
export const GROUP = 'group';

/** Carrega (uma vez por página) as entidades que a pessoa enxerga. */
export function loadEntities(ctx) {
  if (ctx.audience !== 'company' || !ctx.organization) return Promise.resolve(emptyEntities());
  ctx.entitiesPromise ||= ctx.api(`entities?organization_id=${encodeURIComponent(ctx.organization.id)}`)
    .then((result) => {
      const rows = result.rows || [];
      return { rows, byId: new Map(rows.map((row) => [row.id, row])), scope: result.scope || 'group', canAdmin: Boolean(result.can_admin), baseCurrency: result.base_currency || null, available: true };
    })
    .catch(() => emptyEntities());
  return ctx.entitiesPromise;
}
function emptyEntities() { return { rows: [], byId: new Map(), scope: 'group', canAdmin: false, baseCurrency: null, available: false }; }

export function selectedEntity() {
  try { return sessionStorage.getItem(CONTEXT_KEY) || ALL; } catch { return ALL; }
}
function remember(value) {
  try { if (value) sessionStorage.setItem(CONTEXT_KEY, value); else sessionStorage.removeItem(CONTEXT_KEY); } catch { /* segue sem memória */ }
}

/** Uma linha (RFQ/contrato) pertence ao contexto escolhido? Unidade conta na entidade-mãe. */
export function inContext(entities, row, context = selectedEntity()) {
  if (!context) return true;
  if (context === GROUP) return !row.legal_entity_id;
  const entity = entities.byId.get(row.legal_entity_id);
  return row.legal_entity_id === context || entity?.parent_id === context;
}

export function entityName(entities, id) {
  if (!id) return 'Nível de grupo';
  const entity = entities.byId.get(id);
  return entity ? entityLabel(entity, entities.byId) : 'Entidade sem acesso de leitura';
}

export function entityTag(entities, id) {
  if (!entities.rows.length) return null;
  return tag(entityName(entities, id), id ? 'neutral' : 'accent');
}

/** Seletor do contexto de entidade (barra lateral e listas). */
export function entityContextSelect(entities, { onChange = null, label = 'Entidade em foco' } = {}) {
  if (!entities.rows.length) return null;
  const select = el('select', { class: 'input entity-context-select', 'aria-label': label });
  select.add(new Option(entities.scope === 'group' ? 'Todas as entidades do grupo' : 'Todas as minhas entidades', ALL));
  for (const row of entityTree(entities.rows)) {
    if (row.status === 'archived') continue;
    select.add(new Option(`${row.depth ? '— ' : ''}${row.short_name || row.legal_name}`, row.id));
  }
  if (entities.scope === 'group') select.add(new Option('Somente nível de grupo (sem entidade)', GROUP));
  const current = selectedEntity();
  select.value = [...select.options].some((option) => option.value === current) ? current : ALL;
  if (select.value !== current) remember(select.value);
  select.addEventListener('change', () => { remember(select.value); onChange?.(select.value); });
  return select;
}

/** Campo de entidade para criar processo. Obrigatório para escopo restrito. */
export function entityField(entities, { value = selectedEntity() } = {}) {
  if (!entities.rows.length) return null;
  const select = el('select', { name: 'legal_entity_id' });
  if (entities.scope === 'group') select.add(new Option('Nível de grupo (sem entidade específica)', ''));
  for (const row of entityTree(entities.rows)) {
    if (row.status === 'archived') continue;
    select.add(new Option(`${row.depth ? '— ' : ''}${row.legal_name}${row.short_name ? ` (${row.short_name})` : ''}`, row.id));
  }
  const preferred = value && value !== GROUP ? value : '';
  select.value = [...select.options].some((option) => option.value === preferred) ? preferred : select.options[0]?.value || '';
  return field({
    label: 'Entidade do grupo', control: select, required: entities.scope !== 'group',
    hint: entities.scope === 'group'
      ? 'Define quem enxerga o processo. Sem entidade, só a tesouraria do grupo vê.'
      : 'Você só cria processos nas entidades do seu escopo.'
  });
}

/** Consolidado por entidade, sobre o que a pessoa pode ler. */
export function entitySummaryCard(ctx) {
  const box = el('div', {}, loading('Carregando consolidado por entidade…'));
  ctx.api(`entity-summary?organization_id=${encodeURIComponent(ctx.organization.id)}`).then((result) => {
    const rows = result.rows || [];
    if (!rows.length) { box.replaceChildren(emptyState({ title: 'Nenhuma entidade no seu escopo', compact: true, iconName: 'building' })); return; }
    const table = el('table', { class: 'data-table entity-summary-table' });
    table.append(el('thead', {}, el('tr', {}, ['Entidade', 'Moeda', 'Processos em aberto', 'Decididos', 'Contratos ativos', 'Aviso prévio em até 30 dias', 'Próximo vencimento']
      .map((label) => el('th', { scope: 'col', text: label })))));
    const body = el('tbody');
    for (const row of rows) {
      body.append(el('tr', { class: row.depth ? 'entity-child' : '' }, [
        el('td', { 'data-label': 'Entidade', class: 'cell-primary' }, [el('span', { text: `${row.depth ? '— ' : ''}${row.label}` }), row.status === 'archived' ? tag('arquivada') : null]),
        el('td', { 'data-label': 'Moeda', text: row.currency || '—' }),
        el('td', { 'data-label': 'Processos em aberto', text: String(row.rfqs_open) }),
        el('td', { 'data-label': 'Decididos', text: String(row.rfqs_decided) }),
        el('td', { 'data-label': 'Contratos ativos', text: String(row.contracts_active) }),
        el('td', { 'data-label': 'Aviso prévio em até 30 dias', class: row.contracts_notice_due ? 'urgent' : '', text: String(row.contracts_notice_due) }),
        el('td', { 'data-label': 'Próximo vencimento', text: row.next_contract_end ? formatDate(row.next_contract_end) : '—' })
      ]));
    }
    table.append(body);
    box.replaceChildren(el('div', { class: 'table-scroll' }, table), el('p', { class: 'muted small', text: `${result.definition}${result.truncated ? ' Lista truncada em 5.000 registros.' : ''}` }));
  }).catch((error) => box.replaceChildren(errorState({ error })));
  return card({ title: 'Consolidado por entidade', subtitle: 'Somente o que o seu escopo permite ler. Unidades aparecem abaixo da entidade legal.', body: box, className: 'entity-summary' });
}

/** Seção de Configurações: entidades, moeda base e escopo dos membros. */
export function entitySettings(ctx, entities) {
  const root = el('div', { class: 'stack' });
  if (!entities.available) {
    root.append(emptyState({ title: 'Entidades indisponíveis neste ambiente', text: 'A estrutura de entidades do grupo não está disponível aqui.', compact: true, iconName: 'building' }));
    return root;
  }
  const admin = entities.canAdmin;
  const tree = entityTree(entities.rows);
  const list = el('ul', { class: 'entity-list', role: 'list' });
  for (const row of tree) {
    const archive = admin && row.status === 'active' ? button('Arquivar', { size: 'sm', variant: 'ghost', iconName: 'x', onClick: async () => {
      if (!await confirmDialog({ title: `Arquivar ${row.short_name || row.legal_name}?`, description: 'Processos e contratos existentes continuam com o histórico. A entidade deixa de aceitar processos novos e novas concessões de escopo.', confirmLabel: 'Arquivar', tone: 'danger' })) return;
      try { await ctx.api('entities', { method: 'PATCH', body: JSON.stringify({ entity_id: row.id, status: 'archived' }) }); toast('Entidade arquivada.'); ctx.reload(); }
      catch (error) { toast(error.message, 'error'); }
    } }) : null;
    list.append(el('li', { class: `entity-row depth-${row.depth}`, dataset: { entity: 'legal_entity', id: row.id } }, [
      el('span', { class: 'entity-row-main' }, [
        el('strong', { text: row.legal_name }),
        el('span', { class: 'muted small', text: [row.kind === 'business_unit' ? 'Unidade de negócio' : 'Entidade legal', row.short_name, row.tax_identifier ? `CNPJ ${String(row.tax_identifier).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')}` : null, `${row.country} · ${row.currency}`].filter(Boolean).join(' · ') })
      ]),
      row.status === 'archived' ? tag(`arquivada em ${formatDate(row.archived_at)}`) : tag('ativa', 'success'),
      archive
    ]));
  }
  root.append(tree.length ? list : emptyState({ title: 'Nenhuma entidade cadastrada', text: admin ? 'Cadastre as entidades legais do grupo para separar processos, contratos e acessos por entidade.' : 'O administrador do grupo ainda não cadastrou entidades.', compact: true, iconName: 'building' }));

  if (admin) {
    // Moeda base do grupo: contexto de leitura, nunca conversão automática.
    const base = el('input', { name: 'base_currency', maxlength: '3', value: entities.baseCurrency || 'BRL', class: 'input-short', autocomplete: 'off' });
    const baseForm = el('form', { class: 'inline-form', id: 'base-currency-form', novalidate: true }, [
      field({ label: 'Moeda base do grupo', control: base, hint: 'Código ISO (BRL, USD…). Usada como contexto; o Arandu não converte valores entre moedas.' }),
      button('Salvar moeda', { type: 'submit', iconName: 'check' })]);
    baseForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      try { await ctx.api('entities/currency', { method: 'POST', body: JSON.stringify({ organization_id: ctx.organization.id, base_currency: base.value.trim().toUpperCase() }) }); toast('Moeda base atualizada.'); }
      catch (error) { toast(error.message, 'error'); }
    });

    const kind = el('select', { name: 'kind' });
    kind.add(new Option('Entidade legal', 'legal_entity'));
    kind.add(new Option('Unidade de negócio (abaixo de uma entidade)', 'business_unit'));
    const parent = el('select', { name: 'parent_id' });
    for (const row of tree.filter((item) => item.kind === 'legal_entity' && item.status === 'active')) parent.add(new Option(row.legal_name, row.id));
    const parentField = field({ label: 'Entidade legal acima', control: parent });
    parentField.hidden = true;
    kind.addEventListener('change', () => { parentField.hidden = kind.value !== 'business_unit'; });
    const legalName = el('input', { name: 'legal_name', maxlength: '200', required: true, autocomplete: 'off' });
    const shortName = el('input', { name: 'short_name', maxlength: '60', autocomplete: 'off' });
    const cnpj = el('input', { name: 'tax_identifier', inputmode: 'numeric', placeholder: '00.000.000/0000-00', autocomplete: 'off' });
    const country = el('input', { name: 'country', maxlength: '2', value: 'BR', class: 'input-short' });
    const currency = el('input', { name: 'currency', maxlength: '3', value: entities.baseCurrency || 'BRL', class: 'input-short' });
    const form = el('form', { class: 'field-grid', id: 'entity-form', novalidate: true }, [
      field({ label: 'Tipo', control: kind }), parentField,
      field({ label: 'Razão social ou nome da unidade', control: legalName, required: true }),
      field({ label: 'Nome curto', control: shortName, optionalLabel: true }),
      field({ label: 'CNPJ', control: cnpj, optionalLabel: true, hint: 'Conferimos formato e dígitos; não consultamos base oficial.' }),
      field({ label: 'País (ISO)', control: country }), field({ label: 'Moeda local (ISO)', control: currency }),
      el('div', { class: 'form-actions span-2' }, button('Cadastrar entidade', { variant: 'primary', type: 'submit', iconName: 'plus' }))
    ]);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (legalName.value.trim().length < 2) { toast('Informe a razão social ou o nome da unidade.', 'error'); legalName.focus(); return; }
      const body = Object.fromEntries(new FormData(form));
      if (body.kind !== 'business_unit') delete body.parent_id;
      for (const [key, value] of Object.entries(body)) if (value === '') delete body[key];
      try {
        await ctx.api('entities', { method: 'POST', body: JSON.stringify({ organization_id: ctx.organization.id, ...body }) });
        toast('Entidade cadastrada.');
        ctx.reload();
      } catch (error) { toast(error.message, 'error'); }
    });
    root.append(baseForm, el('details', { class: 'entity-create', open: !tree.length }, [el('summary', { text: 'Cadastrar entidade ou unidade' }), form]));
  }
  return root;
}

/** Escopo de cada membro: grupo inteiro ou entidades específicas. Só o admin altera. */
export function memberScopes(ctx, entities) {
  const box = el('div', {}, loading());
  if (!entities.available || !entities.rows.length) {
    box.replaceChildren(el('p', { class: 'muted small', text: 'Sem entidades cadastradas, todos os membros enxergam o grupo inteiro, como hoje.' }));
    return box;
  }
  ctx.api(`entity-scopes?organization_id=${encodeURIComponent(ctx.organization.id)}`).then((result) => {
    const active = entityTree(entities.rows).filter((row) => row.status === 'active');
    const list = el('ul', { class: 'member-list', role: 'list' });
    for (const member of result.rows || []) {
      const restricted = member.entity_scope === 'entities';
      const summary = restricted ? (member.entity_ids.length ? member.entity_ids.map((id) => entityName(entities, id)).join(', ') : 'Entidades do seu escopo') : 'Grupo inteiro';
      const row = el('li', { class: 'member-row scope-row' }, [person(member.display_name || 'Membro', member.title || null), tag(restricted ? 'Escopo restrito' : 'Tesouraria do grupo', restricted ? 'warning' : 'accent'), el('span', { class: 'muted small', text: summary })]);
      if (entities.canAdmin && member.role !== 'admin') {
        const editor = el('form', { class: 'scope-editor', novalidate: true });
        const scope = el('select', { name: 'scope', 'aria-label': `Escopo de ${member.display_name || 'membro'}` });
        scope.add(new Option('Grupo inteiro', 'group'));
        scope.add(new Option('Somente entidades escolhidas', 'entities'));
        scope.value = member.entity_scope;
        const boxes = el('fieldset', { class: 'scope-entities' }, [el('legend', { class: 'small', text: 'Entidades (a concessão de uma entidade cobre as unidades abaixo dela)' }),
          ...active.map((entity) => el('label', { class: 'check-row' }, [
            el('input', { type: 'checkbox', name: 'entity_ids', value: entity.id, checked: member.entity_ids.includes(entity.id) }),
            el('span', { text: `${entity.depth ? '— ' : ''}${entity.short_name || entity.legal_name}` })]))]);
        boxes.hidden = scope.value !== 'entities';
        scope.addEventListener('change', () => { boxes.hidden = scope.value !== 'entities'; });
        editor.append(scope, boxes, button('Salvar escopo', { size: 'sm', type: 'submit', iconName: 'check' }));
        editor.addEventListener('submit', async (event) => {
          event.preventDefault();
          const ids = [...editor.querySelectorAll('input[name="entity_ids"]:checked')].map((input) => input.value);
          if (scope.value === 'entities' && !ids.length) { toast('Escolha ao menos uma entidade para o escopo restrito.', 'error'); return; }
          try {
            await ctx.api('entity-scopes', { method: 'PUT', body: JSON.stringify({ organization_id: ctx.organization.id, user_id: member.user_id, scope: scope.value, entity_ids: ids }) });
            toast('Escopo atualizado. A mudança vale na próxima leitura dessa pessoa.');
            ctx.reload();
          } catch (error) { toast(error.message, 'error'); }
        });
        row.append(el('details', { class: 'scope-details' }, [el('summary', { text: 'Alterar escopo' }), editor]));
      } else if (member.role === 'admin') {
        row.append(el('span', { class: 'muted small', text: 'Administradores são sempre do grupo.' }));
      }
      list.append(row);
    }
    box.replaceChildren(list, entities.canAdmin ? null : el('p', { class: 'muted small' }, [icon('lock', { size: 14 }), el('span', { text: ' Somente administradores do grupo alteram escopos.' })]));
  }).catch((error) => box.replaceChildren(errorState({ error })));
  return box;
}

/** Ação de reatribuir a entidade de uma RFQ (antes da decisão). */
export function rfqEntityControl(ctx, entities, rfq) {
  if (!entities.rows.length) return null;
  const editable = ctx.can('create_rfq') && ['draft', 'open', 'collecting', 'comparing'].includes(rfq.status);
  const current = el('span', { class: 'entity-current' }, [icon('building', { size: 14 }), el('span', { text: entityName(entities, rfq.legal_entity_id) })]);
  if (!editable) return current;
  const select = el('select', { 'aria-label': 'Reatribuir entidade' });
  if (entities.scope === 'group') select.add(new Option('Nível de grupo', ''));
  for (const row of entityTree(entities.rows)) if (row.status === 'active') select.add(new Option(`${row.depth ? '— ' : ''}${row.short_name || row.legal_name}`, row.id));
  select.value = rfq.legal_entity_id || '';
  const save = button('Reatribuir', { size: 'sm', onClick: async () => {
    if (select.value === (rfq.legal_entity_id || '')) return;
    if (!await confirmDialog({ title: 'Reatribuir a entidade do processo?', description: 'Quem enxerga o processo passa a ser definido pela nova entidade. A mudança fica registrada na trilha e não é possível depois da decisão.', confirmLabel: 'Reatribuir' })) return;
    try { await ctx.api('rfq-entity', { method: 'POST', body: JSON.stringify({ rfq_id: rfq.id, legal_entity_id: select.value || null }) }); toast('Entidade reatribuída.'); ctx.reload(); }
    catch (error) { toast(error.message, 'error'); }
  } });
  return el('span', { class: 'entity-control' }, [current, el('details', { class: 'inline-details' }, [el('summary', { text: 'Alterar' }), el('span', { class: 'inline-form' }, [select, save])])]);
}

/** Atribuição única de entidade a contrato anterior à fundação multi-entity. */
export function contractEntityControl(ctx, entities, contract) {
  if (!entities.rows.length) return null;
  if (contract.legal_entity_id || entities.scope !== 'group' || !ctx.can('create_rfq')) return entityTag(entities, contract.legal_entity_id);
  const select = el('select', { 'aria-label': 'Atribuir entidade ao contrato' });
  select.add(new Option('Escolha a entidade…', ''));
  for (const row of entityTree(entities.rows)) if (row.status === 'active') select.add(new Option(`${row.depth ? '— ' : ''}${row.short_name || row.legal_name}`, row.id));
  const save = button('Atribuir entidade', { size: 'sm', onClick: async () => {
    if (!select.value) { toast('Escolha a entidade do contrato.', 'error'); return; }
    if (!await confirmDialog({ title: 'Atribuir entidade ao contrato?', description: 'A atribuição é feita uma única vez e fica na trilha. Mudanças materiais posteriores entram como aditivo.', confirmLabel: 'Atribuir' })) return;
    try { await ctx.api('contract-entity', { method: 'POST', body: JSON.stringify({ contract_id: contract.id, legal_entity_id: select.value }) }); toast('Entidade atribuída ao contrato.'); ctx.reload(); }
    catch (error) { toast(error.message, 'error'); }
  } });
  return el('span', { class: 'entity-control' }, [tag('Nível de grupo', 'accent'), select, save]);
}
