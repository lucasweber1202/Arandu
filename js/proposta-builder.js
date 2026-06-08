const PROPOSAL_TOKEN_KEY = 'arandu.admin.token';

function proposalToken() { return localStorage.getItem(PROPOSAL_TOKEN_KEY) || ''; }
function proposalTarget() { return document.querySelector('[data-proposal-builder]'); }
async function proposalRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'x-arandu-admin-token': proposalToken(), ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || 'Erro ao salvar proposta.');
  return data;
}
function renderProposalBuilder() {
  const target = proposalTarget();
  if (!target) return;
  target.innerHTML = `<form class="form-card" data-proposal-form><h3>Nova proposta curatorial</h3><div class="grid grid-3"><input name="title" placeholder="Título da proposta" required/><input name="client_name" placeholder="Cliente"/><input name="client_company" placeholder="Empresa"/><input name="client_email" placeholder="Email"/><input name="total" placeholder="Valor total estimado"/><input name="valid_until" type="date"/></div><textarea name="notes" placeholder="Resumo da seleção, condições, logística e observações curatoriais"></textarea><button type="submit">Salvar proposta</button><p data-proposal-status class="selection-summary"></p></form>`;
}
async function submitProposal(form) {
  const status = form.querySelector('[data-proposal-status]');
  status.textContent = 'Salvando proposta...';
  const payload = Object.fromEntries(new FormData(form).entries());
  const result = await proposalRequest('/api/admin/operational?resource=proposals', { method: 'POST', body: JSON.stringify(payload) });
  status.textContent = `Proposta salva. ID: ${result.item?.id || 'registro criado'}`;
  form.reset();
  document.querySelector('[data-panel-refresh]')?.click();
}
document.addEventListener('click', (event) => { if (event.target.closest('[data-new-proposal]')) renderProposalBuilder(); });
document.addEventListener('submit', async (event) => { const form = event.target.closest('[data-proposal-form]'); if (!form) return; event.preventDefault(); try { await submitProposal(form); } catch (error) { form.querySelector('[data-proposal-status]').textContent = error.message; } });
