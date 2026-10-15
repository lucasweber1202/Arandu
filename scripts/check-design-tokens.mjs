#!/usr/bin/env node
// Design Constitution §2–§3: identidade única e contraste medido. Falha se a
// marca sair dos tokens, se o site público redefinir cores em vez de usar
// aliases ou se um token de texto cair abaixo de 4,5:1 (WCAG AA).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const app = readFileSync('finance/style.css', 'utf8');
const pub = readFileSync('financial-public.css', 'utf8');
const token = (name) => app.match(new RegExp(`--${name}:(#[0-9a-f]{6})`, 'i'))?.[1];
const EXPECTED = { ink: '#0e1c2b', 'ink-700': '#24384a', petrol: '#0e5a6e', 'petrol-hover': '#0a4757', 'petrol-weak': '#e8f2f5', 'petrol-light': '#5fb2c4' };
for (const [name, value] of Object.entries(EXPECTED)) assert.equal(token(name)?.toLowerCase(), value, `token --${name}`);
for (const alias of ['--accent:var(--petrol)', '--accent-hover:var(--petrol-hover)', '--accent-weak:var(--petrol-weak)']) assert.ok(app.includes(alias), `alias ausente: ${alias}`);
// Site público: só aliases para os tokens do workspace.
for (const alias of ['--navy:var(--ink)', '--teal:var(--petrol)']) assert.ok(pub.includes(alias), `site público sem alias ${alias}`);
// Cor de marca antiga (índigo genérico) não volta às superfícies principais.
const surfaces = [['finance/style.css', app], ['financial-public.css', pub], ...readdirSync('.').filter((f) => f.endsWith('.html')).map((f) => [f, readFileSync(f, 'utf8')])];
for (const [file, text] of surfaces) assert.doesNotMatch(text, /#3547c8|#2a39a6|#2e3db0|rgba\(53,71,200/i, `${file}: índigo antigo fora dos tokens`);
// Resíduos do índigo/lavanda antigo em superfícies de conteúdo (cartões de
// próxima ação, seleção, avisos não lidos) e gradiente decorativo (§2).
assert.doesNotMatch(app, /#(f3f5ff|d7dcf8|fafbff|f8f9ff|f1f3fd|f3f7ff|dbe6fb|c9d0f5)\b/i, 'finance/style.css: lavanda antiga fora dos tokens');
// Gradiente só onde é função: brilho do carregamento, listras da janela de
// renovação e o esmaecer da barra fixa de envio da proposta.
const gradients = app.split('\n').filter((line) => /gradient\(/.test(line)).map((line) => line.match(/^\s*([^{]+)\{/)?.[1]?.trim());
assert.deepEqual(gradients.filter((selector) => !['.skeleton-line', '.life-window', '.proposal-bar'].includes(selector)), [], 'gradiente decorativo fora da lista funcional');
// Monograma único (app, casca estática, site e favicon).
const mark = 'M9.5 23 16 9.5 22.5 23';
for (const file of ['favicon.svg', 'index.html', 'login.html', 'scripts/generate-finance-pages.mjs', 'finance/src/shell.js']) assert.ok(readFileSync(file, 'utf8').includes(mark), `${file}: monograma ausente`);
// Títulos em faixa escura do site precisam de cor clara (regressão: título invisível na faixa de acesso).
assert.match(pub, /\.dark h2,\.dark h3\{color:#fff\}/, 'títulos de .section.dark sem cor clara');
// Contraste (§3.3).
const lum = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const textTokens = ['ink', 'petrol', 'petrol-hover', 'text-muted', 'success', 'warning', 'danger', 'info'];
for (const name of textTokens) {
  const value = token(name);
  assert.ok(value, `token --${name} ausente`);
  for (const background of ['#ffffff', token('bg'), token('petrol-weak')]) assert.ok(ratio(value, background) >= 4.5, `--${name} sobre ${background}: ${ratio(value, background).toFixed(2)}:1 < 4,5:1`);
}
assert.ok(ratio('#ffffff', token('petrol')) >= 4.5, 'texto branco sobre petróleo abaixo de AA');
// Numerais tabulares e movimento reduzido no CSS base.
assert.match(app, /table,\.num,dd\{font-variant-numeric:tabular-nums\}/);
assert.match(app, /prefers-reduced-motion:reduce/);
// §11: alvo de toque ≥ 44 px para os controles compactos (botões, chips, abas, ícones).
const coarse = app.match(/@media \(pointer:coarse\)\{([\s\S]*?)\n\}/)?.[1] || '';
for (const selector of ['.btn', '.btn-sm', '.chip', '.tab', '.icon-btn']) assert.ok(coarse.includes(selector), `toque: ${selector} sem alvo mínimo em (pointer:coarse)`);
assert.match(coarse, /min-height:44px/, 'toque: alvo mínimo de 44 px ausente');
// Superfícies de conteúdo planas: sombra só em camadas sobrepostas.
assert.doesNotMatch(app.match(/\n\.card\{[^}]*\}/)?.[0] || '', /box-shadow/, '.card com sombra');
assert.doesNotMatch(app.match(/\n\.table-card\{[^}]*\}/)?.[0] || '', /box-shadow/, '.table-card com sombra');
console.log('Design tokens: identidade única, aliases públicos, monograma, contraste AA, numerais tabulares e superfícies planas verificados.');
