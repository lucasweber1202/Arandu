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

// Primeiro toque da aba, gravado por js/platform-runtime.js na página de
// entrada. A leitura antiga só olhava a URL do envio: quem chegava pelo TikTok
// na home e enviava o portfólio em para-artistas.html chegava sem origem.
function readUtm() {
  const stored = window.ARANDU_PRIVACY?.attribution?.();
  if (stored && typeof stored === 'object') return stored;
  const params = new URLSearchParams(window.location.search);
  const fallback = { landing_page: window.location.pathname };
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach((field) => {
    const value = params.get(field);
    if (value) fallback[field] = String(value).slice(0, 80);
  });
  return fallback;
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
    message.setAttribute('role', 'status');
    message.setAttribute('aria-live', 'polite');
    form.appendChild(message);
  }
  message.style.color = isError ? '#7b1f17' : '#6f221b';
  message.textContent = text;
  form.querySelector('[data-form-rescue]')?.remove();
}

// Uma submissão recusada não pode terminar em beco sem saída. O rascunho local
// e a cópia para a área de transferência ajudam quem já está no desktop, mas
// quem chega do TikTok no celular precisa de um canal que funcione agora —
// mesmo com o banco de produção indisponível.
function showFormRescue(form, payload) {
  form.querySelector('[data-form-rescue]')?.remove();
  const contact = window.ARANDU_CONTACT;
  const summary = buildStaticLeadSummary(payload);
  const links = [];
  const whatsapp = contact?.whatsappUrl?.(summary);
  if (whatsapp) links.push(`<a href="${whatsapp}" target="_blank" rel="noopener noreferrer">Enviar por WhatsApp</a>`);
  const mailto = contact?.mailto?.('Contato Arandu', summary);
  if (mailto) links.push(`<a href="${mailto}">Enviar por e-mail</a>`);
  links.push('<a href="contato.html">Abrir a página de contato</a>');
  const rescue = document.createElement('div');
  rescue.className = 'arandu-rescue-actions';
  rescue.dataset.formRescue = 'true';
  rescue.innerHTML = links.join('');
  form.appendChild(rescue);
}

// A confirmação de portfólio precisa dizer o que vem depois, não só "recebido".
function showFormNextStep(form) {
  form.querySelector('[data-form-rescue]')?.remove();
  const next = document.createElement('div');
  next.className = 'arandu-rescue-actions';
  next.dataset.formRescue = 'true';
  next.innerHTML = '<a href="submissao-recebida.html">O que acontece agora</a>'
    + '<a href="checklist-portfolio-artista.html">Checklist do portfólio</a>';
  form.appendChild(next);
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

// `submissao-artista` é o evento de funil que define a beta: sem ele não dá
// para saber se o tráfego do TikTok virou candidatura. Os demais formulários
// entram como início de contato.
function conversionEventFor(type) {
  if (type === 'submissao-artista') return 'submit_artist_application';
  return 'contact_start';
}

function successMessageFor(type, result) {
  if (result?.mode === 'demo') return 'Recebido em modo de preparação. Nenhum dado pessoal foi mantido neste navegador.';
  if (type === 'submissao-artista') return 'Portfólio recebido. A curadoria analisa coerência, documentação e disponibilidade das obras e retorna pelo contato informado.';
  return 'Recebido. A curadoria irá analisar e retornar pelo contato informado.';
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
    showFormMessage(form, successMessageFor(payload.type, sent.result));
    if (payload.type === 'submissao-artista') showFormNextStep(form);
    window.ARANDU_PRIVACY?.track?.(conversionEventFor(payload.type), { form_type: payload.type });
    form.reset();
    return;
  }
  storeDraft({ ...payload, api_status: sent.status, api_mode: 'local' });
  const copied = await copyStaticLead(payload);
  showFormMessage(form, copied
    ? 'Não conseguimos registrar seu envio agora. O resumo foi copiado e o rascunho local expira em 24 horas — use um dos canais abaixo para falar com a curadoria.'
    : 'Não conseguimos registrar seu envio agora. O rascunho local expira em 24 horas — use um dos canais abaixo para falar com a curadoria.', true);
  showFormRescue(form, payload);
});

purgeLegacyPersonalData();
