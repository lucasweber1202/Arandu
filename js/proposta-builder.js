/* ARANDU — criação de proposta curatorial pela curadoria */
(() => {
  // Mesma correção da reserva: `/api/admin/operational?resource=proposals` não
  // existia e o formulário nunca gravou nada.
  async function request(payload) {
    const response = await fetch('/api/admin', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ panel: 'proposals', ...payload })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const error = new Error(data.error || 'Não foi possível salvar a proposta.');
      error.code = data.code;
      throw error;
    }
    return data;
  }

  function render() {
    const target = document.querySelector('[data-proposal-builder]');
    if (!target) return;
    target.innerHTML = `<form class="form-card" data-proposal-form>
      <h3>Nova proposta curatorial</h3>
      <div class="grid grid-3">
        <label class="u-visually-hidden" for="proposta-objetivo">Objetivo da proposta</label>
        <input id="proposta-objetivo" name="goal" placeholder="Objetivo da proposta" required />
        <label class="u-visually-hidden" for="proposta-cliente">Cliente</label>
        <input id="proposta-cliente" name="client" placeholder="Cliente" required />
        <label class="u-visually-hidden" for="proposta-espaco">Espaço ou empresa</label>
        <input id="proposta-espaco" name="space" placeholder="Espaço ou empresa" />
        <label class="u-visually-hidden" for="proposta-lead">ID do lead</label>
        <input id="proposta-lead" name="lead_id" placeholder="ID do lead" />
        <label class="u-visually-hidden" for="proposta-total">Valor total estimado</label>
        <input id="proposta-total" name="total" placeholder="Valor total estimado" inputmode="decimal" />
        <label class="u-visually-hidden" for="proposta-prazo">Válida até</label>
        <input id="proposta-prazo" name="deadline" placeholder="Válida até" />
      </div>
      <label class="u-visually-hidden" for="proposta-notas">Resumo da seleção e condições</label>
      <textarea id="proposta-notas" name="notes" placeholder="Resumo da seleção, condições, logística e observações curatoriais"></textarea>
      <button type="submit">Salvar proposta</button>
      <p data-proposal-status class="selection-summary" role="status" aria-live="polite"></p>
    </form>`;
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-new-proposal]')) render();
  });

  document.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-proposal-form]');
    if (!form) return;
    event.preventDefault();
    const status = form.querySelector('[data-proposal-status]');
    status.textContent = 'Salvando proposta...';
    try {
      const result = await request(Object.fromEntries(new FormData(form).entries()));
      status.textContent = `Proposta salva. ID: ${result.record?.id || 'registro criado'}`;
      form.reset();
      document.querySelector('[data-panel-refresh]')?.click();
    } catch (error) {
      status.textContent = error.code === 'commercial_policy_pending' || /política comercial/i.test(error.message)
        ? `${error.message} A proposta volta a ser criável quando a política estiver aprovada.`
        : error.message;
    }
  });
})();
