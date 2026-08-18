import fs from 'node:fs';

const api = fs.readFileSync('api/[...path].js', 'utf8');
const domain = fs.readFileSync('lib/api/domains/public-content.mjs', 'utf8');
const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const env = fs.readFileSync('.env.example', 'utf8');
const issues = [];

const rewrite = vercel.rewrites?.find((item) => item.source === '/.well-known/security.txt');
if (rewrite?.destination !== '/api/security-contact') issues.push('security.txt não está ligado ao handler fail-closed.');
if (!api.includes("route === 'security-contact'")) issues.push('Router não expõe o handler interno de security.txt.');
if (!domain.includes('ARANDU_SECURITY_CONTACT') || !domain.includes('ARANDU_SECURITY_EXPIRES')) issues.push('Contato ou expiração não são validados.');
if (!domain.includes("res.statusCode = 404") || !domain.includes("'Cache-Control', 'no-store'")) issues.push('Configuração ausente não falha fechada.');
if (!env.includes('ARANDU_SECURITY_CONTACT=') || !env.includes('ARANDU_SECURITY_EXPIRES=')) issues.push('Variáveis RFC 9116 ausentes do contrato de ambiente.');
if (issues.length) {
  issues.forEach((issue) => console.error(`- ${issue}`));
  process.exit(1);
}
console.log('security.txt: RFC 9116 configurável e fail-closed verificado.');
