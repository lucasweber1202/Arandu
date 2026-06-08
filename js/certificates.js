async function verifyCertificate(code) {
  const response = await fetch(`/api/certificates?code=${encodeURIComponent(code)}`);
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) return null;
  return result.certificate;
}

function renderCertificateResult(target, certificate) {
  if (!certificate) {
    target.innerHTML = '<h3>Não encontrado</h3><p>Este código não aparece na base de certificados. Confira o código ou fale com a curadoria.</p>';
    return;
  }

  const artwork = certificate.artwork || certificate.payload?.artwork || {};
  target.innerHTML = `
    <h3>Certificado encontrado</h3>
    <p><strong>Código:</strong> ${certificate.code || '—'}</p>
    <p><strong>Status:</strong> ${certificate.verification_status || 'valid'}</p>
    <p><strong>Obra:</strong> ${artwork.title || certificate.payload?.title || 'Obra registrada'}</p>
    <p><strong>Artista:</strong> ${artwork.artist || certificate.payload?.artist || 'Artista registrado'}</p>
    <p><strong>Técnica:</strong> ${artwork.technique || certificate.payload?.technique || '—'}</p>
    <p><strong>Dimensões:</strong> ${artwork.dimensions || certificate.payload?.dimensions || '—'}</p>
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

  const certificate = await verifyCertificate(code);
  renderCertificateResult(target, certificate);
});
