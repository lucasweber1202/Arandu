#!/usr/bin/env node
/**
 * Guarda contra colisão de escopo global entre scripts clássicos.
 *
 * As páginas da Arandu carregam vários `<script src>` sem `type="module"`.
 * Todos compartilham o mesmo escopo global, então duas declarações léxicas
 * (`const`, `let`, `class`) com o mesmo nome em arquivos diferentes derrubam
 * o segundo script inteiro com `SyntaxError: Identifier has already been
 * declared` — a página perde a funcionalidade sem nenhum aviso no build.
 *
 * Foi exatamente assim que `js/selection.js` e `js/selection-tools.js`
 * quebraram a página Minha Seleção. Este check reproduz a análise por página
 * para que a regressão não volte silenciosamente.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

/**
 * Coleta declarações de topo de um script clássico.
 * A varredura é por linha com contagem de chaves: suficiente para o estilo
 * do repositório (declarações de topo sempre iniciam a linha) e sem
 * dependência de parser externo.
 */
function topLevelDeclarations(source) {
  const lexical = new Set();
  const functions = new Set();
  let depth = 0;
  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim();
    if (depth === 0 && !line.startsWith('//') && !line.startsWith('*')) {
      const lexicalMatch = line.match(/^(?:const|let|class)\s+([A-Za-z_$][\w$]*)/);
      if (lexicalMatch) lexical.add(lexicalMatch[1]);
      const functionMatch = line.match(/^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/);
      if (functionMatch) functions.add(functionMatch[1]);
    }
    for (const char of rawLine) {
      if (char === '{') depth += 1;
      else if (char === '}') depth -= 1;
    }
    if (depth < 0) depth = 0;
  }
  return { lexical, functions };
}

const declarationCache = new Map();
function declarationsFor(scriptPath) {
  if (!declarationCache.has(scriptPath)) {
    try {
      declarationCache.set(scriptPath, topLevelDeclarations(readFileSync(resolve(root, scriptPath), 'utf8')));
    } catch {
      declarationCache.set(scriptPath, null);
    }
  }
  return declarationCache.get(scriptPath);
}

const htmlFiles = readdirSync(root)
  .filter((entry) => entry.endsWith('.html'))
  .filter((entry) => statSync(resolve(root, entry)).isFile())
  .sort();

const fatal = [];
const shadowed = [];

for (const page of htmlFiles) {
  const html = readFileSync(resolve(root, page), 'utf8');
  const scripts = [...html.matchAll(/<script\b([^>]*)>/g)]
    .filter(([, attrs]) => !/type\s*=\s*["']module["']/.test(attrs))
    .map(([, attrs]) => attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/)?.[1])
    .filter(Boolean)
    .map((src) => src.split('?')[0].replace(/^\.?\//, ''))
    .filter((src) => src.endsWith('.js'));

  const owners = new Map();
  for (const script of scripts) {
    const declarations = declarationsFor(script);
    if (!declarations) continue;
    for (const name of declarations.lexical) {
      const previous = owners.get(name);
      if (previous && previous.script !== script) {
        fatal.push(`${page}: "${name}" declarado em ${previous.script} e ${script}`);
      }
      owners.set(name, { script, lexical: true });
    }
    for (const name of declarations.functions) {
      const previous = owners.get(name);
      if (previous && previous.script !== script) {
        if (previous.lexical) fatal.push(`${page}: "${name}" declarado em ${previous.script} e ${script}`);
        else shadowed.push(`${page}: função "${name}" redefinida por ${script} (antes: ${previous.script})`);
      }
      owners.set(name, { script, lexical: false });
    }
  }
}

console.log('Arandu Script Globals Check');
console.log(`Páginas analisadas: ${htmlFiles.length}`);
if (shadowed.length) {
  console.log(`Avisos de sombreamento: ${shadowed.length}`);
  [...new Set(shadowed)].slice(0, 20).forEach((item) => console.log(`  AVISO ${item}`));
}
if (fatal.length) {
  console.error(`Colisões fatais: ${[...new Set(fatal)].length}`);
  [...new Set(fatal)].forEach((item) => console.error(`  FALHA ${item}`));
  console.error('Scripts clássicos compartilham o escopo global: renomeie a declaração duplicada.');
  process.exit(1);
}
console.log('Nenhuma colisão de escopo global entre scripts clássicos.');
