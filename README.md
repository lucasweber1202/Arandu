# Arandu — Financial Procurement

**Arandu é uma plataforma B2B de procurement financeiro.** Ela ajuda empresas a
estruturar uma demanda financeira, solicitar propostas a vários bancos e
provedores, comparar as condições lado a lado, decidir com aprovação interna e
acompanhar o contrato até a renovação.

Produtos cobertos hoje:

- **crédito empresarial** (capital de giro, antecipação de recebíveis e afins);
- **adquirência** (MDR, PIX, antecipação, liquidação, gateway).

O Arandu **não** concede crédito, **não** decide crédito, **não** movimenta
dinheiro, **não** executa pagamentos e **não** recomenda instituição. A decisão
é sempre da empresa. Limites completos em
[`docs/FINANCIAL_PRODUCT_BOUNDARIES.md`](docs/FINANCIAL_PRODUCT_BOUNDARIES.md).

> **Demonstração:** a demo canônica é o próprio produto (`main`) com
> `ARANDU_ENV=demo`, um Supabase DEMO e a empresa fictícia Vitta Foods S.A.
> Localmente: `npm run demo:setup`. Roteiro, dados, reset e travas:
> [`docs/demo/README.md`](docs/demo/README.md).

## O problema

Uma tesouraria que quer crédito ou trocar de adquirente costuma pedir proposta
por e-mail, receber cada banco num formato, montar a comparação em planilha e
aprovar por mensagem. Não fica registro de quem pediu o quê, qual versão da
proposta foi comparada, quem aprovou e por quê, nem de quando o contrato vence.
O Arandu dá forma a esse processo, com trilha de auditoria, sem tomar a decisão
no lugar da empresa.

## Como funciona

### Empresa compradora (`/finance/`)

1. **Demanda** — cria uma solicitação (RFQ) guiada por produto; o rascunho é
   salvo no servidor enquanto se escreve.
2. **Convite** — convida provedores; cada convite é de uso único e, quando o
   provedor tem contato cadastrado, vinculado ao e-mail exato.
3. **Revisões** — ajusta a demanda em novas revisões; cada provedor vê o que
   mudou e responde à revisão atual.
4. **Comparação** — compara propostas normalizadas campo a campo, com
   cobertura por proposta e pesos definidos pelo próprio usuário (o Arandu não
   pontua nem recomenda).
5. **Aprovação** — política de aprovação sequencial por etapas; quem pediu não
   aprova, e uma aprovação dada a uma versão antiga não vale para a nova.
6. **Decisão e contrato** — decisão humana registrada, contrato com ciclo de
   vida, marcos de 90/60/30 dias, aviso prévio e renovação.
7. **Colaboração** — tarefas, comentários com menções, visibilidade interna ou
   para o provedor, notificações, busca e central de comandos, documentos
   privados com URL assinada e versionamento.

### Provedor financeiro (`/provider/`)

1. Aceita o convite e passa a ver a demanda completa só depois de aceitar.
2. Responde com proposta versionada, com rascunho salvo automaticamente.
3. Vê apenas o próprio processo: nunca propostas, perguntas, comentários ou
   documentos de concorrentes.
4. Depois do encerramento, o processo fica somente leitura.

### Operação (`/finance/ops.html`)

Console de saúde para o papel de plataforma `finance_ops`, com MFA obrigatório,
métricas operacionais e outbox — sem dados de clientes.

## Arquitetura

| Camada | Tecnologia | Onde |
| --- | --- | --- |
| Front-end | HTML multipágina + JavaScript modular, build com Vite | `finance/`, `provider/`, `demo/`, páginas públicas na raiz |
| API | Funções serverless da Vercel; roteador único | `api/[...path].js`, domínio financeiro em `lib/api/domains/finance.mjs` e `lib/finance/` |
| Banco | Supabase (PostgreSQL, Auth, Storage), RLS em todas as tabelas `fin_*` | migrations em `docs/*.sql`, ordem em `docs/supabase-migrations.json` |
| Jobs | Vercel Cron com segredo (`/api/jobs/renewals`) | `lib/api/domains/finance-jobs.mjs` |
| Demo | Produto real com `ARANDU_ENV=demo` e Supabase DEMO semeado (Vitta Foods); sandbox legado no navegador até a migração | `scripts/demo/`, `finance/demo/` (legado) |

Modelo de dados: [`docs/FINANCIAL_DATA_MODEL.md`](docs/FINANCIAL_DATA_MODEL.md).
Interface: [`docs/FINANCIAL_UI_ARCHITECTURE.md`](docs/FINANCIAL_UI_ARCHITECTURE.md).
Produto: [`docs/FINANCIAL_PROCUREMENT_PRODUCT.md`](docs/FINANCIAL_PROCUREMENT_PRODUCT.md).

## Segurança

- **Multi-tenant no banco**: RLS em todas as tabelas `fin_*`; RPCs com
  `search_path` fixo e inventário travado em teste; 43 ataques diretos entre
  tenants e papéis recusados sem efeito colateral (`npm run test:database`).
- **RBAC** por organização (comprador, aprovador, provedor, admin) e papel de
  plataforma `finance_ops` com MFA `aal2`.
- **Allowlist fail-closed** no piloto: tabela vazia = ninguém cria organização.
- **Documentos privados** no bucket `fin-documents` (privado, 10 MB, 5 tipos),
  acesso só por URL assinada emitida depois da autorização.
- **Service role só no servidor**; o build falha se credencial real acompanhar a
  demo, e `finance:env:check` recusa chave de outro projeto.
- **Superfície legada de arte fechada** (404) em piloto, produção, qualquer
  deployment Vercel de produção e na demo.
- **Request ID** em toda resposta de API, rate limit no banco, cabeçalhos de
  segurança e CSP em `vercel.json`.

Modelo completo: [`docs/FINANCIAL_SECURITY_MODEL.md`](docs/FINANCIAL_SECURITY_MODEL.md),
[`docs/FINANCIAL_THREAT_MODEL.md`](docs/FINANCIAL_THREAT_MODEL.md),
[`docs/FINANCIAL_AUTHORIZATION_MAP.md`](docs/FINANCIAL_AUTHORIZATION_MAP.md).
Vulnerabilidades: [`SECURITY.md`](SECURITY.md).

## Ambientes

Uma base de código, três ambientes. Eles diferem por branch, projeto Vercel,
variáveis e projeto Supabase, nunca por cópias do código.

| Ambiente | Projeto Vercel | Branch | Declarado por | Banco |
| --- | --- | --- | --- | --- |
| **Demo** | `arandu-demo` | `main` | `ARANDU_ENV=demo` | Supabase DEMO próprio (Vitta Foods, fictícia) |
| **Staging/Pilot** | `arandu-pilot` | `main` | `ARANDU_ENV=pilot` | Supabase do piloto (validação) |
| **Production** | `arandu` | `main` | `ARANDU_ENV=production` | Supabase próprio da produção |

Os três ambientes publicam a **mesma `main`** e nunca compartilham banco; nenhum
usa o projeto legado de arte. A diferença de comportamento (e-mail, webhooks,
modelo externo, documentos reais, fixtures) vem só de `lib/runtime-mode.mjs`.
O build recusa a topologia errada (banco trocado, branch diferente de `main`,
sandbox em ambiente real, credencial no sandbox, produção sem ambiente
declarado). Fluxo `feature/* → PR → main → ambientes`, release e rollback:
[`docs/FINANCIAL_DEPLOYMENT_WORKFLOW.md`](docs/FINANCIAL_DEPLOYMENT_WORKFLOW.md).

- **Demo**: [`docs/demo/README.md`](docs/demo/README.md) (canônica). O sandbox
  antigo no navegador (`ARANDU_DEPLOYMENT_KIND=demo`) está em
  [`docs/FINANCIAL_DEMO_MODE.md`](docs/FINANCIAL_DEMO_MODE.md) até ser aposentado.
- **Pilot**: [`docs/FINANCIAL_PILOT_GO_LIVE.md`](docs/FINANCIAL_PILOT_GO_LIVE.md)
  (checklist única), [`docs/FINANCIAL_PILOT_ENVIRONMENT.md`](docs/FINANCIAL_PILOT_ENVIRONMENT.md),
  [`docs/FINANCIAL_PILOT_OPERATIONS.md`](docs/FINANCIAL_PILOT_OPERATIONS.md).
- **Production**: mesmas migrations e o mesmo `finance:pilot:doctor` com
  `ARANDU_ENV=production`; nenhum dado do piloto é copiado.

## Estado operacional

Estado histórico observado em 02/10/2026 (anterior à consolidação `main` canônica de 06/10/2026), separado por código e ambiente em
[`docs/ARANDU_CURRENT_STATE_2026-10-02.md`](docs/ARANDU_CURRENT_STATE_2026-10-02.md):

- **Código**: `main` com Onda 0 e CI verde; `pilot` 13 commits à frente e
  0 atrás, em `187c032c` após a PR #96, com Financial Passport v2.
  O run #721 teve presentation cancelado; o #722 concluiu os quatro gates
  com SUCCESS. A árvore validada é idêntica à do merge #96.
- **Supabase Pilot**: `financial-surface-hardening-1`; aprovação sequencial e
  Passport pendentes. Allowlist vazia, e-mail desligado, Storage privado.
- **Demo pública**: ainda sandbox em `main`; o Supabase DEMO dedicado não
  pôde ser criado por limite de dois projetos ativos no Free.
- **Produção**: deploy oficial antigo; não há Supabase Production dedicado.
- **Dependências externas**: backup/restore do Pilot, configuração Vercel,
  capacidade Supabase, proteção de branches e preparação jurídica/comercial.
  Lista em [`docs/FINANCIAL_OWNER_ACTIONS.md`](docs/FINANCIAL_OWNER_ACTIONS.md).

Nenhum item acima é declarado pronto sem evidência verificável. Gates externos
de produção ficam em `ops/release-evidence.json` e não bloqueiam o piloto
financeiro.

## Rodar localmente

Requisitos: Node.js 24, npm; PostgreSQL 16 para a suíte de banco; Chromium para
Playwright.

```bash
npm ci --include=optional
npm run dev                                    # app em http://localhost:5173
ARANDU_DEMO_MODE=true npm run dev              # com /demo/ habilitada
ARANDU_DEPLOYMENT_KIND=demo npm run build:demo # build igual ao do arandu-demo
```

Piloto completo em contêineres (Postgres, GoTrue, PostgREST e Storage da
Supabase): `npm run pilot:local:up && npm run pilot:local:journey`.

## Validação local

Antes de qualquer push (cada push custa minutos do GitHub Actions — ver
[`docs/GITHUB_ACTIONS_MINUTES.md`](docs/GITHUB_ACTIONS_MINUTES.md)):

```bash
npm run audit:ci
npm run check:all            # contratos, segurança, finanças, migrations, governança
npm run build
npm run check:dist-assets && npm run check:build-size && npm run check:seo:dist
npm run check:financial-surface && npm run check:financial-navigation
npm run test:e2e             # jornadas financeiras (5 motores de navegador)
npm run test:e2e:presentation # demo e modo de apresentação
ARANDU_DATABASE_TEST_URL=postgresql://postgres:postgres@localhost:5432/postgres \
  npm run test:database      # instalação limpa, upgrade, rollback, RLS, ataques
```

Ambientes reais (somente leitura, nunca imprimem segredos):

```bash
ARANDU_ENV=pilot npm run finance:env:check
ARANDU_ENV=pilot npm run finance:pilot:doctor   # 0 = GO, 1 = NO-GO, 2 = UNSAFE
npm run pilot:canary                            # isolamento buyer/provider/outsider
npm run pilot:backup:preflight                  # identidade, dependências e escopo
npm run pilot:restore:drill                     # backup lógico + restore + comparações de integridade
```

O CI (`.github/workflows/ci.yml`) roda os jobs `validate`, `database`,
`deploy-boundaries` e `presentation`.

## Contribuir

Leia [`CONTRIBUTING.md`](CONTRIBUTING.md). Em resumo: branch `feature/*` a
partir de `main`, PR para `main` com os quatro gates verdes no HEAD exato,
validação local completa e **um push por lote**. `pilot` está congelada
(histórica). Nunca registre segredo, e-mail real ou PII no Git.

## Governança do repositório

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — branches, validação e PRs;
- [`SECURITY.md`](SECURITY.md) — reporte responsável;
- [`docs/FINANCIAL_REPO_GOVERNANCE.md`](docs/FINANCIAL_REPO_GOVERNANCE.md) — proteção de branches e checks obrigatórios;
- [`docs/FINANCIAL_DEPLOYMENT_WORKFLOW.md`](docs/FINANCIAL_DEPLOYMENT_WORKFLOW.md) — ambientes e promoção;
- [`docs/OPERATIONS_INDEX.md`](docs/OPERATIONS_INDEX.md) — índice operacional;
- [`CLAUDE.md`](CLAUDE.md) — regras para agentes.

A CI executa `scripts/check-governance.mjs` para impedir regressões nos
controles mínimos do repositório.

## Critério de lançamento

**Piloto** (GO quando todos valerem):

1. migrations do manifesto aplicadas até o schema esperado pelo código do piloto e `finance:pilot:doctor` = GO;
2. `arandu-pilot` publicado da `main` com `ARANDU_ENV=pilot`;
3. `pilot:canary` e `pilot:restore:drill` aprovados contra o piloto real;
4. CI verde no SHA de `main` publicado no piloto;
5. revisão jurídica concluída e empresa/provedores do piloto na allowlist.

**Produção**: Supabase próprio com as mesmas migrations, `ARANDU_ENV=production`
no projeto `arandu`, doctor GO contra ele e o mesmo SHA de `main` validado no
piloto realmente utilizado.

## Nota histórica

O Arandu começou como marketplace de arte brasileira. Essa vertical foi
aposentada e removida da árvore atual; o Git preserva a história. Detalhes e
regras para não reintroduzi-la: [`docs/LEGACY_ART_RETIREMENT.md`](docs/LEGACY_ART_RETIREMENT.md).
