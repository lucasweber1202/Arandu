// Lógica pura da proteção de regressão por jornada (sem navegador; testada em
// scripts/test-journey-budget.mjs). A baseline é versionada em
// docs/perf/journey-js-baseline.json e só muda com justificativa registrada.
import fs from 'node:fs';
import { LIMITS } from '../build-size.mjs';

export const BASELINE_PATH = 'docs/perf/journey-js-baseline.json';
// Tolerância proporcional: 5% sobre o próprio valor medido da jornada. Não é um
// teto absoluto inventado; é a margem de ruído de build (hash, minificação) antes
// de exigir decisão explícita. Requisições: +10% (mínimo +1).
export const TOLERANCE = Object.freeze({ bytes: 0.05, requests: 0.10 });
export const MIN_REASON = 20;

/** Bytes de JS cobertos por execução (cobertura V8 por bloco, aninhada em ordem). */
export function executedBytes(coverage) {
  let total = 0;
  for (const script of coverage) {
    const len = (script.source || '').length;
    if (!len) continue;
    const used = new Uint8Array(len);
    for (const fn of script.functions || []) for (const r of fn.ranges || []) used.fill(r.count > 0 ? 1 : 0, Math.max(0, r.startOffset), Math.min(len, r.endOffset));
    for (const b of used) total += b;
  }
  return total;
}

const unique = (lists) => [...new Set(lists.flat())].sort();
function pass(run, sizeOf) {
  const first = run.steps[0];
  const all = unique(run.steps.map((s) => s.urls));
  const sum = (k) => run.steps.reduce((t, s) => t + (s[k] || 0), 0);
  return {
    // decodedBytes: JS descomprimido único que a jornada carrega (tamanho em dist/),
    // independente de vir da rede ou do cache. transferBytes: o que trafegou.
    initial: { scripts: first.urls.length, decodedBytes: first.urls.reduce((t, u) => t + sizeOf(u), 0), transferBytes: first.transferBytes, requests: first.requests, scriptMs: first.scriptMs, lcpMs: first.lcpMs, cls: first.cls },
    cumulative: { scripts: all.length, decodedBytes: all.reduce((t, u) => t + sizeOf(u), 0), transferBytes: sum('transferBytes'), requests: sum('requests'), fromCache: sum('fromCache'), scriptMs: sum('scriptMs'), taskMs: sum('taskMs') },
    executedBytes: run.executedBytes,
    steps: run.steps.map(({ urls, ...rest }) => ({ ...rest, scripts: urls.length, loadedBytes: urls.reduce((t, u) => t + sizeOf(u), 0) }))
  };
}

export function summarizeJourney(journey, cold, warm, sizeOf) {
  const c = pass(cold, sizeOf);
  return { id: journey.id, label: journey.label, steps: journey.steps.map((s) => s.url), cold: { ...c, unusedRatio: c.cumulative.decodedBytes ? Number((1 - c.executedBytes / c.cumulative.decodedBytes).toFixed(3)) : null }, warm: pass(warm, sizeOf) };
}

const allow = (base, tol, floor = 0) => Math.floor(base * (1 + tol)) + floor;

/** Compara relatório com a baseline. problems => falha; notes => informativo. */
export function compareToBaseline(report, baseline) {
  const problems = []; const notes = [];
  const byId = new Map((baseline.journeys || []).map((j) => [j.id, j]));
  for (const j of report.journeys) {
    const b = byId.get(j.id);
    if (!b) { problems.push(`${j.id}: jornada sem baseline (rode --update com --reason)`); continue; }
    for (const [scope, key] of [['initial', 'decodedBytes'], ['cumulative', 'decodedBytes']]) {
      const got = j.cold[scope][key]; const ref = b[scope][key];
      if (got > allow(ref, TOLERANCE.bytes)) problems.push(`${j.id}: JS ${scope === 'initial' ? 'inicial' : 'acumulado'} ${got} B > baseline ${ref} B +${TOLERANCE.bytes * 100}%`);
      else if (got < ref * (1 - TOLERANCE.bytes)) notes.push(`${j.id}: JS ${scope} caiu para ${got} B (baseline ${ref} B); atualize a baseline para travar o ganho`);
    }
    // O limite por rota (250.000) vale para o JS REALMENTE carregado em cada tela,
    // imports dinâmicos incluídos — não só para o fecho estático do build.
    for (const st of j.cold.steps) if (st.loadedBytes > LIMITS.largestRouteJavascript) problems.push(`${j.id}: tela ${st.url} carregou ${st.loadedBytes} B de JS > limite por rota ${LIMITS.largestRouteJavascript}`);
    const reqRef = b.cumulative.requests;
    if (j.cold.cumulative.requests > allow(reqRef, TOLERANCE.requests, 1)) problems.push(`${j.id}: ${j.cold.cumulative.requests} requisições de JS > baseline ${reqRef} +10%`);
    // Cache quente: /assets é imutável; nenhum byte de JS deveria voltar à rede.
    if (j.warm.cumulative.transferBytes > 0) problems.push(`${j.id}: cache quente baixou ${j.warm.cumulative.transferBytes} B de JS (cache imutável quebrado?)`);
    if (j.cold.cumulative.scriptMs > (b.cumulative.scriptMs || 0) * 2 + 50) notes.push(`${j.id}: tempo de script ${j.cold.cumulative.scriptMs} ms vs ${b.cumulative.scriptMs} ms (laboratório, ruidoso; não bloqueia)`);
  }
  for (const id of byId.keys()) if (!report.journeys.some((j) => j.id === id)) problems.push(`${id}: jornada da baseline não foi medida`);
  return { problems, notes };
}

export function baselineFrom(report, reason, previous = null, date = new Date().toISOString().slice(0, 10)) {
  if (typeof reason !== 'string' || reason.trim().length < MIN_REASON) throw new Error(`Justificativa obrigatória (>= ${MIN_REASON} caracteres) para alterar a baseline de jornadas.`);
  const journeys = report.journeys.map((j) => ({ id: j.id, label: j.label, initial: { decodedBytes: j.cold.initial.decodedBytes, requests: j.cold.initial.requests },
    cumulative: { decodedBytes: j.cold.cumulative.decodedBytes, requests: j.cold.cumulative.requests, transferBytes: j.cold.cumulative.transferBytes, scriptMs: j.cold.cumulative.scriptMs }, executedBytes: j.cold.executedBytes }));
  const history = [...(previous?.history || []), { date, reason: reason.trim(), cumulative: Object.fromEntries(journeys.map((j) => [j.id, j.cumulative.decodedBytes])) }];
  return { description: 'Baseline de JavaScript por jornada (Chromium, API simulada). Atualizar só com --update --reason; ver docs/FINANCIAL_BUNDLE_HEADROOM.md.', tolerance: TOLERANCE, journeys, history };
}

export function updateBaseline(report, reason) {
  const previous = fs.existsSync(BASELINE_PATH) ? JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) : null;
  fs.mkdirSync('docs/perf', { recursive: true });
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(baselineFrom(report, reason, previous), null, 2)}\n`);
}
