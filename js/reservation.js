const ARANDU_RESERVATIONS_KEY = 'arandu.reservations.v1';

function readReservations() {
  try { const data = JSON.parse(localStorage.getItem(ARANDU_RESERVATIONS_KEY) || '[]'); return Array.isArray(data) ? data : []; } catch { return []; }
}

function writeReservations(items) {
  localStorage.setItem(ARANDU_RESERVATIONS_KEY, JSON.stringify(items.slice(-80)));
}

function reservationMessage(data) {
  return `Solicitação de reserva Arandu\n\nObra: ${data.title}\nArtista: ${data.artist}\nNome: ${data.name || 'não informado'}\nWhatsApp: ${data.whatsapp || 'não informado'}\nPrazo desejado: ${data.deadline || 'não informado'}\nObservações: ${data.notes || 'sem observações'}\nLink: ${data.url || window.location.href}`;
}

function getConfiguredWhatsappNumber() {
  return String(window.ARANDU_WHATSAPP_NUMBER || '').replace(/\D/g, '');
}

async function copyReservationFallback(message, statusTarget) {
  try {
    await navigator.clipboard.writeText(message);
    if (statusTarget) statusTarget.textContent = 'WhatsApp ainda não configurado. Solicitação copiada para envio pela página de contato.';
  } catch (_) {
    if (statusTarget) statusTarget.textContent = 'WhatsApp ainda não configurado. Use a página de contato para falar com a curadoria.';
  }
}

function openReservationModal(trigger) {
  const modal = document.querySelector('[data-reserve-modal]') || createReservationModal();
  modal.querySelector('[name="title"]').value = trigger.dataset.reserveTitle || trigger.dataset.artworkTitle || 'Obra selecionada';
  modal.querySelector('[name="artist"]').value = trigger.dataset.reserveArtist || trigger.dataset.artworkArtist || 'Artista Arandu';
  modal.querySelector('[name="url"]').value = trigger.dataset.reserveUrl || trigger.dataset.artworkUrl || window.location.href;
  modal.classList.add('is-open');
}

function createReservationModal() {
  const modal = document.createElement('div');
  modal.className = 'reserve-modal';
  modal.dataset.reserveModal = 'true';
  modal.innerHTML = `
    <form class="reserve-dialog" data-reserve-form>
      <header><div><p class="eyebrow">Reserva de obra</p><h2>Solicitar reserva</h2><p>A solicitação fica salva neste navegador e pode ser enviada por WhatsApp.</p></div><button type="button" data-reserve-close aria-label="Fechar">×</button></header>
      <input name="title" readonly />
      <input name="artist" readonly />
      <input name="name" placeholder="Seu nome" />
      <input name="whatsapp" placeholder="WhatsApp" />
      <input name="deadline" placeholder="Prazo desejado de reserva" />
      <textarea name="notes" placeholder="Observações sobre compra, entrega ou proposta"></textarea>
      <input name="url" type="hidden" />
      <div class="page-actions"><button class="button secondary" type="submit">Salvar e copiar solicitação</button><button class="button secondary" type="button" data-reserve-whatsapp>Enviar WhatsApp</button></div>
      <p data-reserve-status></p>
    </form>`;
  document.body.appendChild(modal);
  return modal;
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function saveReservation(form, copy = true) {
  const data = { id: `reservation_${Date.now()}`, createdAt: new Date().toISOString(), ...formData(form) };
  writeReservations([...readReservations(), data]);
  const message = reservationMessage(data);
  if (copy) {
    try { await navigator.clipboard.writeText(message); form.querySelector('[data-reserve-status]').textContent = 'Reserva salva e solicitação copiada.'; }
    catch { form.querySelector('[data-reserve-status]').textContent = 'Reserva salva neste navegador.'; }
  }
  return { data, message };
}

document.addEventListener('click', async (event) => {
  const reserve = event.target.closest('[data-reserve-artwork]');
  if (reserve) { event.preventDefault(); openReservationModal(reserve); return; }
  if (event.target.closest('[data-reserve-close]')) { event.preventDefault(); document.querySelector('[data-reserve-modal]')?.classList.remove('is-open'); return; }
  if (event.target.matches('[data-reserve-modal]')) event.target.classList.remove('is-open');
  const whatsapp = event.target.closest('[data-reserve-whatsapp]');
  if (whatsapp) {
    event.preventDefault();
    const form = whatsapp.closest('[data-reserve-form]');
    const { message } = await saveReservation(form, false);
    const phone = getConfiguredWhatsappNumber();
    if (!phone) {
      await copyReservationFallback(message, form.querySelector('[data-reserve-status]'));
      return;
    }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  }
});

document.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-reserve-form]');
  if (!form) return;
  event.preventDefault();
  await saveReservation(form, true);
});
