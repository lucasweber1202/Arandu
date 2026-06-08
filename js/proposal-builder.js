const PROPOSAL_KEY = 'arandu.proposal.v1';

function escapeProposalHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function readProposalSelection() {
  try { const data = JSON.parse(localStorage.getItem('arandu.selection.v1') || '[]'); return Array.isArray(data) ? data : []; } catch { return []; }
}

function readProposalState() {
  try { return JSON.parse(localStorage.getItem(PROPOSAL_KEY) || '{}'); } catch { return {}; }
}

function writeProposalState(data) {
  localStorage.setItem(PROPOSAL_KEY, JSON.stringify(data));
}

function parseCurrencyFromText(value) {
  const raw = String(value || '').replace(/[^0-9]/g, '');
  return Number(raw || 0);
}

function inferredTotal(items) {
  return items.reduce((sum, item) => sum + parseCurrencyFromText(`${item.price || ''} ${item.context || ''}`), 0);
}

function proposalStateFromForm() {
  const form = document.querySelector('[data-proposal-form]');
  const data = readProposalState();
  if (!form) return data;
  form.querySelectorAll('[data-proposal-field]').forEach((field) => { data[field.name] = field.value.trim(); });
  writeProposalState(data);
  return data;
}

function syncProposalForm() {
  const form = document.querySelector('[data-proposal-form]');
  if (!form) return;
  const data = readProposalState();
  form.querySelectorAll('[data-proposal-field]').forEach((field) => { if (data[field.name]) field.value = data[field.name]; });
}

function buildProposalText() {
  const data = readProposalState();
  const items = readProposalSelection();
  const works = items.length ? items.map((item, index) => `${index + 1}. ${item.title} — ${item.artist}\n   Contexto: ${item.context}\n   Observação: ${item.note || 'sem observação'}\n   Link: ${item.url || 'obras.html'}`).join('\n\n') : 'Nenhuma obra selecionada.';
  return `Proposta curatorial Arandu\n\nCliente: ${data.client || 'não informado'}\nEspaço: ${data.space || 'não informado'}\nObjetivo: ${data.goal || 'não informado'}\nOrçamento: ${data.budget || 'não informado'}\nPrazo: ${data.deadline || 'não informado'}\nObservações: ${data.notes || 'sem observações'}\n\nObras sugeridas:\n${works}\n\nPróximos passos: confirmar disponibilidade, reserva, certificado, logística e pagamento.`;
}

function buildProposalHtml() {
  const data = readProposalState();
  const items = readProposalSelection();
  const total = inferredTotal(items);
  const totalLabel = total ? total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'sob consulta';
  const works = items.length ? items.map((item) => `<article class="proposal-work"><h3>${escapeProposalHtml(item.title)}</h3><p>${escapeProposalHtml(item.artist)} · ${escapeProposalHtml(item.context)}</p><p>${escapeProposalHtml(item.note || 'Obra selecionada para leitura curatorial.')}</p><p><strong>Link:</strong> ${escapeProposalHtml(item.url || 'obras.html')}</p></article>`).join('') : '<p>Nenhuma obra selecionada. Salve obras no acervo para completar a proposta.</p>';
  return `
    <h2>Proposta curatorial Arandu</h2>
    <p>Seleção preliminar para ${escapeProposalHtml(data.client || 'cliente em análise')}.</p>
    <div class="proposal-summary">
      <span>${escapeProposalHtml(data.space || 'Espaço não informado')}</span>
      <span>${escapeProposalHtml(data.goal || 'Objetivo não informado')}</span>
      <span>${escapeProposalHtml(data.budget || 'Orçamento não informado')}</span>
    </div>
    <p><strong>Prazo:</strong> ${escapeProposalHtml(data.deadline || 'a definir')}</p>
    <p><strong>Observações:</strong> ${escapeProposalHtml(data.notes || 'sem observações adicionais')}</p>
    <h3>Obras sugeridas</h3>
    ${works}
    <p class="proposal-total">Total indicativo: ${escapeProposalHtml(totalLabel)}</p>
    <p>Esta proposta é preliminar. A versão final deve confirmar disponibilidade, certificado, logística, reserva e condições comerciais.</p>`;
}

function renderProposal() {
  proposalStateFromForm();
  const target = document.querySelector('[data-proposal-preview]');
  if (!target) return;
  target.innerHTML = buildProposalHtml();
}

async function copyProposal() {
  renderProposal();
  const text = buildProposalText();
  try {
    await navigator.clipboard.writeText(text);
    document.querySelectorAll('[data-proposal-copy]').forEach((button) => { button.textContent = 'Proposta copiada'; });
  } catch {
    alert(text);
  }
}

function downloadProposal() {
  renderProposal();
  const html = `<!doctype html><html><head><meta charset="UTF-8"><title>Proposta Arandu</title><style>body{font-family:Arial,sans-serif;background:#efe3d1;color:#211713;padding:42px}h1,h2,h3{font-family:Georgia,serif;color:#5a1f1a}.box{background:#f7ead9;border:1px solid #ad8a62;border-radius:24px;padding:28px}.proposal-work{border-top:1px solid #ad8a62;padding-top:14px;margin-top:14px}</style></head><body><div class="box">${buildProposalHtml()}</div></body></html>`;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'proposta-curatorial-arandu.html';
  link.click();
  URL.revokeObjectURL(url);
}

window.ARANDU_BUILD_PROPOSAL_MESSAGE = buildProposalText;

document.addEventListener('input', (event) => {
  if (event.target.closest('[data-proposal-field]')) renderProposal();
});

document.addEventListener('change', (event) => {
  if (event.target.closest('[data-proposal-field]')) renderProposal();
});

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-proposal-copy]')) { event.preventDefault(); copyProposal(); }
  if (event.target.closest('[data-proposal-download]')) { event.preventDefault(); downloadProposal(); }
});

document.addEventListener('DOMContentLoaded', () => { syncProposalForm(); renderProposal(); });
