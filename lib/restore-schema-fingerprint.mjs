import { createHash } from 'node:crypto';

// PostgreSQL pretty deparsing flattens associative AND groups, while retaining
// meaningful grouping, casts, literals, validation and inheritance semantics.
// This independent projection protects CHECK expressions from the historical
// dump formatting normalization below (which removes their parentheses).
export const CHECK_CONSTRAINTS_SQL = `select coalesce(jsonb_agg(
 jsonb_build_array(n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid,true),k.convalidated)
 order by n.nspname collate "C",c.relname collate "C",k.conname collate "C"),'[]'::jsonb)::text
 from pg_constraint k join pg_class c on c.oid=k.conrelid
 join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and k.contype='c';`;

export function restoreSchemaFingerprint(dump, checks) {
  if (!Array.isArray(checks) || checks.some(row => !Array.isArray(row) || row.length !== 5
    || row.slice(0,4).some(value => typeof value !== 'string') || typeof row[4] !== 'boolean')) {
    throw new Error('Invalid CHECK constraint projection.');
  }
  const canonical = dump.split('\n')
    .filter(line => !/^(--|\\(?:un)?restrict|SET |SELECT pg_catalog.set_config)/.test(line))
    .map(line => line.replace(/\s+$/, ''))
    .map(line => /CONSTRAINT .* CHECK /.test(line) ? line.replace(/[()]/g, '') : line)
    .join('\n');
  return createHash('sha256').update(JSON.stringify([canonical, checks])).digest('hex');
}
