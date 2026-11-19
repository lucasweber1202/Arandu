// Capturas reservadas do rewrite da Vercel: removidas uma vez na borda, sem
// relaxar nenhum validador de domínio. Simula a URL que a Vercel entrega.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { REWRITE_PARAMS, stripRewriteQuery, withoutRewriteMetadata } from '../lib/api/rewrite-metadata.mjs';

assert.deepEqual([...REWRITE_PARAMS], ['aranduScope', 'aranduRest']);
assert.equal(stripRewriteQuery('/api/finance/crm-activities?organization_id=o&aranduScope=finance&aranduRest=crm-activities'), '/api/finance/crm-activities?organization_id=o');
assert.equal(stripRewriteQuery('/api/v1/rfqs?aranduScope=v1&aranduRest=rfqs'), '/api/v1/rfqs');
assert.equal(stripRewriteQuery('/api/finance/rfqs'), '/api/finance/rfqs');
assert.equal(stripRewriteQuery('/api/finance/x?a=1&a=2&aranduScope=y&unknown=%2F'), '/api/finance/x?a=1&a=2&unknown=%2F', 'repetidos e desconhecidos preservados');
assert.equal(stripRewriteQuery('/api/x?aranduscope=1'), '/api/x?aranduscope=1', 'só o nome exato é reservado');
assert.equal(withoutRewriteMetadata(new URLSearchParams('aranduRest=a/b&b=1')).toString(), 'b=1');
// Nomes reservados = capturas reais do vercel.json; a borda remove antes de qualquer domínio.
const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const captures = vercel.rewrites.flatMap((r) => [...r.source.matchAll(/:(\w+)/g)].map((m) => m[1]));
assert.deepEqual(captures.sort(), [...REWRITE_PARAMS].sort());
const handler = fs.readFileSync('api/[...path].js', 'utf8');
assert(handler.indexOf('req.url = stripRewriteQuery(req.url)') < handler.indexOf('const route = routeFrom(req)'), 'normalização antes do roteamento');
console.log('rewrite metadata: capturas reservadas removidas na borda; demais parâmetros e validadores intactos PASS.');
