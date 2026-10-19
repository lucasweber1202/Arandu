#!/usr/bin/env node
// Paridade da Demo PUBLICADA com o produto canônico — só leitura, sem login.
// A identidade vem do servidor (/api/health), nunca de um selo na tela.
//
//   node scripts/demo/hosted-parity.mjs --url=https://demo.exemplo --sha=<commit esperado>
//   node scripts/demo/hosted-parity.mjs --url=https://localhost:4443 --local   (laboratório)
//
// Veredito: READY (tudo comprovado), NOT_READY (falha comprovada), ACCESS_BLOCKED
// (o verificador não tem acesso) ou INCONCLUSIVE (transporte/sem prova). Só READY sai com 0.
// "Não verificado" nunca conta como PASS.
// Saída: uma linha por item e reports/demo-parity/hosted.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import { releaseIdentityChecks, transportOutcome, verdict } from './hosted-parity-verdict.mjs';
import { assessPublicHealth } from '../../lib/live-release-health.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => { const [k, ...v] = arg.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
const base = String(args.url || process.env.ARANDU_DEMO_APP_URL || '').replace(/\/$/, '');
const expectedSha = args.sha ? String(args.sha) : null;
const local = Boolean(args.local);
if (!/^https:\/\//.test(base)) { console.error('Informe --url=https://… (a Demo publicada) ou --url=https://localhost:4443 --local.'); process.exit(2); }
if (local && !/^https:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) { console.error('--local só vale para localhost.'); process.exit(2); }
if (local) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // certificado autoassinado do laboratório

const checks = [];
const record = (id, result, detail) => { checks.push({ id, result, detail }); };
async function get(path) {
  try {
    const response = await fetch(`${base}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(20000), headers: { Accept: 'application/json, text/html, */*' } });
    const text = await response.text();
    let json = null; try { json = JSON.parse(text); } catch { /* HTML ou JS */ }
    // "Da aplicação": JSON com corpo ou página do Arandu. A tela de proteção de deploy
    // ou de um proxy (401/403 em HTML de terceiros) não é resposta da aplicação.
    const app = Boolean(json && typeof json === 'object') || /Arandu/.test(text);
    return { status: response.status, json, text, app, type: response.headers.get('content-type') || '', location: response.headers.get('location') };
  } catch (error) { return { status: 0, json: null, text: '', app: false, type: '', error: error.name === 'TimeoutError' ? 'timeout' : error.message }; }
}
/** PASS/FAIL só quando a resposta é da aplicação; senão BLOCKED (acesso) ou UNKNOWN (transporte). */
function judge(id, response, ok, detail) {
  const transport = transportOutcome(response);
  const base = `HTTP ${response.status}${response.error ? ` (${response.error})` : ''}`;
  if (transport) record(id, transport, `${base}${transport === 'BLOCKED' ? ' — acesso bloqueado ao verificador (proteção de deploy/proxy)' : ' — sem resposta da aplicação'}`);
  else record(id, ok(response) ? 'PASS' : 'FAIL', detail ? `${base} ${detail(response)}` : base);
}

const health = await get('/api/health');
const release = health.json?.release || {};
// O domínio verificado responde por si: redirecionar para outro host não é esta Demo.
const offsite = health.location && !String(health.location).startsWith(base) && /^https?:\/\//.test(health.location);
if (offsite) record('domain', 'FAIL', `redireciona para ${new URL(health.location).host}`);
else judge('domain', health, (r) => r.status === 200 && r.app, (r) => `${new URL(base).host}${r.app ? '' : ' — não respondeu como o Arandu'}`);
judge('health-alive', health, (r) => r.status === 200 && r.json?.status === 'alive');
judge('environment-demo', health, () => release.environment === 'demo', () => `environment=${release.environment ?? 'ausente'}`);
// Fixture sintética no navegador ou no servidor não é a Demo canônica.
judge('datasource-supabase', health, () => release.datasource === 'supabase', () => `datasource=${release.datasource ?? 'ausente'}`);
judge('not-misconfigured', health, () => release.misconfigured === false, () => `misconfigured=${release.misconfigured}`);
if (local) record('release-sha', 'NOT_RUN', 'laboratório local: sem commit publicado');
else if (!expectedSha) record('release-sha', 'NOT_RUN', 'informe --sha=<commit> esperado');
else judge('release-sha', health, () => release.commit === expectedSha, () => `commit=${release.commit ?? 'ausente'} esperado=${expectedSha}`);

const ready = await get('/api/health?probe=ready');
if (local) {
  // Localmente o banco não pertence à topologia hospedada: 503 é esperado e registrado, não promovido.
  // O laboratório nunca atesta hospedagem.
  judge('readiness', ready, (r) => r.status === 200 && r.json?.status === 'ready', (r) => `status=${r.json?.status ?? 'ausente'}${r.status === 503 ? ' (esperado no laboratório: banco fora da topologia hospedada)' : ''}`);
} else {
  // Hospedado: liveness e readiness passam pelo mesmo contrato estrito de identidade (SHA completo).
  for (const check of releaseIdentityChecks(health, ready, { expectedSha }, assessPublicHealth)) checks.push(check);
}

const personas = await get('/api/auth/demo-personas');
judge('persona-entry', personas, (r) => r.status === 200 && Array.isArray(r.json?.personas) && r.json.personas.length > 0, (r) => `personas=${r.json?.personas?.length ?? 0}`);
// Sem sessão, dado financeiro nunca sai: 401 da aplicação é o esperado.
const anonymous = await get('/api/finance/organizations');
judge('auth-required', anonymous, (r) => r.status === 401, (r) => (r.status === 200 ? '— devolveu dados sem sessão' : ''));

const login = await get('/login.html');
judge('login-canonical', login, (r) => r.status === 200 && /financial-auth/.test(r.text) && !/data-mode="demo"/.test(r.text));
// Assets com hash do build: lidos do próprio login.html (o visitante baixa exatamente estes).
const assets = [...login.text.matchAll(/<(?:script[^>]+src|link[^>]+stylesheet[^>]+href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]);
if (!assets.length) judge('assets', login, () => false, () => 'login.html sem scripts/estilos do build');
for (const asset of assets) {
  const kind = asset.endsWith('.css') ? /css/ : /javascript/;
  judge(`asset ${asset.replace(/-[\w-]{8}\./, '.')}`, await get(asset), (r) => r.status === 200 && kind.test(r.type), (r) => r.type.split(';')[0]);
}
const shell = await get('/finance/dashboard.html');
judge('finance-shell-canonical', shell, (r) => r.status === 200 && !/\/finance\/demo\/|data-mode="demo"|demo-banner/.test(r.text));
for (const route of ['/finance/rfq.html', '/finance/contracts.html', '/provider/proposal.html']) judge(`route ${route}`, await get(route), (r) => r.status === 200);
// O sandbox legado não pode ser o que o visitante encontra em /demo depois do cutover.
const sandbox = await get('/demo/index.html');
judge('no-legacy-sandbox', sandbox, (r) => !(r.status === 200 && /data-mode="demo"|finance\/demo\/workspace/.test(r.text)), (r) => (r.status === 200 ? '(página servida)' : ''));

mkdirSync('reports/demo-parity', { recursive: true });
const failed = checks.filter((check) => check.result !== 'PASS');
const report = { url: base, local, expected_sha: expectedSha, checked_at: new Date().toISOString(), release, verdict: verdict(checks, { local }), checks };
writeFileSync('reports/demo-parity/hosted.json', `${JSON.stringify(report, null, 2)}\n`);
for (const check of checks) console.log(`${check.result.padEnd(8)} ${check.id.padEnd(32)} ${check.detail}`);
console.log(`\nVeredito: ${report.verdict}${failed.length ? ` (${failed.map((check) => check.id).join(', ')})` : ''}`);
process.exit(report.verdict === 'READY' ? 0 : 1);
