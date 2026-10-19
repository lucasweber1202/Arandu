#!/usr/bin/env node
// O reset da Demo (scripts/demo/seed.mjs --reset) apaga a organização fictícia por
// último. Toda tabela que referencia fin_organizations sem ON DELETE CASCADE precisa
// estar na lista de remoção; senão uma linha criada durante o uso (ex.: entidade
// legal pela tela da CFO) faz o reset parar no meio com 409 e deixa a Demo quebrada
// — foi o que aconteceu em 19/10 depois das sondas multi-entidade.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const seed = fs.readFileSync(path.join(root, 'scripts/demo/seed.mjs'), 'utf8');

// Nenhuma exceção: as personas da Demo incluem admin do grupo (CFO), que alcança
// também a governança de dados (retenção, legal hold, export, offboarding).
const NOT_REACHED_BY_DEMO = new Map();

function referencingTables() {
  const found = new Set();
  for (const file of fs.readdirSync(path.join(root, 'docs')).filter((name) => name.endsWith('.sql'))) {
    let current = null;
    for (const line of fs.readFileSync(path.join(root, 'docs', file), 'utf8').split(/\r?\n/)) {
      const table = line.match(/^\s*(?:create\s+table|alter\s+table)\s+(?:if\s+(?:not\s+)?exists\s+)?(?:only\s+)?(?:public\.)?(fin_[a-z0-9_]+)/i);
      if (table) current = table[1].toLowerCase();
      if (current && /references\s+(?:public\.)?fin_organizations\b/i.test(line) && !/on\s+delete\s+cascade/i.test(line)) found.add(current);
      if (/;\s*$/.test(line)) current = null;
    }
  }
  found.delete('fin_organizations');
  return [...found].sort();
}

const tables = referencingTables();
assert(tables.length > 20, `parser das migrations encontrou só ${tables.length} tabela(s); revise o padrão`);
const missing = tables.filter((table) => !seed.includes(`'${table}'`) && !NOT_REACHED_BY_DEMO.has(table));
assert.deepEqual(missing, [], `o reset da Demo não remove: ${missing.join(', ')} — inclua em scopedTables (scripts/demo/seed.mjs) antes de fin_organizations`);
for (const table of NOT_REACHED_BY_DEMO.keys()) assert(tables.includes(table), `${table} não referencia mais fin_organizations: tire da exceção`);
// Entidades legais: criadas pela tela durante a apresentação; precisam sair antes dos membros.
const order = (needle) => seed.indexOf(needle);
assert(order("['fin_member_entity_grants'") > -1 && order("['fin_member_entity_grants'") < order("['fin_legal_entities'"), 'escopos por entidade saem antes das entidades');
assert(order("['fin_legal_entities'") < order("['fin_members'"), 'entidades legais saem antes dos membros e da organização');
console.log(`Reset da Demo cobre as ${tables.length} tabelas que referenciam a organização.`);
