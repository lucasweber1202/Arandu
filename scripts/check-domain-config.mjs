import { publicHostname } from '../lib/public-site-url.mjs';

const strict = process.argv.includes('--require-ready');
const issues = [];

function reservedHostname(hostname) {
  const host = String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
  if (!host) return true;
  // Placeholder como `sua-url-da-vercel` não tem TLD: sem esta guarda o gate
  // de domínio próprio ficava verde com o valor de exemplo do .env.
  if (!publicHostname(host)) return true;
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === 'example.com' || host.endsWith('.example.com')) return true;
  if (host === 'example.org' || host.endsWith('.example.org')) return true;
  if (host === 'example.net' || host.endsWith('.example.net')) return true;
  if (host === 'example' || host.endsWith('.example')) return true;
  if (host === 'invalid' || host.endsWith('.invalid')) return true;
  if (host === 'test' || host.endsWith('.test')) return true;
  return false;
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

if (!siteUrl) issues.push('ARANDU_SITE_URL precisa usar HTTPS em domínio próprio não reservado.');

console.log('Arandu Domain Check');
console.log(`Domínio próprio: ${Boolean(siteUrl)}`);
if (issues.length) {
  console.warn('\nPendências externas:');
  issues.forEach((issue) => console.warn(`- ${issue}`));
}
if (strict && issues.length) process.exit(1);
