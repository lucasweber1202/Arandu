// Comentários contextuais de proposta, aprovação e contrato (na solicitação,
// a conversa continua sendo a do produto, gravada pelo motor).
//
// Escopo sempre explícito:
//   Interno              só a empresa lê. Provedores nunca veem.
//   Visível ao provedor  a empresa e AQUELE provedor (o dono da proposta).
// Aprovação e contrato só aceitam comentário interno. A leitura filtra por
// escopo e organização antes de desenhar — não há "esconder com CSS".

import { el, icon, timeAgo, fold } from '../../../src/core.js';
import { button, toast } from '../../../src/ui.js';
import { readOS, updateOS, uid } from '../platform/os-store.js';
import { emit } from '../platform/bus.js';
import { optimistic, registerExecutor } from '../platform/sync.js';

const SCOPES = { internal: { label: 'Interno', text: 'Só pessoas da sua empresa leem. Provedores nunca veem.', icon: 'lock' },
  provider: { label: 'Visível ao provedor', text: 'A empresa e este provedor leem. Outros provedores não veem.', icon: 'eye' } };

/** Regra de leitura (testada): provedor só vê o que é do escopo dele. */
export function visibleComments(all, { objectType, objectId, viewerOrgKind, providerOrg = null }) {
  return all.filter((row) => row.object_type === objectType && row.object_id === objectId
    && (viewerOrgKind === 'company' || (row.scope === 'provider' && row.provider_org && row.provider_org === providerOrg)));
}

// "Envio" do comentário: na demo, gravar no registro local é a sincronização.
registerExecutor('comment.create', async (ctx, payload) => {
  updateOS((draft) => { const row = draft.comments.find((entry) => entry.id === payload.id); if (row) row.pending = false; });
  emit('comment.created', { object: payload.object, actor: payload.actor, detail: { scope: payload.scope, excerpt: payload.body.slice(0, 120) } });
  if (payload.mentions.length) emit('mention.created', { object: payload.object, actor: payload.actor, detail: { mentions: payload.mentions, excerpt: payload.body.slice(0, 120), href: payload.href } });
});

/**
 * Conversa de um objeto. `people` = quem pode ser mencionado [{ id, name }].
 * `providerOrg` = organização do provedor dono (habilita o escopo "Visível ao provedor").
 */
export function commentThread(ctx, { objectType, objectId, title, href, people = [], providerOrg = null, allowProviderScope = false, viewerOrgKind = 'company' }) {
  const root = el('section', { class: 'cthread', 'aria-label': `Conversa: ${title}`, dataset: { object: `${objectType}:${objectId}` } });
  const list = el('ol', { class: 'cthread-list', 'aria-live': 'polite' });
  const provider = viewerOrgKind === 'provider';
  let scope = provider ? 'provider' : 'internal';
  const actor = { id: ctx.viewer?.id, name: ctx.viewer?.name || ctx.persona?.name };

  const draw = () => {
    const rows = visibleComments(readOS().comments, { objectType, objectId, viewerOrgKind, providerOrg });
    list.replaceChildren(...(rows.length ? rows.map((row) => el('li', { class: `cmt${row.resolved ? ' is-resolved' : ''}${row.pending ? ' is-pending' : ''}`, dataset: { scope: row.scope } }, [
      el('p', { class: 'cmt-head' }, [el('strong', { text: row.author }), el('span', { class: `scope-badge scope-${row.scope}` }, [icon(SCOPES[row.scope].icon, { size: 12 }), el('span', { text: SCOPES[row.scope].label })]),
        el('time', { datetime: row.at, text: row.pending ? 'aguardando sincronização' : timeAgo(row.at) })]),
      el('p', { class: 'cmt-body', text: row.body }),
      provider ? null : el('button', { type: 'button', class: 'cmt-resolve', 'aria-pressed': String(Boolean(row.resolved)), onclick: () => {
        updateOS((draft) => { const entry = draft.comments.find((item) => item.id === row.id); if (entry) entry.resolved = !entry.resolved; });
        emit('comment.resolved', { object: { type: objectType, id: objectId, title }, actor, detail: { resolved: !row.resolved } });
        draw();
      } }, [icon('check', { size: 12 }), el('span', { text: row.resolved ? 'Resolvido' : 'Marcar como resolvido' })])
    ])) : [el('li', { class: 'cthread-empty', text: provider ? 'Nenhuma mensagem com a empresa neste item.' : 'Nenhum comentário ainda. Use @ para chamar alguém da equipe.' })]));
  };

  // Composer com @menção (autocomplete local, teclado).
  const text = el('textarea', { rows: '2', maxlength: '2000', class: 'cthread-input', 'aria-label': `Comentário em ${title}`, placeholder: provider ? 'Escreva para a empresa…' : 'Comente ou use @ para mencionar…', 'aria-autocomplete': 'list', 'aria-expanded': 'false' });
  const suggest = el('ul', { class: 'mention-list', role: 'listbox', 'aria-label': 'Mencionar', hidden: true });
  let options = [];
  let active = 0;
  const mentions = new Set();
  const query = () => { const match = text.value.slice(0, text.selectionStart).match(/@([\p{L} ]{0,20})$/u); return match ? match[1] : null; };
  const closeSuggest = () => { suggest.hidden = true; text.setAttribute('aria-expanded', 'false'); text.removeAttribute('aria-activedescendant'); };
  const choose = (person) => {
    const before = text.value.slice(0, text.selectionStart).replace(/@([\p{L} ]{0,20})$/u, `@${person.name} `);
    text.value = before + text.value.slice(text.selectionStart);
    mentions.add(person.id);
    closeSuggest();
    text.focus();
  };
  const drawSuggest = () => {
    const term = query();
    const pool = scope === 'internal' ? people : [];
    options = term === null ? [] : pool.filter((person) => fold(person.name).includes(fold(term.trim()))).slice(0, 5);
    if (!options.length) { closeSuggest(); return; }
    active = Math.min(active, options.length - 1);
    suggest.replaceChildren(...options.map((person, index) => el('li', { role: 'option', id: `mention-${objectId}-${index}`, class: 'mention-option', 'aria-selected': String(index === active), onmousedown: (event) => { event.preventDefault(); choose(person); } }, [
      el('strong', { text: person.name }), person.title ? el('span', { text: ` · ${person.title}` }) : null])));
    suggest.hidden = false;
    text.setAttribute('aria-expanded', 'true');
    text.setAttribute('aria-activedescendant', `mention-${objectId}-${active}`);
  };
  text.addEventListener('input', drawSuggest);
  text.addEventListener('keydown', (event) => {
    if (suggest.hidden) { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); send(); } return; }
    if (event.key === 'ArrowDown') { event.preventDefault(); active = (active + 1) % options.length; drawSuggest(); }
    if (event.key === 'ArrowUp') { event.preventDefault(); active = (active - 1 + options.length) % options.length; drawSuggest(); }
    if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); choose(options[active]); }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeSuggest(); }
  });
  text.addEventListener('blur', () => setTimeout(closeSuggest, 100));

  const scopeHelp = el('p', { class: 'cthread-scope-help' });
  const scopeGroup = !provider && allowProviderScope ? el('div', { class: 'seg cthread-scope', role: 'radiogroup', 'aria-label': 'Quem pode ler' }, ['internal', 'provider'].map((value) => {
    const node = el('button', { type: 'button', role: 'radio', class: 'seg-item', 'aria-checked': String(value === scope), dataset: { scope: value } }, [icon(SCOPES[value].icon, { size: 13 }), el('span', { text: SCOPES[value].label })]);
    node.addEventListener('click', () => { scope = value; for (const item of node.parentElement.children) item.setAttribute('aria-checked', String(item.dataset.scope === value)); if (value !== 'internal') mentions.clear(); drawHelp(); });
    return node;
  })) : null;
  const drawHelp = () => { scopeHelp.replaceChildren(el('span', { class: `scope-badge scope-${scope}` }, [icon(SCOPES[scope].icon, { size: 12 }), el('span', { text: SCOPES[scope].label })]), el('span', { text: ` ${SCOPES[scope].text}` })); };
  drawHelp();

  const send = () => {
    const body = text.value.trim();
    if (body.length < 2) { text.focus(); toast('Escreva o comentário antes de enviar.', 'error'); return; }
    // Menção só vale para quem ainda está citado no texto e só em comentário interno.
    const cited = scope === 'internal' ? people.filter((person) => mentions.has(person.id) && body.includes(`@${person.name}`)).map((person) => person.id) : [];
    const row = { id: uid('cm'), object_type: objectType, object_id: objectId, author: actor.name || 'Você', author_id: actor.id, body, scope, provider_org: scope === 'provider' ? providerOrg : null,
      mentions: cited, resolved: false, at: new Date().toISOString(), pending: true };
    optimistic({ ctx, kind: 'comment.create', label: `Comentário em ${title}`, payload: { id: row.id, body, scope, mentions: cited, href, actor, object: { type: objectType, id: objectId, title } },
      apply: () => { updateOS((draft) => { draft.comments.push(row); }); text.value = ''; mentions.clear(); draw(); } }).then(draw).catch(() => draw());
  };
  const submit = button('Comentar', { variant: 'primary', size: 'sm', iconName: 'message', onClick: send });
  root.append(list, el('div', { class: 'cthread-composer' }, [scopeGroup, el('div', { class: 'mention-anchor' }, [text, suggest]), el('div', { class: 'cthread-foot' }, [scopeHelp, submit])]));
  draw();
  return root;
}
