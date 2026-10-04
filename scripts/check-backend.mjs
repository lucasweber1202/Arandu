import fs from 'node:fs';

// Backend do Arandu Financial Procurement: a API consolidada continua pequena,
// o health público só diz liveness, a sessão usa cookie HttpOnly, nenhum
// segredo administrativo compartilhado volta, e as funções serverless da antiga
// vertical de arte (aposentada, docs/LEGACY_ART_RETIREMENT.md) não reaparecem.

const issues = [];
const requiredFiles = [
  'api/[...path].js',
  'api/health.js',
  'api/email-dispatch.js',
  'lib/api-core.mjs',
  'lib/api/domains/auth.mjs',
  'lib/api/domains/sso.mjs',
  'lib/api/domains/finance.mjs',
  'lib/api/domains/finance-core.mjs',
  'lib/api/domains/finance-enterprise.mjs',
  'lib/api/domains/finance-jobs.mjs',
  'lib/api/domains/finance-governance.mjs',
  'lib/api/domains/public-api.mjs',
  'docs/supabase-migrations.json',
  'scripts/test-api-core.mjs'
];
// Funções serverless aposentadas com a vertical de arte: voltar qualquer uma
// reabre superfície e aumenta a contagem de funções na Vercel.
const retiredServerlessFiles = [
  'api/admin-auth.js', 'api/internal-page.js', 'api/readiness.js', 'api/collections.js', 'api/commercial.js',
  'api/mvp-dashboard.js', 'api/upload.js', 'api/orders.js', 'api/account-orders.js'
];

requiredFiles.forEach((file) => { if (!fs.existsSync(file)) issues.push(`Arquivo obrigatório ausente: ${file}`); });
retiredServerlessFiles.forEach((file) => { if (fs.existsSync(file)) issues.push(`Função serverless aposentada reapareceu: ${file}`); });
const functions = fs.readdirSync('api').filter((file) => file.endsWith('.js'));
if (functions.length > 3) issues.push(`API deve ter no máximo 3 funções (roteador, health, despacho de e-mail); encontradas: ${functions.join(', ')}.`);

function includes(file, term) { return fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(term); }
const api = 'api/[...path].js';
const domainDirectory = 'lib/api/domains';
const domainFiles = fs.readdirSync(domainDirectory).filter((file) => file.endsWith('.mjs')).map((file) => `${domainDirectory}/${file}`);
const apiSourceGraph = [api, ...domainFiles].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const apiIncludes = (term) => apiSourceGraph.includes(term);

const apiSource = fs.readFileSync(api, 'utf8');
const apiLines = apiSource.split(/\r?\n/).length;
if (apiLines > 500) issues.push(`Router da API voltou a exceder o budget de 500 linhas: ${apiLines}.`);
if (Buffer.byteLength(apiSource, 'utf8') > 25_000) issues.push('Router da API voltou a exceder o budget de 25 KB.');
if (!apiSource.includes("from '../lib/api-core.mjs'")) issues.push('API consolidada não usa o núcleo HTTP compartilhado.');
for (const declaration of ['class HttpError', 'function readBody(', 'async function handleAuth(']) {
  if (apiSource.includes(declaration)) issues.push(`API consolidada reintroduziu responsabilidade extraída: ${declaration}.`);
}
for (const route of ['finance/', 'jobs/renewals', 'jobs/webhooks', 'jobs/governance', 'v1', 'auth/', 'security-contact']) {
  if (!apiSource.includes(route)) issues.push(`API consolidada não cobre a rota financeira: /api/${route}`);
}

if (!includes('api/health.js', "status: 'alive'")) issues.push('Health público não está limitado à liveness mínima.');
if (includes('api/health.js', 'SUPABASE_URL') || includes('api/health.js', 'process.env')) issues.push('Health público ainda expõe ou consulta configuração interna.');
const legacySecret = ['ARANDU', 'ADMIN', 'TOKEN'].join('_');
const legacyHeader = ['x-arandu', 'admin-token'].join('-');
if (apiIncludes(legacySecret) || apiIncludes(legacyHeader)) issues.push('API consolidada ainda aceita segredo administrativo compartilhado.');
if (!apiIncludes('grant_type=password')) issues.push('Login consolidado não usa fluxo de senha do Supabase Auth.');
if (!apiIncludes('HttpOnly')) issues.push('Sessão consolidada não usa cookie HttpOnly.');

console.log('Arandu Backend Check');
console.log(`Erros: ${issues.length}`);
issues.forEach((issue) => console.error(`- ${issue}`));
if (issues.length) process.exit(1);
