#!/usr/bin/env node
/**
 * Guardas de segurança do SQL versionado.
 *
 * 1. Toda função `security definer` precisa fixar `search_path`. Sem isso a
 *    resolução de nomes segue o `search_path` de quem chama, e quem conseguir
 *    criar objetos em um schema anterior sombreia operadores e funções usados
 *    pelo corpo — execução de código com o papel de quem definiu a função.
 *
 * 2. Nenhum gatilho de criação de conta pode copiar `profile_type` direto de
 *    `raw_user_meta_data`. Esse campo é escrito pelo próprio cadastro, e a
 *    coluna aceita valores administrativos: o valor precisa passar por uma
 *    lista de perfis sem privilégio.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const roots = ['supabase', 'docs'].filter((dir) => existsSync(dir));
const files = roots
  .flatMap((dir) => readdirSync(dir).filter((entry) => entry.endsWith('.sql')).map((entry) => join(dir, entry)))
  .sort();

const problems = [];
let definers = 0;
let accountTriggers = 0;

for (const file of files) {
  const sql = readFileSync(file, 'utf8');

  // Cabeçalho da função: do `create function` até o início do corpo (`$$`/`$body$`).
  for (const match of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+([\w."]+)\s*\([\s\S]*?(?=\$)/gi)) {
    const header = match[0];
    if (!/security\s+definer/i.test(header)) continue;
    definers += 1;
    if (!/set\s+search_path\s*=/i.test(header)) {
      problems.push(`${file}: função "${match[1]}" é security definer sem "set search_path".`);
    }
  }

  for (const match of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+([\w."]+)[\s\S]*?\$\$([\s\S]*?)\$\$/gi)) {
    const [, name, body] = match;
    if (!/raw_user_meta_data\s*->>\s*'profile_type'/i.test(body)) continue;
    accountTriggers += 1;
    const guarded = /in\s*\(\s*'comprador'[^)]*\)/i.test(body);
    const grantsPrivileged = /'(?:admin|curadoria)'/i.test(body);
    if (!guarded || grantsPrivileged) {
      problems.push(`${file}: função "${name}" aceita profile_type do usuário sem restringir a perfis sem privilégio.`);
    }
  }
}

console.log('Arandu SQL Security Check');
console.log(`Arquivos SQL: ${files.length}`);
console.log(`Funções security definer: ${definers}`);
console.log(`Gatilhos que leem profile_type do cadastro: ${accountTriggers}`);
if (problems.length) {
  console.error(`Problemas: ${problems.length}`);
  problems.forEach((problem) => console.error(`  FALHA ${problem}`));
  process.exit(1);
}
console.log('Problemas: 0');
