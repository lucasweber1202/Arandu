const strict = process.argv.includes('--require-ready');
const issues = [];

function enabled(value) {
  return ['1','true','yes','sim'].includes(String(value || '').trim().toLowerCase());
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function reservedHostname(hostname) {
  const host = String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === 'example.com' || host.endsWith('.example.com')) return true;
  if (host === 'example.org' || host.endsWith('.example.org')) return true;
  if (host === 'example.net' || host.endsWith('.example.net')) return true;
  if (host === 'example' || host.endsWith('.example')) return true;
  if (host === 'invalid' || host.endsWith('.invalid')) return true;
  if (host === 'test' || host.endsWith('.test')) return true;
  return false;
}

function validPublicEmail(value) {
  const email = String(value || '').trim();
  if (!validEmail(email)) return false;
  const [, domain = ''] = email.split('@');
  return !reservedHostname(domain);
}

let siteUrl = null;
try {
  const parsed = new URL(process.env.ARANDU_SITE_URL);
  if (
    parsed.protocol === 'https:'
    && !reservedHostname(parsed.hostname)
    && !parsed.hostname.endsWith('.vercel.app')
  ) {
    siteUrl = parsed.toString().replace(/\/$/, '');
  }
} catch {}

const whatsapp = String(process.env.ARANDU_WHATSAPP_NUMBER || '').replace(/\D/g, '');
const contactReady = whatsapp.length >= 12 || validPublicEmail(process.env.ARANDU_CONTACT_EMAIL);
const brandReady = enabled(process.env.ARANDU_BRAND_READY);
if (!siteUrl) issues.push('ARANDU_SITE_URL precisa usar HTTPS em domínio próprio não reservado.');
if (!contactReady) issues.push('Configure WhatsApp real ou e-mail comercial válido em domínio não reservado.');
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
