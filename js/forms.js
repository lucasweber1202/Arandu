/*
  ARANDU — Captura local de formulários

  MVP sem backend:
  - Intercepta submit de formulários.
  - Valida campos obrigatórios quando marcados com required.
  - Salva leads no localStorage.
  - Identifica tipo de lead por data-form-type.
  - Exibe mensagem de sucesso sem sair da página.

  Futuro:
  - Trocar localStorage por Supabase, Resend, Formspree ou backend próprio.
*/

const ARANDU_LEADS_KEY = 'arandu.leads.v1';

function readLeads() {
  try {
    return JSON.parse(localStorage.getItem(ARANDU_LEADS_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeLeads(leads) {
  localStorage.setItem(ARANDU_LEADS_KEY, JSON.stringify(leads));
}

function getFieldKey(field, index) {
  return field.name || field.getAttribute('aria-label') || field.placeholder || `campo_${index + 1}`;
}

function formToLead(form) {
  const fields = Array.from(form.querySelectorAll('input, textarea, select'));
  const data = {};

  fields.forEach((field, index) => {
    data[getFieldKey(field, index)] = field.value || '';
  });

  return {
    id: `lead_${Date.now()}`,
    type: form.dataset.formType || 'contato',
    page: window.location.pathname,
    createdAt: new Date().toISOString(),
    data
  };
}

function showFormMessage(form, text, isError = false) {
  let message = form.querySelector('[data-form-status]');
  if (!message) {
    message = document.createElement('p');
    message.dataset.formStatus = 'true';
    message.style.fontWeight = '700';
    form.appendChild(message);
  }
  message.style.color = isError ? '#7b1f17' : '#9e3d2c';
  message.textContent = text;
}

function hasMissingRequiredFields(form) {
  return Array.from(form.querySelectorAll('[required]')).some((field) => !field.value.trim());
}

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;

  event.preventDefault();

  if (hasMissingRequiredFields(form)) {
    showFormMessage(form, 'Preencha os campos obrigatórios para enviar.', true);
    return;
  }

  const lead = formToLead(form);
  writeLeads([...readLeads(), lead]);
  showFormMessage(form, 'Recebido. A curadoria entrará em contato em breve.');
  form.reset();
});
