#!/usr/bin/env node
// Paridade da Demo PUBLICADA com o produto canônico — só leitura, sem login.
// A identidade vem do servidor (/api/health), nunca de um selo na tela.
//
//   node scripts/demo/hosted-parity.mjs --url=https://demo.exemplo --sha=<commit esperado>
//   node scripts/demo/hosted-parity.mjs --url=https://localhost:4443 --local   (laboratório)
//
// Passa só quando TODOS os itens passam. "Não verificado" nunca conta como PASS.
// Saída: uma linha por item e reports/demo-parity/hosted.json.
import { mkdirSync, writeFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => { const [k, ...v] = arg.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
const base = String(args.url || process.env.ARANDU_DEMO_APP_URL || '').replace(/\/$/, '');
const expectedSha = args.sha ? String(args.sha) : null;
const local = Boolean(args.local);
if (!/^https:\/\//.test(base)) { console.error('Informe --url=https://… (a Demo publicada) ou --url=https://localhost:4443 --local.'); process.exit(2); }
if (local && !/^https:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) { console.error('--local só vale para localhost.'); process.exit(2); }
if (local) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // certificado autoassinado do laboratório

const checks = [];
const record = (id, ok, detail) => { checks.push({ id, result: ok === null ? 'NOT_RUN' : ok ? 'PASS' : 'FAIL', detail }); };
async function get(path) {
  try {
    const response = await fetch(`${base}${path}`, { redirect: 'manual', headers: { Accept: 'application/json, text/html' } });
    const text = await response.text();
    let json = null; try { json = JSON.parse(text); } catch { /* HTML */ }
    return { status: response.status, json, text };
  } catch (error) { return { status: 0, json: null, text: '', error: error.message }; }
}

const health = await get('/api/health');
const release = health.json?.release || {};
record('health-alive', health.status === 200 && health.json?.status === 'alive', `HTTP ${health.status}`);
record('environment-demo', release.environment === 'demo', `environment=${release.environment ?? 'ausente'}`);
// Fixture sintética no navegador ou no servidor não é a Demo canônica.
record('datasource-supabase', release.datasource === 'supabase', `datasource=${release.datasource ?? 'ausente'}`);
record('not-misconfigured', release.misconfigured === false, `misconfigured=${release.misconfigured}`);
if (local) record('release-sha', null, 'laboratório local: sem commit publicado');
else record('release-sha', Boolean(expectedSha) && release.commit === expectedSha, expectedSha ? `commit=${release.commit ?? 'ausente'} esperado=${expectedSha}` : 'informe --sha=<commit> esperado');

const ready = await get('/api/health?probe=ready');
// Localmente o banco não pertence à topologia hospedada: 503 é esperado e registrado, não promovido.
record('readiness', ready.status === 200 && ready.json?.status === 'ready', `HTTP ${ready.status} status=${ready.json?.status ?? 'ausente'}${local && ready.status === 503 ? ' (esperado no laboratório: banco fora da topologia hospedada)' : ''}`);

const personas = await get('/api/auth/demo-personas');
record('persona-entry', personas.status === 200 && Array.isArray(personas.json?.personas) && personas.json.personas.length > 0, `HTTP ${personas.status} personas=${personas.json?.personas?.length ?? 0}`);

const login = await get('/login.html');
record('login-canonical', login.status === 200 && /financial-auth/.test(login.text) && !/data-mode="demo"/.test(login.text), `HTTP ${login.status}`);
const shell = await get('/finance/dashboard.html');
record('finance-shell-canonical', shell.status === 200 && !/\/finance\/demo\/|data-mode="demo"|demo-banner/.test(shell.text), `HTTP ${shell.status}`);
// O sandbox legado não pode ser o que o visitante encontra em /demo depois do cutover.
const sandbox = await get('/demo/index.html');
record('no-legacy-sandbox', !(sandbox.status === 200 && /data-mode="demo"|finance\/demo\/workspace/.test(sandbox.text)), `HTTP ${sandbox.status}${sandbox.status === 200 ? ' (página servida)' : ''}`);

mkdirSync('reports/demo-parity', { recursive: true });
const failed = checks.filter((check) => check.result !== 'PASS');
const report = { url: base, local, expected_sha: expectedSha, checked_at: new Date().toISOString(), release, verdict: failed.length ? 'NOT_READY' : 'READY', checks };
writeFileSync('reports/demo-parity/hosted.json', `${JSON.stringify(report, null, 2)}\n`);
for (const check of checks) console.log(`${check.result.padEnd(8)} ${check.id.padEnd(24)} ${check.detail}`);
console.log(`\nVeredito: ${report.verdict}${failed.length ? ` (${failed.map((check) => check.id).join(', ')})` : ''}`);
process.exit(failed.length ? 1 : 0);
