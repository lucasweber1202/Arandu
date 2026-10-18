# Evidência — auditoria UX/UI da Demo canônica (Claude), 18/10/2026

Base: `main` @ `cc8636c` (#219, toolkit de frontend). Área: `finance/**` (views e `style.css`), `tests/e2e/**`, este documento.
Nenhum arquivo de backend, SQL, tokens globais, `package.json`/lock, workflows ou de outro agente. Production não foi tocada.
Maturidade: M1 + LOCAL_VALIDATED (Demo canônica local, backend real). **Demo hospedada não validada.**

## Ferramentas (FRONTEND_AGENT_TOOLKIT.md)

| Ferramenta | Estado neste ambiente | Uso |
| --- | --- | --- |
| Taste Skill (`design-taste-frontend`), Image to Code | **não instalada** | não usada; instalar exige revisão de proveniência e autorização (§3) |
| Web Design Guidelines (Vercel) | **não instalada** | checklist aplicado manualmente: rótulos, truncamento, contraste de estados, responsividade |
| Awesome Design MD | não consultada | consultiva; nenhuma referência externa necessária |
| Playwright CLI | **não instalado** (`playwright-cli` ausente) | substituído pelo `@playwright/test` do repositório e `design:capture` |

## Método

`npm run demo:setup` (39/39) → `node scripts/design/capture-surfaces.mjs --label=before` (46 capturas, 1440 e 390 px:
painel, solicitações, propostas, contratos, aprovações, pós-contrato, portal do provedor, site público) → revisão visual
tela a tela contra a Design Constitution (§1 linguagem, §2 anti-vibecode, §6 responsividade, §9 tabelas, §12 microcopy) →
correções → regressões → `--label=after` (46 capturas, 0 overflow, 0 erros). O automático do "antes" já dava 0
overflow/0 erros: os defeitos abaixo só aparecem na leitura humana das capturas.

## Defeitos encontrados e corrigidos

| # | Tela | Antes | Depois | Regressão |
| --- | --- | --- | --- | --- |
| U1 | Propostas recebidas (e todo resumo de condições) | "Prazo de liquidação: 1 dias" | "1 dia" (singular para dia/mês) | `finance-procurement`: "validade de processo encerrado…" — **FAIL na `main`** |
| U2 | Propostas recebidas | Validade de propostas de processos **já contratados** em vermelho "vencida" e **sem ano** (dez/2024 parecia este ano): alarme falso de urgência | Processo encerrado: data com ano, texto atenuado, "expirou", sem vermelho; processo em decisão continua alertando | mesmo teste — **FAIL na `main`** |
| U3 | Solicitações (desktop 1440) | Prazo quebrava em duas linhas ("15 de / out") e responsável truncado ("Juliana Ra…") com espaço sobrando no título | Prazo em uma linha; nome inteiro | "solicitações: prazo não quebra…" — **FAIL na `main`** |
| U4 | Solicitações (celular 390) | Filtro "Qualquer responsáv…" cortado (dois selects lado a lado) | Cada filtro ocupa a linha (a regra anterior perdia em especificidade para `.toolbar .input`) | "solicitações no celular: filtros…" — passa nas duas (o mock não reproduz a fonte/largura da Demo); prova pela captura real |

Capturas antes/depois (Demo real): `claude-ux-ui-audit-2026-10-18/{rfqs,proposals}-{desktop,mobile}-{before,after}.png`.

## Auditado sem defeito novo

Painel (pendências com motivo/prazo/responsável), contratos (linha do tempo, próxima ação, atalhos de pós-contrato),
portal do provedor (comprador identificado, estados enviada/encerrada), navegação (menu em cinco áreas, barra inferior no
celular). Observação não corrigida (fora do escopo seguro): no painel, os campos de data do bloco "Inteligência de valor"
exibem o formato do navegador (`mm/dd/yyyy` com locale en-US do Chromium de teste); é controle nativo, não texto do app.

## Validação

| Verificação | Resultado |
| --- | --- |
| `check:all`, `build`, `check:design`, `check:demo-parity`, `check:financial-surface`, `check:financial-navigation`, `git diff --check` | PASS |
| `test:e2e` — Chromium desktop + Pixel 7 | 431 passed, 9 skipped |
| `test:e2e:presentation` — Chromium desktop + Pixel 7 | 125 passed, 19 skipped |
| `design:capture` before/after (Demo local, backend real) | 46/46 cada; after: 0 overflow, 0 erros (uma tentativa intermediária bateu no limite legítimo de 120 req/10 min e foi refeita após a janela) |
| Firefox, WebKit, iPhone | **NOT_RUN** localmente (só Chromium); gate `presentation` do CI cobre |
| `test:e2e:demo`, `test:database` | NOT_RUN — sem mudança de jornada nem SQL |

## Rollback

Reverter a PR (CSS, duas funções de apresentação e testes). Nenhum contrato, dado ou token alterado.
