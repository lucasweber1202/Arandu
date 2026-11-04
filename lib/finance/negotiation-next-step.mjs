// Próximo passo da negociação durante rascunho e coleta. Módulo pequeno e
// puro: entra no carregamento inicial da lista e da página da solicitação;
// o Quadro de respostas (negotiation-board.mjs) continua sob demanda.
const OPEN_INVITE = ['invited', 'accepted'];
const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);
const diffDays = (from, to) => Math.round((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

/**
 * Próximo passo da negociação a partir do que a lista já carrega (estado,
 * prazo, convites e propostas do portal). Fonte única para a lista de
 * solicitações e para o cartão "Próximo passo" da página. Propostas externas
 * não entram aqui: a lista não as carrega (ver o Quadro de respostas).
 * actor: 'company' | 'institution' | 'approver' | 'none'.
 */
export function negotiationNextStep(rfq = {}, today) {
  if (!isDay(today)) throw new Error('today inválido');
  const live = (rfq.invites || []).filter((i) => OPEN_INVITE.includes(i.status));
  const invited = (rfq.invites || []).length || Number(rfq.invites_count) || 0;
  const answered = new Set((rfq.proposals || []).map((p) => p.provider_id)).size;
  const waiting = live.filter((i) => !(rfq.proposals || []).some((p) => p.provider_id === i.provider_id)).length;
  const outdated = (rfq.proposals || []).filter((p) => p.rfq_revision && rfq.revision && p.rfq_revision < rfq.revision).length;
  const passed = isDay(rfq.response_deadline) && diffDays(today, rfq.response_deadline) < 0;
  const step = (actor, text, detail = null) => ({ actor, text, detail });
  if (rfq.pending_approval) return step('approver', 'Aguardando aprovação');
  switch (rfq.status) {
    case 'draft': return step('company', invited ? 'Abrir para propostas' : 'Convidar instituições e abrir');
    case 'open': case 'collecting':
      if (!invited) return step('company', 'Convidar instituições');
      if (passed) return step('company', 'Prazo encerrado: encerrar a coleta e avaliar', `${answered} de ${invited} responderam`);
      if (waiting) return step('institution', `Aguardando ${waiting} de ${invited} ${invited === 1 ? 'instituição' : 'instituições'}`, outdated ? `${outdated} ${outdated === 1 ? 'resposta é' : 'respostas são'} de revisão anterior` : null);
      if (outdated) return step('institution', `Aguardando nova versão de ${outdated} ${outdated === 1 ? 'instituição' : 'instituições'}`, 'Responderam a uma revisão anterior');
      return step('company', 'Todas responderam: encerrar a coleta e avaliar', `${answered} de ${invited} responderam`);
    case 'comparing': return step('company', answered ? 'Comparar, pedir aprovação e decidir' : 'Sem proposta pelo portal: conferir propostas externas ou reabrir');
    case 'decided': return step('company', 'Registrar o contrato');
    case 'contracted': return step('none', 'Contrato em acompanhamento');
    default: return step('none', 'Processo encerrado');
  }
}
export const ACTOR_LABEL = Object.freeze({ company: 'Empresa', institution: 'Instituições', approver: 'Aprovadores', none: 'Sem ação pendente' });
