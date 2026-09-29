# Auditoria de endurecimento para produção

> **Legado — vertical de arte (aposentada).** Documento histórico: não descreve o produto atual (Arandu Financial Procurement). Ver [`LEGACY_ART_RETIREMENT.md`](LEGACY_ART_RETIREMENT.md) e [`OPERATIONS_INDEX.md`](OPERATIONS_INDEX.md).

Data da revisão: 2026-07-30  
Base revisada: PR #23, commit `352f07b`  
Branch complementar: `agent/arandu-production-gates-ops`

## Estado inicial

A PR #23 estava aberta, em draft e mergeável, com reservas, propostas e
operações comerciais transacionais. A suíte local de base passou após
`npm ci --include=optional`. O ambiente local não possui PostgreSQL nem Docker;
por isso, o job PostgreSQL 16 continua sendo a evidência exigida para a
migration real, RLS, concorrência, rollback e idempotência.

Não foram tratados como evidência de staging ou produção: testes locais,
preview da Vercel, arquivos preenchidos sem referência externa ou a mera
existência de backup.

## Correções e controles implementados

| Área | Resultado |
| --- | --- |
| Migration | dry-run, ordem canônica, SHA-256, preflight de reservas duplicadas sem PII, backup/evidência obrigatória, probes e canário |
| Evidências | estados progressivos, responsável, data, referência verificável e relatório Markdown |
| Catálogo | validação CSV por linha, duplicidades, campos legais/editoriais e bloqueio abaixo de 5 artistas/20 obras verificadas |
| Comercial | configuração completa fail-closed e snapshot imutável persistido nas RPCs |
| Segurança | sem segredo admin compartilhado, sem fallback service-role/anon, cookie HttpOnly, RBAC e MFA preservados |
| Observabilidade | request ID, logs estruturados minimizados e transporte opcional somente HTTPS |
| Piloto | coorte mínima de 10, tarefas, feedback por severidade, bloqueadores e relatório |
| Operação | runbooks de migration, rollback, backup, restauração, observabilidade e incidente |

## Validação executada

| Comando | Resultado local |
| --- | --- |
| `npm ci --include=optional` | aprovado |
| `npm run check:all` | aprovado; gates externos permaneceram pendentes |
| `npm run check:migrations` | aprovado por análise estática |
| `npm run check:platform` | aprovado, 6 cenários de API e 12 transacionais |
| `npm run check:security` | aprovado |
| `npm run migrations:release -- --dry-run --flow=existingDatabase --environment=staging` | aprovado, sem conexão externa |
| `ARANDU_SITE_URL=https://arandu.example.com npm run build` | aprovado; domínio usado apenas para validar a geração |
| `ARANDU_SITE_URL=https://arandu.example.com npm run check:seo:dist` | aprovado, 108 páginas |
| `npm run test:e2e:list` | aprovado, 6 testes encontrados |
| `npm run test:e2e` | não executado: Chromium ausente na imagem local; obrigatório na CI |
| `npm audit --audit-level=high` | aprovado, zero vulnerabilidades |
| `git diff --check` | aprovado |

`npm run test:database` precisa rodar no PostgreSQL 16 descartável da CI. Build,
SEO de `dist` e auditoria de dependências passaram localmente. Playwright e o
teste de banco fazem parte da validação final da árvore na CI antes de promover
esta branch.

## Organização e achados

- Os checks de inventário não encontraram assets órfãos novos.
- O build mantém páginas internas fora de `dist`; o gate deve continuar ativo.
- Fixtures continuam explicitamente separadas do gate de catálogo real.
- Documentação histórica permanece no repositório; não foi apagada porque a
  remoção não é necessária nem claramente segura nesta rodada.
- O repositório possui 26 branches remotas e somente a PR #23 aberta. As 25
  branches fora de `main` são candidatas a uma revisão humana de retenção; não
  foram excluídas porque o vínculo com trabalho ainda necessário não foi
  comprovado.
- A PR #23 deve permanecer em draft até o job PostgreSQL validar a assinatura
  das RPCs com snapshot e todos os checks do PR complementar ficarem verdes.

## Bloqueios externos e humanos

1. executar migration, probes e canário em Supabase staging;
2. provar restauração de backup em ambiente descartável;
3. aprovar política comercial e jurídica completa;
4. importar e aprovar catálogo real de 5 artistas e 20 obras;
5. configurar monitoramento e comprovar um erro canário;
6. configurar contato LGPD e domínio HTTPS final;
7. executar piloto fechado com pelo menos 10 participantes e zero bloqueadores
   críticos abertos;
8. repetir o fluxo em produção com confirmação explícita e registrar somente
   referências no arquivo de evidências.

## Sequência de promoção

1. aprovar CI do PR complementar, incluindo PostgreSQL 16;
2. revisar e integrar o PR complementar na branch da PR #23;
3. executar staging conforme `MIGRATION_RELEASE_RUNBOOK.md`;
4. preencher evidências reais sem dados pessoais ou segredos;
5. obter aprovações comercial, jurídica, catálogo e piloto;
6. executar `npm run release:check`;
7. marcar a PR #23 como pronta somente sem bloqueadores;
8. fazer squash merge;
9. validar a árvore exata da `main`;
10. promover produção com backup, canário, smoke tests e plano de rollback.
