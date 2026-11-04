/* global __ARANDU_DEMO__ */
// Aba Comparação: matriz do motor canônico, pesos do comprador e prontidão. Carregada ao abrir a aba.
// Extraído de views/rfq.js (v7.0).

import { el, icon } from '../../core.js';
import { button, errorState, loading } from '../../ui.js';
import { comparisonMatrix, weightsPanel } from '../shared/comparison.js';
import { exportProcess } from './export.js';

export function comparisonTab(ctx, rfq, decision = null) {
  const proposals = rfq.proposals || [];
  const wrap = el('div', { class: 'stack' });
  const matrix = el('div', {}, loading('Carregando comparação…'));
  const weightsSlot = el('div');
  const fetchComparison = async (weights = {}) => ctx.send('comparison', { rfq_id: rfq.id, weights });
  const load = () => {
    matrix.replaceChildren(loading('Carregando comparação…'));
    fetchComparison().then(({ comparison }) => {
      matrix.replaceChildren(comparisonMatrix(rfq, proposals, { model: comparison }));
      // Com propostas externas conferidas, o servidor pode comparar mais colunas
      // que as do portal: os pesos (mesmo motor, via servidor) ficam disponíveis.
      if (proposals.length <= 1 && (comparison?.columns?.length || 0) > 1 && !weightsSlot.childElementCount) weightsSlot.append(panel());
    })
      .catch(() => matrix.replaceChildren(errorState({ title: 'Comparação indisponível', error: 'As condições não puderam ser consultadas. Tente novamente.', onRetry: load })));
  };
  if ((__ARANDU_DEMO__ && ctx.mode === 'demo')) matrix.replaceChildren(comparisonMatrix(rfq, proposals));
  else load();
  // Coleta aberta: a matriz é parcial. Diz quantas convidadas responderam, sem
  // tratar quem ainda não enviou como pior nem antecipar o resultado.
  if (['open', 'collecting'].includes(rfq.status)) {
    const invited = new Set([...(rfq.invites || []).filter((invite) => ['invited', 'accepted'].includes(invite.status)).map((invite) => invite.provider_id), ...proposals.map((proposal) => proposal.provider_id)]);
    const answered = new Set(proposals.map((proposal) => proposal.provider_id)).size;
    wrap.append(el('p', { class: 'callout callout-info compact', id: 'comparison-partial', role: 'note' }, [icon('info', { size: 14 }), el('span', { text:
      `Coleta em andamento: ${answered} de ${invited.size} ${invited.size === 1 ? 'instituição convidada enviou' : 'instituições convidadas enviaram'} proposta. Respostas ainda podem chegar ou ganhar nova versão até o encerramento da coleta${answered === 1 ? '; com uma só proposta não há comparação lado a lado' : ''}.` })]));
  }
  if (!__ARANDU_DEMO__ && !(__ARANDU_DEMO__ && ctx.mode === 'demo')) {
    const ready = el('div');
    wrap.append(ready);
    import('../negotiation-board.js').then((m) => { if (ready.parentNode) ready.replaceWith(m.readinessSection(ctx, rfq)); }).catch(() => ready.remove());
  }
  wrap.append(matrix);
  // Processo já decidido: a conta abre com os pesos que a empresa registrou na decisão.
  const recorded = ctx.weights[rfq.id] ? null : decision?.criteria?.weights;
  const panel = () => weightsPanel(rfq, proposals, { initial: ctx.weights[rfq.id] || recorded,
    initialNote: recorded && Object.keys(recorded).length ? 'Pesos registrados na decisão desta solicitação.' : null,
    onApplied: (weights) => { ctx.weights[rfq.id] = weights; },
    calculate: (__ARANDU_DEMO__ && ctx.mode === 'demo') ? null : async weights => (await fetchComparison(weights)).weighted });
  if (proposals.length > 1) wrap.append(panel());
  else wrap.append(weightsSlot);
  if (proposals.length) {
    ctx.send('signals', { organization_id: ctx.organization.id, event: 'comparison_viewed', entity_type: 'rfq', entity_id: rfq.id }).catch(() => {});
    wrap.append(el('div', { class: 'row-actions' }, [button('Exportar processo (JSON)', { size: 'sm', iconName: 'download', attrs: { id: 'export-rfq' }, onClick: () => exportProcess(ctx, rfq) }),
      el('span', { class: 'muted small', text: 'Registro factual: demanda, propostas, critérios e decisão, com datas. Sem recomendação.' })]));
  }
  return wrap;
}
