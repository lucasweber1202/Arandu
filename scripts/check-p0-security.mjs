#!/usr/bin/env node
import fs from 'node:fs';

const issues = [];
const read = (file) => fs.readFileSync(file, 'utf8');
const requireText = (file, text, message) => {
  if (!read(file).includes(text)) issues.push(`${file}: ${message}`);
};

const runtimeCopy = read('scripts/copy-runtime-assets.mjs');
if (/copyDir\(|artworks\.json|artists\.json|certificates\.json/.test(runtimeCopy)) {
  issues.push('scripts/copy-runtime-assets.mjs: cópia ampla pode publicar fixtures de arte.');
}
// O portal real não publica fixture financeira; o dado fictício vive só no
// motor da demonstração em /demo, decidido no build.
if (!runtimeCopy.includes('assertPresentationModeIsSafe()') || runtimeCopy.includes('data/finance/demo.json')) {
  issues.push('scripts/copy-runtime-assets.mjs: fixture financeira publicada fora da demonstração isolada.');
}
// Toda página publicada (site, portal da empresa, portal do provedor) segue a
// CSP estrita: nada de script inline nem handler inline.
const publishedHtml = [
  ...fs.readdirSync('.').filter((name) => name.endsWith('.html')),
  ...['finance', 'provider'].flatMap((dir) => fs.readdirSync(dir).filter((name) => name.endsWith('.html')).map((name) => `${dir}/${name}`))
];
for (const file of publishedHtml) {
  const html = read(file);
  if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) issues.push(`${file}: script inline incompatível com a CSP estrita.`);
  if (/\son[a-z]+\s*=/i.test(html)) issues.push(`${file}: handler JavaScript inline incompatível com a CSP estrita.`);
}

const viteConfig = read('vite.config.js');
requireText('vite.config.js', '__ARANDU_DEMO__: JSON.stringify(demoMode)', 'modo demonstrativo financeiro não é decidido por constante de build compatível com CSP.');
requireText('vite.config.js', 'assertDemoModeIsSafe()', 'build não falha ao pedir a demonstração na produção financeira.');

const stagingRelease = read('.github/workflows/staging-release.yml');
const stagingLines = stagingRelease.split(/\r?\n/);
let runIndent = null;
let runInputInterpolation = false;
for (const line of stagingLines) {
  const indent = line.match(/^\s*/)[0].length;
  if (runIndent !== null && line.trim() && indent <= runIndent) runIndent = null;
  if (/^\s*run:\s*(?:[|>-]|$)/.test(line)) runIndent = indent;
  if (runIndent !== null && /\$\{\{\s*inputs\./.test(line)) runInputInterpolation = true;
}
if (runInputInterpolation) {
  issues.push('.github/workflows/staging-release.yml: input manual ainda é interpolado diretamente em shell.');
}

console.log('Arandu P0 Security Regression Check');
console.log(`Erros: ${issues.length}`);
if (issues.length) {
  issues.forEach((issue) => console.error(`- ${issue}`));
  process.exit(1);
}
console.log('Fixtures fora do build, CSP estrita nas páginas publicadas, demonstração decidida no build e workflow de staging validados.');
