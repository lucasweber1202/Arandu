// Opportunity Engine: catálogo e composição server-side da worklist. Uma
// oportunidade é fato + regra versionada + fonte + data + ação possível +
// pessoa revisora. Nunca recomendação, nunca decisão: a linguagem diz o que
// disparou e qual ação uma pessoa pode avaliar.
import { day, money } from './fee-presenter.mjs';

export const OPPORTUNITY_TYPES = /* @__PURE__ */ Object.freeze({
  contract_renewal: 'Renovação de contrato se aproxima', repricing_window: 'Janela de repricing se aproxima', facility_maturity: 'Vencimento de facility se aproxima',
  guarantee_review: 'Garantia vence em breve', passport_stale: 'Dados do Passport a revalidar', facility_data_stale: 'Dados de facility desatualizados',
  fee_variance_review: 'Diferença de tarifa aguardando revisão', fee_resolution_value_review: 'Diferença de tarifa resolvida: avaliar registro de valor',
  value_realization_review: 'Economia negociada sem realização registrada', proposal_count_below: 'Propostas abaixo do mínimo da sua política',
  provider_concentration: 'Concentração acima da política da sua empresa', facility_utilization: 'Utilização acima da política da sua empresa',
  approval_exception_frequency: 'Exceções de aprovação acima da sua política', contract_without_sourcing: 'Contrato sem cotação no período da sua política'
});
export const OPPORTUNITY_ACTIONS = /* @__PURE__ */ Object.freeze({
  open_sourcing: 'Avaliar abrir processo de cotação', review_contract: 'Revisar contrato', review_facility: 'Revisar facility', review_guarantee: 'Revisar garantia',
  update_passport: 'Atualizar Passport', review_fee: 'Revisar tarifa', review_value: 'Avaliar registro de valor', review_realization: 'Revisar realização',
  review_policy_exceptions: 'Revisar exceções de política', contact_provider: 'Contatar provedor'
});
export const OPPORTUNITY_STATUS = /* @__PURE__ */ Object.freeze({ open: 'Aberta', acknowledged: 'Ciente', under_review: 'Em revisão', acted: 'Ação registrada', dismissed: 'Descartada', expired: 'Expirada' });
export const OPPORTUNITY_TRANSITIONS = /* @__PURE__ */ Object.freeze({ open: ['acknowledged', 'under_review', 'dismissed'], acknowledged: ['under_review', 'acted', 'dismissed'], under_review: ['acted', 'dismissed'] });
export const DISMISSAL_REASONS = /* @__PURE__ */ Object.freeze({ not_relevant: 'Não se aplica', already_handled: 'Já tratado', data_incorrect: 'Dado incorreto na fonte', accepted_risk: 'Risco aceito pela empresa', duplicate: 'Duplicada', other: 'Outro' });
export const EXPIRY_REASONS = /* @__PURE__ */ Object.freeze({ deadline_passed: 'prazo passou', condition_cleared: 'o fato deixou de existir', rule_disabled: 'regra desativada', rule_superseded: 'regra substituída por nova versão' });
export const SOURCES = /* @__PURE__ */ Object.freeze({ contract: 'Contrato', contract_milestone: 'Marco contratual', facility: 'Facility', guarantee: 'Garantia', passport: 'Passport', fee_variance: 'Diferença de tarifa', value_record: 'Registro de valor', rfq: 'Solicitação', provider: 'Provedor', organization: 'Organização' });
// Parâmetros: limiares financeiros SEM padrão (a empresa define); janelas de
// data com padrão operacional editável, mostrado e gravado explicitamente.
export const RULES = /* @__PURE__ */ Object.freeze({
  contract_renewal: { lead_days: 30, cooldown_days: 30 }, repricing_window: { cooldown_days: 30 }, facility_maturity: { lead_days: 120, cooldown_days: 30 },
  guarantee_review: { lead_days: 60, cooldown_days: 30 }, passport_stale: { lead_days: 30, cooldown_days: 30 }, facility_data_stale: { cooldown_days: 30 },
  fee_variance_review: { min_age_days: 0, cooldown_days: 30 }, fee_resolution_value_review: { cooldown_days: 30 }, value_realization_review: { grace_days: 30, cooldown_days: 30 },
  proposal_count_below: { min_proposals: null, cooldown_days: 30 }, provider_concentration: { max_share_pct: null, cooldown_days: 30 },
  facility_utilization: { max_utilization_pct: null, cooldown_days: 30 }, approval_exception_frequency: { window_days: null, min_count: null, cooldown_days: 30 },
  contract_without_sourcing: { lookback_months: null, cooldown_days: 30 }
});
export const PARAMETER_LABELS = /* @__PURE__ */ Object.freeze({
  lead_days: 'Antecedência (dias)', cooldown_days: 'Silêncio após descarte/ação (dias)', min_age_days: 'Idade mínima da diferença (dias)', grace_days: 'Carência após o período (dias)',
  min_proposals: 'Mínimo de propostas da sua política', max_share_pct: 'Participação máxima por provedor (%)', max_utilization_pct: 'Utilização máxima do limite (%)',
  window_days: 'Janela de observação (dias)', min_count: 'Quantidade de exceções que pede revisão', lookback_months: 'Meses sem cotação'
});

const n = (v) => (v === null || v === undefined ? '—' : String(v));
/** Por que disparou, com os fatos e o parâmetro da regra (nada inferido). */
export function whyText(type, f = {}, p = {}) {
  switch (type) {
    case 'contract_renewal': return `Aviso prévio em ${day(f.notice_date)} (${n(f.days_to_notice)} dias); contrato termina em ${day(f.ends_on)}; regra: avisar ${n(p.lead_days)} dias antes do aviso.`;
    case 'repricing_window': return `Repricing em ${day(f.due_on)} (${n(f.days_to_due)} dias), antecedência do marco: ${n(f.lead_days)} dias.`;
    case 'facility_maturity': return `Vencimento em ${day(f.maturity_on)} (${n(f.days_to_maturity)} dias); regra: ${n(p.lead_days)} dias de antecedência.`;
    case 'guarantee_review': return `Garantia termina em ${day(f.ends_on)} (${n(f.days_to_end)} dias); regra: ${n(p.lead_days)} dias de antecedência.`;
    case 'passport_stale': return `${n(f.fields)} campo(s) do Passport com validade até ${day(f.earliest_valid_until)}; regra: ${n(p.lead_days)} dias de antecedência.`;
    case 'facility_data_stale': return `Última verificação: ${f.verified_at ? day(f.verified_at) : 'nunca'}; a facility pede revisão a cada ${n(f.review_after_days)} dias.`;
    case 'fee_variance_review': return `Diferença de tarifa (${f.comparison_status === 'comparable' ? 'comparável' : 'não comparável'}) em ${n(f.service)}, ${day(f.period_start)} – ${day(f.period_end)}, sem revisão iniciada.`;
    case 'fee_resolution_value_review': return `Diferença confirmada por pessoa e resolvida (${money(f.variance_amount, f.currency || 'BRL')}); um registro de valor só existe se alguém o criar com baseline e metodologia.`;
    case 'value_realization_review': return `Período encerrado em ${day(f.period_end)} sem realização verificada registrada; carência da regra: ${n(p.grace_days)} dias.`;
    case 'proposal_count_below': return `${n(f.proposals)} proposta(s) enviada(s); mínimo da sua política: ${n(p.min_proposals)}.`;
    case 'provider_concentration': return `${n(f.share_pct)}% dos limites aprovados em ${n(f.currency)} com este provedor; máximo da sua política: ${n(p.max_share_pct)}%.`;
    case 'facility_utilization': return `${n(f.utilization_pct)}% do limite usado em ${day(f.as_of)}; máximo da sua política: ${n(p.max_utilization_pct)}%.`;
    case 'approval_exception_frequency': return `${n(f.exceptions)} exceção(ões) de política em ${n(p.window_days)} dias; sua política pede revisão a partir de ${n(p.min_count)}.`;
    case 'contract_without_sourcing': return `Sem solicitação do mesmo produto nos últimos ${n(p.lookback_months)} meses; contrato vigente desde ${day(f.starts_on)}.`;
    default: return 'Fato registrado pela regra.';
  }
}
export function sourceHref(o) {
  const id = encodeURIComponent(o.source_object_id);
  return { contract: '/finance/contracts.html', contract_milestone: '/finance/contracts.html', facility: '/finance/portfolio.html', guarantee: '/finance/portfolio.html',
    passport: '/finance/passport.html', fee_variance: `/finance/fees.html?id=${id}`, value_record: `/finance/value.html?id=${id}`, rfq: `/finance/rfq.html?id=${id}`,
    provider: '/finance/providers.html', organization: '/finance/settings.html' }[o.source_object_type] || null;
}

export function presentRules(rules) {
  const current = new Map();
  for (const r of rules) if (!current.has(r.rule_key) || current.get(r.rule_key).version < r.version) current.set(r.rule_key, r);
  return Object.keys(RULES).map((key) => {
    const r = current.get(key);
    return r ? `${OPPORTUNITY_TYPES[key]} · v${r.version} · ${r.enabled ? 'ativa' : 'desativada'} · ${Object.entries(r.parameters).map(([k, v]) => `${PARAMETER_LABELS[k]}: ${v}`).join(', ')}`
      : `${OPPORTUNITY_TYPES[key]} · não configurada${Object.values(RULES[key]).includes(null) ? ' (limiar definido pela sua empresa)' : ` (padrão operacional editável: ${Object.entries(RULES[key]).map(([k, v]) => `${PARAMETER_LABELS[k]} ${v}`).join(', ')})`}`;
  });
}
export function ruleForm(rules) {
  const latest = (key) => Math.max(0, ...rules.filter((r) => r.rule_key === key).map((r) => r.version));
  return { label: 'Configurar regra', title: 'Configurar regra de oportunidade', post: 'opportunities/rules',
    intro: 'Cada alteração cria uma nova versão; oportunidades já abertas guardam a versão aplicada. Limiares financeiros são da sua empresa; campos que não pertencem à regra escolhida são ignorados.',
    fields: [['rule', 'Regra (versão atual)', Object.keys(RULES).map((k) => [`${k}|${latest(k)}`, `${OPPORTUNITY_TYPES[k]} · v${latest(k)}`])], ['enabled', 'Situação', [['true', 'Ativa'], ['false', 'Desativada']]],
      ...Object.entries(PARAMETER_LABELS).map(([k, label]) => [k, label, 'number', { step: 1, min: 0 }]), ['reason', 'Justificativa', 'textarea', { required: true }]] };
}

export function presentOpportunityPage({ rows, summary, next, rules, today }) {
  const by = Object.fromEntries(summary.map((s) => [s.status, s]));
  const active = ['open', 'acknowledged', 'under_review'];
  const sum = (key, list) => list.reduce((t, s) => t + Number(by[s]?.[key] || 0), 0);
  return {
    cards: [
      { title: 'Oportunidades', lines: [`${sum('opportunities', active)} ativas (${n(by.open?.opportunities || 0)} abertas · ${n(by.acknowledged?.opportunities || 0)} cientes · ${n(by.under_review?.opportunities || 0)} em revisão)`,
        `${sum('due_30', active)} com prazo nos próximos 30 dias · ${sum('overdue', active)} com prazo vencido`,
        `${n(by.acted?.opportunities || 0)} com ação registrada · ${n(by.dismissed?.opportunities || 0)} descartadas · ${n(by.expired?.opportunities || 0)} expiradas`],
      note: 'Fato + regra da sua empresa + fonte + data. Ação possível é sugestão de trabalho para uma pessoa avaliar, nunca decisão do Arandu.' },
      { title: 'Regras da sua empresa', lines: presentRules(rules), actions: [ruleForm(rules)] }
    ],
    columns: ['Oportunidade', 'Por que disparou', 'Prazo', 'Ação possível', 'Estado'],
    rows: rows.map((o) => ({ id: o.id, cells: [OPPORTUNITY_TYPES[o.opportunity_type], whyText(o.opportunity_type, o.current_facts, o.rule_snapshot?.parameters), o.deadline ? `${day(o.deadline)}${o.deadline < today && active.includes(o.status) ? ' (vencido)' : ''}` : '—',
      OPPORTUNITY_ACTIONS[o.possible_action], `${OPPORTUNITY_STATUS[o.status]}${o.expiry_reason ? ` · ${EXPIRY_REASONS[o.expiry_reason]}` : ''}`] })),
    next,
    empty: { title: 'Nenhuma oportunidade no filtro', text: 'Sem regra ativa nada dispara. Configure as regras da sua empresa; o motor só usa fatos registrados.' },
    options: { opportunity_type: Object.entries(OPPORTUNITY_TYPES), status: Object.entries(OPPORTUNITY_STATUS), source: Object.entries(SOURCES) },
    forms: []
  };
}

export function presentOpportunityDetail({ opportunity: o, events = [], reviewers = [], entity = null }) {
  const p = o.rule_snapshot?.parameters || {};
  const actions = (OPPORTUNITY_TRANSITIONS[o.status] || []).map((to) => ({
    label: { acknowledged: 'Marcar como ciente', under_review: 'Iniciar revisão', acted: 'Registrar ação tomada', dismissed: 'Descartar' }[to], title: OPPORTUNITY_STATUS[to], post: 'opportunities/transition',
    fixed: { opportunity_id: o.id, expected_status: o.status, to_status: to },
    intro: to === 'acted' ? 'Registre o que uma pessoa fez. O Arandu não executa ações nem decide.' : null,
    fields: [...(to === 'under_review' ? [['reviewer_id', 'Revisor (administração ou gestão financeira com acesso à entidade)', [['', 'Eu mesmo'], ...reviewers.map((m) => [m.user_id, m.display_name || 'Membro'])]]] : []),
      ...(to === 'dismissed' ? [['dismissal_reason', 'Motivo do descarte', Object.entries(DISMISSAL_REASONS), { required: true }]] : []),
      ...(to === 'acted' ? [['resolution', 'O que foi feito', 'textarea', { required: true }]] : []), ['note', 'Nota (opcional)', 'textarea']]
  }));
  if (['contract', 'contract_milestone'].includes(o.source_object_type) && ['open', 'acknowledged', 'under_review'].includes(o.status) && !o.linked_rfq_id) {
    actions.push({ label: 'Criar rascunho de RFQ', title: 'Criar rascunho de RFQ a partir do contrato', post: 'opportunities/rfq', fixed: { opportunity_id: o.id },
      intro: 'Cria só um rascunho com a demanda do contrato de origem. Nenhum convite é enviado; revisão, edição e envio continuam humanos.',
      fields: [['confirmed', 'Confirmo criar o rascunho', 'checkbox', { required: true }]] });
  }
  return {
    title: OPPORTUNITY_TYPES[o.opportunity_type],
    lines: [`${OPPORTUNITY_STATUS[o.status]}${o.expiry_reason ? ` · ${EXPIRY_REASONS[o.expiry_reason]}` : ''}${o.reopen_count ? ` · reaberta ${o.reopen_count}x` : ''} · prazo ${o.deadline ? day(o.deadline) : '—'}`,
      `Por que disparou: ${whyText(o.opportunity_type, o.facts_snapshot, p)}`,
      `Situação atual: ${whyText(o.opportunity_type, o.current_facts, p)}`,
      `Regra v${o.rule_version}: ${Object.entries(p).map(([k, v]) => `${PARAMETER_LABELS[k]} ${v}`).join(', ') || 'sem parâmetros'}.`,
      `Fonte: ${SOURCES[o.source_object_type]} ${o.source_object_id}${o.discriminator ? ` · ${o.discriminator}` : ''} · aberta em ${day(o.opened_at)} · vista em ${day(o.last_seen_at)}. Entidade: ${entity || 'nível de grupo'}.`,
      `Ação possível: ${OPPORTUNITY_ACTIONS[o.possible_action]} (sugestão de trabalho, sem execução automática).`,
      ...(o.resolution ? [`Ação registrada: ${o.resolution}`] : []), ...(o.dismissal_reason ? [`Descartada: ${DISMISSAL_REASONS[o.dismissal_reason]}`] : []),
      ...(o.cooldown_until ? [`Silêncio até ${day(o.cooldown_until)}, salvo mudança material dos fatos.`] : []), ...(o.linked_rfq_id ? [`Rascunho de RFQ: ${o.linked_rfq_id}`] : [])],
    links: [sourceHref(o) && { href: sourceHref(o), text: `Abrir ${SOURCES[o.source_object_type].toLowerCase()}` }, o.linked_rfq_id && { href: `/finance/rfq.html?id=${encodeURIComponent(o.linked_rfq_id)}`, text: 'Abrir rascunho de RFQ' }].filter(Boolean),
    sections: [{ title: 'Histórico', empty: 'Sem eventos.', items: events.map((e) => `${day(e.created_at)} ${String(e.created_at).slice(11, 16)} · ${e.event_type}${e.from_status ? ` · ${OPPORTUNITY_STATUS[e.from_status] || e.from_status} → ${OPPORTUNITY_STATUS[e.to_status] || e.to_status}` : ''}${e.actor_id ? '' : ' · motor'}${e.note ? ` · ${e.note}` : ''}`) }],
    graph: o.source_object_type === 'provider' ? { type: 'provider', id: o.provider_id, kind: 'opportunity', title: 'Contexto do provedor' } : null,
    actions
  };
}
