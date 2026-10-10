// Reconciliação origem/destino da preservação criptografada. Só contagens por
// tabela (metadado), nunca conteúdo. A origem conta dentro do MESMO snapshot
// exportado que o pg_dump usa; o destino conta depois do restore isolado.
import { createHash } from 'node:crypto';

export const RECONCILED_SCHEMAS = Object.freeze(['public', 'auth', 'storage', 'supabase_migrations']);

// Somente leitura: query_to_xml conta cada tabela sem criar objetos, e
// row_security=off faz o count falhar (em vez de filtrar) se RLS se aplicar.
export const COUNTS_SQL = `select coalesce(json_object_agg(n.nspname||'.'||c.relname,
 (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::bigint
 order by n.nspname, c.relname), '{}'::json)::text
 from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where c.relkind in ('r','p') and n.nspname in (${RECONCILED_SCHEMAS.map((s) => `'${s}'`).join(',')});`;

export function parseCounts(text) {
  let value;
  try { value = JSON.parse(String(text).trim()); } catch { throw new Error('Contagens ilegíveis.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Contagens ilegíveis.');
  for (const [key, count] of Object.entries(value)) {
    if (!/^[a-z_]+\.[A-Za-z0-9_$]{1,63}$/.test(key) || !RECONCILED_SCHEMAS.includes(key.split('.')[0]) || !Number.isSafeInteger(count) || count < 0) throw new Error('Contagens ilegíveis.');
  }
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}

export const countsDigest = (counts) => createHash('sha256').update(JSON.stringify(parseCounts(JSON.stringify(counts)))).digest('hex');

/** Diferenças por tabela: ausente no destino, a mais no destino ou contagem divergente. */
export function compareCounts(source, target) {
  const differences = [];
  for (const [table, count] of Object.entries(source)) {
    if (!(table in target)) differences.push({ table, kind: 'missing_in_target' });
    else if (target[table] !== count) differences.push({ table, kind: 'count_mismatch', source: count, target: target[table] });
  }
  for (const table of Object.keys(target)) if (!(table in source)) differences.push({ table, kind: 'extra_in_target' });
  return { result: differences.length ? 'MISMATCH' : 'MATCH', tables: Object.keys(source).length, differences };
}

/**
 * Destino de restore: somente loopback. Nunca um projeto hospedado — o restore
 * usa --clean e só é aceitável num cluster descartável da própria máquina.
 */
export function loopbackTarget(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Destino de restore inválido.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hash) throw new Error('Destino de restore inválido.');
  if ([...url.searchParams.keys()].some((key) => !['sslmode', 'connect_timeout'].includes(key))) throw new Error('Parâmetros de destino não reconhecidos.');
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!['127.0.0.1', '::1', 'localhost'].includes(host)) throw new Error('Restore só em cluster loopback descartável.');
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!database || database.includes('/')) throw new Error('Banco de destino inválido.');
  return { PGHOST: host, PGPORT: url.port || '5432', PGDATABASE: database, PGUSER: decodeURIComponent(url.username) || 'postgres',
    PGPASSWORD: decodeURIComponent(url.password), PGSSLMODE: url.searchParams.get('sslmode') || 'disable', PGCONNECT_TIMEOUT: '10' };
}
