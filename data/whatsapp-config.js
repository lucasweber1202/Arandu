// Contato público carregado somente da configuração do servidor.
(function () {
  window.ARANDU_WHATSAPP_NUMBER = '';
  window.ARANDU_CONTACT_EMAIL = '';
  window.ARANDU_CONTACT_MESSAGE = 'Olá, quero falar com a curadoria da Arandu.';

  const contact = {
    whatsappNumber: '',
    email: '',
    defaultMessage: window.ARANDU_CONTACT_MESSAGE,
    whatsappUrl(message) {
      const digits = String(this.whatsappNumber || '').replace(/\D/g, '');
      if (digits.length < 12) return '';
      const text = encodeURIComponent(message || this.defaultMessage);
      return `https://wa.me/${digits}?text=${text}`;
    },
    mailto(subject = 'Contato Arandu', body = 'Olá, quero falar com a curadoria da Arandu.') {
      if (!this.email) return '';
      return `mailto:${this.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    }
  };

  window.ARANDU_CONTACT = contact;
  fetch('/api/public-config', { cache: 'no-store' })
    .then((response) => response.json().then((payload) => ({ response, payload })))
    .then(({ response, payload }) => {
      if (!response.ok || payload?.ok === false) throw new Error('config');
      contact.whatsappNumber = payload?.contact?.whatsappNumber || '';
      contact.email = payload?.contact?.email || '';
      window.ARANDU_WHATSAPP_NUMBER = contact.whatsappNumber;
      window.ARANDU_CONTACT_EMAIL = contact.email;
      window.ARANDU_PUBLIC_CONFIG = payload;
      document.dispatchEvent(new CustomEvent('arandu:public-config', { detail: payload }));
    })
    .catch(() => {
      window.ARANDU_PUBLIC_CONFIG = { configured: { domain: false, contact: false, brand: false } };
      document.dispatchEvent(new CustomEvent('arandu:public-config', { detail: window.ARANDU_PUBLIC_CONFIG }));
    });
})();
