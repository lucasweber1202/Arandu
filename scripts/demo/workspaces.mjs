#!/usr/bin/env node
// Pool de workspaces da Demo canônica (docs/demo/VISITOR_ISOLATION.md).
//
//   node scripts/demo/workspaces.mjs list
//   node scripts/demo/workspaces.mjs provision --count=3   # monta N Vitta Foods pelo seed real
//   node scripts/demo/workspaces.mjs cleanup               # apaga vencidos e falhos (só o escopo deles)
//
// Mesmas travas do seed (lib/finance/demo-guard.mjs): ARANDU_ENV=demo,
// ARANDU_DEMO_CONFIRM repetindo o alvo, nunca dentro de deploy, banco marcado
// como demonstração. Cada workspace é semeado por um processo próprio do seed
// com ARANDU_DEMO_WORKSPACE=<slug>; só entra no pool se TODAS as checagens
// passarem. A limpeza nunca toca o baseline nem workspaces reivindicados válidos.
import { spawnSync } from 'node:child_process';
import { assertDemoTarget, DemoGuardError, DEMO_MARKER_KEY, DEMO_MARKER_VALUE } from '../../lib/finance/demo-guard.mjs';
import { newSlug } from '../../lib/finance/demo-workspaces.mjs';

const [command = 'list', ...rest] = process.argv.slice(2);
const option = (name, fallback) => Number(rest.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1] ?? fallback);

let config;
try { config = assertDemoTarget(process.env); } catch (error) {
  if (error instanceof DemoGuardError) { console.error('Recusado. Nada foi escrito.'); for (const reason of error.reasons) console.error(`  - ${reason}`); process.exit(2); }
  throw error;
}

async function service(path, { method = 'GET', body, prefer } = {}) {
  const headers = { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) };
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path.split('?')[0]}: ${response.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

const marker = (await service(`fin_settings?select=value&key=eq.${DEMO_MARKER_KEY}`))?.[0]?.value;
if (marker !== DEMO_MARKER_VALUE) { console.error('Banco sem marcador de demonstração: recusado. Semeie o baseline (npm run demo:seed) antes.'); process.exit(2); }

const rows = () => service('fin_demo_workspaces?select=slug,status,baseline_version,created_at,ready_at,claimed_at,expires_at,idle_expires_at,cleanup_attempts,last_error&order=created_at');
const seed = (slug, flag) => spawnSync(process.execPath, ['scripts/demo/seed.mjs', ...(flag ? [flag] : []), '--quiet'], {
  cwd: process.cwd(), stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, ARANDU_DEMO_WORKSPACE: slug }
});

if (command === 'list') {
  const list = await rows();
  const by = list.reduce((acc, row) => ({ ...acc, [row.status]: (acc[row.status] || 0) + 1 }), {});
  console.log(`Workspaces: ${list.length} (${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(', ') || 'nenhum'})`);
  for (const row of list) console.log(`  ${row.slug}  ${row.status.padEnd(12)} ${row.baseline_version}  expira ${row.expires_at || '—'}${row.last_error ? `  erro: ${row.last_error}` : ''}`);
} else if (command === 'provision') {
  const count = option('count', 1);
  if (!Number.isInteger(count) || count < 1 || count > 20) { console.error('--count entre 1 e 20.'); process.exit(2); }
  let ok = 0;
  for (let index = 0; index < count; index += 1) {
    const slug = newSlug();
    const started = Date.now();
    console.log(`Provisionando workspace ${slug} (${index + 1}/${count})…`);
    const result = seed(slug);
    const seconds = Math.round((Date.now() - started) / 1000);
    if (result.status === 0) { ok += 1; console.log(`  pronto em ${seconds} s.`); }
    else {
      console.error(`  falhou (status ${result.status}) em ${seconds} s; removendo o escopo parcial.`);
      seed(slug, '--cleanup');
    }
  }
  console.log(`Provisionados: ${ok}/${count}.`);
  if (ok !== count) process.exit(1);
} else if (command === 'cleanup') {
  const now = Date.now();
  // Vencidos (inclusive reivindicados fora da validade), falhos e limpezas interrompidas.
  const due = (await rows()).filter((row) => ['expired', 'failed', 'cleaning'].includes(row.status)
    || (row.status === 'claimed' && (Date.parse(row.expires_at) <= now || Date.parse(row.idle_expires_at) <= now))
    || (row.status === 'provisioning' && now - Date.parse(row.created_at) > 6 * 3600_000));
  let ok = 0;
  for (const row of due) {
    const result = seed(row.slug, '--cleanup');
    if (result.status === 0) ok += 1; else console.error(`  limpeza de ${row.slug} falhou; será repetida na próxima execução.`);
  }
  console.log(`Limpeza: ${ok}/${due.length} workspace(s) removido(s).`);
  if (ok !== due.length) process.exit(1);
} else {
  console.error('uso: node scripts/demo/workspaces.mjs list | provision --count=N | cleanup');
  process.exit(2);
}
