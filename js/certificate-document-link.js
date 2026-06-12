function addCertificateDocumentLink() {
  const result = document.querySelector('[data-certificate-result]');
  if (!result || result.querySelector('[data-certificate-document-link]')) return;
  const codeNode = result.querySelector('.certificate-code');
  const code = codeNode?.textContent?.trim();
  const actions = result.querySelector('.page-actions');
  if (!code || !actions || code === '—') return;
  const link = document.createElement('a');
  link.className = 'cta';
  link.dataset.certificateDocumentLink = 'true';
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.href = `/api/certificate-document?code=${encodeURIComponent(code)}`;
  link.textContent = 'Abrir certificado';
  actions.insertBefore(link, actions.firstChild);
}

const certificateDocumentObserver = new MutationObserver(addCertificateDocumentLink);
document.addEventListener('DOMContentLoaded', () => {
  const target = document.querySelector('[data-certificate-result]');
  if (target) certificateDocumentObserver.observe(target, { childList: true, subtree: true });
  addCertificateDocumentLink();
});
