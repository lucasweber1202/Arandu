// Atalhos de teclado e ajuda global (tecla ?).
//
//   G H início · G R solicitações · G A aprovações · G C contratos
//   N R nova solicitação guiada · C comentar · E editar · Esc fechar · ? ajuda
//
// Sequências com tempo curto (1,2 s) e nunca dentro de campos de texto. Ctrl/⌘+K
// e Ctrl/⌘+B continuam onde já estavam (index.js).

import { el, icon } from '../../../src/core.js';
import { tabs } from '../../../src/ui.js';

export const SHORTCUTS = Object.freeze([
  ['Navegação', [['G H', 'Início'], ['G R', 'Solicitações'], ['G A', 'Aprovações'], ['G C', 'Contratos'], ['G N', 'Notificações'], ['G I', 'Integrações']]],
  ['Ações', [['N R', 'Nova solicitação guiada'], ['C', 'Comentar no item aberto'], ['E', 'Editar o item aberto'], ['Ctrl/⌘ K', 'Central de comando'], ['Ctrl/⌘ B', 'Barra lateral']]],
  ['Geral', [['Esc', 'Fechar painel, diálogo ou resumo'], ['?', 'Esta ajuda'], ['Ctrl/⌘ Enter', 'Enviar comentário']]]
]);
const SEQUENCES = { 'g h': '/finance/dashboard.html', 'g r': '/finance/rfqs.html', 'g a': '/finance/approvals.html', 'g c': '/finance/contracts.html', 'g n': '/finance/notifications.html', 'g i': '/finance/integrations.html', 'n r': '/finance/intake.html' };

export const GLOSSARY = Object.freeze([
  ['RFQ (solicitação)', 'Pedido de proposta enviado a várias instituições ao mesmo tempo, com as mesmas informações para todas.'],
  ['CET', 'Custo Efetivo Total: taxa que inclui juros, tarifas, seguros e impostos. É o número que permite comparar custo entre propostas de crédito.'],
  ['MDR', 'Merchant Discount Rate: percentual que a adquirente cobra sobre cada venda no cartão.'],
  ['Carência', 'Período inicial em que não se paga o principal (às vezes nem os juros).'],
  ['Garantia', 'Bem ou direito oferecido para reduzir o risco do credor: recebíveis, imóveis, aval.'],
  ['Aviso prévio', 'Prazo mínimo para avisar que não vai renovar um contrato. Perder o aviso costuma renovar automaticamente.'],
  ['Revisão', 'Nova versão da solicitação. Propostas feitas sobre a versão anterior ficam marcadas como desatualizadas.'],
  ['Política de aprovação', 'Regras que definem quem aprova cada decisão e em que ordem. Versionada: processos em andamento não mudam de regra.']
]);
export const CONCEPTS = Object.freeze([
  ['Próxima ação', 'Cada objeto mostra estado, o que fazer agora, por quê, prazo e responsável.'],
  ['Precisa de você', 'O que depende de você, com quem está esperando e o que fica travado.'],
  ['Comparação factual', 'O Arandu organiza os fatos das propostas. Não recomenda instituição nem aponta vencedor.'],
  ['Escopo do comentário', 'Interno: só a empresa lê. Visível ao provedor: a empresa e aquele provedor — nunca os outros.'],
  ['Sincronização', 'Ações aparecem na hora e sobem em segundo plano. Offline, entram numa fila e sobem ao reconectar.']
]);
export const DEMO_LIMITS = Object.freeze([
  'Todos os dados são fictícios e ficam neste navegador. Restaurar a demonstração volta ao conjunto inicial.',
  'Integrações (Slack, Teams, ERPs, WorkOS, Pluggy, Belvo, PostHog, Drive, OneDrive) são simuladas: nenhum serviço externo é chamado e nenhuma credencial é pedida.',
  'Open Finance usa dados simulados. Nenhum banco real é acessado.',
  'Presença de outras pessoas é derivada dos dados do processo, ou real entre abas deste navegador.',
  'O Arandu não recomenda instituições, não aponta vencedor e não tem IA gerando resumos.',
  'Nenhum dinheiro é movimentado. Nada aqui altera o produto em piloto ou produção.'
]);

const typing = (target) => target?.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""]');
const openDialog = () => document.querySelector('dialog[open]');

export function openHelp() {
  document.getElementById('help-dialog')?.remove();
  const dialog = el('dialog', { id: 'help-dialog', class: 'help-dialog', 'aria-labelledby': 'help-title' });
  const kbd = (combo) => combo.split(' ').map((key) => el('kbd', { class: 'kbd', text: key }));
  const set = tabs([
    { id: 'atalhos', label: 'Atalhos', render: () => el('div', { class: 'help-grid' }, SHORTCUTS.map(([group, rows]) => el('section', {}, [el('h3', { class: 'help-h', text: group }),
      el('dl', { class: 'help-keys' }, rows.flatMap(([combo, label]) => [el('dt', {}, kbd(combo)), el('dd', { text: label })]))]))) },
    { id: 'conceitos', label: 'Conceitos', render: () => el('dl', { class: 'help-defs' }, CONCEPTS.flatMap(([term, text]) => [el('dt', { text: term }), el('dd', { text })])) },
    { id: 'glossario', label: 'Glossário', render: () => el('dl', { class: 'help-defs', id: 'help-glossary' }, GLOSSARY.flatMap(([term, text]) => [el('dt', { text: term }), el('dd', { text })])) },
    { id: 'limites', label: 'Limites da demo', render: () => el('ul', { class: 'help-limits' }, DEMO_LIMITS.map((text) => el('li', {}, [icon('info', { size: 14 }), el('span', { text })]))) }
  ], { label: 'Seções da ajuda', initial: 'atalhos' });
  dialog.append(el('div', { class: 'help-head' }, [el('h2', { id: 'help-title', text: 'Ajuda' }), el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Fechar ajuda', onclick: () => dialog.close() }, icon('x'))]), set.node);
  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

let installed = false;
export function installShortcuts(ctx, { go, announce = () => {} } = {}) {
  if (installed) return;
  installed = true;
  let pending = null;
  let timer = null;
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || typing(event.target)) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (key === '?' || (event.shiftKey && event.key === '/')) {
      if (openDialog()) return;
      event.preventDefault();
      openHelp();
      return;
    }
    if (openDialog()) return;
    if (pending) {
      const target = SEQUENCES[`${pending} ${key}`];
      pending = null;
      clearTimeout(timer);
      if (target) { event.preventDefault(); go(target); }
      return;
    }
    if (key === 'g' || key === 'n') {
      pending = key;
      announce(key === 'g' ? 'Ir para: H início, R solicitações, A aprovações, C contratos.' : 'Nova: R solicitação.');
      timer = setTimeout(() => { pending = null; }, 1200);
      return;
    }
    if (key === 'c') {
      const box = document.querySelector('#view .cthread-input, .dw-inspector .cthread-input, #collaboration textarea, .inbox-context .cthread-input');
      if (box) { event.preventDefault(); box.scrollIntoView({ block: 'center' }); box.focus(); }
      return;
    }
    if (key === 'e') {
      const edit = document.querySelector('[data-shortcut="edit"], #view a[href*="edit"], #view .page-actions a[href*="new-rfq"]');
      if (edit) { event.preventDefault(); edit.click(); }
    }
  });
}
