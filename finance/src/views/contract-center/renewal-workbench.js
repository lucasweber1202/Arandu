/* global __ARANDU_DEMO__ */
// Plano de renovações: contratos vigentes organizados pelo prazo do aviso
// prévio, com o que já existe para agir em cada um — responsável, renovação em
// andamento, tarefas abertas — e duas ações reais: abrir/iniciar a concorrência
// de renovação (rota canônica, idempotente no servidor) e registrar uma tarefa
// de preparação ligada ao contrato (POST tasks com chave de idempotência).
//
// Datas vêm do contrato (fim e aviso prévio). Sem data, o contrato aparece
// como "sem data para planejar" — nunca como tranquilo. Nada aqui é risco,
// recomendação ou renovação executada.

import { el, icon, formatDate, relativeDays, productLabel, plural, renewalStage, textSpan } from '../../core.js';
import { button, confirmDialog, mutedText, tag, toast } from '../../ui.js';
import { renewalButton } from './renewal.js';

const LIVE = new Set(['active', 'renewing']);
const HORIZON_DAYS = 180;
const BUCKETS = [
  ['past_notice', 'Aviso prévio vencido', 'O prazo para avisar a instituição já passou; confira o contrato antes de agir.'],
  ['soon', 'Decidir em até 30 dias', 'Prazo do aviso prévio nos próximos 30 dias.'],
  ['window', 'Janela de renovação aberta', 'Prazo do aviso prévio em mais de 30 dias.'],
  ['upcoming', `Próximos ${HORIZON_DAYS / 30} meses`, 'A janela ainda não abriu.'],
  ['expired', 'Fim da vigência já passou', 'Contrato vigente no cadastro, mas com fim no passado: confirme a situação.'],
  ['undated', 'Sem data para planejar', 'Falta fim de vigência no cadastro; o prazo do aviso não pode ser calculado.']
];

/** Em qual grupo do plano um contrato vigente entra (ou null se fora do horizonte). Exportada para teste. */
export function renewalBucket(contract) {
  if (!LIVE.has(contract.status)) return null;
  if (!contract.ends_on) return 'undated';
  const stage = renewalStage(contract);
  if (stage.stage === 'expired') return 'expired';
  if (stage.stage === 'past_notice') return 'past_notice';
  if (stage.stage === 'window') return stage.daysToDeadline <= 30 ? 'soon' : 'window';
  if (stage.stage === 'upcoming' && stage.daysToDeadline <= HORIZON_DAYS) return 'upcoming';
  return null;
}

export function renewalWorkbench(ctx, contracts, { coverage = { state: 'complete' } } = {}) {
  const manage = ctx.can('create_rfq');
  const sandbox = __ARANDU_DEMO__ && ctx.mode === 'demo';
  const tasks = ctx.data.tasks || [];
  // A visão geral traz até 100 tarefas abertas: além disso, a contagem é parcial.
  const tasksPartial = tasks.length >= 100;
  const openTasks = new Map();
  for (const task of tasks) if (task.related_type === 'contract' && task.status === 'open') openTasks.set(task.related_id, (openTasks.get(task.related_id) || 0) + 1);
  const memberName = (id) => (ctx.members || []).find((m) => m.user_id === id)?.display_name || null;

  const owner = el('select', { class: 'input', 'aria-label': 'Plano de renovações: responsável' }, [
    new Option('Qualquer responsável', ''), new Option('Meus contratos', 'mine'), new Option('Sem responsável', 'none')]);
  const body = el('div', { class: 'stack renewal-plan' });
  const created = new Map(); // tarefas confirmadas nesta tela, por contrato

  function taskAction(contract, deadline, countNode) {
    if (!manage || sandbox) return null;
    let pending = null;
    const action = button('Registrar tarefa de preparação', { size: 'sm', variant: 'ghost', iconName: 'plus', onClick: async () => {
      if (!pending) {
        const ok = await confirmDialog({ title: 'Registrar tarefa de preparação?', confirmLabel: 'Registrar tarefa',
          description: `Cria uma tarefa ligada a este contrato${deadline ? `, com prazo no fim do aviso prévio (${formatDate(deadline)})` : ''}. Não inicia concorrência, não avisa a instituição e não altera o contrato.` });
        if (!ok) return;
        pending = { idempotency_key: crypto.randomUUID(), organization_id: ctx.organization.id, related_type: 'contract', related_id: contract.id,
          title: `Preparar renovação: ${contract.provider_name || 'contrato'} · ${productLabel(contract.product, { short: true })}`, due_on: deadline || null };
      }
      action.disabled = true;
      try {
        const data = await ctx.send('tasks', pending);
        if (!data.row?.id) throw Object.assign(new Error('Não confirmamos o registro da tarefa.'), { status: 0, code: 'task_creation_unknown' });
        pending = null;
        created.set(contract.id, (created.get(contract.id) || 0) + 1);
        countNode.replaceWith(taskCount(contract));
        toast('Tarefa registrada no contrato.');
        action.remove();
      } catch (error) {
        const unknown = !error.status || error.status >= 500 || error.code === 'task_creation_unknown';
        if (unknown) {
          // Mesma chave: tentar de novo confere a mesma solicitação, sem duplicar.
          toast('Não confirmamos o registro. "Conferir registro" reenvia a mesma solicitação e não cria outra tarefa.', 'error');
          action.querySelector('.btn-label').textContent = 'Conferir registro';
        } else { pending = null; toast(error.message || 'A tarefa não foi registrada.', 'error'); }
        action.disabled = false;
      }
    } });
    return action;
  }

  function taskCount(contract) {
    const n = (openTasks.get(contract.id) || 0) + (created.get(contract.id) || 0);
    return el('a', { class: 'renewal-tasks small', href: ctx.href(`/finance/tasks.html?contrato=${encodeURIComponent(contract.id)}`),
      text: n ? plural(n, 'tarefa aberta', 'tarefas abertas') : tasksPartial ? 'Tarefas do contrato' : 'Nenhuma tarefa aberta' });
  }

  function row(contract) {
    const stage = renewalStage(contract);
    const deadline = contract.ends_on ? stage.deadline : null;
    const who = contract.owner_id ? memberName(contract.owner_id) || 'Responsável sem acesso de leitura' : null;
    const count = taskCount(contract);
    return el('li', { class: 'renewal-row', dataset: { contract: contract.id } }, [
      el('div', { class: 'renewal-main' }, [
        el('a', { class: 'renewal-title', href: ctx.href(`/finance/contracts.html?abrir=contrato#contract-${contract.id}`), text: `${contract.provider_name || 'Instituição'} · ${contract.title || productLabel(contract.product, { short: true })}` }),
        el('span', { class: 'row-sub', text: deadline ? `Aviso prévio até ${formatDate(deadline)} (${relativeDays(deadline)}) · fim ${formatDate(contract.ends_on)}` : 'Fim de vigência não cadastrado' }),
        el('span', { class: 'renewal-meta' }, [
          who ? textSpan(`Responsável: ${who}`) : tag('Sem responsável', 'warning'),
          contract.status === 'renewing' ? tag('Renovação em andamento', 'accent') : null,
          !contract.renewal_notice_days && contract.ends_on ? tag('Aviso prévio não cadastrado', 'warning') : null,
          count
        ].filter(Boolean))
      ]),
      el('div', { class: 'renewal-actions' }, [renewalButton(ctx, contract), taskAction(contract, deadline, count)].filter(Boolean))
    ]);
  }

  function draw() {
    const mine = owner.value === 'mine', none = owner.value === 'none';
    const scoped = contracts.filter((c) => LIVE.has(c.status) && (!mine || c.owner_id === ctx.viewer?.id) && (!none || !c.owner_id));
    const grouped = new Map(BUCKETS.map(([key]) => [key, []]));
    let later = 0;
    for (const contract of scoped) {
      const key = renewalBucket(contract);
      if (key) grouped.get(key).push(contract); else later += 1;
    }
    for (const list of grouped.values()) list.sort((a, b) => String(renewalStage(a).deadline || '9999').localeCompare(String(renewalStage(b).deadline || '9999')));
    const groups = BUCKETS.filter(([key]) => grouped.get(key).length).map(([key, label, hint]) => el('section', { class: `renewal-group renewal-${key}`, 'aria-label': label }, [
      el('h3', { class: 'renewal-group-title' }, [textSpan(label), el('span', { class: 'chip-count', text: String(grouped.get(key).length) })]),
      mutedText(hint), el('ul', { class: 'renewal-list', role: 'list' }, grouped.get(key).map(row))]));
    body.replaceChildren(...[
      ...(groups.length ? groups : [mutedText(scoped.length ? `Nenhum contrato vigente com prazo de aviso nos próximos ${HORIZON_DAYS / 30} meses neste recorte.` : 'Nenhum contrato vigente neste recorte.')]),
      later ? mutedText(`${plural(later, 'contrato vigente tem', 'contratos vigentes têm')} aviso prévio depois de ${HORIZON_DAYS / 30} meses e não entra no plano.`) : null,
      coverage.state !== 'complete' ? el('p', { class: 'callout callout-warning compact', role: 'note' }, [icon('alert', { size: 14 }), textSpan('O plano usa só os contratos carregados nesta tela; a carteira completa não foi lida.')]) : null,
      tasksPartial ? mutedText('Contagem de tarefas a partir das 100 tarefas abertas mais próximas; abra as tarefas do contrato para ver todas.') : null
    ].filter(Boolean));
  }
  owner.addEventListener('change', draw);
  draw();
  return el('section', { class: 'renewal-workbench', id: 'plano-renovacoes', 'aria-labelledby': 'plano-renovacoes-title' }, [
    el('div', { class: 'card-head' }, [el('div', { class: 'card-head-text' }, [
      el('h2', { class: 'card-title', id: 'plano-renovacoes-title', text: 'Plano de renovações' }),
      el('p', { class: 'card-subtitle', text: 'Contratos vigentes pelo prazo do aviso prévio, com responsável, renovação em andamento e tarefas. Datas do cadastro do contrato.' })]), owner]),
    el('div', { class: 'card-body' }, body)
  ]);
}
