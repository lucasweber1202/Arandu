#!/usr/bin/env node
// Engineering adapter for PR #241's actual links; no UI or domain duplication.
import { writeFileSync } from 'node:fs';
import { validateFlow } from './publication-proof.mjs';
const [sha, output] = process.argv.slice(2);
if (!/^[a-f0-9]{40}$/.test(sha || '') || !output) throw new Error('Usage: public-tour-proof-flow.mjs <approved full SHA> <output.json>');
const { TOUR_STEPS, TOUR_PAGE } = await import('../lib/public-tour.mjs');
if (TOUR_PAGE !== '/demo/visita.html') throw new Error('Tour contract changed; review adapter');
const byId = Object.fromEntries(TOUR_STEPS.map(s => [s.id, s]));
const step = (stage, id, selector) => {
  if (!byId[id]) throw new Error('Tour stage missing; review adapter');
  return { stage, path: `${TOUR_PAGE}#${id}`, selector, content: `#${id}-title`, text: byId[id].title };
};
const nav = id => `.tour-steps a[href="#${id}"]`;
const flow = { approved_sha: sha, source: 'PR #241; review adapter against approved main', steps: [
  { stage: 'root', path: '/', content: '#tour-start', text: 'Conhecer a plataforma' },
  { stage: 'explore', path: TOUR_PAGE, selector: '#tour-start', content: '#tour-title', text: 'Uma contratação financeira, do pedido à renovação' },
  step('financial-entry', 'painel', byId.contexto ? nav('painel') : '#topo a[href="#painel"]'),
  step('dashboard', 'painel', nav('painel')),
  step('requests', 'solicitacao', nav('solicitacao')),
  step('invites', 'convites', nav('convites')),
  step('proposals', 'propostas', nav('propostas')),
  step('comparison', 'comparacao', nav('comparacao')),
  step('approval', 'aprovacao', nav('aprovacao')),
  step('contracts', 'contrato', nav('contrato')),
  step('tasks-renewals', 'continuidade', nav('continuidade')),
  step('provider', 'instituicao', nav('instituicao')),
  step('provider-proposal', 'instituicao-proposta', nav('instituicao-proposta')),
  { stage: 'areas', path: `${TOUR_PAGE}#areas`, selector: byId['instituicao-valor'] ? '.tour-steps a[href="#areas"]' : '#instituicao-proposta a[href="#areas"]', content: '#areas-title', text: 'As cinco áreas do produto' },
  { stage: 'return', path: '/demo/index.html', selector: '#areas a[href="/demo/index.html"]', content: '#tour-start', text: 'Conhecer a plataforma' }
] };
// #244 adds these real source stages; do not invent paths on earlier builds.
if (byId.contexto) flow.steps.splice(2, 0, step('context', 'contexto', nav('contexto')));
if (byId['instituicao-valor']) flow.steps.splice(flow.steps.length - 2, 0, step('provider-value', 'instituicao-valor', nav('instituicao-valor')));
validateFlow(flow, sha);
writeFileSync(output, JSON.stringify(flow, null, 2) + '\n');
