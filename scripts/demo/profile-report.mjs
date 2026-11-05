// Self-contained, payload-free phase timeline for official synthetic seeds.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const seconds = value => `${(value / 1000).toFixed(2)} s`;
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function seedTimingHtml(profiles) {
  if (!Array.isArray(profiles) || !profiles.length) throw Error('seed_profiles_missing');
  const sections = profiles.map(({ name, report:r }) => {
    if (!/^seed-(?:baseline|[a-f0-9]{10})-(?:seed|reset|check|cleanup)\.json$/.test(name)
      || r?.format_version !== 1 || r.classification !== 'synthetic_seed_timing_no_payload'
      || !number(r.wall_ms) || !Array.isArray(r.phases) || !Array.isArray(r.requests)
      || !r.phases.every(p => number(p.start_ms) && number(p.duration_ms))
      || !r.requests.every(q => number(q.attempts) && number(q.duration_ms))) throw Error('invalid_seed_profile');
    const wall = Math.max(1, r.wall_ms);
    const phases = [...r.phases].sort((a,b) => a.start_ms-b.start_ms || b.duration_ms-a.duration_ms);
    const rows = phases.map(p => `<tr><th scope="row">${escape(p.name)}</th><td>${seconds(p.start_ms)}</td><td>${seconds(p.duration_ms)}</td><td><div class="track"><div class="bar" style="margin-left:${Math.min(100,100*p.start_ms/wall)}%;width:${Math.min(100,100*p.duration_ms/wall)}%"></div></div></td><td>${escape(p.result)}</td></tr>`).join('');
    const waits = Object.entries(r.waits || {}).map(([reason,w]) => {
      if (![w.count,w.requested_ms,w.elapsed_ms].every(number)) throw Error('invalid_seed_wait');
      return `<tr><th scope="row">${escape(reason)}</th><td>${w.count}</td><td>${seconds(w.requested_ms)}</td><td>${seconds(w.elapsed_ms)}</td></tr>`;
    }).join('');
    const requests = [...r.requests].sort((a,b) => b.duration_ms-a.duration_ms).map(q => `<tr><td>${escape(q.phase)}</td><td>${escape(q.channel)}</td><td>${escape(q.actor)}</td><td>${escape(q.method)} ${escape(q.resource)}</td><td>${q.attempts}</td><td>${seconds(q.duration_ms)}</td><td>${seconds(q.attempts ? q.duration_ms/q.attempts : 0)}</td><td>${escape(JSON.stringify(q.statuses))}</td></tr>`).join('');
    return `<section><h2>${escape(name)}</h2><p>Resultado: ${escape(r.result)} · tempo total: ${seconds(r.wall_ms)}</p>
<h3>Linha do tempo por etapa</h3><p>Etapas internas estão incluídas na etapa pai. Não some suas durações como tempo total.</p><table><thead><tr><th>Etapa</th><th>Início</th><th>Duração inclusiva</th><th>Linha do tempo</th><th>Resultado</th></tr></thead><tbody>${rows}</tbody></table>
<h3>Esperas</h3><table><thead><tr><th>Motivo</th><th>Quantidade</th><th>Solicitado</th><th>Decorrido real</th></tr></thead><tbody>${waits}</tbody></table>
<h3>HTTP por etapa, recurso e papel</h3><p>Inclui consumo da resposta e retries. Espera de backpressure fica separada. Soma de requests não equivale ao tempo total; a média não é p95.</p><table><thead><tr><th>Etapa</th><th>Canal</th><th>Papel</th><th>Recurso</th><th>Tentativas</th><th>Tempo HTTP</th><th>Média</th><th>Status</th></tr></thead><tbody>${requests}</tbody></table></section>`;
  }).join('');
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Arandu — tempos do seed sintético</title><style>body{font:15px system-ui,sans-serif;color:#183b3c;margin:2rem;max-width:1600px}section{margin-block:3rem}table{border-collapse:collapse;width:100%;margin-block:1rem}th,td{text-align:left;padding:.5rem;border-bottom:1px solid #ccc;vertical-align:top}thead{background:#edf3f2}.track{background:#edf3f2;width:360px;height:16px;overflow:hidden}.bar{background:#19666a;height:100%}p{max-width:100ch}section{overflow-x:auto}</style><h1>Tempos do seed sintético</h1><p>Somente etapas, recursos normalizados, papéis, contagens e durações. Sem payloads, credenciais ou identidades de contas. Os workspaces são execuções independentes; somar seus tempos não mede o tempo do pool paralelo.</p>${sections}</html>`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [directory, ...extra] = process.argv.slice(2);
  if (!directory || extra.length) throw Error('usage: profile-report.mjs <seed-profile-directory>');
  const files = fs.readdirSync(directory).filter(name => /^seed-(?:baseline|[a-f0-9]{10})-(?:seed|reset|check|cleanup)\.json$/.test(name)).sort();
  const html = seedTimingHtml(files.map(name => ({name,report:JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'))})));
  fs.writeFileSync(path.join(directory,'seed-timing.html'),html,{mode:0o600});
  console.log(`SEED_TIMELINE_READY profiles=${files.length}`);
}
