/*
  ARANDU — Integração WhatsApp estática

  Não depende de backend. Gera links wa.me com mensagens pré-preenchidas quando há número configurado.
  Para ativar em produção, preencha window.ARANDU_WHATSAPP_NUMBER em data/whatsapp-config.js.
*/

function getAranduWhatsappNumber() {
  return String(window.ARANDU_WHATSAPP_NUMBER || '').replace(/\D/g, '');
}

function buildWhatsappUrl(message) {
  const number = getAranduWhatsappNumber();
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : '';
}

async function fallbackContact(message) {
  try {
    await navigator.clipboard.writeText(message);
    alert('Mensagem copiada. Envie para a curadoria pela página de contato.');
  } catch (_) {
    alert('WhatsApp ainda não configurado. Use a página de contato para falar com a curadoria.');
  }
  window.location.href = 'contato.html';
}

function getSelectionItems() {
  try { const data = JSON.parse(localStorage.getItem('arandu.selection.v1') || '[]'); return Array.isArray(data) ? data : []; } catch { return []; }
}

function getSelectionBriefing() {
  try { return JSON.parse(localStorage.getItem('arandu.selection.briefing.v1') || '{}'); } catch { return {}; }
}

function briefingMessage() {
  const briefing = getSelectionBriefing();
  const labels = { ambiente: 'Ambiente', orcamento: 'Orçamento', prazo: 'Prazo', dimensao: 'Dimensão/parede', sensacao: 'Sensação desejada', uso: 'Uso do espaço', observacoes: 'Observações' };
  const lines = Object.entries(labels).map(([key, label]) => briefing[key] ? `${label}: ${briefing[key]}` : '').filter(Boolean);
  return lines.length ? lines.join('\n') : 'Contexto ainda não preenchido.';
}

function selectionMessage() {
  const items = getSelectionItems();
  const list = items.length ? items.map((item, index) => `${index + 1}. ${item.title} — ${item.artist} (${item.context})${item.note ? `\n   Obs.: ${item.note}` : ''}`).join('\n') : 'Ainda não salvei obras.';
  return `Olá, Arandu. Gostaria de receber orientação da curadoria.\n\nBriefing:\n${briefingMessage()}\n\nMinha seleção:\n${list}`;
}

function proposalMessage() {
  if (typeof window.ARANDU_BUILD_PROPOSAL_MESSAGE === 'function') return window.ARANDU_BUILD_PROPOSAL_MESSAGE();
  return 'Olá, Arandu. Gostaria de revisar uma proposta curatorial para empresa, clínica ou espaço institucional.';
}

document.addEventListener('click', async (event) => {
  const whatsapp = event.target.closest('[data-whatsapp]');
  if (!whatsapp) return;
  event.preventDefault();
  const type = whatsapp.dataset.whatsapp;
  const custom = whatsapp.dataset.message;
  const message = type === 'selection' ? selectionMessage() : type === 'proposal' ? proposalMessage() : (custom || 'Olá, Arandu. Gostaria de falar com a curadoria.');
  const url = buildWhatsappUrl(message);
  if (!url) {
    await fallbackContact(message);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
});
