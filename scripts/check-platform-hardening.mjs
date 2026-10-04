import fs from 'node:fs';

// Hardening de plataforma da API financeira: rate limit distribuído, chave
// anônima para o fluxo de conta, recuperação de senha, Idempotency-Key na
// escrita da Public API v1 e build com entradas HTML explícitas. Os fluxos da
// antiga vertical de arte (catálogo, revisão editorial, LGPD de comprador,
// métricas de conversão) foram aposentados (docs/LEGACY_ART_RETIREMENT.md).

const issues = [];
const read = (file) => fs.readFileSync(file, 'utf8');
const api = [
  read('api/[...path].js'),
  ...fs.readdirSync('lib/api/domains').filter((file) => file.endsWith('.mjs')).map((file) => read(`lib/api/domains/${file}`))
].join('\n');
function need(file, source, term, message) { if (!source.includes(term)) issues.push(`${file}: ${message}`); }

need('api/[...path].js', api, 'SUPABASE_ANON_KEY', 'fluxo de conta não usa a chave anônima.');
need('api/[...path].js', api, 'consume_rate_limit', 'não usa rate limit distribuído.');
need('api/[...path].js', api, "action === 'reset-password'", 'recuperação de senha ausente.');
need('lib/api/domains/public-api.mjs', api, 'validIdempotencyKey', 'escrita da Public API v1 não exige Idempotency-Key.');
if (!read('vite.config.js').includes('const pages = [') || read('vite.config.js').includes('collectHtmlFiles(')) {
  issues.push('vite.config.js: entradas HTML precisam de lista explícita para não publicar relatórios ou legado.');
}

console.log('Arandu Platform Hardening Check');
console.log(`Erros: ${issues.length}`);
issues.forEach((item) => console.error(`- ${item}`));
if (issues.length) process.exit(1);
