const DETAIL_TOKEN_KEY = 'arandu.admin.token';

function detailToken() {
  return localStorage.getItem(DETAIL_TOKEN_KEY) || '';
}

function escapeDetailHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));
}

function appendOperationalScript(id, src) {
  if (document.getElementById(id)) return;
  const script = document.createElement('script');
  script.id = id;
  script.src = src;
  script.defer = true;
  document.body.appendChild(script);
}

function loadCrmLite() {
  if (!document.body.dataset.operationalPanel) return;
  if (!document.getElementById('painel-crm-lite-css')) {
    const link = document.createElement('link');
    link.id = 'painel-crm-lite-css';
    link.rel = 'stylesheet';
    link.href = 'css/painel-crm-lite.css?v=20260612-crm-2';
    document.head.appendChild(link);
  }
  appendOperationalScript('painel-crm-lite-js', 'js/painel-crm-lite.js?v=20260612-crm-2');
  appendOperationalScript('painel-edit-js', 'js/painel-edit.js?v=20260612-edit-1');
}

async function detailRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-arandu-admin-token': detailToken(),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || 'Erro operacional.');
  return data;
}

function getPanelEntityType(panel) {
  return ({ obras: 'artwork', artistas: 'artist', leads: 'lead', submissions: 'artist_submission', briefs: 'company_brief', certificados: 'certificate', proposals: 'proposal', reservations: 'reservation', tasks: 'task' })[panel] || 'lead';
}

function ensureDrawer() {
  let drawer = document.querySelector('[data-detail-drawer]');
  if (drawer) return drawer;
  drawer = document.createElement('aside');
  drawer.dataset.detailDrawer = 'true';
  drawer.className = 'search-overlay';
  drawer.hidden = true;
  drawer.innerHTML = `<div class="search-dialog"><div class="search-dialog-header"><h2>Detalhes operacionais</h2><button class="search-close" type="button" data-detail-close>Fechar</button></div><div data-detail-content></div></div>`;
  document.body.appendChild(drawer);
  return drawer;
}

async function loadOperationalDetails(entityType, entityId) {
  const [notes, tasks] = await Promise.all([
    detailRequest(`/api/operational?resource=notes&entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`),
    detailRequest(`/api/operational?resource=tasks&entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`)
  ]);
  return { notes: notes.items || [], tasks: tasks.items || [] };
}

function localDetailFallback(entityType, entityId, error) {
  return `<article class="card"><p class="eyebrow">${escapeDetailHtml(entityType)}</p><h3>${escapeDetailHtml(entityId)}</h3><p>Banco operacional ainda não configurado para este detalhe. Use o CRM leve do painel para registrar tarefas e notas locais.</p><small>${escapeDetailHtml(error.message)}</small></article>`;
}

function renderNote(note) {
  return `<p><strong>${escapeDetailHtml(note.author_name || 'Curadoria')}:</strong> ${escapeDetailHtml(note.note)}<br><small>${note.created_at ? new Date(note.created_at).toLocaleString('pt-BR') : 'Sem data'}</small></p>`;
}

function renderTask(task) {
  return `<p><strong>${escapeDetailHtml(task.title)}</strong> · ${escapeDetailHtml(task.status)} · ${escapeDetailHtml(task.priority)}<br><small>${escapeDetailHtml(task.owner_name || 'Sem responsável')}${task.due_at ? ' · ' + new Date(task.due_at).toLocaleString('pt-BR') : ''}</small>${task.id ? `<br><button class="tag" type="button" data-task-done="${escapeDetailHtml(task.id)}">Marcar como concluída</button>` : ''}</p>`;
}

async function openDetail(entityId) {
  const panel = document.body.dataset.operationalPanel;
  const entityType = getPanelEntityType(panel);
  const drawer = ensureDrawer();
  const content = drawer.querySelector('[data-detail-content]');
  drawer.hidden = false;
  content.innerHTML = '<p>Carregando histórico...</p>';
  try {
    const { notes, tasks } = await loadOperationalDetails(entityType, entityId);
    content.innerHTML = `<article class="card"><p class="eyebrow">${escapeDetailHtml(entityType)}</p><h3>${escapeDetailHtml(entityId)}</h3><div class="grid grid-2"><form class="form-card" data-note-form><h3>Adicionar nota</h3><textarea name="note" placeholder="Próximo contato, observação curatorial, condição comercial..." required></textarea><button type="submit">Salvar nota</button></form><form class="form-card" data-task-form><h3>Criar tarefa</h3><input name="title" placeholder="Título da tarefa" required /><input name="owner_name" placeholder="Responsável" /><input name="due_at" type="datetime-local" /><select name="priority"><option value="normal">Normal</option><option value="high">Alta</option><option value="low">Baixa</option></select><button type="submit">Criar tarefa</button></form></div></article><article class="card"><h3>Notas</h3>${notes.length ? notes.map(renderNote).join('') : '<p>Nenhuma nota.</p>'}</article><article class="card"><h3>Tarefas</h3>${tasks.length ? tasks.map(renderTask).join('') : '<p>Nenhuma tarefa.</p>'}</article>`;
    drawer.dataset.entityType = entityType;
    drawer.dataset.entityId = entityId;
  } catch (error) {
    content.innerHTML = localDetailFallback(entityType, entityId, error);
  }
}

async function submitNote(form) {
  const drawer = ensureDrawer();
  const entity_type = drawer.dataset.entityType;
  const entity_id = drawer.dataset.entityId;
  const note = form.querySelector('[name="note"]').value;
  await detailRequest('/api/operational?resource=notes', { method: 'POST', body: JSON.stringify({ entity_type, entity_id, note }) });
  await openDetail(entity_id);
}

async function submitTask(form) {
  const drawer = ensureDrawer();
  const entity_type = drawer.dataset.entityType;
  const entity_id = drawer.dataset.entityId;
  const data = Object.fromEntries(new FormData(form).entries());
  await detailRequest('/api/operational?resource=tasks', { method: 'POST', body: JSON.stringify({ ...data, entity_type, entity_id }) });
  await openDetail(entity_id);
}

async function markTaskDone(taskId) {
  const drawer = ensureDrawer();
  await detailRequest('/api/operational?resource=tasks', { method: 'PATCH', body: JSON.stringify({ id: taskId, status: 'done' }) });
  await openDetail(drawer.dataset.entityId);
}

document.addEventListener('click', (event) => {
  const open = event.target.closest('[data-open-detail]');
  const done = event.target.closest('[data-task-done]');
  if (open) openDetail(open.dataset.openDetail);
  if (done) markTaskDone(done.dataset.taskDone);
  if (event.target.closest('[data-detail-close]') || event.target.matches('[data-detail-drawer]')) ensureDrawer().hidden = true;
});

document.addEventListener('submit', async (event) => {
  const noteForm = event.target.closest('[data-note-form]');
  const taskForm = event.target.closest('[data-task-form]');
  if (!noteForm && !taskForm) return;
  event.preventDefault();
  if (noteForm) await submitNote(noteForm);
  if (taskForm) await submitTask(taskForm);
});

document.addEventListener('DOMContentLoaded', loadCrmLite);
