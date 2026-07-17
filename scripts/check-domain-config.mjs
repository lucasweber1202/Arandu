const strict = process.argv.includes('--require-ready');
const issues = [];

function enabled(value) {
  return ['1','true','yes','sim'].includes(String(value || '').trim().toLowerCase());
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

let siteUrl = null;
try {
  const parsed = new URL(process.env.ARANDU_SITE_URL);
  if (parsed.protocol === 'https:' && !parsed.hostname.endsWith('.vercel.app') && parsed.hostname !== 'localhost') siteUrl = parsed.toString().replace(/\/$/, '');
} catch {}

const whatsapp = String(process.env.ARANDU_WHATSAPP_NUMBER || '').replace(/\D/g, '');
const contactReady = whatsapp.length >= 12 || validEmail(process.env.ARANDU_CONTACT_EMAIL);
const brandReady = enabled(process.env.ARANDU_BRAND_READY);
if (!siteUrl) issues.push('ARANDU_SITE_URL precisa usar HTTPS em domínio próprio.');
if (!contactReady) issues.push('Configure WhatsApp real ou e-mail comercial válido.');
if (!brandReady) issues.push('A identidade visual final ainda não foi aprovada em ARANDU_BRAND_READY.');

console.log('Arandu Domain, Brand & Contact Check');
console.log(`Domínio próprio: ${Boolean(siteUrl)}`);
console.log(`Contato real: ${contactReady}`);
console.log(`Marca aprovada: ${brandReady}`);
if (issues.length) {
  console.warn('\nPendências externas:');
  issues.forEach((issue) => console.warn(`- ${issue}`));
}
if (strict && issues.length) process.exit(1);
