(() => {
  const state = { items: [] };
  const $ = (selector) => document.querySelector(selector);

  function esc(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function money(value, currency = 'BRL') {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(number); }
    catch { return `${currency} ${number.toFixed(2)}`; }
  }

  function date(value) {
    if (!value) return '—';
    try { return new Date(value).toLocaleString('pt-BR'); } catch { return '—'; }
  }

  function status(message, error = false) {
    const node = $('[data-orders-status]');
    if (!node) return;
    node.textContent = message;
    node.style.color = error ? '#7b1f17' : '';
  }

  function filtered() {
    const q = ($('[data-order-search]')?.value || '').trim().toLowerCase();
    const orderStatus = $('[data-order-status]')?.value || '';
    const paymentStatus = $('[data-payment-status]')?.value || '';
    const fulfillmentStatus = $('[data-fulfillment-status]')?.value || '';
    return state.items.filter((item) => {
      if (orderStatus && item.status !== orderStatus) return false;
      if (paymentStatus && item.payment_status !== paymentStatus) return false;
      if (fulfillmentStatus && item.fulfillment_status !== fulfillmentStatus) return false;
      if (!q) return true;
      return JSON.stringify([
        item.order_number,
        item.artwork_id,
        item.artist_id,
        item.tracking_code,
        item.shipping_provider,
        item.request_id
      ]).toLowerCase().includes(q);
    });
  }

  function options(values, selected) {
    return values.map((value) => `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(value)}</option>`).join('');
  }

  function render() {
    const target = $('[data-orders-list]');
    if (!target) return;
    const items = filtered();
    if (!items.length) {
      target.innerHTML = '<article class="card"><h3>Nenhum pedido encontrado</h3><p>Ajuste os filtros ou atualize a consulta.</p></article>';
      status(`${state.items.length} pedido(s) carregado(s).`);
      return;
    }
    target.innerHTML = items.map((order) => `<article class="order-card" data-order-id="${esc(order.id)}">
      <div class="order-actions"><span class="tag">${esc(order.status)}</span><strong>${esc(order.order_number || order.id)}</strong><span>${esc(money(order.price_snapshot, order.currency))}</span></div>
      <div class="order-meta">
        <p><small>Obra</small>${esc(order.artwork_id || '—')}</p>
        <p><small>Artista</small>${esc(order.artist_id || '—')}</p>
        <p><small>Reserva</small>${esc(order.reservation_id || '—')}</p>
        <p><small>Criado</small>${esc(date(order.created_at))}</p>
        <p><small>Pagamento</small>${esc(order.payment_status || '—')}</p>
        <p><small>Logística</small>${esc(order.fulfillment_status || '—')}</p>
        <p><small>Certificado</small>${esc(order.certificate_status || '—')}</p>
        <p><small>Request ID</small><span class="order-request">${esc(order.request_id || '—')}</span></p>
      </div>
      <form class="order-form" data-order-form>
        <select name="status" aria-label="Status do pedido">${options(['created','confirmed','completed','cancelled'], order.status)}</select>
        <select name="payment_status" aria-label="Status do pagamento">${options(['pending','awaiting_confirmation','paid','refunded','failed','cancelled'], order.payment_status)}</select>
        <select name="fulfillment_status" aria-label="Status logístico">${options(['pending','packing','shipped','delivered','returned','cancelled'], order.fulfillment_status)}</select>
        <select name="certificate_status" aria-label="Status do certificado">${options(['pending','ready','issued','not_applicable'], order.certificate_status)}</select>
        <input name="shipping_provider" value="${esc(order.shipping_provider || '')}" placeholder="Transportadora"/>
        <input name="tracking_code" value="${esc(order.tracking_code || '')}" placeholder="Código de rastreio"/>
        <textarea name="justification" required minlength="8" placeholder="Justificativa operacional obrigatória"></textarea>
        <div class="order-actions"><button class="button" type="submit">Aplicar transição</button><span data-order-result></span></div>
      </form>
    </article>`).join('');
    status(`${items.length} de ${state.items.length} pedido(s) exibido(s).`);
  }

  async function request(path, options = {}) {
    const response = await fetch(path, {
      credentials: 'include',
      cache: 'no-store',
      ...options,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || `Falha HTTP ${response.status}`);
    return data;
  }

  async function load() {
    status('Carregando pedidos…');
    try {
      const data = await request('/api/orders');
      state.items = Array.isArray(data.items) ? data.items : [];
      render();
    } catch (error) {
      state.items = [];
      render();
      status(`Não foi possível carregar pedidos: ${error.message}`, true);
    }
  }

  function delta(order, form) {
    const values = Object.fromEntries(new FormData(form).entries());
    const payload = { id: order.id, justification: String(values.justification || '').trim() };
    for (const key of ['status','payment_status','fulfillment_status','certificate_status','shipping_provider','tracking_code']) {
      const next = String(values[key] ?? '').trim();
      const current = String(order[key] ?? '').trim();
      if (next !== current) payload[key] = next || null;
    }
    return payload;
  }

  document.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-order-form]');
    if (!form) return;
    event.preventDefault();
    const card = form.closest('[data-order-id]');
    const order = state.items.find((item) => item.id === card?.dataset.orderId);
    const result = form.querySelector('[data-order-result]');
    if (!order) return;
    const payload = delta(order, form);
    if (payload.justification.length < 8) {
      if (result) result.textContent = 'Informe uma justificativa com pelo menos 8 caracteres.';
      return;
    }
    if (Object.keys(payload).length <= 2) {
      if (result) result.textContent = 'Nenhuma alteração efetiva selecionada.';
      return;
    }
    if (result) result.textContent = 'Aplicando…';
    try {
      await request('/api/orders', { method: 'PATCH', body: JSON.stringify(payload) });
      if (result) result.textContent = 'Atualizado.';
      await load();
    } catch (error) {
      if (result) result.textContent = error.message;
    }
  });

  for (const selector of ['[data-order-search]','[data-order-status]','[data-payment-status]','[data-fulfillment-status]']) {
    document.addEventListener('input', (event) => { if (event.target.matches(selector)) render(); });
    document.addEventListener('change', (event) => { if (event.target.matches(selector)) render(); });
  }
  document.addEventListener('click', (event) => { if (event.target.closest('[data-orders-refresh]')) load(); });
  document.addEventListener('DOMContentLoaded', load);
})();
