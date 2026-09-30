// Construtor de políticas de aprovação (demo-only, /finance/policies.html).
//
//   Versões  v3 atual · v2 · v1          Regras (ordem importa: a primeira que casa decide)
//                                        ┌ Crédito acima de R$ 5 mi ─ Controladoria → CFO → CEO
//                                        ├ Crédito acima de R$ 1 mi ─ Controladoria → CFO
//                                        └ Adquirência ─ Tesouraria → Controladoria
//   Prévia: escolha uma solicitação e veja o caminho pela versão atual e pelo rascunho.
//
// Editar sempre cria um rascunho; publicar cria uma versão nova. Processos
// em andamento continuam na versão em que começaram.

import { el, icon, formatDateTime, money } from '../../../src/core.js';
import { button, card, confirmDialog, emptyState, toast } from '../../../src/ui.js';
import { readOS, updateOS, subscribeOS, uid } from '../platform/os-store.js';
import { emit } from '../platform/bus.js';
import { flag } from '../platform/telemetry.js';
import { STAGE_ROLES, PRODUCTS, OPERATORS, FIELDS, evaluatePolicy, currentPolicy, policyVersion, rfqPolicyVersion, conditionText, validatePolicy, diffPolicies } from './policy.js';

const clone = (value) => structuredClone(value);

export function flowDiagram(stages, { compact = false } = {}) {
  const steps = [{ label: 'Decisão proposta', kind: 'start' }, ...stages.map((stage) => ({ label: stage.label, person: stage.person, kind: 'stage' })), { label: 'Decisão registrada', kind: 'end' }];
  return el('ol', { class: `flow${compact ? ' is-compact' : ''}`, 'aria-label': `Fluxo: ${steps.map((step) => step.label).join(', ')}` }, steps.map((step, index) => el('li', { class: `flow-step is-${step.kind}` }, [
    index ? el('span', { class: 'flow-arrow', 'aria-hidden': 'true' }, icon('arrowRight', { size: 12 })) : null,
    el('span', { class: 'flow-node' }, [el('strong', { text: step.label }), step.kind === 'stage' && !compact ? el('span', { class: 'flow-person', text: step.person || 'Sem pessoa na demo' }) : null])
  ])));
}

function ruleEditor(rule, index, total, { editable, onChange, onMove, onRemove }) {
  const id = `rule-${rule.id}`;
  const name = el('input', { class: 'input', value: rule.name, maxlength: '80', 'aria-label': `Nome da regra ${index + 1}`, disabled: !editable });
  name.addEventListener('change', () => onChange({ ...rule, name: name.value.trim() }));
  const product = el('select', { class: 'input', 'aria-label': 'Produto', disabled: !editable }, Object.entries(PRODUCTS).map(([value, label]) => el('option', { value, text: label, selected: value === rule.product })));
  product.addEventListener('change', () => onChange({ ...rule, product: product.value }));
  const hasCondition = el('select', { class: 'input', 'aria-label': 'Condição', disabled: !editable }, [el('option', { value: 'none', text: 'Sempre', selected: !rule.condition }), ...Object.entries(FIELDS).map(([value, label]) => el('option', { value, text: label, selected: rule.condition?.field === value }))]);
  const op = el('select', { class: 'input', 'aria-label': 'Operador', disabled: !editable || !rule.condition }, Object.entries(OPERATORS).map(([value, label]) => el('option', { value, text: label, selected: rule.condition?.op === value })));
  const amount = el('input', { class: 'input num', type: 'number', min: '0', step: '100000', value: rule.condition?.value ?? '', 'aria-label': 'Valor da condição', disabled: !editable || !rule.condition });
  hasCondition.addEventListener('change', () => onChange({ ...rule, condition: hasCondition.value === 'none' ? null : { field: hasCondition.value, op: rule.condition?.op || 'gt', value: rule.condition?.value || 1000000 } }));
  op.addEventListener('change', () => onChange({ ...rule, condition: { ...rule.condition, op: op.value } }));
  amount.addEventListener('change', () => onChange({ ...rule, condition: { ...rule.condition, value: Number(amount.value) } }));
  const active = el('input', { type: 'checkbox', checked: rule.active, disabled: !editable });
  active.addEventListener('change', () => onChange({ ...rule, active: active.checked }));

  const stages = el('ol', { class: 'rule-stages', 'aria-label': 'Etapas, em ordem' }, rule.stages.map((key, position) => el('li', { class: 'rule-stage' }, [
    el('span', { class: 'rule-stage-n num', text: String(position + 1) }), el('span', { text: STAGE_ROLES[key]?.label || key }),
    editable ? el('span', { class: 'rule-stage-tools' }, [
      el('button', { type: 'button', class: 'icon-btn sm', 'aria-label': `Subir ${STAGE_ROLES[key]?.label}`, disabled: position === 0, onclick: () => { const next = [...rule.stages]; [next[position - 1], next[position]] = [next[position], next[position - 1]]; onChange({ ...rule, stages: next }); } }, icon('chevronUp', { size: 13 })),
      el('button', { type: 'button', class: 'icon-btn sm', 'aria-label': `Descer ${STAGE_ROLES[key]?.label}`, disabled: position === rule.stages.length - 1, onclick: () => { const next = [...rule.stages]; [next[position + 1], next[position]] = [next[position], next[position + 1]]; onChange({ ...rule, stages: next }); } }, icon('chevronDown', { size: 13 })),
      el('button', { type: 'button', class: 'icon-btn sm', 'aria-label': `Remover ${STAGE_ROLES[key]?.label}`, onclick: () => onChange({ ...rule, stages: rule.stages.filter((_, at) => at !== position) }) }, icon('x', { size: 13 }))
    ]) : null
  ])));
  const available = Object.keys(STAGE_ROLES).filter((key) => !rule.stages.includes(key));
  const add = editable && available.length ? el('select', { class: 'input rule-add-stage', 'aria-label': 'Adicionar etapa' }, [el('option', { value: '', text: '+ Adicionar etapa' }), ...available.map((key) => el('option', { value: key, text: STAGE_ROLES[key].label }))]) : null;
  add?.addEventListener('change', () => { if (add.value) onChange({ ...rule, stages: [...rule.stages, add.value] }); });

  return el('li', { class: `rule${rule.active ? '' : ' is-off'}`, id, dataset: { rule: rule.id } }, [
    el('div', { class: 'rule-head' }, [
      el('span', { class: 'rule-order num', 'aria-label': `Prioridade ${index + 1}`, text: String(index + 1) }), name,
      el('label', { class: 'rule-active' }, [active, el('span', { text: 'Ativa' })]),
      editable ? el('span', { class: 'rule-tools' }, [
        el('button', { type: 'button', class: 'icon-btn sm', 'aria-label': `Aumentar prioridade de ${rule.name}`, disabled: index === 0, onclick: () => onMove(-1) }, icon('chevronUp', { size: 14 })),
        el('button', { type: 'button', class: 'icon-btn sm', 'aria-label': `Diminuir prioridade de ${rule.name}`, disabled: index === total - 1, onclick: () => onMove(1) }, icon('chevronDown', { size: 14 })),
        el('button', { type: 'button', class: 'icon-btn sm', 'aria-label': `Excluir regra ${rule.name}`, onclick: onRemove }, icon('x', { size: 14 }))
      ]) : null
    ]),
    el('div', { class: 'rule-when' }, [el('span', { class: 'rule-label', text: 'Quando' }), product, hasCondition, rule.condition ? op : null, rule.condition ? amount : null].filter(Boolean)),
    el('div', { class: 'rule-then' }, [el('span', { class: 'rule-label', text: 'Aprovam' }), stages, add].filter(Boolean)),
    flowDiagram(rule.stages.map((key) => ({ key, ...STAGE_ROLES[key] })), { compact: true })
  ]);
}

export async function policyBuilder(ctx) {
  ctx.header({ title: 'Políticas de aprovação', subtitle: 'Quem aprova o quê, em que ordem — versionado. Processos em andamento continuam na versão em que começaram.' });
  if (!flag('workflowBuilder')) return emptyState({ title: 'Construtor de políticas desligado', text: 'Ative em Uso da demonstração → Feature flags.', iconName: 'workflow' });
  const editable = ctx.can('admin');
  const root = el('div', { class: 'policy' });
  let viewing = null; // versão só leitura selecionada no histórico
  const rfqs = (ctx.data.rfqs || []).filter((rfq) => rfq.product in PRODUCTS);
  let previewId = rfqs.find((rfq) => rfq.demand?.amount > 5000000)?.id || rfqs[0]?.id;

  const draw = () => {
    const policies = readOS().policies;
    const current = currentPolicy(policies);
    const draft = policies.draft;
    const shown = viewing ? policyVersion(policies, viewing) : draft || current;
    const isDraft = !viewing && Boolean(draft);
    const canEdit = editable && isDraft;
    const setRules = (rules) => updateOS((next) => { next.policies.draft = { ...next.policies.draft, rules }; });

    const versions = el('nav', { class: 'policy-versions', 'aria-label': 'Versões da política' }, [
      el('h2', { class: 'policy-h', text: 'Versões' }),
      el('ul', { role: 'list' }, [
        draft ? el('li', {}, el('button', { type: 'button', class: 'policy-version', 'aria-current': !viewing ? 'true' : null, onclick: () => { viewing = null; draw(); } }, [el('strong', { text: 'Rascunho' }), el('span', { text: `a partir da v${draft.base}` })])) : null,
        ...[...policies.versions].reverse().map((version) => el('li', {}, el('button', { type: 'button', class: 'policy-version', 'aria-current': (viewing === version.version || (!viewing && !draft && version.version === current.version)) ? 'true' : null,
          onclick: () => { viewing = version.version === current.version && !draft ? null : version.version; draw(); } }, [
          el('strong', { text: `Política v${version.version}` }), version.version === policies.current ? el('span', { class: 'tag tag-success', text: 'Atual' }) : null,
          el('span', { class: 'policy-version-meta', text: `${formatDateTime(version.published_at)} · ${version.published_by}` }),
          version.note ? el('span', { class: 'policy-version-note', text: version.note }) : null
        ])))
      ].filter(Boolean))
    ]);

    const rules = shown.rules;
    const list = el('ol', { class: 'rules', 'aria-label': 'Regras, em ordem de prioridade' }, rules.map((rule, index) => ruleEditor(rule, index, rules.length, {
      editable: canEdit,
      onChange: (next) => setRules(rules.map((item) => (item.id === rule.id ? next : item))),
      onMove: (delta) => { const next = [...rules]; const [item] = next.splice(index, 1); next.splice(index + delta, 0, item); setRules(next); },
      onRemove: () => setRules(rules.filter((item) => item.id !== rule.id))
    })));

    const errors = isDraft ? validatePolicy(rules) : [];
    const actions = el('div', { class: 'policy-actions' }, [
      !editable ? el('p', { class: 'policy-note', text: 'Só a administração edita a política. Você vê as versões e a prévia.' }) : null,
      editable && !draft && !viewing ? button('Editar em rascunho', { variant: 'primary', iconName: 'edit', attrs: { id: 'policy-edit' }, onClick: () => { updateOS((next) => { next.policies.draft = { base: current.version, rules: clone(current.rules) }; }); } }) : null,
      editable && viewing ? button(`Duplicar v${viewing} em rascunho`, { iconName: 'copy', attrs: { id: 'policy-duplicate' }, onClick: () => { updateOS((next) => { next.policies.draft = { base: viewing, rules: clone(shown.rules) }; }); viewing = null; } }) : null,
      canEdit ? button('Adicionar regra', { iconName: 'plus', attrs: { id: 'policy-add-rule' }, onClick: () => setRules([...rules, { id: uid('r'), name: 'Nova regra', active: true, product: 'credit', condition: { field: 'amount', op: 'gt', value: 1000000 }, stages: ['cfo'] }]) }) : null,
      canEdit ? button('Descartar rascunho', { variant: 'ghost', iconName: 'x', attrs: { id: 'policy-discard' }, onClick: () => updateOS((next) => { next.policies.draft = null; }) }) : null,
      canEdit ? button(`Publicar v${policies.versions.length + 1}`, { variant: 'primary', iconName: 'check', attrs: { id: 'policy-publish', disabled: errors.length ? 'true' : null }, onClick: async () => {
        const changes = diffPolicies(current, { rules });
        const ok = await confirmDialog({ title: `Publicar a política v${policies.versions.length + 1}?`, confirmLabel: 'Publicar',
          body: el('div', {}, [el('ul', { class: 'policy-diff' }, (changes.length ? changes : ['Sem mudanças nas regras (só uma nova versão).']).map((text) => el('li', { text }))),
            el('p', { class: 'muted', text: 'Novos processos seguem esta versão. Os em andamento continuam na versão em que começaram.' })]) });
        if (!ok) return;
        const version = policies.versions.length + 1;
        updateOS((next) => { next.policies.versions.push({ version, published_at: new Date().toISOString(), published_by: ctx.viewer?.name || 'Administração', note: changes.slice(0, 3).join(' · ') || 'Nova versão', rules: clone(rules) }); next.policies.current = version; next.policies.draft = null; });
        emit('policy.published', { object: { type: 'policy', id: `policy-v${version}`, title: `Política v${version}` }, actor: { id: ctx.viewer?.id, name: ctx.viewer?.name }, detail: { version, changes } });
        toast(`Política v${version} publicada. Processos em andamento continuam na versão anterior.`);
      } }) : null
    ].filter(Boolean));

    // Prévia: qual regra e quais etapas valem para uma solicitação real do conjunto.
    const select = el('select', { class: 'input', id: 'policy-preview-rfq', 'aria-label': 'Solicitação para a prévia' }, rfqs.map((rfq) => el('option', { value: rfq.id, text: rfq.title, selected: rfq.id === previewId })));
    select.addEventListener('change', () => { previewId = select.value; draw(); });
    const rfq = rfqs.find((row) => row.id === previewId);
    const started = rfq ? rfqPolicyVersion(policies, rfq.id) : null;
    const outcome = rfq ? evaluatePolicy({ rules }, rfq) : null;
    const preview = card({ title: 'Prévia', subtitle: 'O caminho que uma solicitação seguiria por esta versão.', id: 'policy-preview', headingLevel: 2, body: rfq ? [
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Solicitação' }), select]),
      el('p', { class: 'policy-preview-fact' }, [el('strong', { text: rfq.product === 'credit' ? money(rfq.demand?.amount) : `${money(rfq.demand?.monthly_volume)} / mês` }), ` · ${PRODUCTS[rfq.product]} · ${outcome.reason}`]),
      outcome.stages.length ? flowDiagram(outcome.stages) : null,
      policies.byRfq[rfq.id] && policies.byRfq[rfq.id] !== policies.current
        ? el('p', { class: 'policy-version-pin', id: 'policy-pin' }, [icon('info', { size: 14 }), ` Este processo começou na Política v${started} e continua nela. A prévia mostra como seria se começasse hoje.`]) : null
    ].filter(Boolean) : [emptyState({ title: 'Sem solicitações para a prévia', compact: true })] });

    const inFlight = Object.entries(policies.byRfq).map(([id, version]) => [ctx.data.rfqs?.find((row) => row.id === id), version]).filter(([row]) => row);
    const pinned = card({ title: 'Processos em andamento', subtitle: 'Versão em que cada um começou.', headingLevel: 2, body: el('ul', { class: 'policy-pinned', role: 'list' }, inFlight.map(([row, version]) => el('li', {}, [
      el('a', { href: ctx.href(`/finance/rfq.html?id=${row.id}`), text: row.title }), el('span', { class: `tag ${version === policies.current ? 'tag-success' : 'tag-neutral'}`, text: `v${version}` })]))) });

    root.replaceChildren(versions, el('div', { class: 'policy-main' }, [
      el('div', { class: 'policy-state' }, [
        el('h2', { class: 'policy-h', text: isDraft ? `Rascunho (a partir da v${draft.base})` : `Política v${shown.version}${shown.version === policies.current ? ' · atual' : ' · histórica'}` }),
        el('p', { class: 'policy-note', text: 'A primeira regra ativa que se aplica decide as etapas. Arraste a prioridade com as setas.' })
      ]),
      errors.length ? el('ul', { class: 'policy-errors', role: 'alert' }, errors.map((text) => el('li', { text }))) : null,
      list, actions
    ].filter(Boolean)), el('div', { class: 'policy-side' }, [preview, pinned]));
  };
  const off = subscribeOS(() => { if (root.dataset.mounted && !root.isConnected) { off(); return; } if (root.isConnected) root.dataset.mounted = '1'; draw(); });
  draw();
  return root;
}
