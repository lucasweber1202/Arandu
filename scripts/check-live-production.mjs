import process from 'node:process';
import { assessPublicHealth } from '../lib/live-release-health.mjs';
import { readBoundedResponse } from '../lib/bounded-response.mjs';

const DEFAULT_BASE_URL = process.env.ARANDU_SITE_URL || 'http://localhost:4173';
const baseUrl = String(process.argv[2] || DEFAULT_BASE_URL).replace(/\/$/, '');
const timeoutMs = Number(process.env.ARANDU_LIVE_CHECK_TIMEOUT_MS || 10000);
const expectedCommit = process.argv.find(arg => arg.startsWith('--expected-commit='))?.slice('--expected-commit='.length) || process.env.VERCEL_GIT_COMMIT_SHA;
const expectedEnvironment = process.env.ARANDU_ENV || 'production';

// Produto financeiro: health, site público, portal e sessão. As rotas da
// antiga vertical de arte precisam responder 404 (superfície aposentada).
const checks = [
  { path: '/api/health', type: 'json', required: true, name: 'Health público' },
  { path: '/api/health?probe=ready', type: 'json', required: true, name: 'Readiness publicada' },
  { path: '/', type: 'html', required: true, name: 'Site público' },
  { path: '/finance/dashboard.html', type: 'html', required: true, name: 'Portal financeiro' },
  { path: '/api/finance/products', type: 'json', required: true, name: 'Catálogo de produtos financeiros' },
  { path: '/api/auth/session', type: 'json', required: false, name: 'Sessão Auth' }
];
// Páginas da vertical de arte removidas do código: 404 em qualquer ambiente.
const RETIRED_ART_PATHS = ['/comprar-arte.html', '/artistas.html', '/obra.html', '/certificado-autenticidade.html', '/painel.html'];

const failures = [];
const warnings = [];

function withTimeout() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, done: () => clearTimeout(timeout) };
}

function safeMessage(error) {
  return ['AbortError', 'TimeoutError'].includes(error?.name) ? 'TIMEOUT' : 'DEPENDENCY_UNAVAILABLE';
}

async function request(path) {
  const { controller, done } = withTimeout();
  const startedAt = Date.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'GET',
      headers: { Accept: path.endsWith('.html') ? 'text/html' : 'application/json' },
      signal: controller.signal, redirect: 'manual'
    });
    const text = response.body ? (await readBoundedResponse(response, 4 * 1024 * 1024)).toString('utf8') : '';
    let json = null;
    if ((response.headers.get('content-type') || '').includes('application/json')) {
      try { json = text ? JSON.parse(text) : null; } catch {}
    }
    return { path, ok: response.ok, status: response.status, ms: Date.now() - startedAt, text, json };
  } finally {
    done();
  }
}

function evaluateHealth(payload, readiness) {
  const check = assessPublicHealth(payload, { environment: expectedEnvironment, commit: expectedCommit, readiness });
  if (check.outcome !== 'PASS') failures.push(check.code);
}

function evaluateApi(check, result) {
  if (!result.ok && check.required) failures.push(`${check.name} falhou: HTTP ${result.status}.`);
  if (!result.ok && !check.required) warnings.push(`${check.name} retornou HTTP ${result.status}.`);
  if (check.type === 'json' && result.ok && !result.json) failures.push(`${check.name} não retornou JSON válido.`);
  if (result.json?.mode === 'demo') warnings.push(`${check.name} está respondendo em modo demo.`);
  if (result.json?.mode === 'pre-production') warnings.push(`${check.name} está marcado como pré-produção.`);
  if (check.path.startsWith('/api/health')) evaluateHealth(result.json, check.path.includes('probe=ready'));
}

console.log(`Arandu Live Production Check`);
console.log('Alvo configurado; URL omitida. SHA esperado completo é obrigatório.');
console.log('');

for (const check of checks) {
  try {
    const result = await request(check.path);
    const statusLabel = result.ok ? 'OK' : check.required ? 'ERRO' : 'ALERTA';
    console.log(`${statusLabel} ${check.name} — ${result.status} (${result.ms}ms) ${check.path}`);
    evaluateApi(check, result);
  } catch (error) {
    const message = safeMessage(error);
    if (check.required) failures.push(`${check.name} não respondeu: ${message}`);
    else warnings.push(`${check.name} não respondeu: ${message}`);
    console.log(`${check.required ? 'ERRO' : 'ALERTA'} ${check.name} — ${message} ${check.path}`);
  }
}

for (const path of RETIRED_ART_PATHS) {
  try {
    const result = await request(path);
    const retired = result.status === 404 || result.status === 410 || (result.status >= 300 && result.status < 400);
    console.log(`${retired ? 'OK' : 'ERRO'} Rota de arte aposentada — ${result.status} ${path}`);
    if (!retired) failures.push(`Rota da vertical de arte aposentada ainda responde ${result.status}: ${path}`);
  } catch (error) {
    warnings.push(`Rota aposentada não respondeu (${path}): ${safeMessage(error)}`);
  }
}

console.log('');
console.log(`Falhas: ${failures.length}`);
failures.forEach((item) => console.error(`- ${item}`));
console.log(`Alertas: ${warnings.length}`);
warnings.forEach((item) => console.warn(`- ${item}`));

// Só process.exitCode, sem encerrar à força: no Windows, sair com fetch recém-fechado
// aciona uma asserção da libuv e o código de saída vira 127.
process.exitCode = failures.length ? 1 : 0;
