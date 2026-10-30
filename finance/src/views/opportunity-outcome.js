// Radar-to-Action: resultado de uma oportunidade que gerou renegociação.
// Lê GET opportunities/outcome (processo, decisão, contrato resultante e
// conclusão registrada) e conclui só com confirmação humana explícita,
// vinculada a uma decisão já registrada. Nada é concluído automaticamente.
import { el, formatDateTime, RFQ_STATUS } from '../core.js';
import { button, promptDialog, toast } from '../ui.js';

const MISSING = { human_decision_not_recorded: 'Decisão humana ainda não registrada.', resulting_contract_not_recorded: 'Contrato resultante ainda não registrado.' };
const ABSENCE = {
  no_linked_negotiation: 'Este sinal não está ligado a uma negociação. Use as ações de revisão do sinal; nenhuma solicitação é criada automaticamente.',
  linked_negotiation_unavailable: 'A negociação ligada a este sinal não está disponível no seu acesso.'
};
const COMPLETABLE = ['acknowledged', 'under_review'];

export function opportunityOutcome(ctx, id, { manage = false, onDone = null } = {}) {
  const root = el('section', { class: 'stack opportunity-outcome', id: 'opportunity-outcome', 'aria-labelledby': 'opp-outcome-title' },
    [el('h3', { id: 'opp-outcome-title', text: 'Resultado da negociação ligada a este sinal' }), el('p', { class: 'muted small', role: 'status', text: 'Consultando o resultado registrado…' })]);
  const load = () => ctx.api(`opportunities/outcome?id=${encodeURIComponent(id)}`);
  const render = (out) => {
    const { opportunity = {}, processes = [], completion = [], absence = null } = out;
    const decisions = processes.flatMap((p) => (p.decisions || []).map((d) => ({ ...d, rfq: p.rfq })));
    const done = completion.at(-1) || null;
    const parts = [el('h3', { id: 'opp-outcome-title', text: 'Resultado da negociação ligada a este sinal' })];
    if (absence) parts.push(el('p', { class: 'callout callout-info compact', role: 'note', text: ABSENCE[absence] || 'Sem negociação registrada para este sinal.' }));
    for (const p of processes) parts.push(el('div', { class: 'stack', dataset: { process: p.rfq?.id || '' } }, [
      el('p', {}, [el('a', { href: ctx.href(p.rfq?.href || `/finance/rfq.html?id=${encodeURIComponent(p.rfq?.id || '')}`), text: p.rfq?.title || 'Solicitação ligada' }),
        el('span', { class: 'muted small', text: ` · ${RFQ_STATUS[p.rfq?.status]?.label || 'Estado não informado'} · ${(p.proposals || []).length} pelo portal, ${(p.external_proposals || []).length} registradas pela empresa (canal externo)` })]),
      ...(p.decisions || []).map((d) => el('p', { class: 'small', text: `Decisão humana registrada em ${formatDateTime(d.decided_at)}${d.rationale ? `: ${d.rationale}` : '.'}` })),
      ...(p.resulting_contracts || []).map((c) => el('p', { class: 'small' }, [el('span', { text: 'Contrato resultante: ' }), el('a', { href: ctx.href(c.href), text: c.title || 'Abrir contrato' })])),
      ...(p.missing || []).map((code) => el('p', { class: 'muted small', dataset: { missing: code }, text: MISSING[code] || 'Etapa sem registro.' }))
    ]));
    if (done) parts.push(el('p', { class: 'callout callout-success compact', role: 'status', dataset: { completed: 'true' }, text: `Conclusão registrada em ${formatDateTime(done.happened_at)}, vinculada à decisão humana${done.metadata?.decision_id ? ' desta negociação' : ''}.` }));
    else if (COMPLETABLE.includes(opportunity.status) && decisions.length && manage) {
      const decision = decisions.at(-1);
      parts.push(button('Concluir sinal com a decisão registrada', { size: 'sm', variant: 'primary', onClick: () => complete(opportunity, decision) }));
    } else if (!absence && !decisions.length) parts.push(el('p', { class: 'muted small', text: 'O sinal só pode ser concluído por esta via depois que uma pessoa registrar a decisão da negociação.' }));
    else if (decisions.length && !COMPLETABLE.includes(opportunity.status)) parts.push(el('p', { class: 'muted small', text: 'Para concluir pela decisão, o sinal precisa estar "Ciente" ou "Em revisão".' }));
    root.replaceChildren(...parts);
  };
  let busy = false;
  async function complete(opportunity, decision) {
    if (busy) return;
    const resolution = await promptDialog({ title: 'Concluir o sinal com esta decisão?', confirmLabel: 'Registrar conclusão', minLength: 3,
      description: `A conclusão fica vinculada à decisão humana registrada em ${formatDateTime(decision.decided_at)} na solicitação "${decision.rfq?.title || 'ligada'}". Não aprova, não decide e não contrata nada.`,
      label: 'O que foi feito (fica no histórico)', placeholder: 'Ex.: renegociação concluída com nova condição registrada' });
    if (!resolution) return;
    busy = true;
    try {
      const out = await ctx.api('opportunities/complete-negotiation', { method: 'POST', body: JSON.stringify({ opportunity_id: id, decision_id: decision.id, expected_status: opportunity.status, confirmed: true, resolution }) });
      toast(out.replayed ? 'Esta conclusão já estava registrada.' : 'Conclusão registrada.');
      render(await load()); onDone?.();
    } catch (error) {
      // Resposta incerta: consultar o resultado antes de qualquer nova tentativa.
      try {
        const fresh = await load(); render(fresh);
        toast((fresh.completion || []).length ? 'A conclusão foi registrada (confirmado no servidor).' : `${error.message || 'Conclusão não registrada.'} Nada foi gravado; confira e tente de novo.`, (fresh.completion || []).length ? 'success' : 'error');
      } catch { toast('Não foi possível confirmar se a conclusão foi registrada. Recarregue antes de tentar de novo.', 'error'); }
    } finally { busy = false; }
  }
  load().then(render).catch((error) => root.replaceChildren(el('h3', { id: 'opp-outcome-title', text: 'Resultado da negociação ligada a este sinal' }),
    el('p', { class: 'muted small', role: 'status', text: error.status === 404 ? 'Sinal indisponível no seu acesso.' : 'Não foi possível consultar o resultado agora.' })));
  return root;
}
