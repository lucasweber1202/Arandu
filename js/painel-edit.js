const EDIT_TOKEN_KEY = 'arandu.admin.token';

const EDIT_CONFIG = {
  obras: [['title','Título'],['artist_id','ID do artista'],['language','Linguagem'],['technique','Técnica'],['year','Ano'],['dimensions','Dimensões'],['price','Preço'],['price_label','Texto do preço'],['status','Status'],['main_image_url','Imagem principal'],['detail_image_url','Imagem de detalhe'],['room_image_url','Imagem em ambiente'],['tags','Tags'],['summary','Resumo'],['curatorial_reading','Leitura curatorial']],
  artistas: [['name','Nome'],['legal_name','Nome completo'],['city','Cidade'],['state','Estado'],['region','Região'],['languages','Linguagens'],['curatorial_axes','Eixos curatoriais'],['profile','Perfil'],['trajectory','Trajetória'],['statement','Statement'],['portfolio_url','Portfólio'],['instagram','Instagram'],['status','Status'],['artist_level','Nível'],['image_url','Imagem'],['studio_image_url','Imagem de ateliê']],
  certificados: [['code','Código'],['verification_status','Status'],['artwork_id','ID da obra'],['artist_id','ID do artista'],['issued_to','Emitido para'],['issued_email','Email'],['issued_at','Data de emissão'],['certificate_hash','Hash'],['certificate_notes','Notas']],
  leads: [['type','Tipo'],['name','Nome'],['email','Email'],['whatsapp','WhatsApp'],['company','Empresa'],['message','Mensagem'],['source_page','Origem'],['status','Status']],
  submissions: [['name','Nome'],['artist_name','Nome artístico'],['city','Cidade'],['state','Estado'],['portfolio_url','Portfólio'],['instagram','Instagram'],['email','Email'],['whatsapp','WhatsApp'],['languages','Linguagens'],['price_range','Faixa de preço'],['message','Mensagem'],['status','Status']],
  briefs: [['name','Contato'],['email','Email'],['whatsapp','WhatsApp'],['company','Empresa'],['project_type','Projeto'],['environment','Ambiente'],['budget','Orçamento'],['deadline','Prazo'],['message','Mensagem'],['source_page','Origem'],['status','Status']],
  proposals: [['client','Cliente'],['space','Espaço'],['goal','Objetivo'],['budget','Orçamento'],['deadline','Prazo'],['notes','Notas'],['total','Total'],['status','Status']],
  reservations: [['artwork_id','ID da obra'],['name','Cliente'],['whatsapp','WhatsApp'],['deadline','Prazo'],['notes','Notas'],['status','Status'],['expires_at','Expira em']],
  tasks: [['entity_type','Tipo da entidade'],['entity_id','ID da entidade'],['title','Título'],['owner_name','Responsável'],['due_at','Prazo'],['priority','Prioridade'],['status','Status']]
};

function editToken() { return localStorage.getItem(EDIT_TOKEN_KEY) || ''; }
function editPanel() { return document.body.dataset.operationalPanel; }
function editItems() { return window.__ARANDU_PANEL_ITEMS__ || []; }
function editEscape(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char])); }
function editValue(value) { return Array.isArray(value) ? value.join(', ') : (value ?? ''); }

function decorateEditButtons() {
  document.querySelectorAll('[data-open-detail]').forEach((button) => {
    if (button.parentElement?.querySelector(`[data-open-edit="${CSS.escape(button.dataset.openDetail)}"]`)) return;
    const edit = document.createElement('button');
    edit.className = 'tag';
    edit.type = 'button';
    edit.dataset.openEdit = button.dataset.openDetail;
    edit.textContent = 'Editar';
    button.insertAdjacentElement('afterend', edit);
  });
}

function ensureEditDrawer() {
  let drawer = document.querySelector('[data-edit-drawer]');
  if (drawer) return drawer;
  drawer = document.createElement('aside');
  drawer.dataset.editDrawer = 'true';
  drawer.className = 'search-overlay';
  drawer.hidden = true;
  drawer.innerHTML = `<div class="search-dialog"><div class="search-dialog-header"><h2>Editar registro</h2><button class="search-close" type="button" data-edit-close>Fechar</button></div><div data-edit-content></div></div>`;
  document.body.appendChild(drawer);
  return drawer;
}

function fieldInput(field, label, item) {
  const raw = editValue(item[field]);
  const value = editEscape(raw);
  const long = ['summary','curatorial_reading','profile','trajectory','statement','message','notes','certificate_notes'].includes(field);
  if (long) return `<label><span>${editEscape(label)}</span><textarea data-edit-field="${editEscape(field)}">${value}</textarea></label>`;
  return `<label><span>${editEscape(label)}</span><input data-edit-field="${editEscape(field)}" value="${value}" /></label>`;
}

function openEdit(id) {
  const panel = editPanel();
  const item = editItems().find((row) => String(row.id) === String(id));
  const fields = EDIT_CONFIG[panel] || [];
  const drawer = ensureEditDrawer();
  const content = drawer.querySelector('[data-edit-content]');
  drawer.hidden = false;
  drawer.dataset.panel = panel;
  drawer.dataset.id = id;
  if (!item) {
    content.innerHTML = '<article class="card"><h3>Registro não encontrado.</h3><p>Atualize o painel e tente novamente.</p></article>';
    return;
  }
  content.innerHTML = `<form class="form-card" data-edit-form><p class="eyebrow">${editEscape(panel)}</p><h3>${editEscape(item.title || item.name || item.code || item.proposal_number || item.id)}</h3><div class="grid grid-2">${fields.map(([field,label]) => fieldInput(field,label,item)).join('')}</div><div class="page-actions"><button type="submit">Salvar alterações</button><button class="button secondary" type="button" data-edit-close>Cancelar</button></div><p data-edit-status class="selection-summary">Edite somente campos necessários. Dados vazios podem limpar campos no banco.</p></form>`;
}

async function submitEdit(form) {
  const drawer = ensureEditDrawer();
  const panel = drawer.dataset.panel;
  const id = drawer.dataset.id;
  const fields = {};
  form.querySelectorAll('[data-edit-field]').forEach((input) => { fields[input.dataset.editField] = input.value.trim(); });
  const status = form.querySelector('[data-edit-status]');
  status.textContent = 'Salvando alterações...';
  const response = await fetch('/api/admin-update', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-arandu-admin-token': editToken() },
    body: JSON.stringify({ panel, id, fields })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || 'Erro ao atualizar registro.');
  const index = editItems().findIndex((row) => String(row.id) === String(id));
  if (index >= 0 && data.record) editItems()[index] = { ...editItems()[index], ...data.record };
  status.textContent = data.mode === 'stored' ? 'Alterações salvas no banco.' : 'Alterações validadas em modo demo.';
  setTimeout(() => window.location.reload(), 700);
}

const observer = new MutationObserver(decorateEditButtons);
document.addEventListener('DOMContentLoaded', () => {
  const table = document.querySelector('[data-panel-table]') || document.body;
  observer.observe(table, { childList: true, subtree: true });
  decorateEditButtons();
});

document.addEventListener('click', (event) => {
  const open = event.target.closest('[data-open-edit]');
  if (open) openEdit(open.dataset.openEdit);
  if (event.target.closest('[data-edit-close]') || event.target.matches('[data-edit-drawer]')) ensureEditDrawer().hidden = true;
});

document.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-edit-form]');
  if (!form) return;
  event.preventDefault();
  try { await submitEdit(form); } catch (error) { form.querySelector('[data-edit-status]').textContent = error.message; }
});
