#!/usr/bin/env node
// Visita guiada pública (P0-A): a página gerada confere com as fontes canônicas,
// cobre comprador e instituição, não promete backend e só existe no build demo.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { TOUR_STEPS, TOUR_KINDS } from '../lib/public-tour.mjs';
import { COMPANY_AREAS, navItems } from '../lib/finance/navigation.mjs';
import { BUYERS, PROVIDERS } from '../lib/finance/demo-personas.mjs';
import { PAGES } from './generate-finance-pages.mjs';

execFileSync(process.execPath, ['scripts/generate-public-tour.mjs', '--check'], { stdio: 'inherit' });
const html = readFileSync('demo/visita.html', 'utf8');
const entry = readFileSync('demo/index.html', 'utf8');

// Etapas: ids únicos, menu e rotas canônicas existentes, pessoa fictícia conhecida.
const ids = TOUR_STEPS.map((step) => step.id);
assert.equal(new Set(ids).size, ids.length, 'etapas com id repetido');
const items = [...navItems('company'), ...navItems('provider')];
const routes = new Set(PAGES.map((page) => `/${page.path}`));
for (const step of TOUR_STEPS) {
  assert.ok(items.some((item) => item.key === step.nav), `${step.id}: item de menu inexistente (${step.nav})`);
  assert.ok(routes.has(step.route), `${step.id}: rota canônica inexistente (${step.route})`);
  assert.ok(BUYERS[step.persona] || PROVIDERS[step.persona], `${step.id}: pessoa desconhecida`);
  assert.equal(step.kind, 'informative', `${step.id}: a visita pública só tem etapas informativas`);
  assert.match(html, new RegExp(`id="${step.id}"`), `${step.id}: sem seção na página`);
}
for (const track of ['buyer', 'provider']) assert.ok(TOUR_STEPS.some((step) => step.track === track), `visita sem trilha ${track}`);
for (const required of ['painel', 'solicitacao', 'convites', 'propostas', 'comparacao', 'aprovacao', 'contrato', 'continuidade']) assert.ok(ids.includes(required), `jornada sem ${required}`);
// Cinco áreas, com os rótulos do menu canônico.
assert.equal(COMPANY_AREAS.length, 5);
for (const area of COMPANY_AREAS) assert.ok(html.includes(`<h3>${area.label}</h3>`), `área ausente: ${area.label}`);
// Entrada: uma ação principal, que leva à visita; classificação explícita.
assert.equal((entry.match(/btn-primary/g) || []).length, 1, 'entrada com mais de uma ação principal');
assert.match(entry, /id="tour-start"[^>]*>Conhecer a plataforma</);
assert.match(entry, /href="\/demo\/visita\.html" id="tour-start"/);
for (const label of Object.values(TOUR_KINDS)) assert.ok(entry.includes(label), `entrada sem a categoria "${label}"`);
assert.match(entry, /Não está disponível neste link/);
// Honestidade: nada de vencedor, recomendação, sucesso de API ou login fictício.
for (const page of [html, entry]) {
  assert.doesNotMatch(page, /melhor proposta|recomendad[ao]|vencedora|proposta enviada com sucesso|salvo no servidor|type="password"|<form/i);
  assert.doesNotMatch(page, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, 'UUID na tela');
  assert.doesNotMatch(page, /supabase|service_role|SUPABASE_|api\/finance/i, 'termo técnico ou credencial na tela');
  assert.match(page, /noindex,nofollow/);
  assert.match(page, /Ambiente demonstrativo/);
}
assert.match(html, /dados fictícios/);
// Capturas: só com proveniência completa e arquivo presente.
if (existsSync('demo/visita/captures.json')) {
  const captures = JSON.parse(readFileSync('demo/visita/captures.json', 'utf8'));
  assert.match(captures.sha, /^[0-9a-f]{40}$/);
  assert.ok(captures.capturedAt && captures.dataset && captures.base);
  for (const [id, shot] of Object.entries(captures.shots)) {
    assert.ok(ids.includes(id), `captura de etapa inexistente: ${id}`);
    for (const view of Object.values(shot).filter((value) => value?.file)) {
      assert.ok(existsSync(`demo/visita/${view.file}`), `captura ausente: ${view.file}`);
      assert.ok(view.route && view.persona && view.width && view.height, `${view.file}: proveniência incompleta`);
    }
  }
}
// Fronteira de build: só o build demonstrativo publica a visita.
assert.match(readFileSync('vite.config.js', 'utf8'), /demoMode \? \['demo\/index\.html', 'demo\/visita\.html'/);
console.log(`Visita pública: ${TOUR_STEPS.length} etapas, cinco áreas, comprador e instituição, sem promessas de backend.`);
