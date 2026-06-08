/*
  ARANDU — Integração WhatsApp estática

  Não depende de backend. Gera links wa.me com mensagens pré-preenchidas.
  Para ativar em produção, preencha o número em data/whatsapp-config.js ou edite ARANDU_WHATSAPP_NUMBER.
*/

const ARANDU_WHATSAPP_NUMBER = window.ARANDU_WHATSAPP_NUMBER || '5500000000000';

function buildWhatsappUrl(message) {
  return `https://wa.me/${ARANDU_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
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

document.addEventListener('click', (event) => {
  const whatsapp = event.target.closest('[data-whatsapp]');
  if (!whatsapp) return;
  event.preventDefault();
  const type = whatsapp.dataset.whatsapp;
  const custom = whatsapp.dataset.message;
  const message = type === 'selection' ? selectionMessage() : (custom || 'Olá, Arandu. Gostaria de falar com a curadoria.');
  window.open(buildWhatsappUrl(message), '_blank', 'noopener,noreferrer');
});
