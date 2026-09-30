# Demo — Ultimate Financial Work OS (v3) · revisão

Rodada exclusiva da demonstração (`/demo/*`). Piloto e produção não mudaram:
nenhuma migration, Supabase, RLS/RBAC real, API, regra financeira, credencial,
SDK ou dependência nova. Arquitetura em `docs/DEMO_WORK_OS_V3.md`.

- Base: `main` @ `d7ae8574b63fc2e3af2a0b558439ebd7a266553b` (PR #88 mergeado).
- Evidência: `artifacts/demo-work-os-v3/before/` (commit `84bbb5a`, antes de
  qualquer mudança) e `artifacts/demo-work-os-v3/after/` — mesmas personas,
  mesmos objetos, mesmos viewports (1440×900, 1366×768, 1280×800, 390×844).
  Onde a tela não existia antes, o "before" mostra o lugar equivalente
  (política → Configurações#aprovação; integrações → Configurações#demonstração;
  intake → nova solicitação; uso → ops).
- Captura: `node scripts/demo-workspace-screenshots.mjs <before|after> --round=v3`.

## Matriz

| Capacidade | Antes | Depois | Como testar | Limitação |
| --- | --- | --- | --- | --- |
| Estado local único | Motor + preferências soltas | `arandu-demo-os` versionado e validado; registro adulterado volta ao inicial | `test-demo-work-os.mjs` | Só neste navegador |
| Cache local-first | Cada tela esperava o motor (140 ms) e mostrava "Carregando…" | Stale-while-revalidate; revalidação atualiza sem piscar | Navegar entre telas; Uso → cache | Cache por aba (sessionStorage) |
| Eventos / delta | Nenhum | 29 tipos, com pessoa, objeto, momento e origem; entre abas | Abrir duas abas | Não é protocolo de sync real |
| Ação otimista | Aprovar esperava o motor | Sai da fila na hora; falha desfaz e explica | E2E `decisão otimista` | Só decisões e comentários são otimistas |
| Offline / fila | — | "Offline · N alterações aguardando sincronização", Reconectar, Tentar novamente | Topbar → Simular offline | Rede simulada |
| Conflito | — | 36 meses × 48 meses lado a lado, escolha auditada | Uso → Simular conflito | Um exemplo fixo; a solicitação decidida não muda |
| Presença | — | Linha discreta: quem está com a decisão, última proposta, dono; outras abas reais | Solicitação / Aprovação; duas abas | Demais pessoas derivadas dos dados |
| Atividade universal | Lista "Histórico" do motor | Motor + camada, sem duplicar, filtros Tudo/Alterações/Propostas/Aprovações/Comentários, origem | Solicitação → Histórico | 40 itens mais recentes |
| Comentários com escopo | Só na solicitação (produto) | Proposta (Interno / Visível ao provedor), aprovação e contrato (internos) | E2E `comentários com escopo` | Guardados localmente |
| @menções | Produto, só na solicitação | Autocomplete de teclado (listbox) em aprovação, contrato e proposta → notificação | E2E `menção` | Só em comentário interno |
| Central de notificações | Lista única | Precisa de você/Menções/Processos/Integrações/Sistema, contadores, só não lidas, marcar lidas | `/finance/notifications.html` | — |
| Precisa de você | Estado, ação, motivo, prazo, dono | + dependência ("Aguardando Atlas Bank", "Bloqueia o registro…") + Hoje/Em breve/Depois | Início | Agrupamento opcional |
| Central de comando | Objetos, ações, aparência | + Pessoas, Comentários, Integrações, Configurações, buscas recentes, destaque; carrega sob demanda | Ctrl/⌘+K | — |
| Atalhos e ajuda | Ctrl+K, Ctrl+B | G H/R/A/C/N/I, N R, C, E, Esc, ?; ajuda com conceitos, glossário (RFQ, CET, MDR, carência, garantia, aviso prévio, revisão) e limites | `?` | Desktop |
| Políticas versionadas | Política única em Configurações | Construtor: rascunho, regras, condição, ordem, etapas, fluxo visual, prévia, publicar; v1–v3 com histórico; processos em andamento na v2 | `/finance/policies.html` | Explica etapas; aprovações registradas seguem o motor |
| Intake | Formulário completo | Modelos (capital de giro, financiamento, refinanciamento, adquirência, renovação), perguntas determinísticas, pré-preenchimento com procedência, política prevista, salvar/duplicar modelo | `/finance/intake.html` | Continua no editor do produto |
| Integration Center | — | 6 categorias, 13 conectores com adaptador (connect/disconnect/status/sync/lastSync/events), consentimento explícito | `/finance/integrations.html` | Todos simulados |
| Slack/Teams | — | Prévia de mensagem que leva ao Arandu; **sem** aprovar pela mensagem | Conectar Slack | Nenhuma mensagem é enviada |
| SSO/SCIM/RBAC | — | Entra ID/Okta/Google, "23 usuários · 4 grupos", mapeamento de grupos, matriz "O que este papel pode fazer?" | Conectar WorkOS | Espelha permissões do produto; não as altera |
| ERP | — | Importar fornecedores e centros de custo, reconhecimento ERP → Arandu, "Preparar registro no ERP" no contrato | Conectar Omie → Contratos → ⋯ | Prévia; nada é enviado |
| Open Finance | — | Consentimento "Dados simulados / Nenhum banco real será acessado", categorias, "17 de 20 campos", procedência Fonte/Atualizado/Responsável | Conectar Pluggy → Configurações#perfil | Dados fictícios |
| Auditoria | Histórico por solicitação | Quem/Fez o quê/Quando/Objeto/Origem com filtro por origem | Uso da demonstração | Local |
| Analytics / funil / flags | — | Eventos locais (demo_started, rfq_opened…), funil, linha do tempo, 7 feature flags | Uso da demonstração | Nada sai do navegador |
| Desempenho | Sem medição | Medições × orçamento, painel escondido (Alt+Shift+D), teste de vazamento de ouvintes | E2E `desempenho` | Medições do próprio navegador |
| Inspector adaptativo | Breakpoint fixo 1360 px | Largura útil medida (tela − barra lateral ≥ 1100 px) | E2E `inspector adaptativo` | Desligável pela flag |
| Roteiro 3.0 | 7 passos | 9 passos, incluindo intake, política e integrações | Landing → Ver processo completo | — |
| Continuidade | "Continuar como …" | + "Voltar ao processo como Marina" depois da aprovação | Aprovação concluída | — |
| Reflow / 320 px | Telas antigas | Novas telas sem rolagem horizontal em 320 px | E2E `320 px` | — |

## Testes

- Novos: `tests/e2e/demo-work-os-v3.spec.js` (16 cenários; toda requisição
  fora de 127.0.0.1 falha o teste) e `scripts/test-demo-work-os.mjs`
  (privacidade, política, atividade, intake, fila, local-first, conectores,
  telemetria, varredura de linguagem de recomendação/IA/URLs externas),
  ligado em `check:finance` e `test:demo`.
- Isolamento: `scripts/test-demo-mode.mjs --dist` ganhou marcadores do Work OS
  (chaves de armazenamento, conectores, classes, rótulos) e verifica que
  `/finance/{intake,policies,integrations,usage}.html` não existem no build
  oficial.
- Testes antigos ajustados (mudança de UX intencional, documentada):
  roteiro 7 → 9 passos; notificações não lidas agora em `.ncenter-item`;
  `arandu-demo-os` na lista de chaves locais permitidas da demo; largura da
  barra compacta medida depois da transição (`expect.poll`).

## Gates (locais)

`npm ci --include=optional` ✓ · `audit:ci` ✓ · `check:all` ✓ · `build` ✓ ·
`build:demo` ✓ · `deploy:check:demo` ✓ · `check:dist-assets` ✓ ·
`check:build-size` ✓ (maior JS 90,6 kB / 100 kB) · `test:e2e:list` ✓ ·
`test:e2e` 40/40 ✓ · `test:e2e:presentation` 117 ✓, 19 pulados por projeto ·
`git diff --check` ✓. Chromium desktop e Pixel 7. Firefox e WebKit **não
estão instalados** neste ambiente (os binários não existem em
`/opt/pw-browsers`); os projetos continuam na config e rodam no CI.

## Riscos e o que olhar

- A caixa de decisão é otimista: se o motor recusar, a decisão volta para a
  fila com a mensagem — conferir o texto.
- A política versionada é demonstrativa: publicar a v4 não muda as etapas que
  o motor cria para aprovações. Está dito na tela e na ajuda.
- O "offline" bloqueia escritas diretas no motor com mensagem clara; só
  decisões e comentários entram na fila.
- A revalidação recarrega a tela quando o dado muda (outra aba). Ela é
  suprimida com diálogo aberto, campo em foco ou inspector aberto.
