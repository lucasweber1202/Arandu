# Índice operacional canônico — Arandu

Este arquivo é o ponto de entrada para operação, staging e lançamento. Quando documentos antigos divergirem, siga os arquivos listados aqui e o estado registrado em `ops/release-evidence.json`.

## Estado e decisão de release

- `ops/release-evidence.json` — fonte oficial dos 13 gates externos.
- `ops/pilot-evidence.json` — evidências do piloto fechado.
- `npm run release:status` — relatório legível do estado atual.
- `npm run release:check` — falha enquanto os requisitos mínimos não forem atingidos.
- `npm run predeploy` — gate final de build, código e release.

## Preparação de staging

- `docs/STAGING_REHEARSAL.md` — ensaio manual e não destrutivo antes do staging real.
- `.github/workflows/staging-rehearsal.yml` — workflow `workflow_dispatch` sem segredos.
- `npm run check:staging` — impede que o rehearsal aplique migrations ou altere gates.
- `npm run staging:evidence` — gera relatório local classificado como simulação.

Um rehearsal verde comprova somente preparação técnica em CI. Ele não equivale a `staging_validated` e não altera `ops/release-evidence.json`.

## Banco e migrations

1. `docs/supabase-migrations.json` — ordem canônica.
2. `docs/TRANSACTIONS_RLS_RBAC.md` — modelo transacional, RLS, RBAC e auditoria.
3. `docs/MIGRATION_RELEASE_RUNBOOK.md` — preflight, dry-run, aplicação, probes e canário.
4. `docs/rollback/supabase-transactions-rbac-audit.rollback.sql` — rollback da camada transacional.
5. `docs/INCIDENT_BACKUP_OBSERVABILITY_RUNBOOK.md` — backup, restore, incidente e observabilidade.

Nunca aplique migration real sem backup referenciado e ambiente explicitamente identificado.

## Administração e segurança

- `docs/ADMIN_AUTH_MFA.md` — provisionamento, papéis, MFA e revogação.
- `docs/ADMIN_OPERACAO_ARANDU.md` — operação diária dos painéis.
- `docs/OPERATIONAL_STATUS_FLOW.md` — máquina de estados operacional, permissões por transição e trilha de histórico.
- `docs/ARTWORK_STATUS.md` — matriz operacional das obras.
- `SECURITY.md` — reporte privado de vulnerabilidades.
- `.github/CODEOWNERS` — responsáveis pelas superfícies críticas.

## Catálogo

- `docs/GUIA_CADASTRO_OBRAS_REAIS.md` — campos e preparação do acervo.
- `docs/CHECKLIST_PARCEIRA_ARTISTA.md` — autorizações e parceria.
- `data/catalog-intake-template.csv` — modelo de intake.
- `npm run catalog:intake:validate` — validação do CSV.
- `npm run check:catalog:release` — gate do catálogo real.

Fixtures e demonstrações não contam como catálogo publicado.

## Política comercial

- `docs/OPERACAO_COMERCIAL_INDEX.md` — índice comercial.
- `docs/FLUXO_COMPRA_RESERVA.md` — jornada de seleção e reserva.
- `data/commercial-policy.json` — configuração pública não sensível e estado da política.
- `npm run check:commercial:release` — validação de completude e aprovação.

Decisões de comissão, pagamento, frete, seguro, devolução e modelo fiscal exigem aprovação humana.

## Piloto, domínio e go-live

- `docs/GO_LIVE_ARANDU.md` — sequência de promoção.
- `docs/DEPLOY_DOMINIO_VERCEL.md` — domínio e hospedagem.
- `docs/SEO_DOMINIO_CHECKLIST.md` — indexação e SEO final.
- `docs/PRIMEIROS_30_DIAS.md` — operação inicial.
- `npm run check:pilot:release` — gate do piloto.
- `npm run check:domain:release` — gate do domínio.

## Governança do repositório

- `CONTRIBUTING.md` — branches, checks e PRs.
- `docs/BRANCH_PROTECTION.md` — regras recomendadas da `main`.
- `docs/REPOSITORY_HYGIENE.md` — limpeza de branches e documentos históricos.
- `docs/VERSIONING.md` — estratégia de versões.

## Documentos históricos

Documentos com datas antigas ou termos como “pronto para uso”, “implementação” e “auditoria” podem registrar o estado de uma rodada anterior. Eles servem como histórico, não como autorização de lançamento.

Antes de seguir qualquer instrução histórica, confirme:

1. se ela aparece neste índice;
2. se o comando ainda existe em `package.json`;
3. se o gate correspondente possui evidência atual;
4. se a migration citada ainda está na ordem canônica.
