/*
  ARANDU — Captura local de formulários

  Este arquivo cria uma primeira camada de funcionamento para formulários
  sem backend. Ele não envia dados para servidor; salva localmente no navegador.

  Uso futuro:
  - Substituir localStorage por Supabase, Resend, Formspree ou backend próprio.
  - Manter a mesma jornada visual já criada no MVP.
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

function formToLead(form) {
  const fields = Array.from(form.querySelectorAll('input, textarea, select'));
  const data = {};

  fields.forEach((field, index) => {
    const key = field.name || field.placeholder || `campo_${index + 1}`;
    data[key] = field.value || '';
  });

  return {
    id: `lead_${Date.now()}`,
    page: window.location.pathname,
    createdAt: new Date().toISOString(),
    data
  };
}

function showFormSuccess(form) {
  let message = form.querySelector('[data-form-status]');
  if (!message) {
    message = document.createElement('p');
    message.dataset.formStatus = 'true';
    message.style.color = '#9e3d2c';
    message.style.fontWeight = '700';
    form.appendChild(message);
  }
  message.textContent = 'Recebido. A curadoria entrará em contato em breve.';
}

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;

  event.preventDefault();

  const lead = formToLead(form);
  const leads = readLeads();
  writeLeads([...leads, lead]);
  showFormSuccess(form);
  form.reset();
});
