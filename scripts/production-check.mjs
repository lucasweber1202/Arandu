import { existsSync, readFileSync } from 'node:fs';

const warnings = [];

if (!existsSync('assets/logo-arandu.png')) warnings.push('Logo PNG final ainda não existe em assets/logo-arandu.png.');

if (existsSync('data/whatsapp-config.js')) {
  const content = readFileSync('data/whatsapp-config.js', 'utf8');
  if (content.includes('5500000000000')) warnings.push('WhatsApp ainda está com número placeholder.');
}

if (existsSync('sitemap.xml')) {
  const sitemap = readFileSync('sitemap.xml', 'utf8');
  if (!sitemap.includes('https://')) warnings.push('sitemap.xml ainda usa URLs relativas; atualizar com domínio real antes da produção.');
  ['admin-preview.html', 'demo.html', 'roadmap.html', 'painel-obras.html'].forEach((internal) => {
    if (sitemap.includes(internal)) warnings.push(`Página interna aparece no sitemap público: ${internal}`);
  });
}

if (existsSync('js/forms.js')) warnings.push('Formulários ainda são locais; integrar com backend antes de depender comercialmente.');
if (existsSync('verificar-certificado.html')) warnings.push('Verificação de certificado ainda é demonstrativa.');

if (warnings.length) {
  console.warn('Atenções antes de produção:');
  warnings.forEach((item) => console.warn(`- ${item}`));
  process.exitCode = 0;
} else {
  console.log('Sem alertas críticos de pré-produção.');
}
