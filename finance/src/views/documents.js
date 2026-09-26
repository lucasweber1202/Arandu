// Documentos privados de um processo, proposta ou contrato.
//
// O arquivo vai direto para o Storage privado por uma URL assinada de curta
// duração, reservada antes pelo servidor; o download também usa URL assinada,
// gerada na hora e nunca guardada. A tela só vê metadados.

import { el, icon, formatDateTime } from '../core.js';
import { button, emptyState, errorState, loading, toast, confirmDialog, field } from '../ui.js';
import { memberName } from './shared.js';

const TYPES = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX'
};
const MAX_BYTES = 10 * 1024 * 1024;

export function fileSize(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

/** Validação local: mesmas regras do servidor, antes de gastar rede. */
export function checkFile(file) {
  if (!file) return 'Escolha um arquivo.';
  if (!TYPES[file.type]) return 'Tipo de arquivo não aceito. Envie PDF, JPG, PNG, XLSX ou DOCX.';
  if (file.size < 1) return 'O arquivo está vazio.';
  if (file.size > MAX_BYTES) return `O arquivo tem ${fileSize(file.size)} e o limite é 10 MB. Reduza o tamanho ou divida em partes.`;
  return null;
}

async function sha256(file) {
  try {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}

/**
 * @param {object} ctx
 * @param {{ entityType: string, entityId: string, canUpload?: boolean, shareLabel?: string|null, ownerLabel?: string }} options
 *   shareLabel: texto da opção de compartilhar; null quando o documento é sempre interno.
 */
export function documentsPanel(ctx, { entityType, entityId, canUpload = false, shareLabel = null, ownerLabel = 'Somente sua empresa' }) {
  const section = el('section', { class: 'documents', 'aria-label': 'Documentos' });
  const list = el('ul', { class: 'document-list', role: 'list' });
  const status = el('p', { class: 'document-status', role: 'status', 'aria-live': 'polite' });
  const people = (id) => (id && id === ctx.viewer?.id ? 'você' : ctx.audience === 'provider' ? 'sua instituição' : memberName(ctx.members, id));

  const download = async (row, version) => {
    try {
      const result = await ctx.api('private-documents/download', { method: 'POST', body: JSON.stringify({ document_id: row.id, version }) });
      if (result.url) window.location.assign(result.url);
      else toast(result.notice || 'Download registrado.', 'info');
    } catch (error) { toast(error.message, 'error'); }
  };

  const upload = async ({ file, title, visibility, documentId = null }) => {
    const problem = checkFile(file);
    if (problem) { status.textContent = problem; status.dataset.tone = 'error'; return false; }
    try {
      status.dataset.tone = 'progress';
      status.textContent = 'Preparando envio…';
      const slot = await ctx.api('private-documents/upload', { method: 'POST', body: JSON.stringify({
        organization_id: ctx.organization.id, entity_type: entityType, entity_id: entityId, title, visibility,
        mime_type: file.type, size: file.size, sha256: await sha256(file), document_id: documentId }) });
      status.textContent = `Enviando ${fileSize(file.size)}…`;
      await ctx.putFile(slot.upload_url, file);
      status.textContent = 'Conferindo o arquivo recebido…';
      await ctx.api('private-documents/complete', { method: 'POST', body: JSON.stringify({ document_id: slot.document_id, version: slot.version }) });
      status.dataset.tone = 'success';
      status.textContent = slot.version > 1 ? `Versão ${slot.version} registrada. A anterior continua no histórico.` : 'Documento anexado.';
      refresh();
      return true;
    } catch (error) {
      status.dataset.tone = 'error';
      status.textContent = error.message;
      return false;
    }
  };

  const versionInput = (row) => {
    const input = el('input', { type: 'file', accept: Object.keys(TYPES).join(','), hidden: true, tabindex: '-1', 'aria-label': `Nova versão de ${row.title}` });
    input.addEventListener('change', async () => { if (input.files?.[0]) await upload({ file: input.files[0], title: row.title, visibility: row.visibility, documentId: row.id }); input.value = ''; });
    const trigger = button('Nova versão', { size: 'sm', variant: 'ghost', iconName: 'refresh', onClick: () => input.click(), attrs: { 'aria-label': `Enviar nova versão de ${row.title}` } });
    return el('span', {}, [input, trigger]);
  };

  const renderRow = (row) => {
    const [current, ...older] = row.versions || [];
    const shared = row.visibility === 'shared';
    const ours = row.organization_id === ctx.organization.id;
    const visibility = el('span', { class: `visibility visibility-${shared ? 'shared' : 'internal'}` }, [icon(shared ? 'eye' : 'lock', { size: 12 }),
      el('span', { text: shared ? (ours ? (shareLabel || 'Compartilhado') : 'Compartilhado com você') : ownerLabel })]);
    const actions = el('div', { class: 'document-actions' }, [
      current ? button('Baixar', { size: 'sm', iconName: 'download', onClick: () => download(row, current.version), attrs: { 'aria-label': `Baixar ${row.title}, versão ${current.version}` } }) : null,
      canUpload && ours ? versionInput(row) : null,
      canUpload && ours ? button('Remover', { size: 'sm', variant: 'ghost', iconName: 'x', onClick: async () => {
        if (!await confirmDialog({ title: `Remover “${row.title}”?`, description: 'O documento some da lista para todos. As versões enviadas continuam guardadas para auditoria e o registro da remoção fica na trilha.', confirmLabel: 'Remover documento', tone: 'danger' })) return;
        try { await ctx.api('private-documents/remove', { method: 'POST', body: JSON.stringify({ document_id: row.id }) }); toast('Documento removido. O histórico foi preservado.'); refresh(); }
        catch (error) { toast(error.message, 'error'); }
      } }) : null
    ]);
    const history = older.length ? el('details', { class: 'document-history' }, [
      el('summary', { text: `${older.length} ${older.length === 1 ? 'versão anterior' : 'versões anteriores'}` }),
      el('ul', { role: 'list' }, older.map((version) => el('li', {}, [
        el('span', { text: `v${version.version} · ${fileSize(version.size_bytes)} · ${formatDateTime(version.completed_at)} · ${people(version.uploaded_by)}` }),
        button('Baixar', { size: 'sm', variant: 'ghost', iconName: 'download', onClick: () => download(row, version.version), attrs: { 'aria-label': `Baixar ${row.title}, versão ${version.version}` } })
      ])))
    ]) : null;
    return el('li', { class: 'document-row', id: `document-${row.id}` }, [
      el('span', { class: 'document-icon', 'aria-hidden': 'true' }, icon('file', { size: 18 })),
      el('div', { class: 'document-main' }, [
        el('p', { class: 'document-title' }, [el('strong', { text: row.title }), current ? el('span', { class: 'tag tag-neutral', text: `v${current.version}` }) : null]),
        el('p', { class: 'document-meta', text: current ? `${TYPES[current.mime_type] || 'Arquivo'} · ${fileSize(current.size_bytes)} · ${formatDateTime(current.completed_at)} · ${ours ? people(current.uploaded_by) : 'enviado pela outra parte'}` : 'Envio em andamento' }),
        visibility, history
      ]),
      actions
    ]);
  };

  const refresh = () => {
    list.replaceChildren(el('li', {}, loading('Carregando documentos…')));
    ctx.api(`private-documents?organization_id=${encodeURIComponent(ctx.organization.id)}&entity_type=${entityType}&entity_id=${encodeURIComponent(entityId)}`).then(({ rows }) => {
      const visible = (rows || []).filter((row) => (row.versions || []).length);
      list.replaceChildren(...(visible.length ? visible.map(renderRow) : [el('li', {}, emptyState({ title: 'Nenhum documento anexado', text: canUpload ? 'Anexe balanços, minutas ou propostas em PDF, planilha ou imagem.' : null, compact: true, iconName: 'file' }))]));
    }).catch((error) => list.replaceChildren(el('li', {}, errorState({ title: 'Documentos indisponíveis', error }))));
  };

  section.append(list);
  if (canUpload) {
    const form = el('form', { class: 'document-form', novalidate: true });
    const fileInput = el('input', { type: 'file', name: 'file', accept: Object.keys(TYPES).join(','), required: true });
    const titleInput = el('input', { name: 'title', maxlength: '200', placeholder: 'Ex.: Balanço patrimonial 2025' });
    // O nome acompanha o arquivo escolhido até a pessoa editar o campo.
    let titleEdited = false;
    titleInput.addEventListener('input', () => { titleEdited = Boolean(titleInput.value.trim()); });
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file && !titleEdited) titleInput.value = file.name.replace(/\.[^.]+$/, '').slice(0, 200);
      const problem = checkFile(file);
      status.dataset.tone = problem ? 'error' : '';
      status.textContent = problem || (file ? `${TYPES[file.type]} · ${fileSize(file.size)}` : '');
    });
    const choices = shareLabel ? el('fieldset', { class: 'visibility-choice' }, [
      el('legend', { class: 'field-label', text: 'Quem pode ver' }),
      el('label', { class: 'radio-row' }, [el('input', { type: 'radio', name: 'visibility', value: 'internal', checked: true }), icon('lock', { size: 14 }), el('span', { text: ownerLabel })]),
      el('label', { class: 'radio-row' }, [el('input', { type: 'radio', name: 'visibility', value: 'shared' }), icon('eye', { size: 14 }), el('span', { text: shareLabel })])
    ]) : null;
    const submit = button('Anexar documento', { type: 'submit', variant: 'primary', size: 'sm', iconName: 'plus' });
    form.append(field({ label: 'Arquivo', control: fileInput, hint: 'PDF, JPG, PNG, XLSX ou DOCX até 10 MB.' }), field({ label: 'Nome do documento', control: titleInput }), choices, submit);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      submit.disabled = true;
      const ok = await upload({ file: fileInput.files?.[0], title: titleInput.value.trim() || 'Documento', visibility: form.elements.namedItem('visibility')?.value || 'internal' });
      submit.disabled = false;
      if (ok) { form.reset(); titleEdited = false; }
    });
    section.append(el('details', { class: 'document-add' }, [el('summary', {}, [icon('plus', { size: 14 }), el('span', { text: 'Anexar documento' })]), form]));
  }
  section.append(status, el('p', { class: 'muted small', text: 'Arquivos ficam em armazenamento privado. Cada download gera um link temporário e fica registrado na trilha.' }));
  refresh();
  return section;
}
