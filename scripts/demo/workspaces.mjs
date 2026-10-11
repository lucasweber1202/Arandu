#!/usr/bin/env node
// Pool de workspaces da Demo canônica (docs/demo/VISITOR_ISOLATION.md).
//
//   node scripts/demo/workspaces.mjs list
//   node scripts/demo/workspaces.mjs provision --count=3 [--concurrency=2]
//   node scripts/demo/workspaces.mjs cleanup
//   node scripts/demo/workspaces.mjs maintain [--dry-run]   # controlador: limpa e repõe até o alvo
//
// Mesmas travas do seed (lib/finance/demo-guard.mjs): ARANDU_ENV=demo,
// ARANDU_DEMO_CONFIRM repetindo o alvo, nunca dentro de deploy, banco marcado
// como demonstração. Cada workspace é semeado por um processo próprio do seed
// com ARANDU_DEMO_WORKSPACE=<slug>; só entra no pool se TODAS as checagens
// passarem. A limpeza nunca toca o baseline nem workspaces reivindicados válidos.
// `maintain` segura um lease exclusivo no banco (fin_demo_pool_lease): duas
// execuções simultâneas nunca montam nem limpam o mesmo pool.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { assertDemoTarget, DemoGuardError, DEMO_MARKER_KEY, DEMO_MARKER_VALUE } from '../../lib/finance/demo-guard.mjs';
import { newSlug, planPool, POOL_POLICY } from '../../lib/finance/demo-workspaces.mjs';

const [command = 'list', ...rest] = process.argv.slice(2);
const option = (name, fallback) => Number(rest.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1] ?? fallback);
const DRY = rest.includes('--dry-run');

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
/** Um seed por workspace, em processo próprio; resolve com o status e a duração. */
function seed(slug, flag) {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/demo/seed.mjs', ...(flag ? [flag] : []), '--quiet'], {
      cwd: process.cwd(), stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, ARANDU_DEMO_WORKSPACE: slug }
    });
    child.on('close', (status) => resolve({ slug, status, seconds: Math.round((Date.now() - started) / 1000) }));
  });
}

/** Monta `count` workspaces com no máximo `concurrency` seeds ao mesmo tempo; falha remove o escopo parcial. */
async function provision(count, concurrency, beforeBatch = async () => {}) {
  const results = [];
  for (let start = 0; start < count; start += concurrency) {
    await beforeBatch();
    const batch = Array.from({ length: Math.min(concurrency, count - start) }, () => newSlug());
    console.log(`Provisionando ${batch.join(', ')}…`);
    for (const result of await Promise.all(batch.map((slug) => seed(slug)))) {
      if (result.status !== 0) { console.error(`  ${result.slug} falhou (status ${result.status}) em ${result.seconds} s; removendo o escopo parcial.`); await seed(result.slug, '--cleanup'); }
      else console.log(`  ${result.slug} pronto em ${result.seconds} s.`);
      results.push(result);
    }
  }
  return results;
}

async function cleanup(slugs) {
  let ok = 0;
  for (const slug of slugs) {
    const result = await seed(slug, '--cleanup');
    if (result.status === 0) ok += 1; else console.error(`  limpeza de ${slug} falhou; será repetida na próxima execução.`);
  }
  return ok;
}

if (command === 'list') {
  const list = await rows();
  const by = list.reduce((acc, row) => ({ ...acc, [row.status]: (acc[row.status] || 0) + 1 }), {});
  console.log(`Workspaces: ${list.length} (${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(', ') || 'nenhum'})`);
  for (const row of list) console.log(`  ${row.slug}  ${row.status.padEnd(12)} ${row.baseline_version}  expira ${row.expires_at || '—'}${row.last_error ? `  erro: ${row.last_error}` : ''}`);
} else if (command === 'provision') {
  const count = option('count', 1);
  const concurrency = option('concurrency', POOL_POLICY.concurrency);
  if (!Number.isInteger(count) || count < 1 || count > 20) { console.error('--count entre 1 e 20.'); process.exit(2); }
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) { console.error('--concurrency entre 1 e 4.'); process.exit(2); }
  const results = await provision(count, concurrency);
  const ok = results.filter((r) => r.status === 0).length;
  console.log(`Provisionados: ${ok}/${count}.`);
  if (ok !== count) process.exit(1);
} else if (command === 'cleanup') {
  const { cleanup: due } = planPool(await rows());
  const ok = await cleanup(due);
  console.log(`Limpeza: ${ok}/${due.length} workspace(s) removido(s).`);
  if (ok !== due.length) process.exit(1);
} else if (command === 'maintain') {
  const holder = `pool-${crypto.randomBytes(6).toString('hex')}`;
  const leaseSeconds = 30 * 60;
  const lease = () => service('rpc/fin_demo_pool_lease', { method: 'POST', body: { p_holder: holder, p_seconds: leaseSeconds } });
  const started = Date.now();
  const plan = planPool(await rows());
  if (DRY) { console.log(JSON.stringify({ dry_run: true, ...plan, cleanup: plan.cleanup.length })); process.exit(0); }
  if ((await lease()) !== true) { console.log(JSON.stringify({ result: 'skipped', reason: 'outro controlador do pool está ativo' })); process.exit(0); }
  let exit = 0;
  try {
    // Replaneja já com o lease: o estado pode ter mudado entre a leitura e a aquisição.
    const current = planPool(await rows());
    const cleaned = await cleanup(current.cleanup);
    const results = current.provision ? await provision(current.provision, POOL_POLICY.concurrency, async () => {
      if ((await lease()) !== true) throw new Error('lease do pool perdido; interrompendo antes de montar mais');
    }) : [];
    const ready = results.filter((r) => r.status === 0);
    if (cleaned !== current.cleanup.length || ready.length !== results.length) exit = 1;
    // Métricas operacionais sem segredo nem identidade: só contagens e durações.
    console.log(JSON.stringify({ result: exit ? 'partial' : 'ok', reason: current.reason, before: current.counts,
      cleaned, cleanup_due: current.cleanup.length, provisioned: ready.length, provision_failed: results.length - ready.length,
      seed_seconds: ready.map((r) => r.seconds), elapsed_seconds: Math.round((Date.now() - started) / 1000) }));
  } finally {
    await service('rpc/fin_demo_pool_release', { method: 'POST', body: { p_holder: holder } }).catch(() => null);
  }
  process.exit(exit);
} else {
  console.error('uso: node scripts/demo/workspaces.mjs list | provision --count=N [--concurrency=K] | cleanup | maintain [--dry-run]');
  process.exit(2);
}
