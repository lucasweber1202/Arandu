# Pilot hosted closure — 04/10/2026

> **Histórico.** Estado vivo em [`FINANCIAL_RELEASE_EVIDENCE_2026-10-05.md`](FINANCIAL_RELEASE_EVIDENCE_2026-10-05.md). As observações hospedadas abaixo continuam sendo as mais recentes disponíveis, mas a baseline de CI descrita aqui foi superada.

**PILOT NO-GO.** Nenhuma migration ou exclusão hospedada foi executada nesta
rodada. Observações por conectores autenticados, apenas leitura. A consulta
final do banco tem timestamp `2026-10-04T19:15:32.569408Z`.

## Baseline e CI

| Item | Evidência observada |
| --- | --- |
| pilot | `7a0a839776bdaf1e95e6a67505f5f49289c51a59`, merge #122 |
| main | `201adb475a62eb05d6da33b9f563b7132cf28a45`, merge #99 |
| PRs abertas antes das alterações | nenhuma |
| #122 HEAD validado | `805494c3fb5c4a73ddfa1a0dda1f270800e2826a` |
| #122 check runs | `database`, `deploy-boundaries`, `validate`, `presentation`: completed/success no HEAD acima |
| Branches relevantes preservadas | savings-value-realization, bank-fee-intelligence, opportunity-engine, value-intelligence-executive; branches antigas de rollout/P0 ainda existem |
| proteção | `pilot` e `main`: `protected=false`; integração sem operações administrativas utilizáveis |

Os quatro verdes da #122 atestam sua baseline. Não atestam as novas PRs desta
rodada. A validação obrigatória antes de merge continua sendo
`npm run merge:gates -- <PR>` no HEAD atual; não se reutiliza sucesso antigo.

## Pilot hospedado

| Item | Observação |
| --- | --- |
| Supabase | `offgpyysgdhfemjlchod`, Arandu Pilot, ACTIVE_HEALTHY, sa-east-1, Postgres 17.6 |
| hostname | `db.offgpyysgdhfemjlchod.supabase.co` |
| Vercel | projeto `arandu-pilot`, ambiente production do projeto dedicado, branch pilot |
| configuração declarada | `ARANDU_ENV=pilot`, `SUPABASE_URL=https://offgpyysgdhfemjlchod.supabase.co`, site `https://arandu-pilot.vercel.app`; valores não secretos observados via API |
| marker antes / depois | `financial-surface-hardening-1` / **inalterado** |
| marker esperado pelo código | `financial-opportunity-engine-1` |
| distância | 17 migrations pendentes em existingDatabase |
| identidade persistida no banco | `deployment_environment` ausente; nome do projeto não substitui guard de identidade |
| bucket | somente `fin-documents`, privado, 10.485.760 bytes, cinco MIME permitidos |
| objetos Storage | 0; total 0 bytes; nenhum bucket de mídia de arte encontrado neste Pilot |
| organizações / MFA | 0 / 0; não há jornada empresarial atual comprovada |
| legado | 36 tabelas inventariadas: cinco linhas brutas (catalog_releases: 1, curated_collections: 4); demais contagens zero. Não se inferiu conteúdo/export aprovado a partir dessas contagens |
| cron observada no banco | renewals: quatro execuções succeeded, de 30/09 09:26:35Z a 03/10 09:26:35Z, cadência diária. Nenhuma evidência de webhooks/governance/opportunities/escalation operacional nesta consulta |

O fonte configura renewals diário 09:15 UTC, webhooks diário 09:45 e governance
diário 04:30. Opportunities e approval deadlines integram o runner de renewals.
Configuração versionada e execução real são evidências diferentes. Não há
claim de near-real-time nem alteração de cadência nesta rodada.

## Backup, restore e rollout

`pilot:backup:preflight` retornou BLOCKED: conexão administrativa de origem
ausente/inválida no executor. Não há `pg_dump`/`pg_restore`/`psql` utilizáveis
nem Docker neste executor. Instalação de pacotes do sistema falhou nas operações
de identidade/permissão do sandbox. **Backup real não executado; restore não
executado; duração não medida; probes pós-restore não executados.**

O doctor local, com `ARANDU_ENV=pilot`, retornou NO-GO por variáveis ausentes
no processo. Isso não prova variáveis ausentes no Vercel: a API do projeto
mostrou configuração e nomes das chaves de servidor. Doctor hospedado completo,
canário e jornada autenticada atual não foram comprovados.

Bundles determinísticos gerados, sem aplicação:

| Bundle | Quantidade / final | SHA-256 |
| --- | --- | --- |
| completo após surface-hardening | 17 / opportunity-engine | `8abfeffa2a3a13bbd6ed77f3bb48f418afbd9364795e1d74aeb327d8b54d203a` |
| prefixo antes do decommission | 12 / data-governance | `ce5797561d35d3e02c1e0c889318cb2d34cd7df2dacb554f4cbe967ff3f7aac0` |

```bash
npm run migrations:bundle -- --flow=existingDatabase --after-schema=financial-surface-hardening-1
npm run migrations:bundle -- --flow=existingDatabase --after-schema=financial-surface-hardening-1 --stop-before=docs/supabase-financial-legacy-art-decommission.sql
```

Ordem do prefixo: approval-handoff → passport → multi-entity → contracts-v2 →
relationships-portfolio → passport-entities → graph → policy-engine → public-api
→ sso → operational-resilience → data-governance.
Etapas adiadas: legacy-art-decommission → p0-closure → value-realization →
fee-intelligence → opportunity-engine. O prefixo não pula uma dependência.
Seu marker final intermediário **não** é suficiente para doctor GO.

Rollback/forward-fix: usar os runbooks e arquivos de rollback específicos das
capabilities; não há rollback universal do bundle. O decommission é destrutivo,
exige recuperabilidade e export/decisão do owner antes da aplicação; sua
reversão exige recuperação, não reintrodução automática do runtime de arte.
Regenerar os bundles se o marker observado ou o código mudar.

## Vercel

| Projeto | Última evidência consultada |
| --- | --- |
| arandu-pilot | READY, production, `dpl_FfPNUGt34Er8f2TyjjpDreXm8SZW`, SHA pilot `7a0a839…` |
| arandu-demo | READY, preview (`target=null`), `dpl_BiQxSNvHiVtRPTdSZsfad4mf5jNX`, SHA `7a0a839…`; não confundir com produção demo canônica |
| arandu | último production ERROR, `dpl_4TJnNc9HksqPUhTQDn6okvgvC5T8`, SHA main `201adb4…`; buildCommand exited 1 |

Produção tem configuração incompleta confirmada: `ARANDU_ENV` ausente e
`SUPABASE_URL` vazia na API de variáveis. O código recusa essa topologia.
O motivo exato da última execução não foi confirmado: leitura de build logs
retornou 403 por escopo. Portanto não se repetiu o claim histórico de
build-rate-limit e não se acionou redeploy às cegas. Não há claim de produção
pronta nem promoção de pilot para main.

## Implementação e validação desta rodada

Gate binário de evidência, redaction/freshness/SHA/identidade/cronologia,
restore do mesmo backup, canário completo, jornada real e decisão de arte:
[`FINANCIAL_PILOT_RELEASE_GATE.md`](FINANCIAL_PILOT_RELEASE_GATE.md).
O gate é um avaliador; não fabrica ou autentica sozinho os comprovantes.

Separação do sandbox do preview financeiro e perfil de chunks:
`FINANCIAL_BUNDLE_HEADROOM.md` na branch/PR separada `perf/bundle-headroom`.
Preview financeiro medido: 426.007 bytes; demo independente: 798.135.
Limites e cobertura preservados. P1.4 permanece **missing**, sem schema, jobs,
provider, review ou mappings implementados nesta entrega; provider real não
configurado e a sequência de PR/gates ainda precisa ser concluída.

Local: npm ci --include=optional concluído; audit:ci zero vulnerabilidades;
SBOM com 21 componentes; check:all aprovado; testes negativos do release gate
e prefixo de migrations aprovados; build/size/dist e fronteiras aprovados.
`test:database` falhou por psql ausente; instalação Playwright recebeu arquivo
vazio/inválido, sem browsers utilizáveis. Não se declara E2E, WebKit p95 ou
clean-room completo verde a partir dos testes Node. Os quatro jobs das novas
PRs ainda precisam fechar no SHA final.

## Blockers e ações exatas

```text
BLOCKER: recuperabilidade e atualização do Supabase Pilot
WHY: schema real está 17 migrations atrás; conexão de dump e destino de restore não disponíveis neste executor
WHO MUST ACT: responsável pelo Supabase Pilot e operador de release
EXACT ACTION: fornecer conexão administrativa por canal seguro ao executor com PG17 e Docker; rodar preflight, backup real, restore descartável e probes; revisar bundle do marker observado; aplicar apenas depois dos gates; interromper antes do decommission sem decisão específica
WHAT IS READY: preflight, drill, probes, bundles determinísticos e prefixo seguro; gate de evidência com testes negativos
HOW TO VERIFY: hash do backup/bundle, restore PASS e duração observada; marker final, doctor GO, canário PASS e jornada real PASS no SHA exato; pilot:release:check GO com comprovantes reais

BLOCKER: decisão destrutiva de legacy art
WHY: inventário não é export/decisão; a sessão não tem ack específico do owner
WHO MUST ACT: owner e responsável pelos dados
EXACT ACTION: revisar as contagens e referências; decidir export e executar/verificar quando necessário; registrar decisão e ack export-verified:<ref>; só então executar a etapa destrutiva após backup/restore
WHAT IS READY: inventário agregado e bundle encerrado antes da etapa
HOW TO VERIFY: referência segura de export e decisão; restore validado; comprovante da aplicação e marker sem segredos

BLOCKER: rulesets e merge gate executável
WHY: protected=false; conector não oferece administração; CLI não recebeu token para repo privado
WHO MUST ACT: owner/admin e operador com GitHub autenticado
EXACT ACTION: ativar rulesets pilot/main com PR, quatro checks strict, sem force push/deleção/bypass; executar npm run merge:gates -- <PR> imediatamente antes do merge
WHAT IS READY: workflow e evaluator de exact HEAD existentes; testes preservados
HOW TO VERIFY: protected=true e quatro success no SHA atual; comando exit 0; nenhum push posterior ao gate

BLOCKER: produção e cadência operacional
WHY: topologia production incompleta; logs sem acesso; jobs hospedados novos não comprovados
WHO MUST ACT: owner Vercel/Supabase
EXACT ACTION: configurar produção com banco próprio e ARANDU_ENV=production; obter escopo de logs e classificar última falha; conferir plano/cadência e validar jobs depois do rollout Pilot
WHAT IS READY: guards de ambiente e runners versionados
HOW TO VERIFY: deploy production READY em SHA autorizado, doctor adequado e histórico de execuções; cadência observada, sem claim near-real-time com agenda diária
```

Próxima capability continua P1.4. Antes de iniciá-la: revisar/validar/mesclar a
PR de headroom com quatro gates exatos. Esta entrega é parcial em relação à
missão completa e não satisfaz o estado B enquanto a foundation P1.4 não existir.
