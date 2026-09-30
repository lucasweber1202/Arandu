// Uso da demonstração (/finance/usage.html) — visão de administração.
//
//   Funil da sessão · Linha do tempo · Auditoria (quem · o quê · quando · objeto · origem)
//   Feature flags · Desempenho (medições locais × orçamento) · Dados locais
//
// Tudo local: nenhum evento sai do navegador (nada de PostHog real).

import { el, icon, timeAgo, formatDateTime } from '../../../src/core.js';
import { button, card, emptyState, toast, confirmDialog } from '../../../src/ui.js';
import { readOS, subscribeOS, resetOS } from '../platform/os-store.js';
import { ORIGINS } from '../platform/bus.js';
import { FLAGS, flag, setFlag, funnel, perfSummary, PERF_BUDGETS } from '../platform/telemetry.js';
import { cacheStats, clearCache } from '../platform/local-first.js';
import { openConflict } from '../platform/conflict.js';

const TYPE_LABELS = {
  'approval.approved': 'Aprovou', 'approval.rejected': 'Rejeitou', 'approval.changes_requested': 'Pediu alterações', 'approval.opened': 'Abriu a decisão', 'comment.created': 'Comentou', 'comment.resolved': 'Atualizou comentário',
  'mention.created': 'Mencionou', 'integration.connected': 'Conectou integração', 'integration.disconnected': 'Desconectou integração', 'integration.synced': 'Sincronizou integração', 'directory.imported': 'Importou diretório',
  'erp.imported': 'Importou do ERP', 'financial_profile.updated': 'Atualizou perfil financeiro', 'policy.published': 'Publicou política', 'sync.conflict': 'Conflito de edição', 'sync.conflict_resolved': 'Resolveu conflito',
  'contract.erp_prepared': 'Preparou registro no ERP', 'flag.changed': 'Alterou feature flag', 'rfq.updated': 'Editou solicitação', 'contract.created': 'Registrou contrato'
};
export const auditRows = (audit, origin = 'all') => audit.filter((row) => origin === 'all' || row.origin === origin).slice().reverse();

export async function usagePage(ctx) {
  ctx.header({ title: 'Uso da demonstração', subtitle: 'Funil, linha do tempo, auditoria, feature flags e desempenho — medidos neste navegador, sem enviar nada.' });
  if (!ctx.can('admin')) return emptyState({ title: 'Visão de administração', text: 'Troque para a persona Administração (Helena Prado) para ver o uso, a auditoria e as feature flags.', iconName: 'lock' });
  const root = el('div', { class: 'usage' });
  let origin = 'all';
  const draw = () => {
    const os = readOS();
    const steps = funnel();
    const max = Math.max(1, ...steps.map((step) => step.count));
    const funnelCard = card({ title: 'Funil da demonstração', subtitle: 'Eventos locais desta sessão/navegador.', id: 'usage-funnel', headingLevel: 2, body: el('ol', { class: 'funnel' }, steps.map((step) => el('li', { class: 'funnel-step' }, [
      el('span', { class: 'funnel-label', text: step.label }), el('span', { class: 'funnel-bar', 'aria-hidden': 'true' }, el('span', { style: `width:${Math.round((step.count / max) * 100)}%` })), el('span', { class: 'funnel-n num', text: String(step.count) })]))) });
    const timelineCard = card({ title: 'Linha do tempo da sessão', headingLevel: 2, id: 'usage-session', body: os.session.length ? el('ol', { class: 'usage-session' }, os.session.slice().reverse().slice(0, 25).map((row) => el('li', {}, [
      el('time', { datetime: row.at, title: formatDateTime(row.at), text: timeAgo(row.at) }), el('span', { text: ` ${row.persona ? `${row.persona} · ` : ''}${row.text}` })]))) : emptyState({ title: 'Nada registrado ainda', compact: true }) });

    const originFilter = el('div', { class: 'seg', role: 'group', 'aria-label': 'Filtrar por origem' }, [['all', 'Todas'], ...Object.entries(ORIGINS)].map(([value, label]) => el('button', { type: 'button', class: 'seg-item', 'aria-pressed': String(value === origin), onclick: () => { origin = value; draw(); }, text: label })));
    const rows = auditRows(os.audit, origin).slice(0, 60);
    const auditCard = card({ title: 'Auditoria', subtitle: 'Quem · fez o quê · quando · objeto · origem.', headingLevel: 2, id: 'audit-log', body: [originFilter, rows.length ? el('table', { class: 'int-table audit-table' }, [
      el('thead', {}, el('tr', {}, ['Quem', 'Fez o quê', 'Quando', 'Objeto', 'Origem'].map((label) => el('th', { scope: 'col', text: label })))),
      el('tbody', {}, rows.map((row) => el('tr', { dataset: { origin: row.origin } }, [el('td', { text: row.actor?.name || 'Arandu (automático)' }), el('td', { text: TYPE_LABELS[row.type] || row.type }),
        el('td', {}, el('time', { datetime: row.at, title: formatDateTime(row.at), text: timeAgo(row.at) })), el('td', { text: row.object?.title || '—' }), el('td', {}, el('span', { class: `tag origin-${row.origin}`, text: ORIGINS[row.origin] || row.origin }))])))
    ]) : emptyState({ title: 'Nada com esta origem', text: 'Conecte uma integração ou abra uma aprovação pela prévia do Slack para ver outras origens.', compact: true })] });

    const flagsCard = card({ title: 'Feature flags', subtitle: 'Liga e desliga peças da demonstração neste navegador.', headingLevel: 2, id: 'usage-flags', body: el('ul', { class: 'flags', role: 'list' }, Object.entries(FLAGS).map(([key, meta]) => {
      const input = el('input', { type: 'checkbox', role: 'switch', checked: flag(key), id: `flag-${key}` });
      input.addEventListener('change', () => { setFlag(key, input.checked); toast(`${meta.label}: ${input.checked ? 'ligado' : 'desligado'}.`); });
      return el('li', { class: 'flag' }, [el('label', { for: `flag-${key}` }, [input, el('strong', { text: ` ${meta.label}` })]), el('p', { class: 'muted', text: meta.text })]);
    })) });

    const perf = perfSummary();
    const stats = cacheStats();
    const perfCard = card({ title: 'Desempenho', subtitle: 'Medições locais (mediana e p95, em ms) contra o orçamento.', headingLevel: 2, id: 'usage-perf', body: [
      perf.length ? el('table', { class: 'int-table perf-table' }, [el('thead', {}, el('tr', {}, ['Medida', 'Amostras', 'Mediana', 'p95', 'Orçamento', ''].map((label) => el('th', { scope: 'col', text: label })))),
        el('tbody', {}, perf.map((row) => { const budget = PERF_BUDGETS[row.name]; const ok = !budget || row.p95 <= budget;
          return el('tr', {}, [el('th', { scope: 'row', text: row.name }), el('td', { class: 'num', text: String(row.count) }), el('td', { class: 'num', text: String(row.median) }), el('td', { class: 'num', text: String(row.p95) }), el('td', { class: 'num', text: budget ? String(budget) : '—' }),
            el('td', {}, el('span', { class: `tag ${ok ? 'tag-success' : 'tag-warning'}`, text: ok ? 'Dentro' : 'Acima' }))]); }))]) : el('p', { class: 'muted', text: 'Navegue pela demo para gerar medições.' }),
      el('p', { class: 'muted', id: 'usage-cache', text: `Cache local-first: ${stats.entries} respostas · ${stats.hits} acertos · ${stats.revalidations} revalidações.` }),
      el('div', { class: 'usage-actions' }, [
        button('Limpar cache', { size: 'sm', iconName: 'refresh', onClick: () => { clearCache(); toast('Cache local limpo. A próxima leitura vem do motor.'); draw(); } }),
        button('Simular conflito de edição', { size: 'sm', iconName: 'alert', attrs: { id: 'usage-conflict' }, onClick: () => openConflict(ctx) }),
        button('Restaurar dados do Work OS', { size: 'sm', variant: 'ghost', iconName: 'x', onClick: async () => {
          if (!await confirmDialog({ title: 'Restaurar dados do Work OS?', description: 'Apaga integrações, comentários, notificações locais, políticas editadas, analytics e auditoria desta demonstração. Os dados financeiros do motor não mudam.', confirmLabel: 'Restaurar', tone: 'danger' })) return;
          resetOS(); toast('Dados do Work OS restaurados.');
        } })
      ])
    ] });
    root.replaceChildren(el('div', { class: 'usage-grid' }, [funnelCard, timelineCard]), auditCard, el('div', { class: 'usage-grid' }, [flagsCard, perfCard]));
  };
  const off = subscribeOS(() => { if (root.dataset.mounted && !root.isConnected) { off(); return; } if (root.isConnected) root.dataset.mounted = '1'; if (!root.contains(document.activeElement) || !document.activeElement.matches('input')) draw(); });
  draw();
  return root;
}
