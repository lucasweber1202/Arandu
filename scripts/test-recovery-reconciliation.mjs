import assert from 'node:assert/strict';
import { parseCounts, compareCounts, countsDigest, loopbackTarget, COUNTS_SQL } from '../lib/recovery-reconciliation.mjs';

// Contagens: só schemas reconciliados, inteiros não negativos, ordem canônica.
assert.deepEqual(Object.keys(parseCounts('{"public.b":1,"auth.users":2}')), ['auth.users', 'public.b']);
for (const bad of ['[]', 'null', '{"pg_catalog.pg_class":1}', '{"public.x":-1}', '{"public.x":1.5}', '{"public.x;drop":1}', 'not json']) assert.throws(() => parseCounts(bad));
assert.equal(countsDigest({ 'public.b': 1, 'auth.users': 2 }), countsDigest({ 'auth.users': 2, 'public.b': 1 }));
assert.notEqual(countsDigest({ 'public.b': 1 }), countsDigest({ 'public.b': 2 }));
// Comparação acusa ausência, excesso e divergência; igualdade é MATCH.
assert.deepEqual(compareCounts({ 'public.a': 1 }, { 'public.a': 1 }), { result: 'MATCH', tables: 1, differences: [] });
assert.deepEqual(compareCounts({ 'public.a': 1, 'public.b': 2 }, { 'public.a': 3, 'public.c': 0 }).differences.map((d) => d.kind), ['count_mismatch', 'missing_in_target', 'extra_in_target']);
// Destino: só loopback; projeto hospedado, pooler, IP de rede e parâmetros extras são recusados.
assert.equal(loopbackTarget('postgresql://postgres@127.0.0.1:55432/postgres?sslmode=disable').PGPORT, '55432');
assert.equal(loopbackTarget('postgres://u:p@[::1]/db').PGHOST, '::1');
for (const bad of ['postgresql://postgres:x@db.offgpyysgdhfemjlchod.supabase.co:5432/postgres', 'postgresql://postgres.igacnfjeuqhxcmfyepgj:x@aws-0-sa-east-1.pooler.supabase.com:5432/postgres',
  'postgresql://postgres@10.0.0.5/postgres', 'postgresql://postgres@127.0.0.1/postgres?host=/tmp', 'mysql://127.0.0.1/db', 'postgresql://postgres@127.0.0.1/', 'not a url']) assert.throws(() => loopbackTarget(bad), bad);
// SQL de contagem é só leitura e restrito aos schemas reconciliados.
assert.doesNotMatch(COUNTS_SQL, /\b(insert|update|delete|create|drop|alter|truncate)\b/i);
console.log('Recovery reconciliation: canonical counts, tamper-evident digest, mismatch kinds and loopback-only restore target passed.');
