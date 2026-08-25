/* ARANDU — criação de reserva pela curadoria */
(() => {
  // Antes isto chamava `/api/admin/operational?resource=reservations`, uma rota
  // que nunca existiu: o formulário sempre terminava em "Rota de API não
  // encontrada". A criação agora vai para `/api/admin`, com o mesmo portão
  // comercial que fecha a reserva pública.
  async function request(payload) {
    const response = await fetch('/api/admin', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ panel: 'reservations', ...payload })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const error = new Error(data.error || 'Não foi possível salvar a reserva.');
      error.code = data.code;
      throw error;
    }
    return data;
  }

  function render() {
    const target = document.querySelector('[data-reservation-builder]');
    if (!target) return;
    target.innerHTML = `<form class="form-card" data-reservation-form>
      <h3>Nova reserva de obra</h3>
      <div class="grid grid-3">
        <label class="u-visually-hidden" for="reserva-artwork">ID da obra</label>
        <input id="reserva-artwork" name="artwork_id" placeholder="ID da obra" required />
        <label class="u-visually-hidden" for="reserva-lead">ID do lead</label>
        <input id="reserva-lead" name="lead_id" placeholder="ID do lead" />
        <label class="u-visually-hidden" for="reserva-nome">Quem reserva</label>
        <input id="reserva-nome" name="name" placeholder="Quem reserva" required />
        <label class="u-visually-hidden" for="reserva-whatsapp">WhatsApp</label>
        <input id="reserva-whatsapp" name="whatsapp" placeholder="WhatsApp" />
        <label class="u-visually-hidden" for="reserva-prazo">Prazo combinado</label>
        <input id="reserva-prazo" name="deadline" placeholder="Prazo combinado" />
        <label class="u-visually-hidden" for="reserva-expira">Expira em</label>
        <input id="reserva-expira" name="expires_at" type="datetime-local" />
      </div>
      <label class="u-visually-hidden" for="reserva-notas">Condições e observações</label>
      <textarea id="reserva-notas" name="notes" placeholder="Condições, prazo combinado e observações"></textarea>
      <button type="submit">Salvar reserva</button>
      <p data-reservation-status class="selection-summary" role="status" aria-live="polite"></p>
    </form>`;
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-new-reservation]')) render();
  });

  document.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-reservation-form]');
    if (!form) return;
    event.preventDefault();
    const status = form.querySelector('[data-reservation-status]');
    status.textContent = 'Salvando reserva...';
    try {
      const result = await request(Object.fromEntries(new FormData(form).entries()));
      status.textContent = `Reserva salva. ID: ${result.record?.id || 'registro criado'}`;
      form.reset();
      document.querySelector('[data-panel-refresh]')?.click();
    } catch (error) {
      status.textContent = error.code === 'commercial_policy_pending' || /política comercial/i.test(error.message)
        ? `${error.message} A reserva volta a ser criável quando a política estiver aprovada.`
        : error.message;
    }
  });
})();
