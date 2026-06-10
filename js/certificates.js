async function verifyCertificate(code) {
  const normalized = String(code || '').trim().toUpperCase();
  try {
    const apiResponse = await fetch('/api/certificates?code=' + encodeURIComponent(normalized), { cache: 'no-store' });
    const apiData = await apiResponse.json().catch(() => ({}));
    if (apiResponse.ok && apiData && apiData.certificate) return apiData.certificate;
  } catch {}
  try {
    const response = await fetch('data/certificates.json', { cache: 'no-store' });
    const certificates = await response.json();
    if (!Array.isArray(certificates)) return null;
    return certificates.find((certificate) => String(certificate.code || '').toUpperCase() === normalized) || null;
  } catch {
    return null;
  }
}

function escapeCertificateHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function renderCertificateResult(target, certificate) {
  if (!certificate) {
    target.innerHTML = '<h3>Não encontrado</h3><p>Este código não aparece na base estática de certificados. Confira o código ou fale com a curadoria.</p><div class="page-actions"><a class="cta secondary" href="contato.html">Falar com a curadoria</a></div>';
    return;
  }

  const artwork = certificate.artwork || certificate.artworks || certificate.payload?.artwork || {};
  const payload = certificate.payload || {};
  const artist = artwork.artists || {};
  const status = certificate.verification_status || 'valid';
  const issuedAt = certificate.issued_at ? new Date(certificate.issued_at).toLocaleDateString('pt-BR') : '—';
  target.innerHTML = `
    <span class="certificate-status">${escapeCertificateHtml(status === 'valid' ? 'Certificado válido' : status)}</span>
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

  const certificate = await verifyCertificate(code);
  renderCertificateResult(target, certificate);
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
