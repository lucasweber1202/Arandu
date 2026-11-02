# Plano de conversão de Production (`igacnfjeuqhxcmfyepgj` → Arandu financeiro)

Estado: **PLANO, nada executado.** Decisão de arquitetura do proprietário: dois Supabase; o legado
vira Production depois da Demo. Este plano só usa ferramentas já existentes no repositório
(`SUPABASE_ENCRYPTED_PRESERVATION.md`, `TWO_ENVIRONMENT_CONSOLIDATION.md`,
`HOSTED_INFRASTRUCTURE_DOCTOR.md`). Nenhuma etapa destrutiva roda sem a autorização indicada.

## Ponto de partida comprovado
- Inventário anterior (19/10, `evidence/codex-hosted-blockers-2026-10-19.md`): 42 registros do produto de arte
  (artistas, obras, certificados, leads, reservas), **8 potencialmente pessoais**; zero tabelas `fin_*`, zero
  buckets e zero usuários/MFA; PostgreSQL 17.6.
- `lib/deployment-topology.mjs`: ref em `legacy`, alvo `production` com `PENDING_DATA_REVIEW`; `production: []`.
- Vercel `arandu`: falha por desenho (sem atribuição aprovada). `ARANDU_SITE_URL=https://arandu-bice.vercel.app`
  foi ajustado externamente e **não deve ser desfeito**.

## Etapas
| # | Etapa | Ferramenta | Destrutiva? | Autorização |
|---|---|---|---|---|
| 1 | Reinventariar (contagens por tabela, colunas com PII, buckets, Auth) somente leitura | `npm run recovery:doctor`; consultas de catálogo do doctor | não | acesso de leitura |
| 2 | Classificar os 42 registros: manter arquivado, exportar ao proprietário, ou descartar | decisão do proprietário registrada em `evidence/` | não | **proprietário decide o destino** |
| 3 | Export criptografado (age) de banco + Auth + Storage, com fingerprints | `recovery:export:private`, `recovery:storage:export` | não | secrets do Environment `database-recovery` |
| 4 | Restore isolado do mesmo export (PostgreSQL 17 descartável), hashes, schema e contagens; se houver objetos, restore/verify dos binários | `recovery:restore:verify`, `recovery:storage:restore`, `recovery:storage:verify`, `recovery:verify` | não (alvo isolado) | — |
| 5 | Limpeza do schema de arte **somente** após 3–4 comprovados | migration de decommission existente + rollback | **sim** | autorização específica da conversão |
| 6 | Instalar a sequência canônica (`docs/supabase-migrations.json`, `cleanInstall`/`existingDatabase`) | `scripts/check-migrations.mjs`, runner de `test:database` | sim (schema) | idem 5 |
| 7 | Auth (URLs de redirect para o domínio de Production, MFA de operador), Storage privado | painel Supabase + `finance:env:check` | não | proprietário |
| 8 | PR promovendo o ref para `ACTIVE_SUPABASE_ASSIGNMENTS.production` | `lib/deployment-topology.mjs` | não (código) | review + quatro gates |
| 9 | Variáveis Vercel `arandu` (`ARANDU_ENV=production`, `SUPABASE_*`, `CRON_SECRET`) e deploy no SHA exato | `release:candidate:doctor`, `/api/health` | não | proprietário |
| 10 | Cutover e verificação: health/readiness, canário, jornadas sem dados sintéticos | `release:check` | — | proprietário |

Rollback por etapa: 1–4 não alteram nada; 5–6 voltam pelo restore comprovado na etapa 4 (por isso 5 não começa
sem 4); 8 reverte por PR; 9 volta pelo Instant Rollback da Vercel e pela remoção das variáveis.

## Regras
Sem PII do legado na Demo nem em GitHub; sem novo projeto Supabase; sem reset sem backup restaurado; sem afrouxar
o gate de topologia para o build passar. Production fica bloqueada até as etapas 2–4 terem evidência.
