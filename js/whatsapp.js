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
  try {
    return JSON.parse(localStorage.getItem('arandu.selection.v1') || '[]');
  } catch {
    return [];
  }
}

function selectionMessage() {
  const items = getSelectionItems();
  if (!items.length) return 'Olá, Arandu. Gostaria de receber orientação da curadoria.';

  const list = items.map((item, index) => `${index + 1}. ${item.title} — ${item.artist} (${item.context})`).join('\n');
  return `Olá, Arandu. Gostaria de receber orientação sobre minha seleção:\n\n${list}\n\nMeu ambiente/orçamento é:`;
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
