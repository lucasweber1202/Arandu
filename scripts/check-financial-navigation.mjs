import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const root = resolve('dist');
function htmlFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const file = join(dir, name);
    return statSync(file).isDirectory() ? htmlFiles(file) : file.endsWith('.html') ? [file] : [];
  });
}
const pages = htmlFiles(root);
for (const page of pages) {
  const html = readFileSync(page, 'utf8');
  for (const match of html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)) {
    const href = match[1];
    if (/^(?:https?:|mailto:|tel:|#|\/\/)/i.test(href)) continue;
    const path = href.split(/[?#]/, 1)[0];
    if (!path) continue;
    const target = path.startsWith('/') ? join(root, path) : resolve(dirname(page), path);
    assert.ok(target.startsWith(root + '/'), 'Link fora do build: ' + href);
    assert.ok(existsSync(target) || existsSync(join(target, 'index.html')), 'Link quebrado: ' + relative(root, page) + ' -> ' + href);
  }
}
console.log('Navegação financeira: ' + pages.length + ' páginas e links internos verificados.');
