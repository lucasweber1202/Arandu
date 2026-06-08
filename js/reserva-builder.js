const RESERVATION_TOKEN_KEY = 'arandu.admin.token';
function reservationToken() { return localStorage.getItem(RESERVATION_TOKEN_KEY) || ''; }
async function reservationRequest(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', 'x-arandu-admin-token': reservationToken(), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || 'Erro ao salvar reserva.');
  return data;
}
function renderReservationBuilder() {
  const target = document.querySelector('[data-reservation-builder]');
  if (!target) return;
  target.innerHTML = `<form class="form-card" data-reservation-form><h3>Nova reserva de obra</h3><div class="grid grid-3"><input name="artwork_id" placeholder="ID da obra" required/><input name="lead_id" placeholder="ID do lead"/><input name="client_name" placeholder="Cliente"/><input name="client_email" placeholder="Email"/><input name="client_whatsapp" placeholder="WhatsApp"/><input name="reserved_until" type="datetime-local"/></div><textarea name="notes" placeholder="Condições, prazo combinado e observações"></textarea><button type="submit">Salvar reserva</button><p data-reservation-status class="selection-summary"></p></form>`;
}
async function submitReservation(form) {
  const status = form.querySelector('[data-reservation-status]');
  status.textContent = 'Salvando reserva...';
  const payload = Object.fromEntries(new FormData(form).entries());
  const result = await reservationRequest('/api/admin/operational?resource=reservations', { method: 'POST', body: JSON.stringify(payload) });
  status.textContent = `Reserva salva. ID: ${result.item?.id || 'registro criado'}`;
  form.reset();
  document.querySelector('[data-panel-refresh]')?.click();
}
document.addEventListener('click', (event) => { if (event.target.closest('[data-new-reservation]')) renderReservationBuilder(); });
document.addEventListener('submit', async (event) => { const form = event.target.closest('[data-reservation-form]'); if (!form) return; event.preventDefault(); try { await submitReservation(form); } catch (error) { form.querySelector('[data-reservation-status]').textContent = error.message; } });
