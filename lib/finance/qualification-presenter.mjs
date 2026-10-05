// Provider Qualification — composição server-side. Linguagem: "qualificado
// segundo as exigências da sua empresa", "evidência aceita", "exceção
// aprovada". Nunca "aprovado pelo Arandu", nunca "verificado pelo Arandu",
// nunca recomendação de provedor. Puro: recebe linhas já autorizadas.
import { AREAS, CATEGORIES, STATUS, TRANSITIONS, EVIDENCE_STATUS, EVIDENCE_SOURCES, EXCEPTION_STATUS, readiness, effectiveStatus } from './qualification.mjs';

const day = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');
const stamp = (v) => (v ? `${day(v)} ${String(v).slice(11, 16)} UTC` : '—');
const pairs = (map) => Object.entries(map);
const STATE = { met: 'atendida (evidência aceita e vigente)', excepted: 'exceção aprovada e vigente', under_review: 'evidência aguardando revisão', missing: 'sem evidência aceita' };

export function qualificationForms({ providers, entities, members, requirements }) {
  const owners = members.filter((m) => ['admin', 'finance_manager', 'analyst'].includes(m.role)).map((m) => [m.user_id, m.display_name || m.user_id]);
  return [
    { label: 'Abrir qualificação', primary: true, title: 'Abrir qualificação de provedor', post: 'qualifications/open',
      intro: 'Uma qualificação por provedor, categoria e entidade (vazio = grupo). As exigências aplicáveis são as definidas pela sua empresa para a categoria e a entidade.',
      fields: [['provider_id', 'Provedor', [['', 'Selecione'], ...providers.map((p) => [p.id, p.name])], { required: true }], ['category', 'Categoria', pairs(CATEGORIES)],
        ['legal_entity_id', 'Entidade (vazio = grupo)', [['', 'Grupo'], ...entities.map((e) => [e.id, e.legal_name])]], ['owner_id', 'Responsável', [['', 'Eu'], ...owners]],
        ['review_due_on', 'Revisar até', 'date']] },
    { label: 'Nova exigência', title: 'Nova exigência de qualificação', post: 'qualifications/requirement',
      intro: 'Exigência da SUA empresa (o Arandu não define critério de qualificação). Versões são imutáveis; editar cria nova versão. Só administração.',
      fields: [['area', 'Área', pairs(AREAS)], ['title', 'Exigência', 'text', { required: true, maxlength: 200 }], ['description', 'Como comprovar', 'textarea', { maxlength: 2000 }],
        ['category', 'Categoria', pairs(CATEGORIES)], ['legal_entity_id', 'Entidade (vazio = grupo)', [['', 'Grupo'], ...entities.map((e) => [e.id, e.legal_name])]],
        ['validity_days', 'Validade da evidência (dias, vazio = sem validade)', 'number', { min: 1, max: 3650, step: 1 }], ['critical', 'Exigência crítica', [['false', 'Não'], ['true', 'Sim']]]] },
    ...(requirements.length ? [{ label: 'Aposentar exigência', title: 'Aposentar exigência', post: 'qualifications/retire-requirement',
      intro: 'A exigência deixa de valer para novas decisões; evidências já registradas continuam no histórico.',
      fields: [['requirement_id', 'Exigência ativa', requirements.map((r) => [r.id, `${AREAS[r.area]} · ${r.title} · v${r.version}`])]] }] : [])
  ];
}

export function presentQualificationPage({ rows, providers, entities, members, requirements, next, today }) {
  const counts = {};
  for (const r of rows) { const s = effectiveStatus(r, today); counts[s] = (counts[s] || 0) + 1; }
  const expiring = rows.filter((r) => ['qualified', 'qualified_with_conditions'].includes(r.status) && r.valid_until && r.valid_until >= today && r.valid_until <= new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 864e5).toISOString().slice(0, 10)).length;
  const names = new Map(providers.map((p) => [p.id, p.name]));
  const ents = new Map(entities.map((e) => [e.id, e.legal_name]));
  return {
    cards: [
      { title: 'Qualificação de provedores', lines: [Object.keys(counts).length ? Object.entries(counts).map(([k, v]) => `${STATUS[k]}: ${v}`).join(' · ') : 'Nenhuma qualificação no escopo.', `${expiring} vencendo em 30 dias`,
        'Qualificação registra exigências da sua empresa, evidências e a decisão de uma pessoa. Não escolhe provedor nem substitui verificação especializada (KYC/KYB/sanções).'] },
      { title: 'Exigências ativas da empresa', lines: requirements.length ? requirements.map((r) => `${r.critical ? '◆ ' : ''}${AREAS[r.area]} · ${r.title} · ${CATEGORIES[r.category]}${r.legal_entity_id ? ` · ${ents.get(r.legal_entity_id) || 'entidade'}` : ''}${r.validity_days ? ` · validade ${r.validity_days} dias` : ''} · v${r.version}`) : ['Nenhuma exigência definida: sem exigência, nenhuma qualificação pode ser decidida como atendida.'] }
    ],
    columns: ['Provedor', 'Categoria', 'Escopo', 'Estado', 'Válida até', 'Revisar até'],
    rows: rows.map((r) => ({ id: r.id, cells: [names.get(r.provider_id) || r.provider_id, CATEGORIES[r.category], r.legal_entity_id ? ents.get(r.legal_entity_id) || 'Entidade' : 'Grupo', STATUS[effectiveStatus(r, today)], day(r.valid_until), day(r.review_due_on)] })),
    next,
    empty: { title: 'Nenhuma qualificação no escopo', text: 'Abra uma qualificação para registrar exigências atendidas, evidências e a decisão.' },
    options: { status: pairs(STATUS), category: pairs(CATEGORIES) },
    forms: qualificationForms({ providers, entities, members, requirements })
  };
}

export function presentQualificationDetail({ qualification: q, provider, entity, requirements, evidence, exceptions, events, today }) {
  const ready = readiness(requirements, evidence, exceptions, today);
  const reqTitle = new Map(requirements.map((r) => [r.id, r.title]));
  const status = effectiveStatus(q, today);
  const actions = [];
  const open = ['not_started', 'in_progress', 'pending_provider', 'pending_internal_review', 'qualified', 'qualified_with_conditions'].includes(q.status);
  if (open && requirements.length) actions.push({ label: 'Registrar evidência', title: 'Registrar evidência', post: 'qualifications/evidence', fixed: { qualification_id: q.id },
    intro: 'Evidência é fato com origem e validade. Resultado de serviço especializado (KYC/KYB/sanções) entra como evidência externa, com o nome do serviço; o Arandu não faz essa verificação.',
    fields: [['requirement_id', 'Exigência', requirements.map((r) => [r.id, `${r.critical ? '◆ ' : ''}${r.title}`])], ['source', 'Origem', pairs(EVIDENCE_SOURCES)],
      ['external_service', 'Serviço externo (só para origem externa)', 'text', { maxlength: 80 }], ['evidence_reference', 'Referência da evidência', 'text', { required: true, maxlength: 200 }], ['valid_until', 'Válida até (vazio = validade da exigência)', 'date']] });
  const pending = evidence.filter((e) => e.status === 'submitted');
  if (pending.length) actions.push({ label: 'Revisar evidência', title: 'Revisar evidência', post: 'qualifications/evidence-review',
    intro: 'Quem registrou a evidência não pode aceitá-la (segregação de funções). Recusar exige motivo.',
    fields: [['evidence_id', 'Evidência', pending.map((e) => [e.id, `${reqTitle.get(e.requirement_id) || 'Exigência'} · ${e.evidence_reference}`])], ['status', 'Resultado', [['accepted', 'Aceitar'], ['rejected', 'Recusar']]], ['reason', 'Motivo (obrigatório para recusar)', 'textarea', { maxlength: 1000 }]] });
  const missing = ready.items.filter((i) => i.state === 'missing' || i.state === 'under_review');
  if (open && missing.length) actions.push({ label: 'Pedir exceção', title: 'Pedir exceção a uma exigência', post: 'qualifications/exception', fixed: { qualification_id: q.id },
    intro: 'Exceção é temporária (até 366 dias), exige motivo e é decidida por outra pessoa. Com exceção, a decisão só pode ser "qualificado com condições".',
    fields: [['requirement_id', 'Exigência', missing.map((i) => [i.requirement_id, i.title])], ['reason', 'Motivo', 'textarea', { required: true, maxlength: 2000 }], ['compensating_controls', 'Controles compensatórios', 'textarea', { maxlength: 2000 }], ['expires_on', 'Vence em', 'date', { required: true }]] });
  const requested = exceptions.filter((x) => x.status === 'requested');
  if (requested.length) actions.push({ label: 'Decidir exceção', title: 'Decidir exceção', post: 'qualifications/exception-decision',
    intro: 'Quem pediu não decide a própria exceção.',
    fields: [['exception_id', 'Exceção', requested.map((x) => [x.id, `${reqTitle.get(x.requirement_id) || 'Exigência'} · até ${day(x.expires_on)}`])], ['status', 'Decisão', [['approved', 'Aprovar'], ['rejected', 'Recusar']]], ['reason', 'Motivo', 'textarea', { required: true, maxlength: 1000 }]] });
  const targets = (TRANSITIONS[q.status] || []).filter((to) => !['qualified', 'qualified_with_conditions'].includes(to) || ready.allowed.includes(to));
  if (targets.length) actions.push({ label: 'Mudar estado / decidir', title: 'Mudar estado ou decidir', post: 'qualifications/transition', fixed: { qualification_id: q.id, expected_status: q.status },
    intro: `Decisão é humana e auditada (administração ou gestão financeira). ${ready.missing ? `Faltam ${ready.missing} exigência(s): decisão de qualificar indisponível.` : ready.excepted ? 'Há exceção aprovada: só "qualificado com condições".' : 'Todas as exigências atendidas.'}`,
    fields: [['to_status', 'Novo estado', targets.map((t) => [t, STATUS[t]])], ['reason', 'Justificativa (obrigatória para decisões)', 'textarea', { maxlength: 2000 }], ['conditions', 'Condições (obrigatórias para "com condições")', 'textarea', { maxlength: 2000 }], ['valid_until', 'Válida até (opcional; nunca além da evidência mais curta)', 'date']] });
  return {
    title: `${provider?.name || 'Provedor'} · ${CATEGORIES[q.category]} · ${entity || 'Grupo'}`,
    lines: [
      `${STATUS[status]}${status !== q.status ? ` (registrada como ${STATUS[q.status]}; validade encerrada em ${day(q.valid_until)})` : ''} · válida até ${day(q.valid_until)} · revisar até ${day(q.review_due_on)}`,
      q.decided_at ? `Decisão em ${stamp(q.decided_at)}: ${q.decision_reason}` : 'Sem decisão registrada.',
      ...(q.conditions ? [`Condições: ${q.conditions}`] : []),
      `Prontidão: ${ready.met} atendida(s) · ${ready.excepted} com exceção · ${ready.missing} pendente(s). ${ready.allowed.length ? `Desfechos permitidos: ${ready.allowed.map((a) => STATUS[a]).join(', ')}.` : 'Qualificar indisponível até atender as pendências.'}`,
      'Estado de qualificação informa a solicitação e a policy; não escolhe vencedor nem decide sozinho.'
    ],
    sections: [
      { title: 'Exigências aplicáveis (◆ = crítica)', empty: 'Nenhuma exigência aplicável: defina exigências da empresa.', items: ready.items.map((i) => `${i.critical ? '◆ ' : ''}${AREAS[i.area]} · ${i.title}: ${STATE[i.state]}${i.valid_until ? ` · até ${day(i.valid_until)}` : ''}`) },
      { title: 'Evidências', empty: 'Nenhuma evidência registrada.', items: evidence.map((e) => `${reqTitle.get(e.requirement_id) || 'Exigência'} · ${EVIDENCE_SOURCES[e.source]}${e.external_service ? ` (${e.external_service})` : ''} · ${e.evidence_reference} · ${EVIDENCE_STATUS[e.status]}${e.valid_until ? ` · válida até ${day(e.valid_until)}` : ''}${e.review_reason ? ` · ${e.review_reason}` : ''} · registrada ${stamp(e.created_at)}`) },
      { title: 'Exceções', empty: 'Nenhuma exceção.', items: exceptions.map((x) => `${reqTitle.get(x.requirement_id) || 'Exigência'} · ${EXCEPTION_STATUS[x.status]} · até ${day(x.expires_on)} · ${x.reason}${x.compensating_controls ? ` · controles: ${x.compensating_controls}` : ''}${x.decision_reason ? ` · decisão: ${x.decision_reason}` : ''}`) },
      { title: 'Trilha', empty: 'Sem eventos.', items: events.map((e) => `${stamp(e.created_at)} · ${e.event_type}${e.from_status ? ` ${STATUS[e.from_status] || e.from_status} →` : ''}${e.to_status ? ` ${STATUS[e.to_status] || EVIDENCE_STATUS[e.to_status] || EXCEPTION_STATUS[e.to_status] || e.to_status}` : ''}${e.reason ? ` · ${e.reason}` : ''}`) }
    ],
    links: [{ href: `/finance/providers.html?id=${q.provider_id}`, text: 'Abrir provedor' }],
    actions
  };
}
