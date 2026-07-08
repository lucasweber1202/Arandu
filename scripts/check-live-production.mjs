import process from 'node:process';

const DEFAULT_BASE_URL = process.env.ARANDU_SITE_URL || 'http://localhost:4173';
const baseUrl = String(process.argv[2] || DEFAULT_BASE_URL).replace(/\/$/, '');
const timeoutMs = Number(process.env.ARANDU_LIVE_CHECK_TIMEOUT_MS || 10000);

const checks = [
  { path: '/api/health?probe=1', type: 'json', required: true, name: 'Health + Supabase probe' },
  { path: '/api/catalog', type: 'json', required: true, name: 'Catálogo público' },
  { path: '/api/artists', type: 'json', required: true, name: 'Artistas públicos' },
  { path: '/api/auth/session', type: 'json', required: true, name: 'Sessão Auth' },
  { path: '/api/certificates?code=ARANDU-TESTE', type: 'json', required: false, name: 'Certificado público' },
  { path: '/status.html', type: 'html', required: true, name: 'Página de status' }
];

const failures = [];
const warnings = [];

function withTimeout() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, done: () => clearTimeout(timeout) };
}

function safeMessage(error) {
  return String(error?.message || error || 'Erro desconhecido').slice(0, 240);
}

async function request(path) {
  const { controller, done } = withTimeout();
  const startedAt = Date.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'GET',
      headers: { Accept: path.endsWith('.html') ? 'text/html' : 'application/json' },
      signal: controller.signal
    });
    const text = await response.text();
    let json = null;
    if ((response.headers.get('content-type') || '').includes('application/json')) {
      try { json = text ? JSON.parse(text) : null; } catch {}
    }
    return { path, ok: response.ok, status: response.status, ms: Date.now() - startedAt, text, json };
  } finally {
    done();
  }
}

function evaluateHealth(payload) {
  if (!payload?.ok) failures.push('/api/health não retornou ok=true.');
  if (!payload?.productionReady) warnings.push('/api/health indica que produção ainda não está completamente configurada.');
  if (!payload?.verifiedReady) warnings.push('/api/health?probe=1 indica que produção ainda não está verificada ponta a ponta.');
  if (payload?.missing?.length) warnings.push(`Variáveis/canais pendentes: ${payload.missing.join(', ')}.`);

  const supabase = payload?.probes?.supabase;
  if (!supabase || supabase.skipped) warnings.push('Probe Supabase não foi executado ou foi pulado.');
  if (supabase && !supabase.skipped && !supabase.ok) {
    const failed = (supabase.resources || []).filter((item) => !item.ok).map((item) => `${item.label} (${item.status})`);
    warnings.push(`Supabase com falhas: ${failed.join(', ') || 'falha não detalhada'}.`);
  }
}

function evaluateApi(check, result) {
  if (!result.ok && check.required) failures.push(`${check.name} falhou: HTTP ${result.status}.`);
  if (!result.ok && !check.required) warnings.push(`${check.name} retornou HTTP ${result.status}.`);
  if (check.type === 'json' && result.ok && !result.json) failures.push(`${check.name} não retornou JSON válido.`);
  if (result.json?.mode === 'demo') warnings.push(`${check.name} está respondendo em modo demo.`);
  if (result.json?.mode === 'pre-production') warnings.push(`${check.name} está marcado como pré-produção.`);
  if (check.path.startsWith('/api/health')) evaluateHealth(result.json);
}

console.log(`Arandu Live Production Check`);
console.log(`Base URL: ${baseUrl}`);
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

console.log('');
console.log(`Falhas: ${failures.length}`);
failures.forEach((item) => console.error(`- ${item}`));
console.log(`Alertas: ${warnings.length}`);
warnings.forEach((item) => console.warn(`- ${item}`));

if (failures.length) process.exit(1);
if (warnings.length) process.exitCode = 0;
