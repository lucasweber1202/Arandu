const ADMIN_TOKEN_KEY = 'arandu.admin.token';

function adminToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY) || '';
}

function setAdminStatus(text, isError = false) {
  const target = document.querySelector('[data-admin-status]');
  if (!target) return;
  target.textContent = text;
  target.style.color = isError ? '#7b1f17' : '#6f221b';
}

async function adminRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-arandu-admin-token': adminToken(),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || 'Erro administrativo.');
  return data;
}

function formDataObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function setupAdminToken() {
  const input = document.querySelector('[data-admin-token]');
  if (!input) return;
  input.value = adminToken();
  input.addEventListener('input', () => {
    localStorage.setItem(ADMIN_TOKEN_KEY, input.value.trim());
  });
}

async function loadAdminPreview() {
  const target = document.querySelector('[data-admin-preview]');
  if (!target || !adminToken()) return;
  try {
    const [artists, artworks, certificates] = await Promise.all([
      adminRequest('/api/admin/artists'),
      adminRequest('/api/admin/artworks'),
      adminRequest('/api/admin/certificates')
    ]);
    target.innerHTML = `
      <div class="grid grid-3">
        <article class="card"><h3>${artists.artists?.length || 0}</h3><p>Artistas cadastrados</p></article>
        <article class="card"><h3>${artworks.artworks?.length || 0}</h3><p>Obras cadastradas</p></article>
        <article class="card"><h3>${certificates.certificates?.length || 0}</h3><p>Certificados emitidos</p></article>
      </div>`;
  } catch (error) {
    target.innerHTML = `<div class="card"><h3>Prévia indisponível</h3><p>${error.message}</p></div>`;
  }
}

document.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-admin-form]');
  if (!form) return;
  event.preventDefault();

  const type = form.dataset.adminForm;
  const endpoints = {
    artist: '/api/admin/artists',
    artwork: '/api/admin/artworks',
    certificate: '/api/admin/certificates'
  };

  try {
    setAdminStatus('Enviando cadastro...');
    const result = await adminRequest(endpoints[type], {
      method: 'POST',
      body: JSON.stringify(formDataObject(form))
    });
    setAdminStatus(`Cadastro salvo: ${type}.`);
    form.reset();
    await loadAdminPreview();
    console.log(result);
  } catch (error) {
    setAdminStatus(error.message, true);
  }
});

document.addEventListener('DOMContentLoaded', () => {
  setupAdminToken();
  loadAdminPreview();
});
