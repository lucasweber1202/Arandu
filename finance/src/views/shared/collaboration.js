// Comentários, visibilidade, histórico de eventos e linha do tempo de revisões.
// Extraído de views/shared.js (v7.0): dependências específicas, sem barrel.

import { el, icon, formatDateTime, timeAgo, uid, fold } from '../../core.js';
import { button, avatar, emptyState, errorState, loading, toast, tag, onSubmit, sessionLink } from '../../ui.js';
import { memberName } from './people.js';
import { revisionDiff } from './terms.js';
import { COMMENT_ROLES } from './tasks.js';

export function revisionTimeline(ctx, rfq) {
  const box = el('div', { class: 'revisions', 'aria-live': 'polite' }, loading('Carregando revisões…'));
  ctx.api(`rfq-revisions?organization_id=${encodeURIComponent(ctx.organization.id)}&rfq_id=${encodeURIComponent(rfq.id)}`).then(({ rows }) => {
    const list = el('ol', { class: 'timeline' });
    const ordered = [...(rows || [])].sort((a, b) => b.revision - a.revision);
    ordered.forEach((row, index) => {
      const previous = ordered[index + 1];
      const changes = previous ? revisionDiff(rfq.product, previous.snapshot, row.snapshot) : [];
      list.append(el('li', { class: `timeline-item${row.revision === rfq.revision ? ' current' : ''}` }, [
        el('span', { class: 'timeline-dot', 'aria-hidden': 'true' }),
        el('div', { class: 'timeline-content' }, [
          el('p', { class: 'timeline-title' }, [el('strong', { text: `Revisão ${row.revision}` }), row.revision === rfq.revision ? tag('atual', 'accent') : null]),
          el('p', { class: 'timeline-meta', text: `${formatDateTime(row.published_at)}${row.changed_by_name ? ` · ${row.changed_by_name}` : ''}` }),
          previous ? (changes.length
            ? el('ul', { class: 'diff-list' }, changes.map((change) => el('li', {}, [el('span', { class: 'diff-label', text: `${change.label}: ` }), el('span', { class: 'diff-before', text: change.before }), ' → ', el('span', { class: 'diff-after', text: change.after })])))
            : el('p', { class: 'muted small', text: 'Sem mudança material.' }))
            : el('p', { class: 'muted small', text: 'Versão inicial publicada.' })
        ])
      ]));
    });
    box.replaceChildren(ordered.length ? list : emptyState({ title: 'Nenhuma revisão registrada', compact: true }));
  }).catch((error) => box.replaceChildren(errorState({ title: 'Histórico de revisões indisponível', error })));
  return box;
}

const VISIBILITY = {
  internal: { icon: 'lock', label: 'Somente sua empresa', tone: 'internal' },
  provider_visible: { icon: 'eye', label: 'Visível ao provedor', tone: 'shared' }
};

export function visibilityBadge(visibility, { provider = false, fromBuyer = false } = {}) {
  const meta = VISIBILITY[visibility] || VISIBILITY.internal;
  const label = provider && visibility === 'provider_visible'
    ? (fromBuyer ? 'Da empresa a todos os provedores convidados' : 'Visível à empresa compradora') : meta.label;
  return el('span', { class: `visibility visibility-${meta.tone}` }, [icon(meta.icon, { size: 12 }), el('span', { text: label })]);
}

/** Destaca menções conhecidas sem interpretar o texto como HTML. */

function commentBody(text, names) {
  const body = el('p', { class: 'comment-body' });
  const known = [...names].filter(Boolean).sort((a, b) => b.length - a.length);
  let rest = String(text);
  while (rest.length) {
    let hit = null;
    for (const name of known) {
      const index = rest.indexOf(`@${name}`);
      if (index >= 0 && (!hit || index < hit.index)) hit = { index, name };
    }
    if (!hit) { body.append(rest); break; }
    if (hit.index) body.append(rest.slice(0, hit.index));
    body.append(el('span', { class: 'mention', text: `@${hit.name}` }));
    rest = rest.slice(hit.index + hit.name.length + 1);
  }
  return body;
}

export function collaboration(ctx, rfq, { provider = false } = {}) {
  const section = el('section', { class: 'collab', id: 'comentarios', 'aria-label': 'Comentários' });
  const thread = el('div', { class: 'thread', 'aria-live': 'polite' }, loading('Carregando comentários…'));
  const members = ctx.members || [];
  const names = new Set(members.map((member) => member.display_name).filter(Boolean));
  // Mesma regra de fin_post_comment: na empresa, comentam administração, gestão e
  // análise; leitor lê. Sem isso o leitor via um formulário que o banco recusa.
  const canComment = provider || COMMENT_ROLES.includes(ctx.viewer?.role);

  const composer = (parent = null) => {
    const form = el('form', { class: `composer${parent ? ' composer-reply' : ''}`, novalidate: true });
    const text = el('textarea', { name: 'body', rows: parent ? '2' : '3', maxlength: '4000', 'aria-label': parent ? 'Resposta' : 'Comentário',
      placeholder: provider ? 'Escreva uma pergunta ou esclarecimento para a empresa…' : 'Escreva um comentário. Use @ para mencionar alguém da sua empresa.' });
    const mentionIds = new Set();
    let visibility = parent ? parent.visibility : (provider ? 'provider_visible' : 'internal');
    const help = el('p', { class: 'composer-help' });
    const setHelp = () => {
      help.replaceChildren(visibilityBadge(visibility, { provider }), el('span', { text: visibility === 'internal'
        ? ' Só pessoas da sua empresa leem. Provedores nunca veem.'
        : provider ? ' A empresa compradora lê. Outros provedores não veem.' : ' Todos os provedores convidados para esta solicitação leem.' }));
    };
    const controls = el('div', { class: 'composer-controls' });
    if (!provider && !parent) {
      const group = el('div', { class: 'segmented visibility-choice', role: 'radiogroup', 'aria-label': 'Quem pode ler' });
      for (const value of ['internal', 'provider_visible']) {
        const meta = VISIBILITY[value];
        const option = el('button', { type: 'button', role: 'radio', class: 'segment', 'aria-checked': String(value === visibility), dataset: { visibility: value } }, [icon(meta.icon, { size: 14 }), el('span', { text: meta.label })]);
        option.addEventListener('click', () => {
          visibility = value;
          for (const node of group.children) node.setAttribute('aria-checked', String(node.dataset.visibility === value));
          if (value !== 'internal') mentionIds.clear();
          setHelp();
        });
        group.append(option);
      }
      controls.append(group);
    }
    // Menções: lista filtrada ao digitar "@".
    const suggestions = el('ul', { class: 'mention-list', role: 'listbox', 'aria-label': 'Mencionar', hidden: true });
    let pickIndex = 0;
    const candidates = () => {
      if (provider || visibility !== 'internal') return [];
      const match = /@([^\s@]*)$/.exec(text.value.slice(0, text.selectionStart));
      if (!match) return [];
      const query = fold(match[1]);
      return members.filter((member) => member.user_id !== ctx.viewer?.id && member.role !== 'provider_user' && member.display_name && fold(member.display_name).includes(query)).slice(0, 6);
    };
    const pick = (member) => {
      const cursor = text.selectionStart;
      const before = text.value.slice(0, cursor).replace(/@([^\s@]*)$/, `@${member.display_name} `);
      text.value = before + text.value.slice(cursor);
      text.selectionStart = text.selectionEnd = before.length;
      mentionIds.add(member.user_id);
      suggestions.hidden = true;
      text.focus();
    };
    const showSuggestions = () => {
      const list = candidates();
      suggestions.replaceChildren();
      suggestions.hidden = !list.length;
      pickIndex = 0;
      list.forEach((member, index) => {
        const option = el('li', { role: 'option', class: 'mention-option', 'aria-selected': String(index === 0), id: `mention-${member.user_id}` }, [avatar(member.display_name, { size: 'xs' }), el('span', { text: member.display_name }), el('span', { class: 'muted', text: member.title || '' })]);
        option.addEventListener('mousedown', (event) => { event.preventDefault(); pick(member); });
        suggestions.append(option);
      });
      suggestions.list = list;
    };
    text.addEventListener('input', showSuggestions);
    text.addEventListener('keydown', (event) => {
      if (suggestions.hidden) return;
      const options = [...suggestions.children];
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        pickIndex = (pickIndex + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
        options.forEach((option, index) => option.setAttribute('aria-selected', String(index === pickIndex)));
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        pick(suggestions.list[pickIndex]);
      } else if (event.key === 'Escape') suggestions.hidden = true;
    });
    text.addEventListener('blur', () => setTimeout(() => { suggestions.hidden = true; }, 120));
    const error = el('p', { class: 'field-error', role: 'alert', hidden: true });
    const submit = button(parent ? 'Responder' : 'Publicar comentário', { variant: 'secondary', type: 'submit', iconName: 'send', size: 'sm' });
    const cancel = parent ? button('Cancelar', { variant: 'ghost', size: 'sm', onClick: () => form.remove() }) : null;
    setHelp();
    form.append(el('div', { class: 'composer-field' }, [text, suggestions]), controls, help, error, el('div', { class: 'composer-actions' }, [cancel, submit]));
    const clientId = { value: uid() };
    onSubmit(form, async (event) => {
      event.preventDefault();
      const value = text.value.trim();
      error.hidden = true;
      if (!value) { error.textContent = 'Escreva o comentário antes de publicar.'; error.hidden = false; text.focus(); return; }
      if (/[<>]/.test(value)) { error.textContent = 'Use texto simples, sem os caracteres < e >.'; error.hidden = false; return; }
      const mentions = [...mentionIds].filter((id) => value.includes(`@${members.find((member) => member.user_id === id)?.display_name}`));
      submit.disabled = true;
      submit.querySelector('.btn-label').textContent = 'Publicando…';
      try {
        await ctx.send('comments', {
          organization_id: ctx.organization.id, object_type: 'rfq', object_id: rfq.id, visibility, body: value,
          mention_ids: visibility === 'internal' ? mentions : [], client_id: clientId.value, parent_id: parent?.id || null
        });
        clientId.value = uid();
        text.value = '';
        mentionIds.clear();
        toast(mentions.length ? `Comentário publicado. ${mentions.length === 1 ? 'A pessoa mencionada foi avisada.' : 'As pessoas mencionadas foram avisadas.'}` : 'Comentário publicado.');
        await refresh();
      } catch (failure) {
        error.replaceChildren(`${failure.message}${failure.status === 401 ? '' : ' O texto continua aqui para você tentar de novo.'} `, sessionLink(failure) || '');
        error.hidden = false;
      } finally {
        submit.disabled = false;
        submit.querySelector('.btn-label').textContent = parent ? 'Responder' : 'Publicar comentário';
      }
    });
    return form;
  };

  let rowsById = new Map();
  const renderComment = (row, replies) => {
    const author = row.author_name || memberName(members, row.author_id);
    const item = el('article', { class: `comment comment-${row.visibility}`, id: `comment-${row.id}` }, [
      avatar(author, { size: 'sm' }),
      el('div', { class: 'comment-main' }, [
        el('header', { class: 'comment-head' }, [
          el('strong', { class: 'comment-author', text: author }),
          row.author_org && row.author_is_provider ? el('span', { class: 'comment-org', text: row.author_org }) : null,
          el('time', { class: 'comment-time', datetime: row.created_at, title: formatDateTime(row.created_at), text: timeAgo(row.created_at) }),
          visibilityBadge(row.visibility, { provider, fromBuyer: provider && !row.author_is_provider })
        ]),
        row.parent_id && !rowsById.has(row.parent_id) ? el('p', { class: 'muted small', text: 'Resposta da empresa a uma pergunta enviada por outra instituição.' }) : null,
        commentBody(row.body, names)
      ])
    ]);
    const main = item.querySelector('.comment-main');
    // Threads têm um nível: responder a uma resposta vai para o comentário de
    // origem; sem acesso à origem (pergunta de outra instituição), não há resposta.
    const target = row.parent_id ? rowsById.get(row.parent_id) : row;
    if (target && canComment) {
      const reply = el('button', { type: 'button', class: 'link-btn' }, [icon('reply', { size: 14 }), el('span', { text: 'Responder' })]);
      reply.addEventListener('click', () => {
        if (main.querySelector('.composer-reply')) return;
        const form = composer(target);
        main.append(form);
        form.querySelector('textarea').focus();
      });
      main.append(el('div', { class: 'comment-actions' }, reply));
    }
    if (replies.length) main.append(el('div', { class: 'replies' }, replies.map((child) => renderComment(child, []))));
    return item;
  };

  async function refresh() {
    try {
      const result = await ctx.api(`comments?organization_id=${encodeURIComponent(ctx.organization.id)}&object_type=rfq&object_id=${encodeURIComponent(rfq.id)}`);
      const rows = [...(result.rows || [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      const ids = new Set(rows.map((row) => row.id));
      rowsById = new Map(rows.map((row) => [row.id, row]));
      const roots = rows.filter((row) => !row.parent_id || !ids.has(row.parent_id));
      thread.replaceChildren();
      for (const root of roots) thread.append(renderComment(root, rows.filter((row) => row.parent_id === root.id)));
      if (!roots.length) thread.append(emptyState({ title: provider ? 'Nenhuma conversa ainda' : 'Nenhum comentário ainda', text: provider ? 'Tire dúvidas sobre a demanda aqui. A empresa compradora é avisada.' : 'Registre contexto, dúvidas e combinados deste processo. Mencione alguém com @.', iconName: 'message', compact: true }));
      if (location.hash.startsWith('#comment-')) document.querySelector(location.hash)?.scrollIntoView({ block: 'center' });
    } catch (error) {
      thread.replaceChildren(errorState({ title: 'Comentários indisponíveis', error, onRetry: refresh }));
    }
  }
  section.append(thread, canComment ? composer() : el('p', { class: 'callout callout-info compact', id: 'comment-readonly' }, [icon('lock', { size: 14 }),
    el('span', { text: 'Seu papel lê os comentários deste processo. Comentar e mencionar fica com análise, gestão financeira e administração.' })]));
  refresh();
  return section;
}

const EVENT_LABELS = Object.freeze({
  rfq_created: 'criou a solicitação', rfq_open: 'abriu para propostas', rfq_collecting: 'passou a coletar propostas', rfq_comparing: 'encerrou a coleta e iniciou a avaliação',
  rfq_revised: 'publicou uma nova revisão', rfq_decided: 'marcou como decidida', rfq_cancelled: 'cancelou a solicitação', rfq_closed: 'encerrou a solicitação',
  provider_invited: 'convidou um provedor', invite_accepted: 'aceitou o convite', proposal_submitted: 'enviou proposta', proposal_revised: 'enviou nova versão da proposta',
  approval_requested: 'solicitou aprovação', approval_step_approved: 'aprovou uma etapa', approval_approved: 'concluiu a aprovação', approval_rejected: 'rejeitou a aprovação',
  approval_changes_requested: 'pediu alterações', approval_cancelled: 'cancelou o pedido de aprovação', decision_recorded: 'registrou a decisão',
  contract_registered: 'registrou o contrato', comment_added: 'comentou', renewal_task_created: 'criou tarefa de renovação', renewal_rfq_started: 'iniciou nova concorrência',
  rfq_demand_updated: 'atualizou a demanda', rfq_demand_updated_after_open: 'alterou a demanda após a abertura',
  renewal_milestone_reached: 'registrou um marco de renovação', document_uploaded: 'anexou um documento', document_version_added: 'enviou nova versão de documento',
  document_downloaded: 'baixou um documento', document_removed: 'removeu um documento'
});
/** Frase do histórico. Tipo desconhecido nunca aparece cru na interface. */

export function eventPhrase(type) { return EVENT_LABELS[type] || 'registrou uma atualização'; }

const EVENT_TITLES = Object.freeze({
  proposal_submitted: 'Nova proposta', proposal_revised: 'Proposta revisada', approval_requested: 'Aprovação solicitada', approval_approved: 'Aprovação concluída',
  approval_step_approved: 'Etapa aprovada', approval_rejected: 'Aprovação rejeitada', approval_changes_requested: 'Alterações pedidas', approval_cancelled: 'Pedido de aprovação cancelado',
  decision_recorded: 'Decisão registrada', contract_registered: 'Contrato registrado', rfq_revised: 'Nova revisão', rfq_created: 'Solicitação criada',
  rfq_open: 'Aberta para propostas', rfq_collecting: 'Coleta reaberta', rfq_comparing: 'Coleta encerrada', rfq_cancelled: 'Solicitação cancelada', provider_invited: 'Provedor convidado',
  invite_accepted: 'Convite aceito', comment_added: 'Comentário', renewal_task_created: 'Renovação em atenção', renewal_milestone_reached: 'Marco de renovação',
  renewal_rfq_started: 'Nova concorrência de renovação', rfq_demand_updated: 'Demanda atualizada', rfq_demand_updated_after_open: 'Demanda alterada após abertura',
  document_uploaded: 'Documento anexado', document_version_added: 'Nova versão de documento', document_removed: 'Documento removido',
  // Ciclo de vida pós-contratação e cadastros (eventos gravados pela API real).
  profile_field_saved: 'Perfil financeiro atualizado', profile_field_confirmed: 'Dado do perfil confirmado', organization_created: 'Organização criada',
  organization_updated: 'Organização atualizada', provider_onboarded: 'Instituição cadastrada', buyer_onboarded: 'Empresa cadastrada',
  comparison_viewed: 'Comparação consultada', weights_applied: 'Pesos aplicados', rfq_passport_snapshot: 'Perfil fixado na solicitação',
  opportunity_rule_versioned: 'Regra de oportunidade versionada', approval_policy_updated: 'Política de aprovação atualizada',
  spend_recorded: 'Spend registrado', spend_reconciled: 'Spend reconciliado', implementation_opened: 'Implantação iniciada',
  implementation_milestone_changed: 'Marco de implantação atualizado', implementation_issue_changed: 'Pendência de implantação atualizada',
  extraction_fact_confirmed: 'Fato extraído confirmado', document_extraction_started: 'Extração de documento iniciada', document_extraction_completed: 'Extração de documento concluída',
  qualification_requirement_set: 'Exigência de qualificação definida', provider_qualification_opened: 'Qualificação aberta',
  provider_qualification_in_progress: 'Qualificação em andamento', provider_qualification_pending_internal_review: 'Qualificação aguardando revisão',
  obligation_opened: 'Obrigação aberta', obligation_data_recorded: 'Medição de obrigação registrada', obligation_reviewed: 'Obrigação revisada',
  obligation_waiver_changed: 'Waiver de obrigação alterado', performance_dimension_versioned: 'Dimensão de performance versionada',
  performance_period_opened: 'Período de performance aberto', performance_measured: 'Performance medida', performance_reviewed: 'Performance revisada',
  fee_schedule_created: 'Tarifa contratada registrada', fee_observation_recorded: 'Tarifa observada registrada', fee_observation_verified: 'Tarifa observada verificada',
  fee_variance_detected: 'Diferença de tarifa identificada', contract_terms_registration: 'Termos do contrato registrados',
  facility_created: 'Facility registrada', facility_balance_recorded: 'Saldo de facility registrado'
});
/** Título curto para feeds. */

export function eventTitle(type) { return EVENT_TITLES[type] || 'Atualização'; }

export function activityLog(ctx, type, id) {
  const list = el('ol', { class: 'activity' }, el('li', {}, loading('Carregando histórico…')));
  ctx.api(`events?organization_id=${encodeURIComponent(ctx.organization.id)}&entity_type=${type}&entity_id=${encodeURIComponent(id)}`).then(({ rows }) => {
    list.replaceChildren();
    for (const row of rows || []) {
      const detail = row.metadata?.provider ? ` · ${row.metadata.provider}` : row.metadata?.revision ? ` · revisão ${row.metadata.revision}` : '';
      list.append(el('li', { class: 'activity-item' }, [
        el('span', { class: 'activity-dot', 'aria-hidden': 'true' }),
        el('span', { class: 'activity-text' }, [el('strong', { text: row.actor_name || 'Membro da equipe' }), ` ${eventPhrase(row.event_type)}${detail}`]),
        el('time', { class: 'activity-time', datetime: row.happened_at, text: formatDateTime(row.happened_at) })
      ]));
    }
    if (!list.children.length) list.append(el('li', { class: 'muted', text: 'Nenhuma atividade registrada.' }));
  }).catch((error) => list.replaceChildren(el('li', {}, errorState({ title: 'Histórico indisponível', error }))));
  return list;
}
