#!/usr/bin/env node
/**
 * Integridade dos assets publicados.
 *
 * O build injeta CSS/JS por transformação de HTML. Quando uma tag é injetada
 * fora da ordem esperada (ou aponta para um caminho que o bundler não emite),
 * o build continua verde e o 404 só aparece no navegador do usuário — foi o
 * caso do módulo do Speed Insights, ausente em `dist/` e requisitado por todas
 * as páginas publicadas.
 *
 * Este check abre cada HTML de `dist/` e exige que toda referência local
 * (`src`/`href` de script, stylesheet, imagem, ícone e manifesto) exista em
 * disco.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, dirname, posix } from 'node:path';

const dist = resolve(process.cwd(), 'dist');
if (!existsSync(dist)) {
  console.error('dist/ não encontrado. Rode `npm run build` antes deste check.');
  process.exit(1);
}

function htmlFilesIn(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...htmlFilesIn(full));
    else if (entry.endsWith('.html')) found.push(full);
  }
  return found;
}

const REFERENCE_PATTERN = /<(?:script|link|img|source)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["'][^>]*>/gi;

const pages = htmlFilesIn(dist).sort();
const missing = [];
let checked = 0;

for (const page of pages) {
  const html = readFileSync(page, 'utf8');
  for (const [, rawReference] of html.matchAll(REFERENCE_PATTERN)) {
    const reference = rawReference.trim();
    if (!reference || /^(?:https?:|data:|mailto:|tel:|#|\/\/)/i.test(reference)) continue;
    const withoutQuery = reference.split(/[?#]/)[0];
    if (!withoutQuery) continue;
    checked += 1;
    const target = withoutQuery.startsWith('/')
      ? join(dist, withoutQuery)
      : resolve(dirname(page), withoutQuery);
    if (!existsSync(target)) {
      missing.push(`${posix.relative(dist, page.split('\\').join('/'))} -> ${reference}`);
    }
  }
}

console.log('Arandu Dist Assets Check');
console.log(`Páginas publicadas: ${pages.length}`);
console.log(`Referências locais verificadas: ${checked}`);
if (missing.length) {
  const unique = [...new Set(missing)];
  console.error(`Referências quebradas: ${unique.length}`);
  unique.slice(0, 40).forEach((item) => console.error(`  FALHA ${item}`));
  console.error('Toda referência local publicada precisa existir em dist/.');
  process.exit(1);
}
console.log('Todas as referências locais do build existem em dist/.');
