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
/** Nome do arquivo da página aberta, para não oferecer link para ela mesma. */
function paginaAtual() {
  return window.location.pathname.split('/').pop() || 'index.html';
}

function showFormRescue(form, payload) {
  form.querySelector('[data-form-rescue]')?.remove();
  const contact = window.ARANDU_CONTACT;
  const summary = buildStaticLeadSummary(payload);
  const links = [];
  const whatsapp = contact?.whatsappUrl?.(summary);
  if (whatsapp) links.push(`<a href="${whatsapp}" target="_blank" rel="noopener noreferrer">Enviar por WhatsApp</a>`);
  const mailto = contact?.mailto?.('Contato Arandu', summary);
  if (mailto) links.push(`<a href="${mailto}">Enviar por e-mail</a>`);
  // Em contato.html esse link mandava a pessoa para a página onde ela já
  // estava — e, sem WhatsApp nem e-mail configurados, era a única saída
  // oferecida logo depois de dizer "use um dos canais abaixo".
  if (paginaAtual() !== 'contato.html') {
    links.push('<a href="contato.html">Abrir a página de contato</a>');
  } else if (!links.length) {
    links.push('<a href="como-funciona.html">Como a Arandu funciona</a>', '<a href="comprar-arte.html">Ver o acervo</a>');
  }
  const rescue = document.createElement('div');
  rescue.className = 'arandu-rescue-actions';
  rescue.dataset.formRescue = 'true';
  rescue.innerHTML = links.join('');
  form.appendChild(rescue);
}

// A confirmação de portfólio precisa dizer o que vem depois, não só "recebido".
// Converter é o passo mais caro da jornada, e cinco dos seis formulários
// terminavam em "Recebido. A curadoria irá analisar" e nada mais: a pessoa
// enviava e a página não dizia o que esperar nem o que fazer em seguida.
const FORM_NEXT_STEPS = {
  'submissao-artista': [
    ['O que acontece agora', 'submissao-recebida.html'],
    ['Criar conta para acompanhar', 'cadastro.html'],
    ['Checklist do portfólio', 'checklist-portfolio-artista.html']
  ],
  'revisao-preco-artista': [
    ['Voltar ao portal do artista', 'portal-artista.html'],
    ['Como selecionamos', 'como-selecionamos-artistas.html']
  ],
  'duvida-curadoria': [
    ['Como a Arandu funciona', 'como-funciona.html'],
    ['O que garantimos', 'confianca.html'],
    ['Ver o acervo', 'comprar-arte.html']
  ],
  'interesse-comprador': [
    ['Como comprar', 'como-comprar-na-arandu.html'],
    ['Montar minha seleção', 'minha-selecao.html'],
    ['Criar conta', 'cadastro.html']
  ],
  'selecao': [
    ['Como comprar', 'como-comprar-na-arandu.html'],
    ['O que garantimos', 'confianca.html'],
    ['Criar conta para guardar', 'cadastro.html']
  ],
  'empresa-intencao': [
    ['Acompanhar meus briefings', 'portal-empresa.html'],
    ['Montar uma seleção', 'minha-selecao.html'],
    ['O que garantimos', 'confianca.html']
  ],
  newsletter: [
    ['Ler a Narrativa', 'narrativa.html'],
    ['Ver o acervo', 'comprar-arte.html']
  ]
};
FORM_NEXT_STEPS['briefing-empresa'] = FORM_NEXT_STEPS['empresa-intencao'];
FORM_NEXT_STEPS['briefing-arquiteto'] = FORM_NEXT_STEPS['empresa-intencao'];
FORM_NEXT_STEPS['proposta-empresa'] = FORM_NEXT_STEPS['empresa-intencao'];

function nextStepsFor(type) {
  return FORM_NEXT_STEPS[type] || [
    ['Ver o acervo', 'comprar-arte.html'],
    ['Como a Arandu funciona', 'como-funciona.html']
  ];
}

function showFormNextStep(form, type) {
  form.querySelector('[data-form-rescue]')?.remove();
  // "Próximo passo" que aponta para a página onde a pessoa já está não é passo
  // nenhum: o briefing de empresas oferecia voltar para o próprio briefing.
  const here = paginaAtual();
  const steps = nextStepsFor(type).filter(([, href]) => href.split('?')[0].split('#')[0] !== here);
  const usable = steps.length ? steps : [['Ver o acervo', 'comprar-arte.html'], ['Como a Arandu funciona', 'como-funciona.html']];
  const next = document.createElement('div');
  next.className = 'arandu-rescue-actions';
  next.dataset.formRescue = 'true';
  usable.forEach(([label, href]) => {
    const link = document.createElement('a');
    link.href = href;
    link.textContent = label;
    next.appendChild(link);
  });
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

// Cada tipo diz o que foi recebido e o que acontece com aquilo — "Recebido" e
// nada mais deixa a pessoa sem saber se o envio chegou ao lugar certo.
const FORM_SUCCESS = {
  'submissao-artista': 'Portfólio recebido. A curadoria analisa coerência, documentação e disponibilidade das obras e retorna pelo contato informado.',
  'revisao-preco-artista': 'Pedido de revisão registrado. A curadoria avalia a justificativa junto do histórico da obra e responde pelo seu contato.',
  'duvida-curadoria': 'Mensagem recebida. A curadoria responde pelo contato informado; enquanto isso, estas páginas costumam resolver as dúvidas mais comuns.',
  'interesse-comprador': 'Recebido. A curadoria vai entender o que você procura e responder com um caminho — não com uma lista de preços.',
  selecao: 'Seleção enviada. A curadoria comenta as obras salvas e responde pelo contato informado.',
  'empresa-intencao': 'Briefing recebido. A curadoria estuda ambiente, orçamento e prazo antes de propor qualquer obra.',
  'briefing-empresa': 'Briefing recebido. A curadoria estuda ambiente, orçamento e prazo antes de propor qualquer obra.',
  'briefing-arquiteto': 'Briefing recebido. A curadoria estuda ambiente, orçamento e prazo antes de propor qualquer obra.',
  'proposta-empresa': 'Pedido de proposta recebido. A curadoria retorna com uma seleção comentada para o seu espaço.',
  newsletter: 'Inscrição registrada. Você recebe os textos da Narrativa e os avisos de abertura do acervo no e-mail informado.'
};

function successMessageFor(type, result) {
  if (result?.mode === 'demo') return 'Recebido em modo de preparação. Nenhum dado pessoal foi mantido neste navegador.';
  return FORM_SUCCESS[type] || 'Recebido. A curadoria irá analisar e retornar pelo contato informado.';
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
    showFormNextStep(form, payload.type);
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
