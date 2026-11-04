// Agenda de relacionamento da organização (tela de instituições).
// Extraído de views/crm-workspace.js (v7.0).

import { el, formatDate, todayIso } from '../../core.js';
import { button, tag, loading, errorState, emptyState } from '../../ui.js';
import { ACTIVITY_KINDS, STAGES, STAGE_ORDER, crmErrorMessage, memberLabel, crmList } from './model.js';
import { select } from './form.js';

export function crmOrganizationPanel(ctx, { providers = [], contracts = [], onOpenProvider = null } = {}) {
  const root = el('section', { class: 'card crm-org', id: 'crm-agenda', 'aria-labelledby': 'crm-org-title' });
  const providerName = new Map(providers.map((p) => [p.id, p.name]));
  const contractProvider = new Map(contracts.map((c) => [c.id, c.provider_id]));
  const providerOf = (row) => row.related_type === 'provider' ? row.related_id : row.related_type === 'contract' ? contractProvider.get(row.related_id) : null;
  const headline = el('div', { class: 'cc-head' }, [el('div', {}, [el('h2', { id: 'crm-org-title', class: 'card-title', text: 'Agenda e processos comerciais' }),
    el('p', { class: 'muted small', text: 'Compromissos pendentes e processos ativos registrados pela equipe, de todas as instituições do seu escopo.' })])]);
  const load = async () => {
    root.replaceChildren(headline, loading('Carregando agenda…'));
    try {
      const [planned, processes] = await Promise.all([crmList(ctx, 'crm-activities', { status: 'planned' }), crmList(ctx, 'crm-processes', { status: 'active' })]);
      const today = todayIso();
      const filter = select([['all', 'Todos os pendentes'], ['overdue', 'Vencidos'], ['today', 'Hoje'], ['unowned', 'Sem responsável'], ['no_date', 'Sem prazo definido'], ['mine', 'Meus']], 'all');
      filter.setAttribute('aria-label', 'Filtrar agenda');
      const instOptions = providers.filter((p) => [...planned.rows, ...processes.rows].some((r) => providerOf(r) === p.id));
      const inst = select([['', 'Todas as instituições'], ...instOptions.map((p) => [p.id, p.name])], '');
      inst.setAttribute('aria-label', 'Instituição');
      const ownerIds = [...new Set([...planned.rows, ...processes.rows].map((r) => r.owner_id).filter(Boolean))];
      const owner = select([['', 'Todos os responsáveis'], ...ownerIds.map((id) => [id, memberLabel(ctx, id)])], '');
      owner.setAttribute('aria-label', 'Responsável');
      const list = el('ul', { class: 'plain-list crm-list', role: 'list' });
      const row = (kind, r) => {
        const pid = providerOf(r);
        const due = r.due_on;
        const late = due && due < today;
        return el('li', { class: `crm-row${late ? ' crm-row-late' : ''}`, dataset: { crm: kind } }, [
          el('div', { class: 'crm-row-main' }, [
            el('span', { class: 'muted small', text: kind === 'activity' ? ACTIVITY_KINDS[r.kind] : `Processo · ${STAGES[r.stage]}` }),
            el('strong', { text: kind === 'activity' ? r.subject : `${r.title}: ${r.next_action}` }),
            el('span', { class: 'small', text: [due ? `${late ? 'Venceu em' : 'Prazo'} ${formatDate(due)}` : 'Sem prazo', `responsável: ${memberLabel(ctx, r.owner_id)}`, pid && providerName.get(pid) ? providerName.get(pid) : null].filter(Boolean).join(' · ') })
          ]),
          late ? tag('Vencido', 'danger') : null,
          pid && onOpenProvider && providers.find((p) => p.id === pid) ? button('Abrir instituição', { size: 'sm', variant: 'ghost', attrs: { 'aria-label': `Abrir relacionamento com ${providerName.get(pid)}` }, onClick: () => onOpenProvider(providers.find((p) => p.id === pid)) }) : null
        ]);
      };
      const draw = () => {
        const v = filter.value;
        const pick = (r) => (!inst.value || providerOf(r) === inst.value) && (!owner.value || r.owner_id === owner.value)
          && (v === 'all' || (v === 'overdue' && r.due_on && r.due_on < today) || (v === 'today' && r.due_on === today) || (v === 'unowned' && !r.owner_id) || (v === 'mine' && r.owner_id === ctx.viewer?.id) || (v === 'no_date' && !r.due_on));
        const items = [...planned.rows.filter(pick).map((r) => ['activity', r]), ...processes.rows.filter((r) => !['won', 'lost'].includes(r.stage)).filter(pick).map((r) => ['process', r])]
          .sort(([, a], [, b]) => String(a.due_on || '9999').localeCompare(String(b.due_on || '9999')));
        list.replaceChildren(...items.slice(0, 50).map(([k, r]) => row(k, r)));
        if (!items.length) list.append(el('li', {}, emptyState({ compact: true, iconName: 'calendar', title: 'Nada pendente neste filtro', text: 'Registre compromissos e processos no relacionamento de cada instituição.' })));
      };
      for (const node of [filter, inst, owner]) node.addEventListener('change', draw);
      const stageCounts = STAGE_ORDER.slice(0, 4).map((s) => [s, processes.rows.filter((p) => p.stage === s).length]);
      root.replaceChildren(headline,
        el('ul', { class: 'pipeline', 'aria-label': 'Processos ativos por etapa' }, stageCounts.map(([s, n]) => el('li', { class: `pipeline-stage${n ? '' : ' empty'}` }, [el('span', { class: 'pipeline-count', text: String(n) }), el('span', { class: 'pipeline-label', text: STAGES[s] })]))),
        el('div', { class: 'toolbar' }, [filter, inst, owner]), list,
        ...(planned.truncated || processes.truncated ? [el('p', { class: 'muted small', text: 'Mostrando os primeiros 200 registros de cada tipo.' })] : []));
      draw();
    } catch (error) {
      if (error.status === 503) { root.replaceChildren(headline, el('p', { class: 'callout callout-info compact', text: 'O registro comercial ainda não está disponível neste ambiente.' })); return; }
      root.replaceChildren(headline, errorState({ title: 'Agenda indisponível', error: { ...error, message: crmErrorMessage(error) }, onRetry: load }));
    }
  };
  load();
  return root;
}

/**
 * Relacionamento comercial vinculado a um objeto financeiro (contrato ou
 * negociação): processos e atividades com `related_id` igual ao objeto. Leitura;
 * a edição continua no relacionamento da instituição.
 */
