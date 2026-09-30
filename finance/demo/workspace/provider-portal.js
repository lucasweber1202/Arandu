// Portal do provedor na demonstração: simples de propósito, com a próxima
// ação sempre visível e as revisões explicadas.
//
// Linguagem única (desktop, celular, busca e títulos):
//   Oportunidade  demanda que a instituição pode responder
//   Proposta      a resposta da instituição (versionada)
//   Convite       o acesso a uma oportunidade (aceitar libera a demanda)
//
// Revisões: quando a empresa publica uma revisão depois da proposta, a tela
// mostra exatamente o que mudou, campo a campo, a partir do histórico
// publicado (rfq-revisions) — nada é inferido. Depois de enviar, um estado
// de sucesso claro substitui o "toast e recarregar".

import { el, icon, formatDateTime, timeAgo } from '../../src/core.js';
import { button } from '../../src/ui.js';
import { revisionDiff } from '../../src/views/shared.js';
import { opportunityNext } from './next-action.js';
import { nextInline } from './work-ui.js';
import { handoffButton } from './handoff.js';

const SEEN_KEY = 'arandu-demo-proposal-seen';
function readSeen() { try { return JSON.parse(sessionStorage.getItem(SEEN_KEY) || '{}') || {}; } catch { return {}; } }
function writeSeen(value) { try { sessionStorage.setItem(SEEN_KEY, JSON.stringify(value)); } catch { /* sem sessão */ } }

function diffList(changes) {
  return el('dl', { class: 'rev-diff' }, changes.map((change) => el('div', { class: 'rev-diff-row' }, [
    el('dt', { text: change.label }),
    el('dd', {}, [el('span', { class: 'rev-before', text: change.before }), el('span', { class: 'rev-arrow', 'aria-label': 'passou para', text: '→' }), el('span', { class: 'rev-after', text: change.after })])
  ])));
}

async function revisions(ctx, rfqId) {
  const result = await ctx.api(`rfq-revisions?organization_id=${encodeURIComponent(ctx.organization.id)}&rfq_id=${encodeURIComponent(rfqId)}`);
  return result.rows || [];
}

/** Painel de revisão da página de proposta. */
export function enhanceProviderProposal(ctx) {
  const wanted = new URLSearchParams(location.search).get('proposal');
  const assignment = (ctx.data.assignments || []).find((row) => row.proposal_id === wanted);
  const status = document.querySelector('#view .proposal-status');
  if (!assignment || !status || status.dataset.dw) return;
  status.dataset.dw = '1';
  const open = ['open', 'collecting'].includes(assignment.rfq_status);
  const outdated = open && assignment.version && assignment.submitted_rfq_revision && assignment.rfq_revision > assignment.submitted_rfq_revision;
  const seen = readSeen();
  const previous = seen[assignment.proposal_id];
  seen[assignment.proposal_id] = assignment.version || 0;
  writeSeen(seen);
  const latest = assignment.history?.[0];
  // Continuidade: a mesma solicitação, do lado da empresa que compara.
  const handoff = assignment.version ? handoffButton(ctx, { persona: 'buyer', path: `/finance/rfq.html?id=${assignment.rfq_id}#comparacao`, label: 'Ver como Marina (empresa)', note: 'A mesma solicitação, na comparação da empresa' }) : null;
  if (handoff) queueMicrotask(() => status.after(el('div', { class: 'provider-handoff' }, handoff)));
  const justSent = Number.isFinite(previous) && assignment.version > previous && latest && Date.now() - Date.parse(latest.submitted_at) < 10 * 60000;

  if (justSent) {
    const panel = el('section', { class: 'sent-state', id: 'proposal-sent', 'aria-labelledby': 'sent-title', tabindex: '-1' }, [
      el('span', { class: 'sent-icon', 'aria-hidden': 'true' }, icon('check', { size: 18 })),
      el('div', {}, [
        el('h2', { class: 'sent-title', id: 'sent-title', text: `Proposta v${assignment.version} enviada` }),
        el('p', { class: 'sent-meta num', text: `Responde à revisão ${assignment.submitted_rfq_revision || assignment.rfq_revision} · Enviada ${timeAgo(latest.submitted_at)}` }),
        el('p', { class: 'sent-text', text: open ? 'Você ainda pode revisar enquanto a coleta estiver aberta. Cada alteração vira uma nova versão, e a empresa vê todas.' : 'A coleta encerrou; esta versão fica registrada para a empresa.' })
      ])
    ]);
    status.replaceChildren(panel);
    requestAnimationFrame(() => panel.focus({ preventScroll: false }));
    return;
  }
  if (outdated) {
    const panel = el('section', { class: 'rev-changed', id: 'rfq-changed', 'aria-labelledby': 'rev-changed-title' }, [
      el('p', { class: 'rev-kicker' }, [icon('alert', { size: 14 }), el('span', { text: 'A solicitação mudou' })]),
      el('h2', { class: 'rev-title', id: 'rev-changed-title', text: `Sua proposta respondeu à revisão ${assignment.submitted_rfq_revision}. A empresa publicou a revisão ${assignment.rfq_revision}.` }),
      el('div', { class: 'rev-body' }, el('p', { class: 'muted small', text: 'Carregando o que mudou…' })),
      button('Atualizar proposta', { variant: 'primary', iconName: 'edit', attrs: { id: 'update-proposal' }, onClick: () => {
        const first = document.querySelector('#proposal-form input:not([type=hidden]), #proposal-form select');
        first?.scrollIntoView({ block: 'center' });
        first?.focus();
      } })
    ]);
    status.replaceChildren(panel);
    revisions(ctx, assignment.rfq_id).then((rows) => {
      const before = rows.find((row) => row.revision === assignment.submitted_rfq_revision)?.snapshot;
      const after = rows.find((row) => row.revision === assignment.rfq_revision)?.snapshot;
      const changes = revisionDiff(assignment.product, before, after);
      panel.querySelector('.rev-body').replaceChildren(changes.length ? el('div', {}, [el('p', { class: 'rev-sub', text: 'Mudanças' }), diffList(changes)]) : el('p', { class: 'muted small', text: 'Nenhuma mudança de campo registrada entre as revisões.' }));
    }).catch(() => panel.querySelector('.rev-body').replaceChildren(el('p', { class: 'muted small', text: 'Não foi possível carregar o histórico de revisões.' })));
    return;
  }
  // Proposta em dia: o que a versão atual já incorporou, a partir do histórico publicado.
  if (assignment.version && assignment.history?.length > 1) {
    const [current, prior] = assignment.history;
    if (current.rfq_revision && prior?.rfq_revision && current.rfq_revision > prior.rfq_revision) {
      const panel = el('details', { class: 'rev-applied', id: 'rfq-applied' }, [
        el('summary', {}, [icon('repeat', { size: 14 }), el('span', { text: `Sua v${current.version} já responde à revisão ${current.rfq_revision}, a atual. Ver o que mudou desde a v${prior.version} (revisão ${prior.rfq_revision}).` })]),
        el('div', { class: 'rev-body' }, el('p', { class: 'muted small', text: 'Carregando…' }))
      ]);
      status.append(panel);
      revisions(ctx, assignment.rfq_id).then((rows) => {
        const changes = revisionDiff(assignment.product, rows.find((row) => row.revision === prior.rfq_revision)?.snapshot, rows.find((row) => row.revision === current.rfq_revision)?.snapshot);
        panel.querySelector('.rev-body').replaceChildren(changes.length ? diffList(changes) : el('p', { class: 'muted small', text: 'Sem mudanças de campo.' }),
          el('p', { class: 'muted small', text: `v${current.version} enviada ${formatDateTime(current.submitted_at)}.` }));
      }).catch(() => {});
    }
  }
}

/** Próxima ação em cada oportunidade (início e lista), na mesma gramática da empresa. */
export function enhanceOpportunities(ctx) {
  for (const article of document.querySelectorAll('#view article.opportunity')) {
    if (article.dataset.dw) continue;
    article.dataset.dw = '1';
    const row = (ctx.data.assignments || []).find((item) => `rfq-${item.rfq_id}` === article.id);
    if (!row) continue;
    article.querySelector('.opportunity-main')?.append(nextInline(opportunityNext(row)));
  }
  // "Convites recebidos" → "Convites": a mesma palavra da navegação.
  const invites = document.querySelector('#convites .card-title');
  if (invites) invites.textContent = 'Convites';
}
