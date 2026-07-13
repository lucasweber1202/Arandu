// Configuração central de contato público da Arandu.
// WhatsApp: informe o número real no formato 55 + DDD + número, apenas dígitos.
// Email: mantenha um canal de fallback para quando o WhatsApp ainda não estiver configurado.

window.ARANDU_WHATSAPP_NUMBER = '';
window.ARANDU_CONTACT_EMAIL = 'contato@arandu.art';
window.ARANDU_CONTACT_MESSAGE = 'Olá, quero falar com a curadoria da Arandu.';

window.ARANDU_CONTACT = {
  whatsappNumber: window.ARANDU_WHATSAPP_NUMBER,
  email: window.ARANDU_CONTACT_EMAIL,
  defaultMessage: window.ARANDU_CONTACT_MESSAGE,
  whatsappUrl(message) {
    const digits = String(this.whatsappNumber || '').replace(/\D/g, '');
    if (!digits || digits.length < 12) return '';
    const text = encodeURIComponent(message || this.defaultMessage || 'Olá, quero falar com a curadoria da Arandu.');
    return `https://wa.me/${digits}?text=${text}`;
  },
  mailto(subject = 'Contato Arandu', body = 'Olá, quero falar com a curadoria da Arandu.') {
    const email = String(this.email || '').trim();
    if (!email) return '';
    return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }
};
