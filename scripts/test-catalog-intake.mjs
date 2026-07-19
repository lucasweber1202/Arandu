#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

await import(`../js/catalog-intake-core.js?test=${Date.now()}`);
const core=globalThis.AranduCatalogIntakeCore;
assert.ok(core, 'Core do intake não foi carregado.');

const template=fs.readFileSync('data/catalog-intake-template.csv','utf8');
for(const header of ['nome_artistico','titulo_obra','artista_id','identidade_verificada','consentimento_publicacao_em','autorizacao_imagem_em','catalogo_verificado_em','fonte_referencia']){
  assert.ok(template.split('\n')[0].split(',').includes(header),`Template sem ${header}.`);
}

const csv=`tipo,nome_artistico,nome_completo,status,identidade_verificada,consentimento_publicacao_em,artista_verificado_em,fonte_referencia,titulo_obra,artista_id,preco,imagem_principal,autorizacao_imagem_em,preco_verificado_em,disponibilidade_verificada_em,catalogo_verificado_em\nartista,Artista Real,Nome Civil,published,sim,2026-07-01,2026-07-02,contrato-001,,,,,,,,\nobra,,,,,,,,Obra Real,artista-real,"4.200,00",https://example.com/obra.jpg,2026-07-03,2026-07-03,2026-07-03,2026-07-03`;
const entries=core.buildEntries(csv);
assert.equal(entries.length,2);
assert.equal(entries[0].item.panel,'artistas');
assert.equal(entries[0].item.data.name,'Artista Real');
assert.equal(entries[0].item.data.identity_verified,true);
assert.equal(entries[0].errors.length,0);
assert.equal(entries[0].warnings.length,0);
assert.equal(entries[1].item.panel,'obras');
assert.equal(entries[1].item.data.title,'Obra Real');
assert.equal(entries[1].item.data.artist_id,'artista-real');
assert.equal(entries[1].item.data.price,4200);
assert.equal(entries[1].errors.length,0);
assert.equal(entries[1].warnings.length,1);
assert.match(entries[1].warnings[0],/Fonte/);

const api=fs.readFileSync('api/[...path].js','utf8');
for(const term of ['publishing_consent_at: dateFrom','identity_verified: boolFrom','image_authorized_at: dateFrom','catalog_verified_at: dateFrom','source_reference: limited']){
  assert.ok(api.includes(term),`API administrativa não preserva ${term}.`);
}
console.log('Arandu Catalog Intake Tests');
console.log('Parser, aliases em português, preço e metadados de verificação validados.');
