import { el, icon, productLabel, formatDate, formatDateTime } from '../core.js';
import { card, button, field, drawer, loading, errorState, emptyState, toast, formDrawer } from '../ui.js';
import { CONTRACT_CATEGORIES } from '../../../lib/finance/contract-terms.mjs';
import { loadEntities, entityName } from './entities.js';
import { graphContextCard } from './graph-context.js';

// Renderer genérico de registros factuais compostos no servidor (server
// aggregation): o servidor escreve rótulos, linhas e formulários com a
// linguagem do domínio; aqui só se desenha, filtra, pagina e envia. Assim a
// regra de linguagem segura vive (e é testada) num lugar só, e cada módulo
// novo custa uma configuração, não uma tela inteira no pacote.
//
// Página: { cards:[{title, lines, note, href, link, actions}], columns, rows:[{id, cells}], next, empty, options, forms }
// Detalhe: { title, lines, links:[{href, text}], sections:[{title, items}], graph:{type,id,kind,title}, actions:[form] }
// Formulário: { label, primary, title, intro, fields:[[chave, rótulo, tipo|opções, atributos]], post, fixed }

const post = (ctx, path, body) => ctx.api(path, { method: 'POST', body: JSON.stringify(body) });
// Rede de proteção da apresentação: textos compostos no servidor ainda podem
// trazer identificador interno ou instante ISO (ex.: origem do plano de
// implantação). Aqui viram o que a pessoa reconhece — contrato pelo nome,
// membro pelo nome, data legível — ou um rótulo neutro. O contrato da API não muda.
const ID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ISO_RE = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?\b/g;
export function humanizeText(ctx, text) {
  if (typeof text !== 'string') return text;
  const contracts = new Map((ctx.data?.contracts || []).map((row) => [row.id, row]));
  const members = new Map((ctx.members || []).map((row) => [row.user_id, row.display_name]));
  return text
    .replace(ISO_RE, (iso) => formatDateTime(iso))
    .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_, y, m, d) => `${d}/${m}/${y}`)
    .replace(/template ([a-z_]+):v(\d+)/gi, 'modelo de plano v$2')
    .replace(new RegExp(`decisão (${ID_RE.source})`, 'gi'), 'decisão registrada')
    .replace(new RegExp(`contrato (${ID_RE.source})`, 'gi'), (_, id) => contracts.has(id.toLowerCase()) ? `contrato ${contractName(contracts.get(id.toLowerCase()))}` : 'contrato vinculado')
    .replace(new RegExp(`(responsável:?|confirmado por) (${ID_RE.source})`, 'gi'), (_, label, id) => `${label} ${members.get(id.toLowerCase()) || 'pessoa não identificada'}`)
    .replace(ID_RE, (id) => members.get(id.toLowerCase()) || (contracts.has(id.toLowerCase()) ? contractName(contracts.get(id.toLowerCase())) : 'registro vinculado'));
}
let currentCtx = null;
const lines = (items = [], cls = null) => items.map((text) => el('p', { class: cls, text: currentCtx ? humanizeText(currentCtx, text) : text }));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const contractName = (contract) => contract.title
  || [contract.provider_name, productLabel(contract.product, { short: true }), contract.ends_on ? `vence ${formatDate(contract.ends_on)}` : ''].filter(Boolean).join(' · ') || 'Contrato sem título';

// Chegada a partir de um contrato (?contrato=): diz de onde a pessoa veio,
// devolve-a ao contrato e declara o recorte que o servidor de fato aplicou.
// A API filtra por instituição/entidade, não por contrato: a lista pode ter
// itens de outros contratos com a mesma instituição, e a tela diz isso.
function originContext(ctx, { contractId, noun, controls, filters, entities }) {
  if (!noun || !contractId || !UUID.test(contractId)) return null;
  const contract = (ctx.data.contracts || []).find((row) => row.id === contractId);
  const box = el('aside', { class: 'callout callout-info origin-context', 'aria-label': 'Contrato de origem' });
  const describe = () => {
    const applied = filters.filter(([key]) => controls[key]?.value).map(([key, label]) => `${label.toLowerCase()} ${controls[key].selectedOptions?.[0]?.text || 'selecionado'}`);
    const exact = controls.contract_id && controls.contract_id.value === contractId;
    const sameProvider = contract?.provider_id && controls.provider_id?.value === contract.provider_id;
    const scopeText = exact
      ? `Filtro aplicado: este contrato. A lista mostra só os ${noun} vinculados a ele.`
      : !applied.length
        ? `Sem filtro: a lista mostra ${noun} de todo o seu escopo, não só deste contrato.`
        : `Filtro aplicado: ${applied.join(' · ')}. Sem o filtro de contrato, a lista pode incluir outros contratos${sameProvider ? ' com a mesma instituição' : ''}.`;
    box.replaceChildren(icon('info', { size: 16 }), el('div', {}, [
      el('p', {}, [el('strong', { text: 'Vindo do contrato: ' }), el('span', { text: contract
        ? `${CONTRACT_CATEGORIES[contract.product] || productLabel(contract.product)} com ${contract.provider_name || 'instituição não informada'}${contract.legal_entity_id ? ` · ${entityName(entities, contract.legal_entity_id)}` : ''}${contract.ends_on ? ` · vence ${formatDate(contract.ends_on)}` : ''}`
        : 'contrato fora da lista carregada nesta sessão' })]),
      el('p', { class: 'small', text: scopeText }),
      el('a', { class: 'contract-link', href: ctx.href(`/finance/contracts.html${contract ? `#contract-${contract.id}` : ''}`) }, [el('span', { text: contract ? 'Voltar ao contrato' : 'Abrir contratos' }), icon('arrowRight', { size: 14 })])
    ]));
  };
  describe();
  return { node: box, update: describe };
}

export async function ledgerPage(ctx, { resource, title, subtitle, filters, scope = 'Escopo', originNoun = null }) {
  currentCtx = ctx;
  const entities = await loadEntities(ctx);
  const params = new URL(location.href).searchParams;
  const year = new Date().getUTCFullYear();
  const manage = ['admin', 'finance_manager'].includes(ctx.viewer?.role);
  const sources = {
    entities: [['', 'Meu escopo'], ...entities.rows.map((x) => [x.id, entityName(entities, x.id)])],
    providers: [['', 'Todos'], ...(ctx.data.providers || []).map((x) => [x.id, x.name])],
    // Contrato sem título é nomeado pelo que a pessoa reconhece (instituição,
    // produto, vencimento), nunca pelo identificador interno.
    contracts: [['', 'Todos'], ...(ctx.data.contracts || []).map((x) => [x.id, contractName(x)])]
  };
  const controls = {};
  const grid = el('div', { class: 'form-grid' }, filters.map(([key, label, kind]) => {
    const control = kind === 'date' ? el('input', { type: 'date' }) : kind === 'start' || kind === 'end' ? el('input', { type: 'date', value: `${year}-${kind === 'start' ? '01-01' : '12-31'}` })
      : el('select', {}, (sources[kind] || [['', 'Todos']]).map(([value, text]) => el('option', { value, text })));
    // Filtro vindo de link (ex.: contract_id) nunca se perde em silêncio: sem a
    // opção na lista carregada, entra uma opção neutra com o mesmo valor.
    if (params.get(key) && control.tagName === 'SELECT' && ![...control.options].some((o) => o.value === params.get(key))) control.add(new Option(key === 'contract_id' ? 'Contrato do link' : 'Selecionado pelo link', params.get(key)));
    if (params.get(key)) control.value = params.get(key);
    controls[key] = control;
    return field({ label, control });
  }));
  const result = el('div', { class: 'stack' }, loading());
  const origin = originContext(ctx, { contractId: params.get('contrato'), noun: originNoun, controls, filters, entities });
  let cursor = null;
  let busy = false;
  let filled = false;
  let refetch = false;
  const reload = () => { cursor = null; return load(); };
  const open = (form, done = reload) => formDrawer(form.title, form.intro, form.fields, async (values) => {
    await post(ctx, form.post, { organization_id: ctx.organization.id, ...form.fixed, ...Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null)) });
    await done();
  }, undefined, { onUncertain: reload });
  let forms = [];
  const actions = el('div', { class: 'actions' });
  ctx.header({ title, subtitle, actions: [actions] });
  async function load() {
    if (busy) return;
    busy = true;
    result.replaceChildren(loading());
    try {
      const q = new URLSearchParams({ organization_id: ctx.organization.id });
      for (const [k, control] of Object.entries(controls)) if (control.value) q.set(k, control.value);
      if (cursor) q.set('after', cursor);
      const data = await ctx.api(`${resource}?${q}`);
      if (!filled) {
        filled = true;
        for (const [k, list] of Object.entries(data.options || {})) if (controls[k]) {
          for (const [v, t] of list) controls[k].add(new Option(t, v));
          if (params.get(k)) { controls[k].value = params.get(k); refetch = true; }
        }
        forms = manage ? data.forms || [] : [];
        actions.replaceChildren(...forms.map((form) => button(form.label, { variant: form.primary ? 'primary' : 'secondary', onClick: () => open(form) })));
      }
      const table = data.rows.length ? el('div', { class: 'table-scroll' }, el('table', { class: 'data-table compact' }, [
        el('thead', {}, el('tr', {}, [...data.columns, ''].map((text) => el('th', { scope: 'col', text })))),
        // No celular o cabeçalho some e cada célula vira "rótulo: valor"; sem
        // data-label as linhas eram valores soltos ("Aguardando dados", "Ausentes").
        el('tbody', {}, data.rows.map((row) => el('tr', {}, [...row.cells.map((text, index) => el('td', index === 0 ? { class: 'cell-primary', text: humanizeText(ctx, text) } : { 'data-label': data.columns[index] || '', text: humanizeText(ctx, text) })),
          el('td', { class: 'cell-action' }, button(data.detail_label || 'Detalhe', { size: 'sm', onClick: () => detail(row.id) }))])))
      ])) : emptyState(data.empty);
      origin?.update();
      result.replaceChildren(...data.cards.map((c) => card({ title: c.title, body: [...lines(c.lines), ...lines(c.note ? [c.note] : [], 'muted small'), c.href ? el('a', { href: c.href, text: c.link }) : null, ...(manage ? c.actions || [] : []).map((form) => button(form.label, { size: 'sm', onClick: () => open(form) }))] })),
        table, ...(data.next ? [button('Próxima página', { onClick: () => { cursor = data.next; load(); } })] : []), ...(cursor ? [button('Primeira página', { onClick: reload })] : []));
    } catch (error) { result.replaceChildren(errorState({ error, onRetry: load })); }
    finally { busy = false; }
    if (refetch) { refetch = false; await load(); }
  }
  async function detail(id) {
    try {
      const d = await ctx.api(`${resource}/detail?${new URLSearchParams({ id, organization_id: ctx.organization.id })}`);
      const body = el('div', { class: 'stack' }, [...lines(d.lines), ...(d.links || []).map((l) => el('p', {}, el('a', { href: l.href, text: l.text }))), ...(d.sections || []).map((s) => card({ title: s.title, body: s.items.length ? el('ol', { class: 'plain-list small' }, s.items.map((text) => el('li', { text: humanizeText(ctx, text) }))) : el('p', { class: 'muted', text: s.empty }) }))]);
      if (d.graph) body.append(await graphContextCard(ctx, d.graph));
      let dialog;
      const done = () => { dialog.close(); return reload(); };
      const buttons = manage ? (d.actions || []).map((form) => button(form.label, { size: 'sm', onClick: () => open(form, done) })) : [];
      dialog = drawer({ title: humanizeText(ctx, d.title), body, footer: buttons.length ? el('div', { class: 'actions' }, buttons) : null });
    } catch (e) { toast(e.message, 'error'); }
  }
  const root = el('div', { class: 'stack portfolio' }, [origin?.node, card({ title: scope, body: [grid, button('Aplicar filtros', { onClick: reload })] }), result].filter(Boolean));
  await load();
  if (params.get('id')) await detail(params.get('id'));
  return root;
}
