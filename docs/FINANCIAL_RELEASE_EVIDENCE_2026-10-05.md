# Baseline da pilot e fechamento operacional — 05/10/2026

**PILOT NO-GO.** Fonte canônica do estado atual (substitui
`FINANCIAL_RELEASE_EVIDENCE_2026-10-04.md` como referência viva; aquele
documento continua válido como registro histórico das observações hospedadas de
04/10). Nenhuma migration, exclusão, backup ou restore foi executado em ambiente
hospedado nesta rodada: o executor não tem credencial de Supabase, Vercel nem
administração do GitHub. Tudo o que está marcado "local" foi executado neste
executor e não atesta piloto nem produção.

## Estado inicial encontrado

| Item | Observado |
| --- | --- |
| `main` | `201adb475a62eb05d6da33b9f563b7132cf28a45` (merge #99) |
| `pilot` | `556258c0329a321fd6b2df8daf151195be4327f1` (merge #124 sobre o merge #123 `0e0c1d1`) |
| PRs abertas | nenhuma |
| proteção | `pilot` e `main`: `protected=false` (API de branches) |
| #123 (`d791552`) | run `37228180467`: quatro gates success |
| #124 (`8701d82`) | run `37228221232`: `database`, `deploy-boundaries`, `validate` success; **`presentation` failure** |
| `pilot@556258c` | combinação #123 + #124 **nunca validada por CI**: as duas PRs foram testadas contra `7a0a839` e mergeadas em sequência; o CI não roda em push para `pilot` |

## Regressão de restauração da demo — causa-raiz

Sintoma (CI da #124, Chromium desktop): depois de `restore('Dados demonstrativos')`
o teste esperava `data-theme="dark"` e recebia `light`. Reproduzido localmente
(1/6 e 1/10 execuções no Chromium).

O reset **não** era a causa: instrumentado, `localStorage` e `data-theme` estavam
intactos antes e depois do reset de dados em todas as execuções verdes; na
execução vermelha o `page.evaluate` foi destruído por uma **navegação** disparada
pelo Enter da central de comando.

Causa: `lazyPalette` (`finance/demo/workspace/index.js`) carrega a central de
comando sob demanda. Um Ctrl+K antes de o módulo chegar abria a central só
depois do `import()`; as teclas digitadas nesse intervalo se perdiam e o Enter
seguinte executava o primeiro item da lista **vazia** ("Seu trabalho" →
navegação). O tema escuro nunca era aplicado; o reset de dados apenas revelava o
estado. Depois de `page.reload()` o teste não espera o pré-carregamento ocioso,
por isso falhava só no segundo comando e só quando o Chromium agendava o
`requestIdleCallback` tarde. É bug real de produto (perda de digitação e ação não
pedida), não do teste.

Correção: entre o pedido de abertura e a chegada do módulo, as teclas vão para um
buffer em captura (não vazam para a página), Backspace edita, Enter fica
pendente e é executado sobre a busca completa quando a central abre, Esc cancela
e devolve o teclado; Ctrl+K durante o carregamento cancela (mesma semântica de
alternância); falha de rede no `import()` libera o teclado e permite nova
tentativa. A semântica de restauração (só aparência / só dados / tudo) não foi
alterada.

Testes: o cenário original ganhou a asserção de que o tema escuro está aplicado
**antes** do reset de dados (aperto, não afrouxamento) e dois testes novos
seguram o pacote da central com `page.route` para reproduzir de forma
determinística a digitação durante o carregamento (Enter pendente e Esc). Os dois
testes novos **falham sem a correção** (tema continua `light`; foco preso pela
central aberta depois do Esc) e passam com ela: 64/64 em 8 repetições
(Chromium desktop + mobile Chrome).

## Segunda falha encontrada nesta rodada — mock divergente

`test:e2e` local: "documento privado sobe por URL assinada…" falhou em 7/20
repetições (desktop e mobile Chromium) com contexto destruído por navegação.
O servidor real (`lib/finance/document-storage.mjs`) assina o download com
`download=<arquivo>`, e o Storage responde como anexo (o navegador baixa sem sair
da página). O mock devolvia o PDF *inline* sem esse parâmetro, e o
`location.assign` navegava. O mock passou a espelhar o comportamento real
(`download=` + `Content-Disposition: attachment`), e o teste agora exige o GET
assinado e que a pessoa continue na solicitação antes de ler o armazenamento.
30/30 local. Uma primeira versão também esperava o evento `download` do
Playwright; ele não dispara no WebKit para resposta interceptada como anexo
(falhou no `validate` da #125 em webkit-desktop e mobile-safari) e foi removido
sem afrouxar o que o teste prova.

## Jornada local com componentes reais da Supabase — expectativa obsoleta

`pilot:local:journey` acusou 1 falha: "duas execuções simultâneas do cron"
esperava `200/200`. Desde o P0.10 cada job tem lease e a execução que não o obtém
responde `202 job_busy` para aquele job; observado `202/202` com 1 marco e 1
aviso (sem duplicação). A verificação ficou **mais precisa**: aceita 200 ou
202 `job_busy`, exige que cada um dos quatro jobs termine `succeeded` em alguma
das execuções, que nenhum falhe e que marco e aviso sejam únicos.

## Prevenção de merge vermelho

| Item | Estado |
| --- | --- |
| Rulesets versionados `.github/rulesets/{pilot,main}.json` | prontos, testados em `check:governance` (ativa, sem bypass, PR, conversas resolvidas, sem deleção/force push, quatro checks strict com `integration_id` do GitHub Actions) |
| `npm run merge:gates -- <PR>` | agora também bloqueia PR que não contém a ponta atual da base |
| `.github/workflows/merge-audit.yml` | detecção pós-merge em push para `pilot`/`main`; testado com o cenário real da #124 |
| Aplicação da ruleset | **OWNER_ACTION_REQUIRED** — executor sem administração (conector sem rulesets; `GH_TOKEN` inválido). Passo a passo em `BRANCH_PROTECTION.md` |

## Validação local desta rodada (HEAD da PR)

| Comando | Resultado |
| --- | --- |
| `npm ci --include=optional` | ok |
| `npm run audit:ci` | 0 vulnerabilidades |
| `npm run sbom:ci` | 21 componentes |
| `npm run check:all` | exit 0 |
| `npm run test:database` (PostgreSQL 16 local) | exit 0: instalação limpa, upgrade, reaplicação, rollback, RLS, matriz adversarial entre tenants, PostgREST, governança, aposentadoria da arte |
| `npm run build` + `check:build-size` + `check:dist-assets` + `check:financial-surface` + `check:financial-navigation` + `check:seo:dist` | ok; JS 426.007 / 800.000 |
| `npm run build:demo` | ok; JS 798.838 / 800.000 (orçamento inalterado; +703 bytes da correção) |
| equivalente local do job `deploy-boundaries` | ok (preview sem demo, demo explícita rotulada, produção sem `ARANDU_ENV` recusada, demo forçada em produção recusada, `predeploy` fail-closed) |
| `test:e2e` (Chromium desktop + mobile Chrome) | 167 passed, 7 skipped, 0 failed |
| `test:e2e:presentation` (Chromium desktop + mobile Chrome) | 123 passed, 19 skipped, 0 failed |
| `pilot:local:up` + `pilot:local:journey` (Postgres 15, GoTrue, PostgREST, Storage reais) | 24 passos, 63 ataques, 0 falhas |
| `pilot:local:doctor` | todos os cenários com o código esperado (GO, NO-GO, UNSAFE) |
| `pilot:restore:drill` (origem local com dados da jornada) | PASS, 28 sondas + canário de isolamento; backup 1,07 s, restore 2,35 s, sondas 0,88 s |
| `git diff --check` | ok |

Firefox, WebKit e Safari móvel **não** existem neste executor (download de
navegador proibido); rodam nos jobs `validate` e `presentation` do CI. Os skips
são condicionais documentados nos specs (atalhos/inspector/medições só de
desktop no projeto mobile; jornada da demo canônica sem senha).

### Limite do restore drill (lacuna real)

O drill restaura o banco (public, `auth.users`/`identities`, configuração e
políticas do Storage) e **recusa rodar** quando a origem tem objetos no Storage,
fatores MFA ou políticas de auth, porque não exporta binários, segredos TOTP nem
essas políticas — prefere bloquear a fingir recuperação. Para o drill local com
dados, os 7 objetos e 3 fatores MFA criados pela jornada foram apagados da pilha
descartável antes do backup. Consequências para o piloto:

- hoje (0 objetos, 0 MFA observados em 04/10) o drill hospedado pode rodar;
- depois do primeiro upload ou do cadastro de MFA do `finance_ops` (O3), o drill
  passa a bloquear. **Rodar o drill hospedado antes de O3 e antes do primeiro
  documento**, e tratar backup/restore de binários do Storage e de MFA como
  lacuna aberta (`PARTIAL`) antes de dados reais.

O executor agora tem clientes PostgreSQL 15, 16 e 17; o preflight exige o mesmo
major da origem (piloto hospedado = 17).

## Ambientes hospedados — sondas públicas, só leitura (05/10)

| Sonda | arandu-pilot | arandu-demo | arandu-bice (produção) |
| --- | --- | --- | --- |
| `/api/health` | 200 alive | 200 alive | 200 alive |
| `/demo/index.html` | 404 | 200 | 404 |
| `/api/finance/me` | 401 | 404 `legacy_surface_closed` | 401 |
| `/api/finance/products` | 200 | 404 `legacy_surface_closed` | **503** proteção contra abuso indisponível |
| `/api/jobs/renewals` sem segredo | 401 `cron_unauthorized` | 404 | 401 |
| `/api/catalog`, `/api/forms` (legado) | 404 `route_not_found` | 404 | **503 / 405 — API legada ainda roteada** |
| cabeçalhos (CSP, HSTS preload, nosniff, frame, referrer, permissions) | presentes | presentes | presentes |

- Pilot: chunks `app`/`ui` publicados coincidem com o build local do HEAD da
  `pilot` (consistente, não prova de SHA; o SHA de release só aparece no console
  `finance_ops` + MFA).
- Demo: API inteira fechada, sem backend.
- Produção: continua servindo deployment antigo com a API legada; E2b/E3b
  inalterados (`ARANDU_ENV=production` e Supabase próprio ausentes, último build
  de produção ERROR em 04/10). Produção **não** está pronta.
- Schema do piloto, backup, restore, doctor hospedado, canário e jornada
  hospedada: **não observados nesta rodada** (sem credencial). O último marker
  conhecido continua `financial-surface-hardening-1` (04/10), 17 migrations atrás
  de `financial-opportunity-engine-1`; não se assume que mudou.

## P1.4

Definição normativa: guideline §23 (Proposal & Document Intelligence: extração e
organização de fatos com proveniência por campo, confirmação humana, semantic
diff; nunca autoridade decisória) e matriz P1.4. **NOT_STARTED nesta rodada**: a
ordem desta missão exige baseline limpa + CI verde + fechamento hospedado
suficientemente comprovado antes de P1.4, e o fechamento hospedado depende de
ações do owner listadas abaixo. Pré-requisitos já registrados continuam: provedor
de extração com contrato e minimização, e headroom de bundle (demo a 1.162 bytes
do teto).

## Ações exclusivamente externas (ordem recomendada)

1. **Rulesets** — importar `.github/rulesets/pilot.json` e `main.json`
   (`BRANCH_PROTECTION.md`). Verificar `protected=true`. Rollback: desativar.
2. **Recuperabilidade do Pilot** — entregar ao executor, por canal seguro,
   `PILOT_SOURCE_DATABASE_URL` (conexão administrativa, TLS); rodar
   `PATH=/usr/lib/postgresql/17/bin:$PATH npm run pilot:backup:preflight` e
   `npm run pilot:restore:drill` **antes** de O3 e de qualquer upload. Verificar
   `reports/pilot-restore-drill.json` `passed`, SHA do backup e duração.
3. **Schema do Pilot** — com restore PASS: `npm run migrations:bundle --
   --flow=existingDatabase --after-schema=<marker observado>
   --stop-before=docs/supabase-financial-legacy-art-decommission.sql`, aplicar o
   prefixo, `ARANDU_ENV=pilot npm run finance:pilot:doctor`, depois a decisão
   destrutiva de arte e o restante. Rollback: arquivos de `docs/rollback/` por
   capability; decommission só por recuperação.
4. **Doctor, canário e jornada hospedados** no SHA exato; `npm run
   pilot:release:check` GO com comprovantes reais.
5. **Produção** — Supabase próprio, `ARANDU_ENV=production`, migrations
   `cleanInstall`; nunca o banco do piloto nem o legado.
6. Jurídico, contas, operador, e-mail, domínio e comercial — inalterados
   (`FINANCIAL_PILOT_GO_LIVE.md`).
