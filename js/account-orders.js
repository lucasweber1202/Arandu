(() => {
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
  }

  function formatMoney(value, currency = 'BRL') {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return 'Valor confirmado pela curadoria';
    try {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency || 'BRL' }).format(amount);
    } catch {
      return `${currency || 'BRL'} ${amount.toFixed(2)}`;
    }
  }

  function formatDate(value) {
    if (!value) return '';
    try { return new Date(value).toLocaleString('pt-BR'); } catch { return ''; }
  }

  const labels = {
    status: {
      created: 'Pedido criado',
      confirmed: 'Confirmado',
      completed: 'Concluído',
      cancelled: 'Cancelado'
    },
    payment: {
      pending: 'Pagamento pendente',
      awaiting_confirmation: 'Pagamento em confirmação',
      paid: 'Pagamento confirmado',
      refunded: 'Reembolsado',
      failed: 'Falha no pagamento',
      cancelled: 'Pagamento cancelado'
    },
    fulfillment: {
      pending: 'Preparação pendente',
      packing: 'Em embalagem',
      shipped: 'Enviado',
      delivered: 'Entregue',
      returned: 'Devolvido',
      cancelled: 'Envio cancelado'
    },
    certificate: {
      pending: 'Certificado pendente',
      ready: 'Certificado pronto',
      issued: 'Certificado emitido',
      not_applicable: 'Certificado não aplicável'
    }
  };

  function label(group, value) {
    return labels[group]?.[value] || value || 'Pendente';
  }

  function renderOrders(target, orders) {
    if (!orders.length) {
      target.innerHTML = '<section class="card"><p class="eyebrow">Seus pedidos</p><h3>Nenhum pedido concluído ainda</h3><p>Quando uma reserva confirmada avançar para venda, o acompanhamento aparecerá aqui.</p></section>';
      return;
    }

    target.innerHTML = `<section class="card">
      <p class="eyebrow">Seus pedidos</p>
      <h2>Acompanhamento pós-reserva</h2>
      <p>Veja pagamento, preparação, envio e certificado sem expor informações internas da operação.</p>
      <div class="grid grid-2">
        ${orders.map((order) => `<article class="card">
          <span class="tag">${escapeHtml(label('status', order.status))}</span>
          <h3>${escapeHtml(order.order_number || 'Pedido Arandu')}</h3>
          <p><strong>${escapeHtml(formatMoney(order.price_snapshot, order.currency))}</strong></p>
          <p>Obra: ${escapeHtml(order.artwork_id || 'confirmada pela curadoria')}</p>
          <ul>
            <li>${escapeHtml(label('payment', order.payment_status))}</li>
            <li>${escapeHtml(label('fulfillment', order.fulfillment_status))}</li>
            <li>${escapeHtml(label('certificate', order.certificate_status))}</li>
          </ul>
          ${order.tracking_code ? `<p><strong>Rastreio:</strong> ${escapeHtml(order.tracking_code)}</p>` : ''}
          ${order.shipping_provider ? `<p><strong>Transportadora:</strong> ${escapeHtml(order.shipping_provider)}</p>` : ''}
          <small>${escapeHtml(formatDate(order.created_at))}</small>
        </article>`).join('')}
      </div>
    </section>`;
  }

  async function loadOrders() {
    const target = document.querySelector('[data-account-orders]');
    if (!target) return;
    const presentation = window.AranduPresentation?.enabled === true || document.querySelector('meta[name="arandu-presentation-mode"]')?.content === 'true';
    if (presentation) {
      target.innerHTML = '<section class="card"><p class="eyebrow">Pedido demonstrativo</p><h2>Acompanhamento pós-reserva</h2><p class="presentation-disclaimer"><strong>Cenário sem validade comercial.</strong> Nenhum pedido ou pagamento foi criado.</p><div class="grid grid-2"><article class="card"><span class="tag">Demonstração</span><h3>ARD-DEMO-001</h3><p><strong>Valor demonstrativo</strong></p><p>Obra: Estudo de Solo Nº 04</p><ul><li>Pagamento não iniciado</li><li>Logística não iniciada</li><li>Registro de procedência demonstrativo</li></ul></article></div></section>';
      return;
    }
    try {
      const response = await fetch('/api/account-orders', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        target.innerHTML = '';
        return;
      }
      if (!response.ok || data.ok === false) throw new Error(data.error || 'Não foi possível carregar seus pedidos.');
      renderOrders(target, Array.isArray(data.orders) ? data.orders : []);
    } catch (error) {
      // Sem esta troca, o comprador lia a mensagem de erro da API no lugar do
      // acompanhamento do próprio pedido.
      target.innerHTML = '<section class="card"><p class="eyebrow">Seus pedidos</p><h3>Acompanhamento temporariamente indisponível</h3><p>Nenhum pedido foi perdido: o acompanhamento volta assim que a consulta se restabelecer. Recarregue a página em instantes ou fale com a curadoria.</p><div class="page-actions"><a class="cta secondary" href="contato.html">Falar com a curadoria</a></div></section>';
    }
  }

  document.addEventListener('DOMContentLoaded', loadOrders);
})();
