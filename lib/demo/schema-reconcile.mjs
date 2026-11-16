// Reconciliação SOMENTE LEITURA do schema de um banco contra o manifesto
// canônico de migrations (docs/supabase-migrations.json).
//
// Entrada: um inventário de relações (tabelas e views) do schema public, vindo
// do catálogo (psql, banco descartável) ou do OpenAPI do PostgREST (hospedado,
// GET com a chave de serviço). Nada aqui conecta, escreve ou aplica SQL.
//
// Saída: uma classificação conservadora —
//   compatible   todas as relações esperadas existem;
//   incremental  um prefixo do manifesto está completo e o restante ausente:
//                aplicar as pendentes, na ordem, é uma atualização incremental;
//   partial      alguma migration está pela metade (aplicação interrompida?);
//   divergent    migration posterior presente com anterior ausente, ou estrutura
//                fora do esperado — não aplicar nada sem investigação humana;
//   indeterminate o inventário não pôde ser lido ou o manifesto não é legível.
// Funções/RPCs não entram na impressão digital remota: o OpenAPI só lista o que
// o papel consultado pode executar, então ausência ali não prova ausência no
// banco. Elas são verificadas no banco descartável (test:database).

import fs from 'node:fs';
import path from 'node:path';

const IDENT = '(?:"?public"?\\.)?"?([a-z_][a-z0-9_]*)"?';
const CREATE = new RegExp(`create\\s+(?:or\\s+replace\\s+)?(?:materialized\\s+)?(table|view)\\s+(?:if\\s+not\\s+exists\\s+)?${IDENT}`, 'gi');
// DROP aceita lista ("drop table if exists public.a, public.b;").
const DROP = /drop\s+(?:materialized\s+)?(table|view)\s+(?:if\s+exists\s+)?([^;]+);/gi;
const LISTED = new RegExp(IDENT, 'gi');
const RENAME = new RegExp(`alter\\s+(?:table|view)\\s+(?:if\\s+exists\\s+)?${IDENT}\\s+rename\\s+to\\s+"?([a-z_][a-z0-9_]*)"?`, 'gi');

/** Remove comentários SQL (linha e bloco) para não contar objetos citados em texto. */
function stripComments(sql) {
  return String(sql).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

/**
 * Para cada migration (na ordem dada), as relações que ela introduz e que
 * continuam existindo ao final do manifesto. Relações temporárias (criadas e
 * depois removidas) não entram. Exportada para teste.
 */
export function migrationRelations(entries) {
  const live = new Map(); // nome -> índice da migration que o introduziu
  entries.forEach(({ sql }, index) => {
    const clean = stripComments(sql);
    // Ordem textual importa (drop + create na mesma migration recria o objeto).
    const events = [];
    for (const m of clean.matchAll(CREATE)) events.push({ at: m.index, kind: 'create', name: m[2].toLowerCase() });
    for (const m of clean.matchAll(DROP)) for (const part of m[2].replace(/\b(cascade|restrict)\b/gi, '').split(',')) {
      const name = [...part.trim().matchAll(LISTED)][0]?.[1];
      if (name) events.push({ at: m.index, kind: 'drop', name: name.toLowerCase() });
    }
    for (const m of clean.matchAll(RENAME)) events.push({ at: m.index, kind: 'rename', name: m[1].toLowerCase(), to: m[2].toLowerCase() });
    events.sort((a, b) => a.at - b.at);
    for (const event of events) {
      if (event.kind === 'create') { if (!live.has(event.name)) live.set(event.name, index); }
      else if (event.kind === 'drop') live.delete(event.name);
      else if (live.has(event.name)) { live.delete(event.name); live.set(event.to, index); }
    }
  });
  return entries.map(({ file, sql }, index) => ({ file, version: schemaVersionOf(sql), relations: [...live].filter(([, at]) => at === index).map(([name]) => name).sort() }));
}

/** Valor de fin_settings.schema_version gravado pela migration (se houver). Exportada para teste. */
export function schemaVersionOf(sql) {
  const found = [...stripComments(sql).matchAll(/'schema_version'\s*,\s*'([a-z0-9][a-z0-9._-]*-\d+)'/gi)];
  return found.length ? found.at(-1)[1] : null;
}

/** Lê o manifesto e os arquivos SQL de um fluxo (default existingDatabase). */
export function loadManifest({ root = process.cwd(), flow = 'existingDatabase' } = {}) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/supabase-migrations.json'), 'utf8'));
  const files = manifest[flow];
  if (!Array.isArray(files) || !files.length) throw new Error(`Fluxo de migrations desconhecido: ${flow}`);
  return files.map((file) => ({ file, sql: fs.readFileSync(path.join(root, file), 'utf8') }));
}

/**
 * Classifica o inventário. `inventory` = Iterable de nomes de relações do
 * schema public, ou null quando não pôde ser lido. Exportada para teste.
 */
export function classifySchema(plan, inventory, { schemaVersion = null } = {}) {
  if (!Array.isArray(plan) || !plan.length) return { state: 'indeterminate', reason: 'manifest_unreadable', pending: [], partial: [], missing: [], unexpected: [] };
  if (!inventory) return { state: 'indeterminate', reason: 'inventory_unavailable', pending: [], partial: [], missing: [], unexpected: [] };
  const present = new Set([...inventory].map((name) => String(name).toLowerCase()));
  const rows = plan.map(({ file, relations }) => {
    const found = relations.filter((name) => present.has(name));
    return { file, expected: relations.length, found: found.length, missing: relations.filter((name) => !present.has(name)),
      status: !relations.length ? 'no_relations' : found.length === relations.length ? 'full' : found.length ? 'partial' : 'none' };
  });
  const expected = new Set(plan.flatMap((row) => row.relations));
  // Relações de domínio fora do manifesto: o banco tem estrutura que o código não conhece.
  const unexpected = [...present].filter((name) => /^(fin_|demo_|api_)/.test(name) && !expected.has(name)).sort();
  const missing = rows.flatMap((row) => row.missing);
  const partial = rows.filter((row) => row.status === 'partial').map(({ file, expected: total, found, missing: gone }) => ({ file, found, expected: total, missing: gone }));
  const counted = rows.filter((row) => row.status !== 'no_relations');
  const lastFull = counted.map((row) => row.status).lastIndexOf('full');
  const firstGap = counted.findIndex((row) => row.status !== 'full');
  const base = { rows, missing, partial, unexpected };
  if (!missing.length && !unexpected.length) {
    // Relações completas; o marcador, quando presente, precisa ser o último do manifesto.
    const lastVersion = [...plan].reverse().find((row) => row.version)?.version || null;
    if (schemaVersion && lastVersion && schemaVersion !== lastVersion) {
      const at = plan.findIndex((row) => row.version === schemaVersion);
      if (at === -1) return { state: 'divergent', reason: 'unknown_schema_version', pending: [], ...base };
      return { state: 'incremental', pending: plan.slice(at + 1).map((row) => row.file), unverifiable: plan.slice(at + 1).filter((row) => !row.relations.length).map((row) => row.file), ...base };
    }
    return { state: 'compatible', pending: [], ...base };
  }
  if (partial.length) return { state: 'partial', reason: 'migration_partially_present', pending: [], ...base };
  // Lacuna antes de uma migration completa: ordem não é um prefixo.
  if (firstGap !== -1 && lastFull > firstGap) return { state: 'divergent', reason: 'out_of_order', pending: [], ...base };
  if (unexpected.length) return { state: 'divergent', reason: 'unexpected_relations', pending: [], ...base };
  // Prefixo completo: pendentes = todas as migrations depois da última completa
  // (inclui as que só alteram funções/políticas, sem relação própria).
  let cut = lastFull === -1 ? 0 : plan.findIndex((row) => row.file === counted[lastFull].file) + 1;
  // Segunda evidência: o marcador schema_version prova a aplicação das
  // migrations sem relação própria até ele. Marcador à frente das relações
  // (diz aplicada, mas faltam tabelas) é divergência.
  const marked = schemaVersion ? plan.findIndex((row) => row.version === schemaVersion) : -1;
  if (schemaVersion && marked === -1) return { state: 'divergent', reason: 'unknown_schema_version', pending: [], ...base };
  if (marked >= cut) {
    if (plan.slice(cut, marked + 1).some((row) => row.relations.length)) return { state: 'divergent', reason: 'schema_version_ahead_of_relations', pending: [], ...base };
    cut = marked + 1;
  }
  if (cut >= plan.length) return { state: 'compatible', pending: [], ...base };
  const pending = plan.slice(cut);
  // Pendentes sem relação própria não podem ser provados como aplicados ou não
  // por inventário de relações: o plano as reaplica, e por isso cada uma precisa
  // ser idempotente (create or replace / if not exists) — conferido em test:database.
  return { state: 'incremental', pending: pending.map((row) => row.file), unverifiable: pending.filter((row) => !row.relations.length).map((row) => row.file), ...base };
}

/** Relações a partir do OpenAPI do PostgREST (chaves "/nome", exceto "/rpc/..."). Exportada para teste. */
export function relationsFromOpenApi(document) {
  const paths = document && typeof document === 'object' ? document.paths : null;
  if (!paths || typeof paths !== 'object') return null;
  return Object.keys(paths).filter((key) => /^\/[a-z_][a-z0-9_]*$/.test(key)).map((key) => key.slice(1));
}

export const CATALOG_SQL = "select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m') order by 1";
