#!/usr/bin/env node
// Design Constitution §1.5: a tela nunca mostra "null"/"undefined". `el()` ignora
// filhos nulos, mas o DOM nativo não: `node.append(cond ? x : null)` imprime o
// texto "null" (já aconteceu em Configurações, importação de contrato, facility,
// política e erro de salvamento da RFQ). Este checador recusa, nos argumentos de
// topo de append/prepend/replaceChildren/after/before, um condicional que possa
// resultar em null/undefined/false/'' ou um `cond && x`. Use `...(cond ? [x] : [])`
// ou `...[...].filter(Boolean)`.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files = [];
const walk = (dir) => { for (const name of readdirSync(dir)) { const path = join(dir, name); if (statSync(path).isDirectory()) walk(path); else if (path.endsWith('.js')) files.push(path); } };
walk('finance/src');
for (const name of readdirSync('provider')) if (name.endsWith('.js')) files.push(join('provider', name));

/** Argumentos de topo de cada chamada DOM, com o trecho de nível 0 (sem conteúdo aninhado). */
function topLevelArgs(source, start) {
  const args = [];
  let depth = 1; let current = ''; let i = start;
  while (i < source.length && depth) {
    const c = source[i];
    if ('([{'.includes(c)) depth += 1;
    else if (')]}'.includes(c)) depth -= 1;
    if (depth === 1 && c === ',') { args.push(current); current = ''; } else if (depth >= 1) current += c;
    i += 1;
  }
  args.push(current);
  return args.map((arg) => {
    const flat = arg.replace(/`[^`]*`/g, 'T').replace(/'(?:\\.|[^'\\])*'/g, 'S');
    let level = 0; let outer = '';
    for (const c of flat) { if ('([{'.includes(c)) level += 1; if (level === 0) outer += c; if (')]}'.includes(c)) level -= 1; }
    return { raw: arg, outer: outer.trim() };
  });
}

export function findNullChildren(source) {
  const found = [];
  const call = /\.(append|prepend|replaceChildren|after|before)\(/g;
  let match;
  while ((match = call.exec(source))) {
    for (const { raw, outer } of topLevelArgs(source, match.index + match[0].length)) {
      if (/^\.\.\./.test(outer)) continue;
      if (/\?[^:]*:\s*(null|undefined|false|S)$/.test(outer) || /&&\s*[\w.]+$/.test(outer)) {
        found.push({ line: source.slice(0, match.index).split('\n').length, snippet: raw.replace(/\s+/g, ' ').trim().slice(0, 100) });
      }
    }
  }
  return found;
}

// Autoteste: o padrão real do defeito é recusado; as formas seguras passam.
const bad = "form.append(field(a), canEdit ? el('div') : null);\nbox.replaceChildren(icon('x'), ok && button('y'));";
const good = "form.append(...[field(a), canEdit ? el('div') : null].filter(Boolean));\nform.append(...(ok ? [x] : []));\nform.append(el('div', {}, [cond ? x : null]));";
if (findNullChildren(bad).length !== 2 || findNullChildren(good).length !== 0) {
  console.error('check-ui-null-children: autoteste falhou.');
  process.exit(1);
}

const problems = files.flatMap((file) => findNullChildren(readFileSync(file, 'utf8')).map((item) => `${file}:${item.line}: ${item.snippet}`));
if (problems.length) {
  console.error(`Filho condicional que pode virar o texto "null" na tela (${problems.length}):`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`UI: ${files.length} arquivos sem filho DOM condicional que vire "null" na tela.`);
