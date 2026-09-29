import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const dist = join(process.cwd(), 'dist');
assert.ok(existsSync(dist), 'Execute npm run build antes do gate da superfície.');
function files(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}
const output = files(dist);
const html = output.filter(path => path.endsWith('.html'));
const forbiddenFiles = /(?:^|\/)(?:comprar-arte|artistas|colecoes|obra|para-artistas|arte-para-[^/]+|portal-artista)\.html$/i;
const forbiddenCopy = /arte brasileira contemporânea|comprar arte|curadoria antes da vitrine|enviar portfólio|obras salvas|arandu arte|portal do artista|empresas e arquitetos/i;
for (const path of output) assert.ok(!forbiddenFiles.test(relative(dist, path)), 'Página de arte publicada: ' + relative(dist, path));
// Metadados também são superfície: o manifesto PWA aparece na instalação e em
// prévias de compartilhamento. Em 29/09/2026 ele ainda descrevia arte.
const textual = output.filter(path => /\.(?:html|webmanifest|json|txt|xml|svg)$/.test(path));
for (const path of textual) assert.ok(!forbiddenCopy.test(readFileSync(path, 'utf8')), 'Texto de arte publicado: ' + relative(dist, path));
for (const path of html) {
  const name = relative(dist, path);
  if (/^(?:finance|provider)\//.test(name) || /^(?:login|cadastro)\.html$/.test(name)) {
    assert.match(readFileSync(path, 'utf8'), /name="robots" content="noindex,nofollow"/, 'Área interna indexável: ' + name);
  }
}
assert.match(readFileSync(join(dist, 'index.html'), 'utf8'), /Procurement financeiro B2B/i);
for (const manifest of ['manifest.webmanifest', 'site.webmanifest']) {
  assert.match(JSON.parse(readFileSync(join(dist, manifest), 'utf8')).description, /procurement financeiro/i, 'Manifesto sem descrição financeira: ' + manifest);
}
assert.match(readFileSync(join(dist, 'login.html'), 'utf8'), /acesso corporativo/i);
const invite = readFileSync(join(dist, 'provider/invite.html'), 'utf8');
assert.ok(!invite.includes('vercel-speed-insights'));
assert.match(invite, /name="referrer" content="no-referrer"/);
console.log('Superfície financeira: ' + html.length + ' páginas sem resíduos públicos de arte.');
