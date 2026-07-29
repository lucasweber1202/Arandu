#!/usr/bin/env node
import fs from 'node:fs';

const issues = [];
const read = (file) => fs.readFileSync(file, 'utf8');
const requireText = (file, text, message) => {
  if (!read(file).includes(text)) issues.push(`${file}: ${message}`);
};

const adminDashboard = read('js/admin-dashboard.js');
if (adminDashboard.includes('root.innerHTML')) {
  issues.push('js/admin-dashboard.js: dados administrativos ainda são renderizados com innerHTML.');
}
['itemTitle(item, activePanel)', 'itemSubtitle(item, activePanel)', 'label(status)'].forEach((expression) => {
  if (!adminDashboard.includes(`textContent = ${expression}`)) {
    issues.push(`js/admin-dashboard.js: "${expression}" não passa por uma renderização textual segura.`);
  }
});

const tokenFiles = [
  'js/admin-dashboard.js',
  'js/admin-console.js',
  'js/admin-cadastros.js',
  'js/artwork-editor.js',
  'js/artist-editor.js',
  'js/certificates-admin.js',
  'js/funnel-metrics.js',
  'js/history-tools.js',
  'js/lead-detail.js',
  'js/media-upload.js',
  'js/proposals-admin.js',
  'js/record-editor.js',
  'js/sales-kanban.js'
];
tokenFiles.forEach((file) => {
  const source = read(file);
  if (/localStorage\.(?:getItem|setItem|removeItem)/.test(source)) {
    issues.push(`${file}: credencial administrativa ainda pode persistir no localStorage.`);
  }
});

const certificates = read('js/certificates.js');
if (certificates.includes('data/certificates.json')) {
  issues.push('js/certificates.js: verificação pública ainda aceita base estática.');
}
requireText('scripts/copy-runtime-assets.mjs', "rmSync(demoCertificates)", 'base demonstrativa de certificados ainda é publicada.');
requireText('js/certificate-print.js', "verification_status:'não verificado'", 'impressão não falha de forma fechada.');

requireText('js/forms.js', 'ARANDU_LOCAL_DRAFT_TTL_MS', 'rascunhos de formulário não possuem expiração.');
requireText('js/forms.js', 'ARANDU_MAX_LOCAL_DRAFTS = 5', 'rascunhos de formulário não possuem limite mínimo de retenção.');
requireText('js/forms.js', 'clearLocalDrafts();', 'dados locais não são apagados após envio.');
requireText('js/reservation.js', 'ARANDU_RESERVATION_TTL_MS', 'reservas locais não possuem expiração.');
requireText('politica-de-privacidade.html', 'data-clear-local-personal-data', 'titular não possui ação de limpeza local.');

for (const file of fs.readdirSync('.').filter((name) => name.endsWith('.html'))) {
  const html = read(file);
  if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) issues.push(`${file}: script inline incompatível com a CSP estrita.`);
  if (/\son[a-z]+\s*=/i.test(html)) issues.push(`${file}: handler JavaScript inline incompatível com a CSP estrita.`);
}
for (const file of fs.readdirSync('js').filter((name) => name.endsWith('.js'))) {
  if (/\son[a-z]+\s*=/i.test(read(`js/${file}`))) {
    issues.push(`js/${file}: runtime ainda gera handler JavaScript inline incompatível com a CSP estrita.`);
  }
}

console.log('Arandu P0 Security Regression Check');
console.log(`Erros: ${issues.length}`);
if (issues.length) {
  issues.forEach((issue) => console.error(`- ${issue}`));
  process.exit(1);
}
console.log('XSS administrativo, credenciais, certificados, privacidade local e CSP validados.');
