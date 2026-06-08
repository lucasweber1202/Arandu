/* ARANDU — Formulários padronizados */
const ARANDU_LEADS_KEY = 'arandu.leads.v1';
const ARANDU_FORM_DRAFTS_KEY = 'arandu.formDrafts.v1';

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
  try { const data = JSON.parse(localStorage.getItem('arandu.selection.v1') || '[]'); return Array.isArray(data) ? data : []; } catch { return []; }
}

function readSelectionBriefingForLead() {
  try { return JSON.parse(localStorage.getItem('arandu.selection.briefing.v1') || '{}'); } catch { return {}; }
}

function readQuizForLead() {
  try { return JSON.parse(localStorage.getItem('arandu.quiz.v1') || '{}'); } catch { return {}; }
}

function readUtm() {
  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: params.get('utm_source'),
    utm_medium: params.get('utm_medium'),
    utm_campaign: params.get('utm_campaign'),
    referrer: document.referrer || null
  };
}

function normalizeFormType(form) {
  return form.dataset.formType || form.getAttribute('data-form-type') || 'contato';
}

function formToLead(form) {
  const fields = Array.from(form.querySelectorAll('input, textarea, select'));
  const data = {};

  fields.forEach((field, index) => {
    if (field.type === 'checkbox') data[getFieldKey(field, index)] = field.checked;
    else data[getFieldKey(field, index)] = field.value || '';
  });

  const type = normalizeFormType(form);
  const payload = {
    id: `form_${Date.now()}`,
    type,
    form_type: type,
    page: window.location.pathname,
    url: window.location.href,
    createdAt: new Date().toISOString(),
    utm: readUtm(),
    consent: {
      privacy: true,
      marketing: Boolean(data.consent_marketing || data.marketing || data.newsletter)
    },
    data
  };

  if (type === 'selecao') {
    payload.selection = readSelectionForLead();
    payload.selection_briefing = readSelectionBriefingForLead();
  }
  payload.quiz = readQuizForLead();
  return payload;
}

function showFormMessage(form, text, isError = false) {
  let message = form.querySelector('[data-form-status]');
  if (!message) {
    message = document.createElement('p');
    message.dataset.formStatus = 'true';
    message.style.fontWeight = '700';
    form.appendChild(message);
  }
  message.style.color = isError ? '#7b1f17' : '#6f221b';
  message.textContent = text;
}

function hasMissingRequiredFields(form) {
  return Array.from(form.querySelectorAll('[required]')).some((field) => !field.value.trim());
}

function storeDraft(payload) {
  const drafts = JSON.parse(localStorage.getItem(ARANDU_FORM_DRAFTS_KEY) || '[]');
  drafts.push(payload);
  localStorage.setItem(ARANDU_FORM_DRAFTS_KEY, JSON.stringify(drafts.slice(-80)));
}

async function submitLeadToApi(payload) {
  const response = await fetch('/api/forms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
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
  if (form.dataset.authHandled === 'true') return;
  if (form.dataset.briefingForm !== undefined) { event.preventDefault(); return; }

  event.preventDefault();

  if (hasMissingRequiredFields(form)) {
    showFormMessage(form, 'Preencha os campos obrigatórios para enviar.', true);
    return;
  }

  const payload = formToLead(form);
  writeLeads([...readLeads(), payload]);
  storeDraft(payload);
  showFormMessage(form, 'Enviando para a curadoria...');

  try {
    const result = await submitLeadToApi(payload);
    const suffix = result.stored ? '' : ' O envio está em modo demonstração até o Supabase ser configurado.';
    showFormMessage(form, `Recebido. A curadoria entrará em contato em breve.${suffix}`);
    form.reset();
  } catch (error) {
    showFormMessage(form, `Recebido localmente. ${error.message}`, true);
  }
});
