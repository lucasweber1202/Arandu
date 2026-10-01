// Um conflito de edição, bem feito (demonstração).
//
//   Refinanciamento de CCB · Prazo desejado
//   Versão atual: 36 meses (Helena Prado, há 2 min)   Sua alteração: 48 meses
//   [Manter a versão atual]  [Usar a minha]
//
// Mostra como o Work OS trataria duas pessoas editando o mesmo campo: nada é
// sobrescrito em silêncio, as duas versões aparecem lado a lado e a escolha
// fica registrada na auditoria. Na demo, a solicitação decidida do conjunto
// inicial não muda — a resolução é registrada como evento.

import { el, icon } from '../../../src/core.js';
import { button, toast } from '../../../src/ui.js';
import { readOS, updateOS } from './os-store.js';
import { emit } from './bus.js';

export const CONFLICT_EXAMPLE = Object.freeze({
  object: { type: 'rfq', id: 'de000000-0000-4000-8000-000400000005', title: 'Refinanciamento de CCB — R$ 1,8 milhão' },
  field: 'term_months', label: 'Prazo desejado',
  theirs: { value: 36, text: '36 meses', by: 'Helena Prado' },
  mine: { value: 48, text: '48 meses' }
});

/** Resultado da resolução (testável): valor final e texto de auditoria. */
export function resolveConflict(conflict, choice) {
  const keep = choice === 'theirs';
  return { value: keep ? conflict.theirs.value : conflict.mine.value, text: keep ? `manteve ${conflict.theirs.text} (versão de ${conflict.theirs.by})` : `aplicou ${conflict.mine.text} sobre a versão de ${conflict.theirs.by}` };
}

export function openConflict(ctx) {
  const conflict = { ...CONFLICT_EXAMPLE, at: new Date(Date.now() - 120000).toISOString() };
  updateOS((draft) => { draft.conflict = conflict; });
  emit('sync.conflict', { object: conflict.object, actor: { id: ctx.viewer?.id, name: ctx.viewer?.name }, detail: { field: conflict.field } });
  document.getElementById('conflict-dialog')?.remove();
  const dialog = el('dialog', { id: 'conflict-dialog', class: 'conflict-dialog', 'aria-labelledby': 'conflict-title', 'aria-describedby': 'conflict-desc' });
  const choose = (choice) => {
    const result = resolveConflict(conflict, choice);
    updateOS((draft) => { draft.conflict = { ...conflict, resolved: choice, resolved_at: new Date().toISOString() }; });
    emit('sync.conflict_resolved', { object: conflict.object, actor: { id: ctx.viewer?.id, name: ctx.viewer?.name }, detail: { field: conflict.field, choice, excerpt: `${conflict.label}: ${result.text}` } });
    dialog.close();
    toast(`Conflito resolvido: ${result.text}. Registrado na auditoria.`);
  };
  const side = (label, version, extra, id) => el('div', { class: `conflict-side is-${id}` }, [el('p', { class: 'conflict-label', text: label }), el('p', { class: 'conflict-value num', text: version.text }), el('p', { class: 'muted', text: extra })]);
  dialog.append(
    el('h2', { id: 'conflict-title', class: 'conflict-title' }, [icon('alert', { size: 18 }), el('span', { text: ' Duas alterações no mesmo campo' })]),
    el('p', { id: 'conflict-desc', text: `${conflict.object.title} · ${conflict.label}. ${conflict.theirs.by} salvou enquanto você editava. Nada foi sobrescrito.` }),
    el('div', { class: 'conflict-grid' }, [side('Versão atual', conflict.theirs, `${conflict.theirs.by}, há 2 min`, 'theirs'), side('Sua alteração', conflict.mine, 'Ainda não salva', 'mine')]),
    el('div', { class: 'conflict-actions' }, [
      button('Manter a versão atual', { attrs: { id: 'conflict-keep' }, onClick: () => choose('theirs') }),
      button('Usar a minha', { variant: 'primary', attrs: { id: 'conflict-mine' }, onClick: () => choose('mine') })
    ]),
    el('p', { class: 'conflict-note muted', text: 'Demonstração: a escolha fica registrada na auditoria; a solicitação decidida do conjunto inicial não muda.' })
  );
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}
export const lastConflict = () => readOS().conflict;
