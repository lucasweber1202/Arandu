import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';

const root = process.cwd();
const ignoredPrefixes = ['http://', 'https://', 'mailto:', 'tel:', '#', 'javascript:'];
const ignoredDirs = new Set([
  'node_modules',
  '.git',
  'dist',
  'reports',
  'tests',
  'test-results',
  'playwright-report'
]);
const htmlFiles = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (ignoredDirs.has(entry)) continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path);
    else if (entry.endsWith('.html')) htmlFiles.push(path);
  }
}

function cleanHref(href) {
  return href.split('#')[0].split('?')[0];
}

walk(root);

const broken = [];
for (const file of htmlFiles) {
  const content = readFileSync(file, 'utf8');
  const matches = [...content.matchAll(/\b(?:href|src)=['"]([^'"]+)['"]/g)];
  for (const match of matches) {
    const raw = match[1];
    if (!raw || ignoredPrefixes.some((prefix) => raw.startsWith(prefix))) continue;
    const href = cleanHref(raw);
    if (!href) continue;
    const target = href.startsWith('/') ? join(root, href) : normalize(join(dirname(file), href));
    if (!existsSync(target)) broken.push(`${file.replace(root + '/', '')} -> ${raw}`);
  }
}

if (broken.length) {
  console.error('Links ou assets quebrados encontrados:');
  broken.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('Links internos e assets referenciados aprovados.');
