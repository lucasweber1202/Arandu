async function verifyCertificate(code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (window.AranduPresentation?.enabled === true || document.querySelector('meta[name="arandu-presentation-mode"]')?.content === 'true') {
    try {
      const response = await fetch('/data/certificates.json', { cache: 'no-store' });
      const certificates = await response.json();
      const certificate = Array.isArray(certificates) ? certificates.find((item) => item.code === normalized) : null;
      return certificate ? { state: 'demonstration', certificate } : { state: 'not-found', certificate: null };
    } catch { return { state: 'unavailable', certificate: null }; }
  }
  try {
    const apiResponse = await fetch('/api/certificates?code=' + encodeURIComponent(normalized), { cache: 'no-store' });
    const apiData = await apiResponse.json().catch(() => ({}));
    if (!apiResponse.ok || apiData?.ok === false) return { state: 'unavailable', certificate: null };
    return apiData?.certificate
      ? { state: 'verified', certificate: apiData.certificate }
      : { state: 'not-found', certificate: null };
  } catch {
    return { state: 'unavailable', certificate: null };
  }
}

function escapeCertificateHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function renderCertificateResult(target, result) {
  if (!['verified', 'demonstration'].includes(result?.state) || !result.certificate) {
    const unavailable = result?.state === 'unavailable';
    target.replaceChildren();
    const title = document.createElement('h3');
    title.textContent = unavailable ? 'Verificação indisponível' : 'Certificado não encontrado';
    const message = document.createElement('p');
    message.textContent = unavailable
      ? 'Não foi possível consultar a base oficial agora. Por segurança, nenhum certificado é considerado válido sem resposta do servidor.'
      : 'Este código não consta como válido na base oficial. Confira o código ou fale com a curadoria.';
    const actions = document.createElement('div');
    actions.className = 'page-actions';
    const contact = document.createElement('a');
    contact.className = 'cta secondary';
    contact.href = 'contato.html';
    contact.textContent = 'Falar com a curadoria';
    actions.appendChild(contact);
    target.append(title, message, actions);
    return;
  }

  const certificate = result.certificate;
  const demonstration = result.state === 'demonstration';
  const artwork = certificate.artwork || certificate.artworks || certificate.payload?.artwork || {};
  const payload = certificate.payload || {};
  const artist = artwork.artists || {};
  const status = certificate.verification_status || 'valid';
  const issuedAt = certificate.issued_at ? new Date(certificate.issued_at).toLocaleDateString('pt-BR') : '—';
  target.innerHTML = `
    <span class="certificate-status">${escapeCertificateHtml(demonstration ? 'Registro demonstrativo · sem validade comercial' : status === 'valid' ? 'Certificado válido' : status)}</span>
    <h3>${escapeCertificateHtml(artwork.title || payload.title || 'Obra registrada')}</h3>
    <p class="certificate-code">${escapeCertificateHtml(certificate.code || '—')}</p>
    <div class="certificate-grid">
      <p><strong>Artista</strong><br>${escapeCertificateHtml(artwork.artist || artist.name || payload.artist || 'Artista registrado')}</p>
      <p><strong>Técnica</strong><br>${escapeCertificateHtml(artwork.technique || payload.technique || '—')}</p>
      <p><strong>Dimensões</strong><br>${escapeCertificateHtml(artwork.dimensions || payload.dimensions || '—')}</p>
      <p><strong>Edição</strong><br>${escapeCertificateHtml(artwork.edition || payload.edition || '—')}</p>
      <p><strong>Ano</strong><br>${escapeCertificateHtml(artwork.year || payload.year || '—')}</p>
      <p><strong>Emissão</strong><br>${escapeCertificateHtml(issuedAt)}</p>
    </div>
    <p><strong>Observação:</strong> ${escapeCertificateHtml(certificate.certificate_notes || payload.certificate_notes || 'Registro verificado na base Arandu.')}</p>
    <div class="page-actions"><button class="button secondary" type="button" data-print-certificate>Imprimir validação</button><a class="cta secondary" href="autenticidade.html">Entender autenticidade</a></div>
  `;
}

document.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-certificate-form]');
  if (!form) return;

  event.preventDefault();
  const input = form.querySelector('[data-certificate-code]');
  const target = document.querySelector('[data-certificate-result]');
  const code = input?.value.trim().toUpperCase();

  if (!target || !code) return;
  target.innerHTML = '<h3>Consultando...</h3><p>Verificando o código informado.</p>';

  const result = await verifyCertificate(code);
  renderCertificateResult(target, result);
});

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-print-certificate]')) window.print();
});

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('id') || params.get('code');
  const input = document.querySelector('[data-certificate-code]');
  const form = document.querySelector('[data-certificate-form]');
  if (code && input && form) {
    input.value = code.toUpperCase();
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }
});
