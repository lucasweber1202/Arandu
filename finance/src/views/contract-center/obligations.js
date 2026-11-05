// Covenants e obrigações DESTE contrato dentro do centro do contrato. Mesma
// fonte do registro de covenants (GET covenants?contract_id=, fin_obligation_monitor):
// período, prazo, estado, dados e responsável. Leitura; registrar dados, revisar
// e waivers continuam no registro de covenants, aberto já no recorte do contrato.
import { el, formatDate, daysUntil, relativeDays } from '../../core.js';
import { tag, loading, mutedText } from '../../ui.js';

const TONE = { not_due: 'neutral', due_soon: 'warning', awaiting_data: 'warning', under_review: 'info', compliant: 'success', non_compliant: 'danger', waived: 'neutral', not_applicable: 'neutral' };
const enc = encodeURIComponent;

/** Texto honesto do prazo: sem prazo não é atraso; vencido só com data. */
export function dueText(row) {
  if (!row.due_on) return 'Sem prazo registrado';
  const days = daysUntil(row.due_on);
  return days === null ? `Prazo ${formatDate(row.due_on)}` : days < 0 ? `Prazo venceu ${relativeDays(row.due_on)} (${formatDate(row.due_on)})` : `Prazo ${relativeDays(row.due_on)} (${formatDate(row.due_on)})`;
}

export function contractObligationsSection(ctx, contract, { manage = false } = {}) {
  const ledger = ctx.href(`/finance/covenants.html?${new URLSearchParams({ contract_id: contract.id, contrato: contract.id })}`);
  const head = el('div', { class: 'cc-head' }, [el('h3', { id: `obl-${contract.id}`, text: 'Covenants e obrigações' }),
    el('a', { class: 'btn btn-sm btn-ghost', href: ledger, text: manage ? 'Registrar ou revisar' : 'Abrir registro' })]);
  const box = el('section', { class: 'cc-section contract-obligations', 'aria-labelledby': `obl-${contract.id}` }, [head, loading('Carregando obrigações…')]);
  const who = (id) => !id ? 'Responsável não definido' : (ctx.members || []).find((m) => m.user_id === id)?.display_name || 'Pessoa fora da sua lista de membros';
  ctx.api(`covenants?${new URLSearchParams({ organization_id: ctx.organization.id, contract_id: contract.id })}`).then((page) => {
    const rows = page.rows || [];
    if (!rows.length) {
      box.replaceChildren(head, mutedText('Nenhum covenant ou obrigação registrado para este contrato. Ausência de registro não significa conformidade.'));
      return;
    }
    box.replaceChildren(head,
      el('ul', { class: 'milestone-list', role: 'list' }, rows.map((row) => el('li', { class: 'milestone-row', dataset: { obligation: row.id } }, [
        el('div', { class: 'milestone-main' }, [el('strong', { text: row.title || 'Obrigação' }),
          el('span', { class: 'muted small', text: [row.kind_label, dueText(row), row.has_data ? 'dados registrados' : 'dados ausentes', who(row.owner_id)].filter(Boolean).join(' · ') })]),
        row.status_label ? tag(row.status_label, TONE[row.status] || 'neutral') : null
      ]))),
      ...(page.next ? [mutedText('Há mais períodos: veja todos no registro de covenants.')] : []),
      mutedText('Estado factual do período; conformidade só após revisão humana independente.'));
  }).catch((error) => {
    box.replaceChildren(head, el('p', { class: error.status === 503 || error.status === 404 ? 'muted small' : 'callout callout-warning compact', role: error.status === 503 || error.status === 404 ? null : 'alert',
      text: error.status === 403 ? 'Seu acesso não permite ver as obrigações deste contrato.' : error.status === 503 || error.status === 404 ? 'Registro de covenants indisponível neste ambiente.' : 'Não conseguimos carregar as obrigações agora. Isso não significa que não existam.' }));
  });
  return box;
}
