#!/usr/bin/env node
/**
 * Gate de segurança HTTP.
 *
 * Trava regressões nos cabeçalhos servidos pela borda (vercel.json) e na guarda
 * de mesma origem das funções serverless. Roda sem rede: tudo é verificado no
 * código-fonte e, no caso da API, executando o handler com requisições forjadas.
 */
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { crossOriginRejection } from '../lib/http-security.mjs';

const issues = [];
const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));

function headersFor(source) {
  const rule = (vercel.headers || []).find((entry) => entry.source === source);
  if (!rule) {
    issues.push(`vercel.json: regra de cabeçalhos ausente para "${source}".`);
    return new Map();
  }
  return new Map(rule.headers.map((header) => [header.key, header.value]));
}

const global = headersFor('/(.*)');

const REQUIRED_GLOBAL = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-site',
  'X-Permitted-Cross-Domain-Policies': 'none'
};

Object.entries(REQUIRED_GLOBAL).forEach(([key, expected]) => {
  const actual = global.get(key);
  if (!actual) issues.push(`vercel.json: cabeçalho global "${key}" ausente.`);
  else if (actual !== expected) issues.push(`vercel.json: "${key}" deveria ser "${expected}", está "${actual}".`);
});

const hsts = global.get('Strict-Transport-Security') || '';
const maxAge = Number(hsts.match(/max-age=(\d+)/)?.[1] || 0);
if (maxAge < 31536000) issues.push('vercel.json: Strict-Transport-Security precisa de max-age de ao menos um ano.');
if (!hsts.includes('includeSubDomains')) issues.push('vercel.json: Strict-Transport-Security sem includeSubDomains.');

if (global.has('Content-Security-Policy-Report-Only') && !global.has('Content-Security-Policy')) {
  issues.push('vercel.json: CSP ainda está apenas em modo de relatório; ela precisa ser aplicada.');
}

const csp = global.get('Content-Security-Policy') || '';
if (!csp) {
  issues.push('vercel.json: Content-Security-Policy aplicada ausente.');
} else {
  const directives = new Map(
    csp.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
      const [name, ...values] = part.split(/\s+/);
      return [name, values.join(' ')];
    })
  );
  const REQUIRED_CSP = {
    'default-src': "'self'",
    'base-uri': "'self'",
    'form-action': "'self'",
    'frame-ancestors': "'self'",
    'object-src': "'none'",
    'frame-src': "'none'"
  };
  Object.entries(REQUIRED_CSP).forEach(([directive, expected]) => {
    if (!directives.has(directive)) issues.push(`CSP: diretiva "${directive}" ausente.`);
    else if (directives.get(directive) !== expected) {
      issues.push(`CSP: "${directive}" deveria ser "${expected}", está "${directives.get(directive)}".`);
    }
  });
  ['script-src', 'style-src', 'connect-src', 'img-src'].forEach((directive) => {
    if (!directives.has(directive)) issues.push(`CSP: diretiva "${directive}" ausente.`);
  });
  if ((directives.get('script-src') || '').includes("'unsafe-eval'")) {
    issues.push("CSP: script-src não pode liberar 'unsafe-eval'.");
  }
  if ((directives.get('script-src') || '').includes("'unsafe-inline'")) {
    issues.push("CSP: script-src não pode liberar 'unsafe-inline'.");
  }
  if (!csp.includes('upgrade-insecure-requests')) issues.push('CSP: upgrade-insecure-requests ausente.');
}

const apiHeaders = headersFor('/api/(.*)');
if (!String(apiHeaders.get('Cache-Control') || '').includes('no-store')) {
  issues.push('vercel.json: respostas de /api precisam de Cache-Control no-store.');
}

const publicHtmlHeaders = headersFor('/(.*).html');
const publicBrowserCache = String(publicHtmlHeaders.get('Cache-Control') || '');
const publicCdnCache = String(publicHtmlHeaders.get('Vercel-CDN-Cache-Control') || '');
if (!publicBrowserCache.includes('max-age=0') || publicBrowserCache.includes('no-store')) {
  issues.push('vercel.json: HTML público deve revalidar no navegador sem usar no-store global.');
}
if (!publicCdnCache.includes('max-age=300') || !publicCdnCache.includes('stale-while-revalidate=86400')) {
  issues.push('vercel.json: HTML público precisa de cache curto na CDN com stale-while-revalidate.');
}

if (!String(apiHeaders.get('X-Robots-Tag') || '').includes('noindex')) {
  issues.push('vercel.json: respostas de /api precisam de X-Robots-Tag noindex.');
}

// --- Guarda de mesma origem -------------------------------------------------

function fakeRequest(method, headers = {}) {
  return { method, headers, socket: { remoteAddress: '127.0.0.1' } };
}

const originCases = [
  ['POST sem Origin (cliente não-navegador)', fakeRequest('POST', { host: 'arandu-procurement.test' }), false],
  ['GET de outra origem', fakeRequest('GET', { host: 'arandu-procurement.test', origin: 'https://malicioso.example' }), false],
  ['POST de mesma origem', fakeRequest('POST', { host: 'arandu-procurement.test', origin: 'https://arandu-procurement.test' }), false],
  ['POST ignora x-forwarded-host conflitante', fakeRequest('POST', { host: 'arandu-procurement.test', 'x-forwarded-host': 'malicioso.example', origin: 'https://arandu-procurement.test' }), false],
  ['POST não confia só em x-forwarded-host', fakeRequest('POST', { host: 'interno', 'x-forwarded-host': 'arandu-procurement.test', origin: 'https://arandu-procurement.test' }), true],
  ['POST com protocolo divergente', fakeRequest('POST', { host: 'arandu-procurement.test', 'x-forwarded-proto': 'https', origin: 'http://arandu-procurement.test' }), true],
  ['POST com host malformado', fakeRequest('POST', { host: 'arandu-procurement.test@malicioso.example', origin: 'https://arandu-procurement.test' }), true],
  ['POST de outra origem', fakeRequest('POST', { host: 'arandu-procurement.test', origin: 'https://malicioso.example' }), true],
  ['DELETE de outra origem', fakeRequest('DELETE', { host: 'arandu-procurement.test', origin: 'https://malicioso.example' }), true],
  ['POST com Sec-Fetch-Site cross-site', fakeRequest('POST', { host: 'arandu-procurement.test', 'sec-fetch-site': 'cross-site' }), true],
  ['POST com Origin null', fakeRequest('POST', { host: 'arandu-procurement.test', origin: 'null', 'sec-fetch-site': 'same-origin' }), true],
  ['POST de navegador sem Origin', fakeRequest('POST', { host: 'arandu-procurement.test', 'sec-fetch-site': 'same-origin' }), true],
  ['POST com Origin malformada', fakeRequest('POST', { host: 'arandu-procurement.test', origin: 'nao-e-uma-url' }), true]
];

originCases.forEach(([label, req, shouldBlock]) => {
  const blocked = Boolean(crossOriginRejection(req));
  if (blocked !== shouldBlock) {
    issues.push(`Guarda de origem: "${label}" deveria ${shouldBlock ? 'bloquear' : 'permitir'}, mas ${blocked ? 'bloqueou' : 'permitiu'}.`);
  }
});

// --- A guarda está de fato ligada nos handlers ------------------------------

const GUARDED_APIS = {
  'api/[...path].js': 'enforceSameOrigin(req)'
};

Object.entries(GUARDED_APIS).forEach(([file, needle]) => {
  if (!fs.existsSync(file)) {
    issues.push(`Arquivo obrigatório ausente: ${file}`);
    return;
  }
  if (!fs.readFileSync(file, 'utf8').includes(needle)) {
    issues.push(`${file}: escrita sem guarda de mesma origem (${needle}).`);
  }
});

['api/email-dispatch.js'].forEach((file) => {
  if (fs.existsSync(file) && !fs.readFileSync(file, 'utf8').includes('applyApiSecurityHeaders')) {
    issues.push(`${file}: respostas sem os cabeçalhos de segurança compartilhados.`);
  }
});
const catchAllSource = fs.readFileSync('api/[...path].js', 'utf8');
const apiCoreSource = fs.readFileSync('lib/api-core.mjs', 'utf8');
if (!catchAllSource.includes("from '../lib/api-core.mjs'") || !apiCoreSource.includes('applyApiSecurityHeaders')) {
  issues.push('api/[...path].js: respostas não estão ligadas ao núcleo HTTP seguro.');
}

// --- A API bloqueia de verdade uma escrita cross-origin ---------------------

process.env.SUPABASE_URL ||= 'https://arandu-security-check.supabase.co';
process.env.SUPABASE_ANON_KEY ||= 'anon-security-check';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-security-check';

const { default: handler } = await import(`../api/[...path].js?security=${Date.now()}`);

function collectingResponse() {
  return {
    statusCode: 0,
    headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    body: '',
    end(value = '') { this.body = String(value); }
  };
}

const forgedRequest = Readable.from([Buffer.from(JSON.stringify({ email: 'alvo@example.com' }))]);
forgedRequest.method = 'POST';
forgedRequest.url = '/api/forms';
forgedRequest.headers = { host: 'arandu-procurement.test', origin: 'https://malicioso.example', 'content-type': 'application/json' };
forgedRequest.socket = { remoteAddress: '127.0.0.1' };

const forgedResponse = collectingResponse();
await handler(forgedRequest, forgedResponse);
if (forgedResponse.statusCode !== 403) {
  issues.push(`API: escrita forjada de outra origem retornou ${forgedResponse.statusCode}, esperado 403.`);
}
if (forgedResponse.headers['x-frame-options'] !== 'DENY') {
  issues.push('API: respostas JSON sem X-Frame-Options DENY.');
}

console.log('Arandu HTTP Security Check');
console.log(`Cabeçalhos globais verificados: ${Object.keys(REQUIRED_GLOBAL).length + 2}`);
console.log(`Casos de origem verificados: ${originCases.length}`);
console.log(`Erros: ${issues.length}`);
if (issues.length) {
  issues.forEach((issue) => console.error(`- ${issue}`));
  process.exit(1);
}
console.log('CSP aplicada, cabeçalhos de borda e guarda de mesma origem validados.');
