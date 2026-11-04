# Interface financeira

## Superfície

- Website: `/`, `/produto.html`, `/credito.html`, `/adquirencia.html`, `/seguranca.html`, `/limites.html`. São as seis rotas canônicas em `data/public-routes.json`.
- Acesso: `/login.html` e `/cadastro.html`, usando `/api/auth/*` existente. O login abre `/finance/index.html`; o usuário escolhe organização dentro do workspace.
- Comprador: `/finance/*`; provedor: `/provider/*`. Mantemos os deep links existentes para RFQ, proposta e convite. Nenhuma rota interna é indexável.
- Build: `vite.config.js` declara explicitamente 22 entradas HTML. `copy-runtime-assets.mjs` só copia identidade financeira e fixtures de demonstração quando o modo de apresentação permitido está ligado. Os demais arquivos históricos permanecem no repositório, mas não no `dist/`.

## Componentes e comportamento

`finance/style.css` contém tokens e componentes compartilhados por ambos os portais. Em desktop, a navegação é lateral; em tablet e telefone, torna-se uma faixa horizontal com rolagem. As tabelas de comparação dão lugar a cartões por proposta no telefone. `finance/app.js` usa as mesmas APIs, permissões e regras de comparação preexistentes; acrescenta rótulos de status, prioridades e filtros locais sem alterar o domínio.

O site usa `financial-public.css`, sem importar o CSS editorial de arte. A página de limites substitui o aviso jurídico repetido em cada tela operacional; os avisos contextuais de decisão, convite e cobertura permanecem onde necessários.

## Segurança de convites e e-mail

A migration do piloto recusa a criação de organização quando a allowlist está vazia. Um segredo aleatório mantido em `fin_settings`, acessível somente à função privilegiada, permite recompor o token de um convite ainda válido a partir de seu identificador. A outbox guarda apenas essa referência. O dispatcher chama a RPC como serviço, cria o link com fragmento e usa o renderer `finance_provider_invite`. Sem URL válida, token válido ou credenciais, o envio falha e volta para retry; nenhuma mensagem de convite sem link é enviada.

## Validação

`npm run build && npm run check:financial-surface && npm run check:dist-assets` verifica a superfície e os assets. `npm run check:finance` cobre domínio/API/smoke; `node scripts/test-email-outbox.mjs` cobre o renderer. `npm run test:database` exige PostgreSQL local. `npx playwright test tests/e2e/finance-procurement.spec.js` cobre desktop e celular quando os navegadores Playwright estão instalados.

## Reconciliação da base e aprofundamento incremental

A PR #67 foi incorporada à branch `work/arandu-first-financial-pilot-readiness` no merge `d23bbb5`, e não à `main`. O merge `603ffb5` tem como pais a `main` `1046af6` e esse commit. Como a única divergência posterior da `main` desde a base comum era `package.json` e `package-lock.json`, os scripts financeiros da #67 foram preservados com Vite 8.3.0 e Playwright 1.63.0 da `main`.

O comando `Ctrl/Cmd+K` abre busca local nos registros já recebidos da API para a organização ativa: solicitações, propostas, provedores, contratos e tarefas. A busca não consulta outra organização, não persiste termos e não emite analytics. O catálogo é limitado aos registros presentes no `overview`; não é busca paginada de todo o histórico. O painel expõe tarefas vencidas e RFQs com prazo em sete dias. A média de propostas por solicitação substitui a antiga “taxa de resposta”, que usava propostas/convites sem identificar convites respondidos e poderia induzir interpretação incorreta.

A lista de RFQs filtra por título, produto e status. O comprador pode pré-preencher uma nova demanda a partir de RFQ anterior da mesma organização. Somente produto, título, campos de demanda e prazo futuro são copiados na memória da página; a nova RFQ só nasce no POST explícito e convites, propostas e decisões não são copiados. A resposta do POST leva diretamente ao novo rascunho. A lista de provedores filtra por nome e região.

### Limites desta rodada

A busca não é server-side nem paginada; `overview` ainda limita a quantidade de registros. Não foram acrescentados approvals multinível, upload privado, autosave no servidor, notificações in-app ou console operacional. Nenhum desses fluxos deve ser anunciado como disponível. A inspeção visual manual do preview protegido e a validação com usuários de piloto continuam separadas dos testes automáticos.

A suíte `test:e2e:presentation` agora é um job explícito da CI e cobre a prévia financeira rotulada, ausência de escrita ao explorar pesos, navegação sem Arte, mobile e reutilização de demanda. Os testes do antigo acervo foram substituídos porque aquelas páginas não fazem parte do build financeiro publicado.

## Arquitetura frontend v7.0 (04/11/2026)

Objetivo: cada página baixa só o que usa, sem segundo sistema de CRM, negociação
ou contrato e sem mover regra financeira para a tela. `finance/app.js` continua
o coordenador de rotas (lista explícita exigida por `check-demo-parity`).

| Antes | Depois | Responsabilidade |
|---|---|---|
| `views/company.js` (~80 KB, 7 rotas num chunk) | `views/company/{approvals,proposals,contracts,providers,tasks,notifications,settings}.js` + `capabilities.js` | uma tela por módulo; capabilities secundárias (policy, contrato, relacionamento, SSO, passport) sob demanda |
| `views/shared.js` (importado por quase todas as telas, com o motor de comparação) | `views/shared/{people,terms,comparison,approvals,collaboration,tasks,documents}.js` | imports específicos, sem barrel; só RFQ/caixa de aprovação carregam comparação |
| `views/rfq.js` (todas as abas) | `rfq.js` (visão geral, próximo passo, propostas) + `rfq/{comparison-tab,approvals-tab,decision-tab,export}.js` | abas carregadas na primeira abertura; `tabs()` não reconstrói nem relê ao alternar |
| `views/crm-workspace.js` (Copilot e painéis puxavam o CRM inteiro) | `crm-workspace.js` + `crm/{model,form,organization-panel,linked-panel}.js` | fonte única do vocabulário/leitura; RFQ e contrato só baixam o painel vinculado |
| `views/contract-center.js` | + `contract-center/{terms,import}.js` | assistente de registro de contrato existente só ao acionar |
| busca Ctrl/Cmd+K no shell | `src/command-center.js` | atalho e botão instalados no shell; diálogo/busca baixados na primeira abertura |

Padrões introduzidos: `ctx.send(path, body, method)` (escrita JSON pelo mesmo
caminho de `ctx.api`), `ctx.orgId` (organização ativa codificada, lida na hora
da chamada), `mutedText()` e `toastError()` em `ui.js`. Ramos do sandbox legado
(`ctx.mode === 'demo'`, `demoPage`, troca de persona) ficam condicionados à
constante de build `__ARANDU_DEMO__`: idênticos no build demonstrativo e
eliminados do produto. `core.js` deixou de importar `PRODUCTS` (rótulos já
existiam em `CATEGORY_LABELS`; paridade verificada no E2E).

Estados: falha ao carregar um módulo (rede ou deploy novo) nunca mostra a
mensagem técnica do navegador; como o navegador guarda a falha do `import()`,
a ação oferecida é **Recarregar a página**, não uma nova tentativa que falharia
de novo (`readableError`/`moduleLoadFailed`). Falhas de dados mantêm
**Tentar novamente** no lugar; `tabs()` passa a oferecê-la para abas assíncronas.

Medições locais (build de produção, bytes publicados; `reports/bundle-profile.json`):

| Medida | Base `c72e686` | v7.0 |
|---|---:|---:|
| JS total do produto (Oficial/Staging/Demo canônica) | 778.633 | 767.171 |
| Margem até 800.000 | 21.367 (97,3%) | 32.829 (95,9%) |
| JS do build demonstrativo legado (parte produto) | 797.453 | 793.504 |
| Sandbox legado | 327.553 | 327.946 |
| Maior chunk | 55.561 (`rfq`) | 55.828 (`crm-workspace`+relacionamento) |
| Maior rota (`rfq`) | 210.846 | 158.299 |
| Carga inicial (app + shell) | 83.055 | ~62.300 |

Carga efetiva por página (app + tela + módulos que a tela carrega ao abrir):
contratos 241.725 → ~118.400; instituições 325.685 → ~193.200; aprovações
249.306 → ~170.000; configurações 329.880 → ~217.100; notificações 205.734 →
~64.300; Copilot 136.033 → ~78.700; RFQ com painel CRM 250.875 → ~163.000.
Splitting aumenta a “cola” entre chunks (~18 KB no total); o ganho total veio de
código do sandbox eliminado do produto, `ctx.send`/`ctx.orgId`/`mutedText`/
`toastError` e do desacoplamento de `PRODUCTS`.

Limites conhecidos: o envelope saudável (≤ 720.000) não foi atingido; o texto
de interface é ~46% do JS publicado. No build demonstrativo legado, o chunk do
motor do sandbox (~55 KB) é contado como produto porque inclui
`lib/finance/workflow.mjs`; contado honestamente, o sandbox passaria do teto
congelado de 330.000. Isso só se resolve com a migração de `arandu-demo` para
`ARANDU_ENV=demo` (cutover), que remove o sandbox do build. Ainda candidatos:
detalhe do contrato (versões/aditivos/marcos), `policy.js`, `provider.js`.
