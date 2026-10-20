// Visita guiada pública (P0-A, guideline v3.5 §37): roteiro enxuto que liga
// cada etapa da página /demo/visita.html à tela canônica que ela representa.
//
// Este arquivo NÃO é um segundo modelo financeiro: não tem valores, estados de
// maturidade nem regras. Os números vêm de scripts/demo/dataset.mjs (o mesmo
// conjunto que scripts/demo/seed.mjs grava pela API real), as áreas e os
// rótulos do menu de lib/finance/navigation.mjs e as capturas de
// demo/visita/captures.json, produzidas por scripts/design/capture-tour.mjs
// contra a Demo canônica local (ARANDU_ENV=demo). Quem junta tudo é
// scripts/generate-public-tour.mjs.
//
// Classificação (o visitante vê o rótulo; a página nunca mistura categorias):
//   informative   VISITA INFORMATIVA — leitura de telas e dados do cenário fictício
//   browser       SIMULAÇÃO NO NAVEGADOR — sandbox histórico /demo/finance, local ao navegador
//   backend       OPERAÇÃO REAL DE BACKEND — não existe na visita pública enquanto a
//                 Demo hospedada (M3) não for comprovada; reservado, nunca usado aqui.

export const TOUR_KINDS = Object.freeze({
  informative: 'Visita informativa',
  browser: 'Simulação no navegador',
  backend: 'Operação real de backend'
});

/**
 * @typedef {object} TourStep
 * @property {string} id         âncora pública (#id): link profundo estável
 * @property {'buyer'|'provider'} track
 * @property {string} title
 * @property {string} nav        chave do item em lib/finance/navigation.mjs
 * @property {string} persona    BUYERS ou PROVIDERS em lib/finance/demo-personas.mjs
 * @property {string} route      rota canônica capturada (sem id: o script resolve pelo título)
 * @property {string} [rfq]      export de scripts/demo/dataset.mjs aberto na captura
 * @property {string} [anchor]   seção da tela canônica enquadrada na captura
 * @property {'informative'} kind
 */

/** @type {readonly TourStep[]} */
export const TOUR_STEPS = Object.freeze([
  { id: 'painel', track: 'buyer', title: 'O que pede atenção hoje', nav: 'dashboard', persona: 'juliana', route: '/finance/dashboard.html', kind: 'informative' },
  { id: 'solicitacao', track: 'buyer', title: 'A solicitação financeira', nav: 'rfqs', persona: 'juliana', route: '/finance/rfq.html', rfq: 'RFQ_CREDIT', kind: 'informative' },
  { id: 'convites', track: 'buyer', title: 'Convites às instituições', nav: 'rfqs', persona: 'juliana', route: '/finance/rfq.html', rfq: 'RFQ_OPEN', kind: 'informative' },
  { id: 'propostas', track: 'buyer', title: 'Propostas e versões', nav: 'proposals', persona: 'juliana', route: '/finance/proposals.html', kind: 'informative' },
  { id: 'comparacao', track: 'buyer', title: 'Comparação lado a lado', nav: 'rfqs', persona: 'juliana', route: '/finance/rfq.html', rfq: 'RFQ_ACQUIRING', anchor: 'comparacao', kind: 'informative' },
  { id: 'aprovacao', track: 'buyer', title: 'Aprovação com responsabilidades separadas', nav: 'approvals', persona: 'helena', route: '/finance/approvals.html', kind: 'informative' },
  { id: 'contrato', track: 'buyer', title: 'O contrato registrado', nav: 'contracts', persona: 'juliana', route: '/finance/contracts.html', kind: 'informative' },
  { id: 'continuidade', track: 'buyer', title: 'Depois da assinatura', nav: 'covenants', persona: 'juliana', route: '/finance/covenants.html', kind: 'informative' },
  { id: 'instituicao', track: 'provider', title: 'A instituição recebe o convite', nav: 'providerHome', persona: 'atlas', route: '/provider/index.html', kind: 'informative' },
  { id: 'instituicao-proposta', track: 'provider', title: 'Preparar e enviar a proposta', nav: 'providerRfqs', persona: 'atlas', route: '/provider/rfqs.html', kind: 'informative' }
]);

/** Viewports das capturas (os mesmos de scripts/design/capture-surfaces.mjs). */
export const TOUR_VIEWPORTS = Object.freeze({
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 }
});

export const TOUR_PAGE = '/demo/visita.html';
