// Contrato de paridade Demo × Oficial (missão de consolidação; Guideline v3.3).
//
// A Demo canônica (ARANDU_ENV=demo) é o MESMO build da `main` servido com
// outro banco: rotas, telas, APIs, RLS e permissões não mudam. Este manifesto
// não repete o que já tem fonte canônica — páginas vêm de
// scripts/generate-finance-pages.mjs, o menu de lib/finance/navigation.mjs e
// os papéis de lib/finance/permissions.mjs. Ele acrescenta só o que não existe
// em outro lugar: a que capacidade cada tela pertence, quais recursos reais da
// API ela usa e qual verificação de sanidade do seed (scripts/demo/seed.mjs)
// prova que a Demo tem dados para demonstrá-la.
//
// O estado de cada capacidade é CALCULADO por scripts/check-demo-parity.mjs,
// nunca escrito à mão:
//   PARITY_VERIFIED       rota canônica + recurso real + cobertura no seed (ou
//                         estado vazio legítimo declarado) — verificação LOCAL
//   PARITY_PARTIAL        existe no produto e na Demo, mas falta cobertura do
//                         dataset (lacuna declarada em `gap`)
//   ENVIRONMENT_LIMITED   depende de serviço externo que a Demo não tem
//   NOT_REPRESENTED       sem rota na Demo canônica (nunca deve ocorrer)
//   NOT_IMPLEMENTED_IN_PRODUCT  existe só no sandbox legado
// A publicação HOSPEDADA é outro eixo (hostedState): depende da atribuição ativa
// do Supabase DEMO em lib/deployment-topology.mjs e de evidência de deploy.

/**
 * @typedef {object} Capability
 * @property {string} id
 * @property {string} name
 * @property {'platform'|'work'|'sourcing'|'portfolio'|'relationships'|'governance'|'provider'} area
 * @property {string[]} views      chaves de view (PAGES em generate-finance-pages)
 * @property {string[]} api        recursos reais (/api/finance/<recurso>[/ação]) ou auth/<ação>
 * @property {string[]} sanity     trechos literais de rótulos de check() em scripts/demo/seed.mjs
 * @property {string} [emptyState] estado vazio legítimo, com a ação que cria dados
 * @property {string} [envLimit]   limitação de ambiente honesta
 * @property {string} [gap]        lacuna de dataset conhecida (obrigatória sem sanity/emptyState)
 */

/** @type {readonly Capability[]} */
export const CAPABILITIES = Object.freeze([
  // ------------------------------------------------------------ plataforma
  { id: 'PLT-ENV', name: 'Ambiente identificado (selo e marcador do banco)', area: 'platform', views: [], api: ['organizations'],
    sanity: ['Aplicação em ARANDU_ENV=demo', 'Banco marcado como demonstração'] },
  { id: 'PLT-ORG', name: 'Organização, membros e papéis', area: 'platform', views: ['settings'], api: ['organizations', 'members', 'approval-policy'],
    sanity: ['Organização Vitta Foods visível para a tesouraria'] },
  { id: 'PLT-PERSONA', name: 'Entrada por persona (sessão real do Supabase DEMO)', area: 'platform', views: [], api: ['auth/demo-personas', 'auth/demo-login'],
    sanity: [], emptyState: 'Sem dado próprio: autentica contas sintéticas criadas pelo seed; coberto por scripts/test-demo-personas.mjs' },
  // ------------------------------------------------------------ meu trabalho
  { id: 'WRK-DASH', name: 'Início: pendências, prazos e atividade', area: 'work', views: ['dashboard'], api: ['overview', 'dashboard'],
    sanity: ['Aprovação pendente na etapa da CFO', 'Contrato de crédito em janela de renovação'] },
  { id: 'WRK-TASKS', name: 'Tarefas', area: 'work', views: ['tasks'], api: ['tasks'], sanity: ['Tarefas abertas'] },
  { id: 'WRK-APPROVALS', name: 'Aprovações sequenciais', area: 'work', views: ['approvals'], api: ['approvals', 'approvals/request'],
    sanity: ['Aprovação pendente na etapa da CFO', 'Aprovações concluídas'] },
  { id: 'WRK-NOTIFY', name: 'Notificações', area: 'work', views: ['notifications'], api: ['notifications'],
    sanity: ['CFO com aprovação pendente nos avisos', 'Tesouraria com avisos não lidos'] },
  // ------------------------------------------------------------ contratações
  { id: 'SRC-RFQS', name: 'Solicitações (lista e estados)', area: 'sourcing', views: ['rfqs'], api: ['rfqs'], sanity: ['RFQ "'] },
  { id: 'SRC-NEW', name: 'Nova solicitação por objetivo, com Passport', area: 'sourcing', views: ['newRfq'], api: ['rfqs', 'rfq-passport'],
    sanity: ['RFQ de crédito com fotografia do Passport'] },
  { id: 'SRC-RFQ', name: 'Detalhe da solicitação: convites, propostas, comentários', area: 'sourcing', views: ['rfq'], api: ['rfqs', 'invites/send', 'comments'],
    sanity: ['RFQ "', 'Comentários na negociação de crédito'] },
  { id: 'SRC-COMPARE', name: 'Comparação financeira com pesos do comprador', area: 'sourcing', views: ['rfq'], api: ['comparison'],
    sanity: ['Comparação ponderada da adquirência'],
    gap: 'Cenários da #163 (CET não informado, incompatibilidade econômica, diferença entre versões) não têm check próprio no seed' },
  { id: 'SRC-DECISION', name: 'Decisão registrada com justificativa', area: 'sourcing', views: ['rfq'], api: ['decisions'], sanity: ['Decisões com justificativa'] },
  { id: 'SRC-PROPOSALS', name: 'Propostas recebidas e versões', area: 'sourcing', views: ['proposals'], api: ['proposals'], sanity: ['RFQ "', 'Portal do provedor (Lumina Pay) com histórico'] },
  { id: 'SRC-EXTRACT', name: 'Documentos e fatos extraídos com proveniência', area: 'sourcing', views: ['extractions'], api: ['extractions/start', 'extractions/review'],
    sanity: ['Documento lido com fatos e proveniência'] },
  { id: 'SRC-IMPL', name: 'Implantação pós-award', area: 'sourcing', views: ['implementations'], api: ['implementations/open', 'implementations/milestone'],
    sanity: ['Implantação pós-award em andamento com bloqueio'] },
  // ------------------------------------------------------------ portfólio
  { id: 'PRT-CONTRACTS', name: 'Contratos e renovações', area: 'portfolio', views: ['contracts'], api: ['contracts', 'contract-terms'],
    sanity: ['Contrato de adquirência vigente', 'Contrato de crédito em janela de renovação', 'Marco de renovação D-90 registrado pelo cron'] },
  { id: 'PRT-DEBT', name: 'Dívida, limites, garantias e saldos', area: 'portfolio', views: ['portfolio'], api: ['facilities', 'facility-balances', 'portfolio'],
    sanity: ['Portfolio com limite, uso e saldo documentados'] },
  { id: 'PRT-COVENANTS', name: 'Covenants e obrigações', area: 'portfolio', views: ['covenants'], api: ['covenants/open'],
    sanity: ['Covenants: conforme, aguardando dados e waiver'] },
  { id: 'PRT-FEES', name: 'Tarifas bancárias contratadas × observadas', area: 'portfolio', views: ['fees'], api: ['fees/schedules', 'fees/observe', 'fees/verify'],
    sanity: ['Fee Intelligence com observação e referência contratada'] },
  { id: 'PRT-SPEND', name: 'Spend por moeda e tipo', area: 'portfolio', views: ['spend'], api: ['spend'],
    sanity: ['Spend por moeda/tipo, com e sem reconciliação', 'Spend preserva USD estimado sem conversão'] },
  { id: 'PRT-VALUE', name: 'Valor e savings com metodologia', area: 'portfolio', views: ['value'], api: ['value'], sanity: [],
    gap: 'O seed não registra valor de procurement; a tela abre vazia sem demonstrar baseline e metodologia' },
  { id: 'PRT-OPPS', name: 'Oportunidades por regra da empresa', area: 'portfolio', views: ['opportunities'], api: ['opportunities/rules', 'signals'],
    sanity: ['Oportunidades detectadas pelas regras da empresa'] },
  // ------------------------------------------------------------ relacionamentos
  { id: 'REL-INSTITUTIONS', name: 'Instituições e relacionamento contextual (#161, #164)', area: 'relationships', views: ['providers'], api: ['providers', 'provider-relationship'],
    sanity: ['Contrato de adquirência vigente', 'Portfolio com limite, uso e saldo documentados'],
    gap: 'Sem check próprio do contexto por instituição (instituição sem contrato, com facility e saldos)' },
  { id: 'REL-QUALIFY', name: 'Qualificação de provedores', area: 'relationships', views: ['qualifications'], api: ['qualifications/open', 'qualifications/requirement', 'qualifications/transition'],
    sanity: ['Qualificação do Atlas aguardando decisão humana'] },
  { id: 'REL-PERF', name: 'Performance do provedor', area: 'relationships', views: ['performance'], api: ['performance/open', 'performance/dimension'],
    sanity: ['Performance do provedor com período aberto'] },
  // ------------------------------------------------------------ governança
  { id: 'GOV-PASSPORT', name: 'Financial Passport', area: 'governance', views: ['passport'], api: ['profile', 'profile/confirm'],
    sanity: ['Passport com cobertura e campo a revisar'] },
  { id: 'GOV-OPS', name: 'Console operacional', area: 'governance', views: ['ops'], api: ['ops'], sanity: [],
    emptyState: 'Mostra a saúde real de jobs e outbox do próprio ambiente; não há dado de negócio a semear' },
  { id: 'GOV-BOUNDS', name: 'Limites do produto', area: 'governance', views: ['boundaries'], api: [], sanity: [],
    emptyState: 'Página estática e idêntica nos dois ambientes' },
  // ------------------------------------------------------------ portal do provedor
  { id: 'PRV-HOME', name: 'Portal do provedor: início e oportunidades', area: 'provider', views: ['providerHome', 'providerRfqs'], api: ['assignments'],
    sanity: ['Portal do provedor (Lumina Pay) com histórico', 'Provedor não vê concorrentes'] },
  { id: 'PRV-PROPOSAL', name: 'Rascunho, envio e versões da proposta', area: 'provider', views: ['providerProposal'], api: ['proposal-draft'],
    sanity: ['Portal do provedor (Lumina Pay) com histórico'] },
  { id: 'PRV-INVITE', name: 'Aceite de convite', area: 'provider', views: ['providerInvite'], api: ['invites/send', 'members/accept'],
    sanity: ['Provedor não vê concorrentes'] }
]);

/**
 * Telas que existem SÓ no sandbox legado (/demo). Cada uma tem uma decisão
 * registrada; nenhuma pode ser publicada como parte da Demo canônica.
 */
export const SANDBOX_ONLY = Object.freeze({
  workIntake: 'Promovida ao produto: botão "Começar" do Início (lib/finance/intents.mjs, #160). A tela do sandbox é retirada com o sandbox.',
  workPolicies: 'Equivalente canônico: política de aprovação em Configurações (approval-policy). Retirar com o sandbox.',
  workIntegrations: 'Conectores simulados: não promover. O produto mostra integrações reais (finance-integrations) e estado honesto quando não há fornecedor.',
  workUsage: 'Telemetria local da sessão de demonstração: não é capacidade do produto. Retirar com o sandbox.'
});

/** Pontos conhecidos onde o código canônico ainda carrega o sandbox (sob demanda, só em data-mode="demo"). Só podem diminuir. */
export const SANDBOX_COUPLING_BUDGET = Object.freeze({ 'finance/app.js': 3 });

/** Únicos arquivos do servidor que podem decidir comportamento pelo runtime de demonstração. */
export const SERVER_DEMO_BRANCH_ALLOWLIST = Object.freeze(['lib/api/domains/auth.mjs', 'lib/api/domains/finance.mjs']);

/** Únicos arquivos do frontend canônico que podem ler `ctx.environment` (selo do ambiente). */
export const CLIENT_ENVIRONMENT_ALLOWLIST = Object.freeze(['finance/src/shell.js', 'finance/app.js']);

/** Lacunas de publicação/operação que o gate local não resolve. */
export const OPEN_ITEMS = Object.freeze([
  { id: 'OPS-CONCURRENCY', text: 'Visitantes da Demo pública compartilham as mesmas personas e o mesmo dataset; falta isolamento por sessão/visitante (Lote D).' },
  { id: 'OPS-PERSONA-RATE', text: 'O login por persona herda o limite por conta (20/h): uma Demo pública com vários visitantes esgota a persona. Redesenhar junto do isolamento.' },
  { id: 'OPS-HOSTED', text: 'Supabase DEMO sem atribuição ativa aprovada (lib/deployment-topology.mjs): a Demo canônica não pode ser publicada até o cutover com recuperação comprovada.' },
  { id: 'OPS-SANDBOX', text: 'arandu-demo ainda publica o sandbox legado (ARANDU_DEPLOYMENT_KIND=demo); retirar só depois da Demo canônica hospedada e validada.' }
]);
