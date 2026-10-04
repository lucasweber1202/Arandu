import { el } from '../core.js';
import { card, button, field, drawer, loading, errorState, emptyState, toast, formDrawer } from '../ui.js';
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
const lines = (items = [], cls = null) => items.map((text) => el('p', { class: cls, text }));

export async function ledgerPage(ctx, { resource, title, subtitle, filters, scope = 'Escopo' }) {
  const entities = await loadEntities(ctx);
  const params = new URL(location.href).searchParams;
  const year = new Date().getUTCFullYear();
  const manage = ['admin', 'finance_manager'].includes(ctx.viewer?.role);
  const sources = {
    entities: [['', 'Meu escopo'], ...entities.rows.map((x) => [x.id, entityName(entities, x.id)])],
    providers: [['', 'Todos'], ...(ctx.data.providers || []).map((x) => [x.id, x.name])],
    contracts: [['', 'Todos'], ...(ctx.data.contracts || []).map((x) => [x.id, x.title || x.id])]
  };
  const controls = {};
  const grid = el('div', { class: 'form-grid' }, filters.map(([key, label, kind]) => {
    const control = kind === 'date' ? el('input', { type: 'date' }) : kind === 'start' || kind === 'end' ? el('input', { type: 'date', value: `${year}-${kind === 'start' ? '01-01' : '12-31'}` })
      : el('select', {}, (sources[kind] || [['', 'Todos']]).map(([value, text]) => el('option', { value, text })));
    if (params.get(key)) control.value = params.get(key);
    controls[key] = control;
    return field({ label, control });
  }));
  const result = el('div', { class: 'stack' }, loading());
  let cursor = null;
  let busy = false;
  let filled = false;
  let refetch = false;
  const reload = () => { cursor = null; return load(); };
  const open = (form, done = reload) => formDrawer(form.title, form.intro, form.fields, async (values) => {
    await post(ctx, form.post, { organization_id: ctx.organization.id, ...form.fixed, ...Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null)) });
    await done();
  });
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
        el('tbody', {}, data.rows.map((row) => el('tr', {}, [...row.cells.map((text) => el('td', { text })), el('td', {}, button(data.detail_label || 'Detalhe', { size: 'sm', onClick: () => detail(row.id) }))])))
      ])) : emptyState(data.empty);
      result.replaceChildren(...data.cards.map((c) => card({ title: c.title, body: [...lines(c.lines), ...lines(c.note ? [c.note] : [], 'muted small'), c.href ? el('a', { href: c.href, text: c.link }) : null, ...(manage ? c.actions || [] : []).map((form) => button(form.label, { size: 'sm', onClick: () => open(form) }))] })),
        table, ...(data.next ? [button('Próxima página', { onClick: () => { cursor = data.next; load(); } })] : []), ...(cursor ? [button('Primeira página', { onClick: reload })] : []));
    } catch (error) { result.replaceChildren(errorState({ error, onRetry: load })); }
    finally { busy = false; }
    if (refetch) { refetch = false; await load(); }
  }
  async function detail(id) {
    try {
      const d = await ctx.api(`${resource}/detail?${new URLSearchParams({ id, organization_id: ctx.organization.id })}`);
      const body = el('div', { class: 'stack' }, [...lines(d.lines), ...(d.links || []).map((l) => el('p', {}, el('a', { href: l.href, text: l.text }))), ...(d.sections || []).map((s) => card({ title: s.title, body: s.items.length ? el('ol', { class: 'plain-list small' }, s.items.map((text) => el('li', { text }))) : el('p', { class: 'muted', text: s.empty }) }))]);
      if (d.graph) body.append(await graphContextCard(ctx, d.graph));
      let dialog;
      const done = () => { dialog.close(); return reload(); };
      const buttons = manage ? (d.actions || []).map((form) => button(form.label, { size: 'sm', onClick: () => open(form, done) })) : [];
      dialog = drawer({ title: d.title, body, footer: buttons.length ? el('div', { class: 'actions' }, buttons) : null });
    } catch (e) { toast(e.message, 'error'); }
  }
  const root = el('div', { class: 'stack portfolio' }, [card({ title: scope, body: [grid, button('Aplicar filtros', { onClick: reload })] }), result]);
  await load();
  if (params.get('id')) await detail(params.get('id'));
  return root;
}
