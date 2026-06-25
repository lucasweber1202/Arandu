(() => {
  function extraFields(form) {
    if (!form || form.dataset.reservePlus === 'true') return;
    form.dataset.reservePlus = 'true';
    const notes = form.querySelector('textarea[name="notes"]');
    const url = form.querySelector('input[name="url"]');
    const city = document.createElement('input');
    city.name = 'city';
    city.placeholder = 'Cidade de entrega';
    const profile = document.createElement('select');
    profile.name = 'buyer_profile';
    profile.innerHTML = '<option value="">Perfil da compra</option><option value="primeira-compra">Primeira compra de arte</option><option value="colecionador">Colecionador</option><option value="empresa">Empresa ou projeto</option><option value="arquiteto">Arquiteto ou decorador</option>';
    if (notes) form.insertBefore(city, notes);
    if (notes) form.insertBefore(profile, notes);
    const info = document.createElement('div');
    info.className = 'launch-note';
    info.innerHTML = '<strong>Próximos passos:</strong> a curadoria confirma disponibilidade, estado da obra, envio, prazo, certificado e forma de pagamento antes de qualquer fechamento.';
    if (url) form.insertBefore(info, url);
  }

  function observeModal() {
    const modal = document.querySelector('[data-reserve-modal]');
    if (modal) extraFields(modal.querySelector('[data-reserve-form]'));
  }

  document.addEventListener('click', () => setTimeout(observeModal, 80));
  document.addEventListener('DOMContentLoaded', observeModal);
})();
