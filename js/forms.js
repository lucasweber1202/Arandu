/* ARANDU — Formulários 100% estáticos */
const ARANDU_LEADS_KEY = 'arandu.leads.v1';
const ARANDU_FORM_DRAFTS_KEY = 'arandu.formDrafts.v1';

function readLeads() {
  try { const data = JSON.parse(localStorage.getItem(ARANDU_LEADS_KEY) || '[]'); return Array.isArray(data) ? data : []; } catch { return []; }
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

function buildStaticLeadSummary(payload) {
  const lines = Object.entries(payload.data || {})
    .filter(([, value]) => value !== '' && value !== false && value !== null && value !== undefined)
    .map(([key, value]) => `${key}: ${value}`);
  return `Lead Arandu\nTipo: ${payload.type}\nPágina: ${payload.page}\nData: ${payload.createdAt}\n\n${lines.join('\n')}`;
}

async function copyStaticLead(payload) {
  const text = buildStaticLeadSummary(payload);
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (form.dataset.authHandled === 'true') return;
  if (form.dataset.briefingForm !== undefined) { event.preventDefault(); return; }

  event.preventDefault();

  if (hasMissingRequiredFields(form)) {
    showFormMessage(form, 'Preencha os campos obrigatórios para continuar.', true);
    return;
  }

  const payload = formToLead(form);
  writeLeads([...readLeads(), payload]);
  storeDraft(payload);
  const copied = await copyStaticLead(payload);
  showFormMessage(form, copied ? 'Recebido localmente e resumo copiado. Envie pelo WhatsApp ou salve para acompanhamento.' : 'Recebido localmente. O resumo ficou salvo neste navegador.');
  form.reset();
});
