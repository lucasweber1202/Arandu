// Formulário de registro do CRM com conflito de revisão e campos comuns.
// Extraído de views/crm-workspace.js (v7.0).

import { el, uid } from '../../core.js';
import { button, field, drawer, toast, confirmDialog, onSubmit, sessionLink } from '../../ui.js';
import { crmErrorMessage, memberLabel, writers } from './model.js';

export function crmForm({ title, intro = null, fields, send, done, onSaved, onConflict = null }) {
  const requestKey = uid();
  const errors = el('div', { class: 'callout callout-error', role: 'alert', hidden: true });
  const save = button('Gravar', { variant: 'primary', type: 'submit' });
  const form = el('form', { class: 'stack crm-form', novalidate: true }, [intro ? el('p', { class: 'muted small', text: intro }) : null]);
  const wrapped = fields.filter(Boolean).map((spec) => {
    const wrap = field({ label: spec.label, control: spec.control, hint: spec.hint || null, required: Boolean(spec.required), optionalLabel: !spec.required && !spec.noOptional });
    if (spec.hidden) wrap.hidden = true;
    spec.wrap = wrap;
    form.append(wrap);
    return spec;
  });
  form.append(errors, el('div', { class: 'form-actions' }, [save]));
  let dirty = false;
  form.addEventListener('input', () => { dirty = true; });
  const dialog = drawer({ title, body: form, confirmClose: async () => !dirty || confirmDialog({ title: 'Descartar o que foi preenchido?', description: 'Nada deste formulário foi gravado.', confirmLabel: 'Descartar', tone: 'danger' }) });
  onSubmit(form, async (event) => {
    event.preventDefault();
    errors.hidden = true;
    let firstInvalid = null;
    const values = {};
    for (const spec of wrapped) {
      if (spec.wrap.hidden) { spec.wrap.setError(''); continue; }
      const raw = spec.read ? spec.read() : (spec.control.value.trim() === '' ? null : spec.control.value.trim());
      const problem = spec.required && (raw === null || raw === '') ? `Informe ${spec.label.toLowerCase()}.` : spec.validate?.(raw) || '';
      spec.wrap.setError(problem);
      if (problem && !firstInvalid) firstInvalid = spec.control;
      if (raw !== undefined && !(raw === null && spec.skipNull)) values[spec.key] = raw;
    }
    if (firstInvalid) { firstInvalid.focus(); return; }
    try {
      const result = await send(values, requestKey);
      dirty = false;
      dialog.close();
      toast(result?.replayed ? `${done} (a mesma ação já havia sido registrada; nada foi duplicado)` : done);
      onSaved?.(result);
    } catch (error) {
      errors.replaceChildren(el('span', { text: crmErrorMessage(error) }), ...(sessionLink(error) ? [' ', sessionLink(error)] : []),
        ...(error.status === 409 && onConflict ? [' ', button('Recarregar dados', { size: 'sm', iconName: 'refresh', onClick: () => { dirty = false; dialog.close(); onConflict(); } })] : []));
      errors.hidden = false;
      if (!error.status || error.status >= 500) save.querySelector('.btn-label').textContent = 'Repetir a mesma ação';
    }
  });
  return dialog;
}

export const input = (attrs = {}) => el('input', { class: 'input', ...attrs });

export const textarea = (attrs = {}) => el('textarea', { class: 'input', rows: '3', ...attrs });

export function select(options, value = '') {
  const node = el('select', { class: 'input' });
  for (const [v, label] of options) node.add(new Option(label, v, false, v === value));
  node.value = value ?? '';
  return node;
}

export const ownerOptions = (ctx) => [['', 'Sem responsável definido'], ...writers(ctx).map((m) => [m.user_id, memberLabel(ctx, m.user_id)])];

// ------------------------------------------------------------- workspace
/**
 * Workspace de relacionamento de UMA instituição: contatos, atividades/agenda,
 * processos comerciais e histórico. `links`: contratos e negociações da
 * instituição já autorizados no painel, usados como vínculos possíveis.
 *
 * Buyer: escopo é `provider` (cadastro do comprador). Instituição: escopo é a
 * própria organização, com `counterparty` opcional (convite aceito).
 */
