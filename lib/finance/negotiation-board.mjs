// Quadro de respostas da negociação: uma linha por instituição, juntando o
// convite, a proposta enviada pelo portal e as propostas registradas pela
// empresa a partir de fonte externa. Puro (testado em Node), sem rede.
//
// Regras de integridade:
// - proposta externa é "registrada pela empresa", nunca "enviada pela
//   instituição"; transcrição não conferida fica fora da comparação;
// - "de quem é a vez" sai de estados reais (convite, proposta, conferência,
//   prazo, estado da solicitação), sem inferir intenção da instituição;
// - nenhuma ordenação comercial: as linhas seguem a ordem do convite.

import { brDay } from './format.mjs';
const OPEN = ['open', 'collecting'];
const LIVE_INVITE = ['invited', 'accepted'];
const blank = (v) => v === null || v === undefined || v === '';
const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);
const diffDays = (from, to) => Math.round((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
const brDate = (iso) => brDay(iso);

export const BALL = Object.freeze({ institution: 'Aguardando a instituição', company: 'Aguardando a empresa', none: 'Sem pendência nesta etapa' });

/** Condições comparáveis em branco, pelos rótulos do produto (sem chaves internas). */
export function missingComparable(fields = [], terms = {}) {
  return fields.filter((f) => f.comparable && blank(terms?.[f.key])).map((f) => String(f.label).replace(/\s*\(.*\)$/, ''));
}

function validity(terms, today) {
  if (!terms || !isDay(terms.valid_until)) return null;
  const d = diffDays(today, terms.valid_until);
  return { expired: d < 0, soon: d >= 0 && d <= 5, text: d < 0 ? `validade venceu em ${brDate(terms.valid_until)}` : `válida até ${brDate(terms.valid_until)}` };
}

/**
 * @param {object} input
 * @param {object} input.rfq          status, revision, response_deadline
 * @param {Array}  input.invites      provider_id, provider_name, status
 * @param {Array}  input.proposals    portal: id, provider_id, provider_name, version, rfq_revision, terms
 * @param {Array}  input.externals    id, provider_id, provider_name, state, current_version, rfq_revision_matches, terms, channel
 * @param {Array}  input.fields       PRODUCTS[product].proposalFields
 * @param {string} input.today        YYYY-MM-DD
 */
export function negotiationBoard({ rfq = {}, invites = [], proposals = [], externals = [], fields = [], today }) {
  if (!isDay(today)) throw new Error('today inválido');
  const open = OPEN.includes(rfq.status);
  const deadlinePassed = isDay(rfq.response_deadline) && diffDays(today, rfq.response_deadline) < 0;
  const order = [];
  const rows = new Map();
  const row = (id, name) => {
    if (!rows.has(id)) { rows.set(id, { providerId: id, name: name || 'Instituição cadastrada', invite: null, portal: null, external: [] }); order.push(id); }
    const r = rows.get(id); if (name && r.name === 'Instituição cadastrada') r.name = name; return r;
  };
  for (const i of invites) if (i.provider_id) row(i.provider_id, i.provider_name).invite = i;
  for (const p of proposals) if (p.provider_id) row(p.provider_id, p.provider_name).portal = p;
  for (const x of externals) if (x.provider_id && !['superseded'].includes(x.state)) row(x.provider_id, x.provider_name).external.push(x);

  const out = order.map((id) => {
    const r = rows.get(id);
    const channels = [];
    const notes = [];
    let ball = 'none';
    let status;
    if (r.portal) {
      const p = r.portal;
      const outdated = p.rfq_revision && rfq.revision && p.rfq_revision < rfq.revision;
      const v = validity(p.terms, today);
      const missing = missingComparable(fields, p.terms);
      channels.push({ kind: 'portal', label: 'Enviada pela instituição no portal', version: p.version, href: `#proposal-${p.id}`, missing, validity: v, outdated: Boolean(outdated), inComparison: true });
      status = outdated ? `Respondeu à revisão ${p.rfq_revision}; a solicitação está na revisão ${rfq.revision}` : `Proposta v${p.version} recebida`;
      if (outdated && open) { ball = 'institution'; notes.push('Pode enviar nova versão para a revisão atual até o fim da coleta.'); }
      if (v?.expired) notes.push(`Proposta do portal com ${v.text}.`);
    } else if (r.invite) {
      const inv = r.invite;
      if (LIVE_INVITE.includes(inv.status) && open && !deadlinePassed) { ball = 'institution'; status = inv.status === 'accepted' ? 'Aceitou o convite; ainda sem proposta' : 'Convite ainda não aceito'; }
      else if (LIVE_INVITE.includes(inv.status)) status = deadlinePassed ? 'Sem proposta até o prazo' : 'Sem proposta pelo portal';
      else status = { declined: 'Recusou o convite', revoked: 'Convite revogado pela empresa', expired: 'Convite expirado' }[inv.status] || 'Convite encerrado';
    } else status = 'Sem convite pelo portal';

    for (const x of r.external) {
      const v = validity(x.terms, today);
      const pending = ['preparing', 'pending_review'].includes(x.state);
      const reviewed = x.state === 'reviewed';
      channels.push({ kind: 'external', label: 'Registrada pela empresa (fonte externa, não autenticada pela instituição)', version: x.current_version, href: `#external-${x.id}`,
        missing: missingComparable(fields, x.terms), validity: v, outdated: x.rfq_revision_matches === false, inComparison: reviewed && x.rfq_revision_matches !== false,
        review: x.state === 'withdrawn' ? 'Retirada da análise' : reviewed ? 'Transcrição conferida' : x.state === 'preparing' ? 'Em preparação' : 'Aguardando conferência' });
      if (pending) { ball = 'company'; notes.push('Transcrição externa aguardando conferência: fica fora da comparação até alguém da gestão conferir.'); }
      if (reviewed && x.rfq_revision_matches === false) notes.push('Proposta externa registrada para outra revisão da solicitação: fora da comparação corrente.');
      if (!r.portal) status = x.state === 'withdrawn' ? 'Proposta externa retirada da análise' : reviewed ? 'Proposta externa conferida' : 'Proposta externa registrada';
    }
    // Coleta encerrada com respostas: a vez é da empresa (avaliar), salvo conferência já apontada.
    if (ball === 'none' && rfq.status === 'comparing' && channels.some((c) => c.inComparison)) ball = 'company';
    return { providerId: r.providerId, name: r.name, status, ball, ballLabel: BALL[ball], channels, notes, relationshipHref: `/finance/providers.html?provider_id=${encodeURIComponent(r.providerId)}` };
  });

  const count = (b) => out.filter((r) => r.ball === b).length;
  const inComparison = out.filter((r) => r.channels.some((c) => c.inComparison)).length;
  const summary = {
    institutions: out.length, waitingInstitution: count('institution'), waitingCompany: count('company'), inComparison,
    deadline: isDay(rfq.response_deadline) ? (deadlinePassed ? `prazo encerrado em ${brDate(rfq.response_deadline)}` : `prazo ${brDate(rfq.response_deadline)}`) : 'sem prazo definido'
  };
  return { rows: out, summary, readiness: comparisonReadiness(out) };
}

/**
 * O que precisa ser visto antes de comparar: fora da comparação e por quê,
 * condições comparáveis ausentes e validades vencidas. Fatos, sem ranking.
 */
export function comparisonReadiness(rows) {
  const items = [];
  for (const r of rows) for (const c of r.channels) {
    const source = c.kind === 'portal' ? 'portal' : 'externa';
    if (!c.inComparison) items.push({ tone: 'warning', providerId: r.providerId, href: c.href, text: `${r.name} (${source}): fora da comparação — ${c.kind === 'external' ? (c.review === 'Transcrição conferida' ? 'registrada para outra revisão da solicitação' : c.review.toLowerCase()) : 'motivo não identificado'}.` });
    else if (c.outdated) items.push({ tone: 'warning', providerId: r.providerId, href: c.href, text: `${r.name} (${source}): responde a uma revisão anterior da solicitação.` });
    if (c.inComparison && c.missing.length) items.push({ tone: 'neutral', providerId: r.providerId, href: c.href, text: `${r.name} (${source}): ${c.missing.length === 1 ? 'condição comparável não informada' : `${c.missing.length} condições comparáveis não informadas`} — ${c.missing.slice(0, 4).join(', ')}${c.missing.length > 4 ? '…' : ''}.` });
    if (c.inComparison && c.validity?.expired) items.push({ tone: 'warning', providerId: r.providerId, href: c.href, text: `${r.name} (${source}): ${c.validity.text}.` });
  }
  return items;
}
