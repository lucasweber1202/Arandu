import { createHash } from 'node:crypto';

export function databaseFingerprint(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new Error('Database URL inválida.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Database URL precisa usar PostgreSQL.');
  const material = [
    url.hostname.toLowerCase(),
    url.port || '5432',
    url.pathname.replace(/^\//, ''),
    decodeURIComponent(url.username || '')
  ].join('|');
  return `sha256:${createHash('sha256').update(material).digest('hex')}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const value = process.env.ARANDU_STAGING_DATABASE_URL || process.env.ARANDU_DATABASE_URL || process.argv[2];
  if (!value) {
    console.error('Configure ARANDU_STAGING_DATABASE_URL ou informe a URL como argumento.');
    process.exit(1);
  }
  console.log(databaseFingerprint(value));
}
