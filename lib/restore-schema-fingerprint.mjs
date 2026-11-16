import { createHash } from 'node:crypto';

const identifier = '(?:"(?:[^"\\n]|"")*"|[a-z_][a-z0-9_$]*)';
const columnOptions = new RegExp(`^(ALTER TABLE ONLY public\\.${identifier} ALTER COLUMN ${identifier} SET )\\((.*)\\);$`);

// pg_dump 16.15 exports pg_attver from server 16.16; 16.16's client omits it.
// It changes on restore even for an otherwise identical two-column table.
// Remove only that internal numeric option, retaining every semantic option.
function withoutAttributeVersion(line) {
  const match = columnOptions.exec(line);
  if (!match) return line;
  const options = [];
  let start = 0, quote = null;
  for (let i = 0; i < match[2].length; i++) {
    const ch = match[2][i];
    if (quote) {
      if (ch === quote && match[2][i + 1] === quote) i++;
      else if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') quote = ch;
    else if (ch === ',') { options.push(match[2].slice(start, i).trim()); start = i + 1; }
  }
  options.push(match[2].slice(start).trim());
  const retained = options.filter(option => !/^pg_attver=\d+$/.test(option));
  if (quote || retained.length === options.length) return line;
  return retained.length ? `${match[1]}(${retained.join(', ')});` : null;
}

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
    .map(withoutAttributeVersion)
    .filter(line => line !== null)
    .map(line => /CONSTRAINT .* CHECK /.test(line) ? line.replace(/[()]/g, '') : line)
    .join('\n');
  return createHash('sha256').update(JSON.stringify([canonical, checks])).digest('hex');
}
