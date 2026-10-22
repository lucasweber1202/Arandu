# Ensaio final de prontidão — 21/10/2026 (executor cloud, NÃO é a estação definitiva)

**SHA ensaiado:** `main@d17ad67d55422edb478b3f2821b0e643dcc889c9`, mais as correções da
branch `claude/final-demo-readiness-20261029` (ver "Código").
**Ambiente:** contêiner Linux temporário (cloud), 4 vCPU, 15 GB, Docker 29.9.1
iniciado localmente, Node 24.22.1 instalado em diretório privado. **Não é Windows/WSL2.**
**Veredito de estação: `STATION_NOT_VERIFIED`.** Nada aqui vale como READY da
máquina do owner; serve de ensaio reproduzível e de evidência do produto contra
backend real local.

## 1. Classificação P0

| Gate | Estado | Evidência |
| --- | --- | --- |
| P0-A PUBLIC SHAREABLE | HTTP **PASS**; navegador **NOT_PROVEN** | `smoke:public-demo` em `https://arandu-demo.vercel.app/`: 169/169 checagens HTTP, manifesto `commit=d17ad67`, `branch=main`, `modality=informative-tour-with-browser-sandbox`, `datasource=synthetic-fixtures`. Etapa de navegador: 13 erros por viewport, todos de dois tipos sem relação com conteúdo (ver §3) |
| P0-B LOCAL STATION READY | **STATION_NOT_VERIFIED** | Executor cloud. Precisa rodar na máquina definitiva (§8) |
| P0-C DEMO END-TO-END | **PASS em backend real local (laboratório)** | Seed 39/39, prontidão leitura PRONTO, `demo-entry-lifecycle` verde, `demo-baseline` 6/6 (§4) |
| P0-D FALLBACK | **PREPARED** | Planos A/B/C e incidentes em `docs/demo/PRESENTATION_2026-10-29.md` e `OPERATOR_29-10.md` (atualizados); capturas reais nesta pasta |
| P0-E RELEASE GOVERNANCE | Pendente de PR/gates | Correções desta rodada em PR única (§7) |

## 2. Auditoria da estação de laboratório (20 itens)

| # | Item | Resultado | Evidência |
| --- | --- | --- | --- |
| 1 | SHA correto | PASS | worktree em `origin/main` d17ad67 (e depois a branch de correção) |
| 2 | Lockfile | PASS | `npm ci --include=optional` sem alteração |
| 3 | Árvore limpa | PASS | `git status` limpo antes do ensaio |
| 4 | Node | PASS (24.22.1) | runtime do contêiner era 22; Node 24 privado usado em tudo |
| 5 | Docker | PASS | daemon local; imagens do ECR público |
| 6 | Portas | PASS | 54322 (db), 8443 (gateway), 4443 (app), somente localhost |
| 7 | Banco | PASS | contêiner `healthy` |
| 8 | Auth (GoTrue) | PASS | HTTP 200 |
| 9 | API (PostgREST) | PASS | HTTP 200 |
| 10 | Storage | PASS | HTTP 200; bucket `fin-documents` privado |
| 11 | App HTTPS | PASS | `ARANDU_ENV=demo`, dados supabase |
| 12 | Certificado no navegador | PASS em Chromium headless (ignora autoassinado); **verificar no navegador do owner** | — |
| 13 | Seed sintético | PASS | `39/39 checagens OK` |
| 14 | Personas entram | PASS | 9/9 pela prontidão |
| 15 | RLS efetivo | PASS | "Atlas não vê outras instituições: 0 menções"; isolamento entre visitantes: ver §4 |
| 16 | Pool | PASS após provisionar | 4/4 em ≈ 630 s por par |
| 17 | Navegação e operações | PASS | lifecycle + baseline |
| 18 | Readiness recente | Leitura PRONTO; interativo PRONTO após pool | `readiness-local.md` |
| 19 | Retomada sem perda | NOT_RUN aqui | já medido em 19/10 (OPERATOR); repetir na definitiva |
| 20 | Sem conexões hospedadas | PASS | `SUPABASE_URL=https://localhost:8443`; sonda hospedada `not_ready` esperada |

## 3. Visita pública (P0-A)

- HTTP: 169/169 PASS. A visita responde no SHA aprovado, sem rotas legadas de arte (404) e com `/api/health` 200.
- Navegador (desktop e Pixel 7): FAIL do harness com dois tipos de erro:
  1. `CONTRACT_FAILURE` "Response body is not available for a response that was navigated away from". É uma corrida do Playwright ao ler o corpo após reload.
  2. `ROUTE_FAILURE` no favicon durante o reload (requisição abortada).

  Este contêiner usa Chromium build 1194 com Playwright 1.64 (que espera o 1248). As 34 capturas renderizaram corretamente (amostras em `public/`).
- **Não declarado PASS**: repetir `smoke:public-demo --browser` numa máquina com o Chromium do lockfile. Se repetir, investigar o harness.

## 4. Jornadas executadas contra backend real local

| Jornada | Resultado |
| --- | --- |
| `seed.mjs --reset` + 39 checagens | PASS |
| `readiness --smoke` | Leitura PRONTO; interativo NÃO PRONTO só por pool vazio, que foi provisionado em seguida |
| `demo-entry-lifecycle.spec.js`: gestora → RFQ, convites, propostas, comparação → CFO aprova → decisão e contrato → implantação, covenants, renovação → tarefa gravada → instituição envia e revisa → outra instituição não alcança → leitor sem escrita → sair | **PASS** (39,5 s, 1 workspace) |
| `demo-baseline.spec.js` (tesouraria, CFO, provedor sem concorrentes, Passport, pós-contrato, responsáveis de tarefa com idempotência e recusas) | **6/6 PASS** |
| `demo-workspaces.spec.js` (dois visitantes isolados, IDOR, 19 recursos negados) | **PASS** na janela seguinte do limite (1ª tentativa: interrompida pelo próprio limite de entradas; 2ª: 5ª reivindicação da hora recusada pelo limite de 4/h; 3ª, 19:31 UTC: verde, 10,6 s, 2 workspaces) |

Observado e respeitado: ao rodar três suítes seguidas, a lista de personas passou
a responder 429 (30 por 10 min por rede). A 5ª reivindicação de workspace na
mesma hora foi recusada (4 por hora por rede). As duas proteções funcionaram.
Nenhuma foi desligada.

## 5. Matriz de jornadas

| Fluxo | Mock E2E | Backend local | Estação definitiva | Visita pública | Teste automatizado | Risco conhecido |
| --- | --- | --- | --- | --- | --- | --- |
| Painel "Precisa de você" | sim | sim (captura) | não | etapa 2 | baseline | — |
| Central de Relacionamentos (fila) | sim | sim (captura, corrigida nesta rodada) | não | etapa 1 (texto) | finance-relationship-center | backend não traz aviso prévio no relacionamento; complementado pelo overview |
| Contrato existente → próxima ação | sim | sim | não | etapa 8 | finance-contracts, relationship-center | aviso prévio antigo pode ser default 60 |
| RFQ, convites, propostas, versões | sim | sim | não | etapas 3–5 | lifecycle, procurement | — |
| Portal da instituição | sim | sim | não | etapas 10–12 | lifecycle, provider-draft | recusa de convite inexistente |
| Comparação factual | sim | sim | não | etapa 6 | lifecycle, procurement | — |
| Aprovação CFO e decisão | sim | sim (grava) | não | etapa 7 | lifecycle, baseline | — |
| Contrato, implantação, covenants, renovação | sim | sim | não | etapas 8–9 | lifecycle, baseline | — |
| Tarefas e responsáveis | sim | sim (grava) | não | etapa 2 | baseline | — |
| Proposta externa | sim | **não** (sem cenário no seed) | não | nota na etapa 5 | finance-external-proposals | mostrar só como conceito ou fora da demo |
| Isolamento entre instituições/visitantes | parcial | sim | não | tabela etapa 12 | lifecycle, workspaces, SQL CI | — |

## 6. Auditoria visual (backend real, 1440 × 900 e Pixel 7)

- Capturas em `local-backend/`: painel, instituições, relacionamento Atlas, contratos, solicitações, comparação, tarefas, covenants, portal Atlas e aviso de limite no login.
- Overflow horizontal: 0 nas duas larguras.
- Defeitos encontrados **só com dados reais** e corrigidos nesta rodada:
  1. a fila repetia a mesma negociação por instituição convidada (5 de 8 itens visíveis);
  2. "prazo de resposta" aparecia em coleta já encerrada;
  3. o workspace do Atlas dizia "aviso prévio não informado" enquanto a Central mostrava 60 dias;
  4. a escolha de persona sumia sem aviso com a lista em 429.

## 7. Código (PR única)

Branch `claude/final-demo-readiness-20261029`:
- `financial-auth.js`, `financial-demo-entry.js`: aviso de espera no lugar do sumiço silencioso (429 da lista de personas).
- `relationship-center.js`, `relationship-context.js`, `provider-relationship.js`:
  - um item por negociação;
  - coleta encerrada explícita;
  - aviso prévio complementado pelo overview.
- Testes:
  - `demo-persona-entry.spec.js`: 429;
  - `finance-relationship-center.spec.js`: agrupamento e aviso complementado.
- Docs: PRESENTATION (passo 12, contingência), OPERATOR (F2, orçamentos medidos), esta evidência.

Resultados locais: listados na descrição da PR.
Rollback: `git revert` do merge (só frontend e docs; sem dados ou migração).

## 8. Pendente para a máquina definitiva (owner)

1. Windows/WSL2 com Docker Desktop (integração WSL2), repositório no disco Linux, Node 24 do Linux.
2. Com o SHA aprovado (após o merge desta PR), executar a sequência do OPERATOR D-3: `prepare-station --provision`, `freeze --station`, `readiness --smoke` e `station`.
3. Repetir `smoke:public-demo --browser` com o Chromium do lockfile.
4. Handoff de backend (não bloqueia a demo):
   - `provider-relationship` não seleciona `renewal_notice_days`;
   - a recusa de convite não existe;
   - o seed não tem cenário de proposta externa.
