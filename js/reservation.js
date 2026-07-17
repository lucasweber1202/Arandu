const ARANDU_RESERVATIONS_KEY = 'arandu.reservations.v1';
const ARANDU_RESERVATIONS_API = '/api/reservations';

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

function extractArtworkId(data) {
  if (data.artwork_id || data.artworkId || data.id) return data.artwork_id || data.artworkId || data.id;
  try {
    const url = new URL(data.url || window.location.href, window.location.origin);
    return url.searchParams.get('id') || '';
  } catch {
    return '';
  }
}

async function sendReservationToApi(data) {
  const payload = { ...data, artwork_id: extractArtworkId(data) };
  try {
    const response = await fetch(ARANDU_RESERVATIONS_API, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    return { ok: response.ok && result.ok !== false, status: response.status, result };
  } catch (error) {
    return { ok: false, status: 0, result: { error: error.message } };
  }
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
  modal.querySelector('[name="artwork_id"]').value = trigger.dataset.reserveArtwork || trigger.dataset.saveArtwork || trigger.dataset.artworkId || '';
  const status = modal.querySelector('[data-reserve-status]');
  if (status) status.textContent = '';
  modal.classList.add('is-open');
}

function createReservationModal() {
  const modal = document.createElement('div');
  modal.className = 'reserve-modal';
  modal.dataset.reserveModal = 'true';
  modal.innerHTML = `
    <form class="reserve-dialog" data-reserve-form>
      <header><div><p class="eyebrow">Reserva de obra</p><h2>Solicitar reserva</h2><p>A solicitação registra seu interesse e não confirma pagamento automaticamente. A curadoria confirma disponibilidade, condição, prazo e envio.</p></div><button type="button" data-reserve-close aria-label="Fechar">×</button></header>
      <input name="title" readonly />
      <input name="artist" readonly />
      <input name="name" placeholder="Seu nome" maxlength="160" required />
      <input name="whatsapp" placeholder="WhatsApp com DDD" maxlength="20" required />
      <input name="deadline" placeholder="Prazo desejado de reserva. Ex.: 48h" maxlength="160" />
      <textarea name="notes" maxlength="3000" placeholder="Observações sobre compra, entrega, cidade de destino ou proposta"></textarea>
      <input name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;opacity:0;pointer-events:none" />
      <input name="url" type="hidden" />
      <input name="artwork_id" type="hidden" />
      <div class="page-actions"><button class="button secondary" type="submit">Salvar solicitação</button><button class="button secondary" type="button" data-reserve-whatsapp>Enviar WhatsApp</button></div>
      <p data-reserve-status></p>
    </form>`;
  document.body.appendChild(modal);
  return modal;
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function reservationMissingFields(form) {
  const data = formData(form);
  return !String(data.name || '').trim() || !String(data.whatsapp || '').trim();
}

function showReservationValidation(form) {
  const status = form.querySelector('[data-reserve-status]');
  if (status) status.textContent = 'Preencha nome e WhatsApp para a curadoria conseguir retornar.';
}

async function saveReservation(form, copy = true) {
  if (reservationMissingFields(form)) {
    showReservationValidation(form);
    return { data: null, message: '', api: { ok: false, status: 0 } };
  }
  const data = { id: `reservation_${Date.now()}`, createdAt: new Date().toISOString(), ...formData(form) };
  const api = await sendReservationToApi(data);
  const localRecord = { ...data, api_status: api.status, api_mode: api.result?.mode || (api.ok ? 'stored' : 'local') };
  writeReservations([...readReservations(), localRecord]);
  const message = reservationMessage(data);
  const status = form.querySelector('[data-reserve-status]');
  if (copy) {
    try { await navigator.clipboard.writeText(message); } catch {}
    if (status) status.textContent = api.ok ? (api.result?.mode === 'demo' ? 'Reserva preparada e salva neste navegador. Configure o Supabase para registrar no banco.' : 'Reserva registrada para a curadoria.') : 'Reserva salva neste navegador; não foi possível registrar agora.';
  }
  return { data, message, api };
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
    if (!message) return;
    const phone = getConfiguredWhatsappNumber();
    if (!phone) { await copyReservationFallback(message, form.querySelector('[data-reserve-status]')); return; }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  }
});

document.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-reserve-form]');
  if (!form) return;
  event.preventDefault();
  await saveReservation(form, true);
});
