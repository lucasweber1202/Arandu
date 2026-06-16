import { existsSync, readFileSync } from 'node:fs';

const requiredEnv = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ARANDU_ADMIN_TOKEN',
  'ARANDU_WHATSAPP_NUMBER',
  'ARANDU_CONTACT_EMAIL',
  'ARANDU_SITE_URL'
];

const missing = requiredEnv.filter((key) => !process.env[key]);

const checks = [];

checks.push({
  name: 'assets/logo-arandu.png',
  ok: existsSync('assets/logo-arandu.png'),
  message: existsSync('assets/logo-arandu.png') ? 'logo encontrada' : 'logo final ausente'
});

if (existsSync('data/whatsapp-config.js')) {
  const content = readFileSync('data/whatsapp-config.js', 'utf8');
  const hasNumber = /ARANDU_WHATSAPP_NUMBER\s*=\s*['"]\d{12,14}['"]/.test(content);
  checks.push({ name: 'WhatsApp estático', ok: hasNumber, message: hasNumber ? 'número preenchido' : 'número não preenchido no arquivo estático' });
} else {
  checks.push({ name: 'WhatsApp estático', ok: false, message: 'arquivo data/whatsapp-config.js ausente' });
}

if (existsSync('sitemap.xml')) {
  const sitemap = readFileSync('sitemap.xml', 'utf8');
  const isVercelPlaceholder = sitemap.includes('arandu.vercel.app');
  checks.push({ name: 'sitemap.xml', ok: !isVercelPlaceholder, message: isVercelPlaceholder ? 'ainda usa arandu.vercel.app' : 'não usa domínio provisório da Vercel' });
} else {
  checks.push({ name: 'sitemap.xml', ok: false, message: 'sitemap ausente' });
}

console.log('Arandu — diagnóstico rápido de configuração');
console.log('\nVariáveis ausentes:');
if (missing.length === 0) console.log('- nenhuma');
else missing.forEach((key) => console.log(`- ${key}`));

console.log('\nArquivos e pendências:');
checks.forEach((check) => console.log(`- ${check.ok ? 'OK' : 'PENDENTE'} ${check.name}: ${check.message}`));

if (missing.length || checks.some((check) => !check.ok)) {
  process.exitCode = 0;
}
