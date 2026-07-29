const ARANDU_LEADS_KEY = 'arandu.leads.v1';
const ARANDU_FORM_DRAFTS_KEY = 'arandu.formDrafts.v1';
const ARANDU_FORMS_API = '/api/forms';
const ARANDU_LOCAL_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const ARANDU_MAX_LOCAL_DRAFTS = 5;

function purgeLegacyPersonalData() {
  localStorage.removeItem(ARANDU_LEADS_KEY);
  try {
    const now = Date.now();
    const drafts = JSON.parse(localStorage.getItem(ARANDU_FORM_DRAFTS_KEY) || '[]');
    const active = Array.isArray(drafts)
      ? drafts.filter((draft) => Number(draft?.expiresAt || 0) > now).slice(-ARANDU_MAX_LOCAL_DRAFTS)
      : [];
    if (active.length) localStorage.setItem(ARANDU_FORM_DRAFTS_KEY, JSON.stringify(active));
    else localStorage.removeItem(ARANDU_FORM_DRAFTS_KEY);
  } catch {
    localStorage.removeItem(ARANDU_FORM_DRAFTS_KEY);
  }
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
  return { utm_source: params.get('utm_source'), utm_medium: params.get('utm_medium'), utm_campaign: params.get('utm_campaign'), referrer: document.referrer || null };
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
    source_page: window.location.pathname,
    url: window.location.href,
    createdAt: new Date().toISOString(),
    utm: readUtm(),
    consent: { privacy: true, marketing: Boolean(data.consent_marketing || data.marketing || data.newsletter) },
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
  let drafts = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(ARANDU_FORM_DRAFTS_KEY) || '[]');
    if (Array.isArray(parsed)) drafts = parsed.filter((draft) => Number(draft?.expiresAt || 0) > Date.now());
  } catch {}
  drafts.push({ ...payload, expiresAt: Date.now() + ARANDU_LOCAL_DRAFT_TTL_MS });
  localStorage.setItem(ARANDU_FORM_DRAFTS_KEY, JSON.stringify(drafts.slice(-ARANDU_MAX_LOCAL_DRAFTS)));
}

function clearLocalDrafts() {
  localStorage.removeItem(ARANDU_LEADS_KEY);
  localStorage.removeItem(ARANDU_FORM_DRAFTS_KEY);
}

function buildStaticLeadSummary(payload) {
  const lines = Object.entries(payload.data || {}).filter(([, value]) => value !== '' && value !== false && value !== null && value !== undefined).map(([key, value]) => `${key}: ${value}`);
  return `Lead Arandu\nTipo: ${payload.type}\nPágina: ${payload.page}\nData: ${payload.createdAt}\n\n${lines.join('\n')}`;
}

async function copyStaticLead(payload) {
  const text = buildStaticLeadSummary(payload);
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

async function sendLeadToApi(payload) {
  try {
    const response = await fetch(ARANDU_FORMS_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    return { ok: response.ok && result.ok !== false, result, status: response.status };
  } catch (error) {
    return { ok: false, result: { error: error.message }, status: 0 };
  }
}

document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (form.dataset.authHandled === 'true') return;
  if (form.dataset.briefingForm !== undefined) { event.preventDefault(); return; }
  event.preventDefault();
  if (hasMissingRequiredFields(form)) { showFormMessage(form, 'Preencha os campos obrigatórios para continuar.', true); return; }
  const payload = formToLead(form);
  showFormMessage(form, 'Enviando para a curadoria...');
  const sent = await sendLeadToApi(payload);
  if (sent.ok) {
    clearLocalDrafts();
    showFormMessage(form, sent.result?.mode === 'demo' ? 'Recebido em modo de preparação. Nenhum dado pessoal foi mantido neste navegador.' : 'Recebido. A curadoria irá analisar e retornar pelo contato informado.');
    form.reset();
    return;
  }
  storeDraft({ ...payload, api_status: sent.status, api_mode: 'local' });
  const copied = await copyStaticLead(payload);
  showFormMessage(form, copied ? 'Não foi possível enviar agora. O resumo foi copiado e o rascunho local expira em 24 horas.' : 'Não foi possível enviar agora. O rascunho local expira em 24 horas.', true);
});

purgeLegacyPersonalData();
