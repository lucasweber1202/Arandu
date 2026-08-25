/* ARANDU — o que a compra realmente oferece hoje */
(() => {
  // A beta declara que compra e reserva não estão abertas, e o servidor recusa
  // `/api/reservations` e `/api/proposals` de forma fechada. Mesmo assim cada
  // cartão de obra, a página da obra e a seleção ofereciam "Reservar com
  // curadoria": quem clicava recebia um erro de política comercial no fim do
  // formulário. O estado vem do build (mesma variável do aviso de beta), então
  // não há requisição extra nem troca de rótulo depois que a página aparece.
  const ready = document.querySelector('meta[name="arandu-commercial-ready"]')?.content === 'true';
  if (ready) return;

  const NOTE = 'A reserva abre quando a política comercial for aprovada. Até lá, a conversa começa pela curadoria.';

  function replaceReserveControl(control) {
    if (control.dataset.commerceReplaced === 'true') return;
    const title = control.dataset.reserveTitle || '';
    const link = document.createElement('a');
    link.className = control.className || 'cta secondary';
    link.dataset.commerceReplaced = 'true';
    link.href = title ? `contato.html?obra=${encodeURIComponent(title.slice(0, 120))}` : 'contato.html';
    link.textContent = 'Falar com a curadoria';
    link.title = NOTE;
    control.replaceWith(link);
  }

  function apply() {
    document.querySelectorAll('[data-reserve-artwork]').forEach(replaceReserveControl);
    // A caixa de reserva da página da obra prometia um fluxo que não existe.
    document.querySelectorAll('.trust-note').forEach((note) => {
      if (/reserva abre conversa/i.test(note.textContent || '')) note.textContent = NOTE;
    });
  }

  // Os cartões de obra são desenhados depois que o catálogo responde, então a
  // troca precisa acompanhar o DOM em vez de rodar uma vez só.
  apply();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  new MutationObserver(apply).observe(document.documentElement, { childList: true, subtree: true });
})();
