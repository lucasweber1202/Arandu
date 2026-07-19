#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const errors = [];
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const check = (condition, message) => { if (!condition) errors.push(message); };

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map((value) => parseInt(value, 16) / 255);
  const linear = channels.map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
}

const files = ['css/arandu-clarity.css', 'vite.config.js', 'js/site.js'];
for (const file of files) check(fs.existsSync(path.join(root, file)), `Arquivo ausente: ${file}`);

if (errors.length === 0) {
  const css = read('css/arandu-clarity.css');
  const vite = read('vite.config.js');
  const site = read('js/site.js');
  const version = '20260719-clarity-1';

  check(css.includes('--clarity-ink: #21110d'), 'A paleta de alto contraste não está definida.');
  check(css.includes('.conversion-band :is(h1, h2, h3, strong, .section-title)'), 'A faixa de conversão não protege a cor dos títulos.');
  check(css.includes('.safe-card :is(p, span, small)'), 'Os cards escuros da home não protegem a cor do texto.');
  check(css.includes('line-height: 1.01 !important'), 'A entrelinha mínima dos títulos não está protegida.');
  check(css.includes('.mobile-bottom-nav') && css.includes('display: none !important'), 'As barras móveis duplicadas não foram removidas.');
  check(css.includes(':focus-visible') && css.includes('outline: 3px solid var(--clarity-focus)'), 'O foco visível de alto contraste está ausente.');

  const viteClarity = vite.lastIndexOf('/css/arandu-clarity.css');
  const viteRelease = vite.lastIndexOf('/css/arandu-release.css');
  check(viteClarity > viteRelease, 'O Vite precisa injetar arandu-clarity.css depois de arandu-release.css.');
  check(vite.includes(`arandu-clarity.css?v=${version}`), 'A versão da camada de clareza diverge no Vite.');

  const siteClarity = site.indexOf("['arandu-clarity.css'");
  const siteLunch = site.indexOf("['arandu-lunch-polish.css'");
  check(siteClarity > siteLunch, 'site.js precisa carregar arandu-clarity.css por último.');
  check(site.includes(`['arandu-clarity.css','${version}']`), 'A versão da camada de clareza diverge em site.js.');

  const pairs = [
    ['texto principal', '#21110d', '#fffaf6'],
    ['texto secundário', '#4b342c', '#fffaf6'],
    ['texto em herói', '#fffaf2', '#4d100c'],
    ['texto secundário em herói', '#f1dfd2', '#4d100c'],
    ['texto no rodapé', '#f1dfd2', '#180b08'],
    ['botão primário', '#fffaf2', '#741f1a'],
    ['placeholder', '#6d5147', '#fffaf6']
  ];
  for (const [label, foreground, background] of pairs) {
    const ratio = contrast(foreground, background);
    check(ratio >= 4.5, `${label}: contraste ${ratio.toFixed(2)}:1 abaixo de 4.5:1.`);
  }
}

console.log('Arandu Readability Check');
console.log(`Erros: ${errors.length}`);
errors.forEach((error) => console.error(`- ${error}`));
if (errors.length) process.exit(1);
console.log('Contraste, tipografia, foco e ordem das camadas validados.');
