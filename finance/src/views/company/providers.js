// Instituições cadastradas, fila de relacionamento e cadastro.
// Extraído de company.js (v7.0): uma capability por módulo e rota.

import { el, icon, formatDate, relativeDays, plural, PROVIDER_KINDS, fold } from '../../core.js';
import { tag, button, emptyState, toast, drawer, field, person, onSubmit, toastError } from '../../ui.js';
import { loadEntities } from '../entities.js';
import { mods, need } from './capabilities.js';

export async function providers(ctx) {
  const rows = ctx.data.providers || [];
  // Memória de relacionamento (contatos, issues, avaliações da empresa, mapa).
  const entities = await loadEntities(ctx);
  const relationshipEnabled = entities.available;
  await need('center', 'contractCenter', ...(relationshipEnabled ? ['relationship'] : []));
  const manage = ctx.can('create_rfq');
  const add = manage ? button('Cadastrar instituição', { variant: 'primary', iconName: 'plus', attrs: { 'data-intent': 'cadastrar-instituicao' }, onClick: () => providerDrawer(ctx) }) : null;
  // Consultas guiadas (sem IA) e catálogo: carregados só ao abrir.
  const queries = button('Consultas', { iconName: 'search', attrs: { 'data-intent': 'consultas' }, onClick: () => import('../guided-queries.js').then((m) => m.openGuidedQueries(ctx)) });
  const catalog = button('Catálogo de produtos', { iconName: 'layers', attrs: { 'data-intent': 'catalogo' }, onClick: () => import('../product-catalog.js').then((m) => m.openProductCatalog(ctx)) });
  ctx.header({ title: 'Instituições', subtitle: 'Bancos, fintechs e adquirentes com quem a empresa se relaciona: contratos, vencimentos e processos de cada uma. É um cadastro da empresa, não uma atestação.', actions: [queries, catalog, add].filter(Boolean) });
  if (!rows.length) return emptyState({ title: 'Nenhuma instituição cadastrada', text: 'Registre a primeira instituição para organizar o relacionamento e as condições existentes.', iconName: 'building', action: add ? button('Cadastrar instituição', { variant: 'primary', iconName: 'plus', onClick: () => providerDrawer(ctx) }) : null });
  // Índice de relacionamento: fatos do histórico da própria empresa, em ordem alfabética (nada de ranking).
  const participation = new Map();
  const proposalsBy = new Map();
  for (const rfq of ctx.data.rfqs || []) {
    for (const invite of rfq.invites || []) participation.set(invite.provider_id, (participation.get(invite.provider_id) || 0) + 1);
    for (const proposal of rfq.proposals || []) proposalsBy.set(proposal.provider_id, (proposalsBy.get(proposal.provider_id) || 0) + 1);
  }
  const liveContracts = new Map();
  for (const contract of ctx.data.contracts || []) {
    if (!['active', 'renewing'].includes(contract.status) || !contract.provider_id) continue;
    const list = liveContracts.get(contract.provider_id) || [];
    list.push(contract);
    liveContracts.set(contract.provider_id, list);
  }
  const search = el('input', { type: 'search', class: 'input', placeholder: 'Buscar por nome, tipo ou região', 'aria-label': 'Buscar provedor' });
  const count = el('span', { class: 'result-count', role: 'status', 'aria-live': 'polite' });
  const table = el('table', { class: 'data-table provider-table' });
  table.append(el('thead', {}, el('tr', {}, ['Instituição', 'Tipo e região', 'Contratos vigentes carregados', 'Próximo vencimento carregado', 'Processos carregados', 'Verificação'].map((label) => el('th', { scope: 'col', text: label })))));
  const body = el('tbody');
  table.append(body);
  const draw = () => {
    const term = fold(search.value);
    body.replaceChildren();
    const visible = rows.filter((row) => fold(`${row.name} ${row.region} ${PROVIDER_KINDS[row.kind]}`).includes(term));
    for (const provider of visible) {
      body.append(el('tr', { id: `provider-${provider.id}`, dataset: { entity: 'provider', id: provider.id } }, [
        el('td', { 'data-label': 'Provedor', class: 'cell-primary' }, [person(provider.name, provider.website || null),
          relationshipEnabled ? button('Relacionamento', { size: 'sm', variant: 'ghost', iconName: 'users', attrs: { 'aria-label': `Relacionamento com ${provider.name}` }, onClick: () => { const url = new URL(location.href); url.searchParams.set('provider_id', provider.id); history.replaceState(null, '', url.pathname + url.search + url.hash); mods.relationship.openProviderRelationship(ctx, provider); } }) : null]),
        el('td', { 'data-label': 'Tipo e região' }, [el('span', { text: PROVIDER_KINDS[provider.kind] || 'Tipo não informado' }), el('span', { class: 'cell-sub muted small', text: provider.region || 'Região não informada' })]),
        el('td', { 'data-label': 'Contratos vigentes', class: 'num', text: String((liveContracts.get(provider.id) || []).length) }),
        el('td', { 'data-label': 'Próximo vencimento' }, (() => {
          const next = (liveContracts.get(provider.id) || []).map((contract) => contract.ends_on).filter(Boolean).sort()[0];
          return next ? [el('span', { text: formatDate(next) }), el('span', { class: 'cell-sub muted small', text: relativeDays(next) })] : el('span', { class: 'muted', text: (liveContracts.get(provider.id) || []).length ? 'Vencimento não informado' : 'Nenhum no recorte carregado' });
        })()),
        el('td', { 'data-label': 'Processos', text: `${plural(participation.get(provider.id) || 0, 'convite', 'convites')} · ${plural(proposalsBy.get(provider.id) || 0, 'proposta', 'propostas')}` }),
        el('td', { 'data-label': 'Verificação' }, provider.verification_state === 'EVIDENCIA_REGISTRADA'
          ? tag(`Evidência registrada em ${formatDate(provider.regulator_checked_at)}`, 'success')
          : el('span', { class: 'muted small', title: 'O cadastro é uma referência da empresa, não uma atestação de regularidade.', text: 'Sem verificação registrada' }))
      ]));
    }
    count.textContent = `${visible.length} de ${rows.length}`;
  };
  search.addEventListener('input', draw);
  const requested = new URLSearchParams(location.search).get('provider_id')?.toLowerCase();
  if (requested && relationshipEnabled) {
    const provider = rows.find(row => row.id === requested);
    if (provider) queueMicrotask(() => mods.relationship.openProviderRelationship(ctx, provider));
    else queueMicrotask(async () => {
      const current = () => location.pathname.endsWith('/providers.html') && new URLSearchParams(location.search).get('provider_id')?.toLowerCase() === requested;
      try {
        const detail = await ctx.api(`provider-relationship?organization_id=${ctx.orgId}&provider_id=${encodeURIComponent(requested)}`);
        if (detail.provider?.id !== requested) throw new Error('Instituição indisponível.');
        if (current()) mods.relationship.openProviderRelationship(ctx, detail.provider, {initialDetail:detail});
      } catch { if (current()) toast('Instituição indisponível no seu escopo autorizado. Tente novamente pela lista.', 'error'); }
    });
  }
  draw();
  const openRelationship = relationshipEnabled ? (provider) => { const url = new URL(location.href); url.searchParams.set('provider_id', provider.id); history.replaceState(null, '', url.pathname + url.search + url.hash); mods.relationship.openProviderRelationship(ctx, provider); } : null;
  const center = mods.center.relationshipWorkQueue(ctx, { entities, onOpenProvider: openRelationship,
    importButton: manage ? (providerId) => mods.contractCenter.importContractButton(ctx, entities, { label: 'Registrar contrato existente', size: 'sm', providerId }) : null });
  const agenda = relationshipEnabled ? (await import('../crm/organization-panel.js')).crmOrganizationPanel(ctx, { providers: rows, contracts: ctx.data.contracts || [], onOpenProvider: openRelationship }) : null;
  return el('div', { class: 'list-page' }, [
    center,
    agenda,
    el('h2', { class: 'form-section-title', text: 'Todas as instituições' }),
    el('p', { class: 'callout callout-info compact', role: 'note', text: 'Recorte dos registros carregados e autorizados: até 200 instituições, 200 contratos e 200 solicitações recentes. Convites e propostas se referem a essas solicitações; rascunhos e propostas retiradas não contam. Contagens e vencimentos não representam o histórico completo.' }),
    el('div', { class: 'toolbar' }, [el('div', { class: 'toolbar-search' }, [icon('search'), search]), count]), el('div', { class: 'table-card' }, table)
  ]);
}

function providerDrawer(ctx) {
  const form = el('form', { class: 'stack', id: 'provider-form', novalidate: true });
  const name = el('input', { name: 'name', maxlength: '200' });
  const kind = el('select', { name: 'kind' });
  for (const [value, label] of Object.entries(PROVIDER_KINDS)) kind.add(new Option(label, value));
  const region = el('input', { name: 'region', maxlength: '120' });
  const website = el('input', { name: 'website', type: 'url', placeholder: 'https://' });
  const notes = el('textarea', { name: 'notes', rows: '3', maxlength: '1000' });
  const nameField = field({ label: 'Nome', control: name, required: true });
  form.append(nameField, field({ label: 'Tipo', control: kind }), field({ label: 'Região de atuação', control: region, optionalLabel: true }),
    field({ label: 'Site', control: website, optionalLabel: true, hint: 'Somente https.' }), field({ label: 'Notas internas', control: notes, optionalLabel: true, hint: 'Visíveis apenas para a sua empresa.' }),
    el('p', { class: 'callout callout-info compact' }, [icon('shield', { size: 14 }), el('span', { text: 'O Arandu não afirma que um provedor é regulado sem autoridade, registro, evidência e data de consulta.' })]));
  const save = button('Cadastrar instituição', { variant: 'primary', type: 'submit', iconName: 'check', attrs: { form: 'provider-form' } });
  const dialog = drawer({ title: 'Cadastrar instituição', body: form, footer: [button('Cancelar', { variant: 'ghost', onClick: () => dialog.close() }), save] });
  onSubmit(form, async (event) => {
    event.preventDefault();
    if (name.value.trim().length < 2) { nameField.setError('Informe o nome do provedor.'); name.focus(); return; }
    if (website.value && !/^https:\/\//.test(website.value)) { website.closest('.field').setError('Use um endereço https.'); return; }
    save.disabled = true;
    try {
      const created = await ctx.send('providers', { organization_id: ctx.organization.id, ...Object.fromEntries(new FormData(form)) });
      dialog.close();
      // Primeiro valor sem a instituição no portal: o cadastro abre direto o
      // relacionamento, onde contato, contrato e questões são os próximos passos.
      const id = created?.row?.id;
      toast(id ? 'Instituição cadastrada. Ela não precisa ter conta no Arandu: registre agora um contato ou um contrato existente.' : 'Instituição cadastrada.');
      if (id) {
        const url = new URL(location.href);
        url.searchParams.delete('acao');
        url.searchParams.set('provider_id', id);
        history.replaceState(null, '', url.pathname + url.search + url.hash);
      }
      ctx.reload();
    } catch (error) { toastError(error); save.disabled = false; }
  });
  name.focus();
}

// ----------------------------------------------------------------- tarefas
// Responsável de tarefa (contrato da #204): só gestores atribuem; só admin,
// gestor financeiro e analista podem responder (o banco confere papel, membro e
// escopo de entidade). Candidatos vêm dos membros da própria empresa já
// carregados; leitor e provedor nunca aparecem. Nome nunca é identificador.
