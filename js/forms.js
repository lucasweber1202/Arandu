/*
  ARANDU — Formulários conectados ao Vercel API

  Agora o formulário tenta enviar para /api/leads.
  Se o backend ainda não estiver com Supabase configurado, a API responde em modo demo
  e o navegador mantém uma cópia local em localStorage como fallback.
*/

const ARANDU_LEADS_KEY = 'arandu.leads.v1';

function readLeads() {
  try { return JSON.parse(localStorage.getItem(ARANDU_LEADS_KEY) || '[]'); } catch { return []; }
}

function writeLeads(leads) {
  localStorage.setItem(ARANDU_LEADS_KEY, JSON.stringify(leads));
}

function getFieldKey(field, index) {
  return field.name || field.getAttribute('aria-label') || field.placeholder || `campo_${index + 1}`;
}

function readSelectionForLead() {
  try { return JSON.parse(localStorage.getItem('arandu.selection.v1') || '[]'); } catch { return []; }
}

function formToLead(form) {
  const fields = Array.from(form.querySelectorAll('input, textarea, select'));
  const data = {};

  fields.forEach((field, index) => {
    data[getFieldKey(field, index)] = field.value || '';
  });

  const lead = {
    id: `lead_${Date.now()}`,
    type: form.dataset.formType || 'contato',
    page: window.location.pathname,
    createdAt: new Date().toISOString(),
    data
  };

  if (lead.type === 'selecao') lead.selection = readSelectionForLead();
  return lead;
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

async function submitLeadToApi(lead) {
  const response = await fetch('/api/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lead)
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) {
    throw new Error(result.error || 'Não foi possível enviar agora.');
  }
  return result;
}

document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;

  event.preventDefault();

  if (hasMissingRequiredFields(form)) {
    showFormMessage(form, 'Preencha os campos obrigatórios para enviar.', true);
    return;
  }

  const lead = formToLead(form);
  writeLeads([...readLeads(), lead]);
  showFormMessage(form, 'Enviando para a curadoria...');

  try {
    const result = await submitLeadToApi(lead);
    const suffix = result.stored ? '' : ' O envio está em modo demonstração até o Supabase ser configurado.';
    showFormMessage(form, `Recebido. A curadoria entrará em contato em breve.${suffix}`);
    form.reset();
  } catch (error) {
    showFormMessage(form, `Recebido localmente. ${error.message}`, true);
  }
});
