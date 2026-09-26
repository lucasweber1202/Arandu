# GO / NO-GO do primeiro piloto

> Estado item a item (DONE / BLOCKED / OWNER_ACTION_REQUIRED) em
> [`FINANCIAL_PILOT_GO_LIVE.md`](FINANCIAL_PILOT_GO_LIVE.md). Rodada de 26/09/2026:
> CI do GitHub sem minutos até 01/10 — evidência local em
> [`FINANCIAL_RELEASE_EVIDENCE_2026-09-26.md`](FINANCIAL_RELEASE_EVIDENCE_2026-09-26.md).

Critérios objetivos. Cada linha é verificável por comando ou por evidência — e
nenhuma delas é marcada pelo software sozinho.

## Verificável por comando

| Critério | Comando | Estado nesta rodada |
| --- | --- | --- |
| CI verde na `main` | GitHub Actions | ✅ `434664f`: `validate`, `database`, `deploy-boundaries` |
| Migrations aplicam, reaplicam e revertem | `npm run test:database` | ✅ |
| Jornada ponta a ponta íntegra | `npm run test:pilot` | ✅ 18 passos |
| Domínio e fronteira de API | `npm run check:finance` | ✅ |
| Gates gerais | `npm run check:all` | ✅ |
| Navegadores | `npm run test:e2e` | ✅ no CI, nos cinco motores |
| Ambiente do piloto válido | `ARANDU_ENV=pilot npm run finance:env:check` | ⏳ depende do ambiente existir |
| Preview publicado | Vercel | ✅ |

## Verificável por evidência humana

| Critério | Quem confirma | Estado |
| --- | --- | --- |
| Revisão jurídica concluída | advogado | ❌ **pendente** — 14 itens em `FINANCIAL_LEGAL_REVIEW_REQUIRED.md` |
| Supabase dedicado ao piloto criado | proprietário | ❌ pendente |
| Domínio/subdomínio do piloto apontado | proprietário | ❌ pendente |
| Backup conferido e restore testado | proprietário | ❌ pendente — há procedimento, não há teste executado |
| Empresa piloto escolhida e de acordo | proprietário | ❌ pendente |
| Provedores escolhidos e de acordo | proprietário | ❌ pendente |
| Allowlist preenchida | operador | ❌ pendente |
| Termos com versão definida | proprietário + advogado | ❌ pendente |

## NO-GO imediato

Qualquer um destes impede o piloto, independentemente do resto:

* RLS falhando em qualquer teste de isolamento;
* token de convite alcançável por log, analytics, referrer ou histórico;
* CI vermelho;
* migration inconsistente entre instalação limpa e upgrade;
* revisão jurídica não concluída;
* ambiente do piloto compartilhando banco com produção;
* modo de demonstração ligado no ambiente do piloto;
* qualquer P0 ou P1 conhecido em aberto.

## Estado agregado

**Software: GO.** Não há P0 nem P1 conhecido em aberto; a jornada das duas
pontas funciona; CI, banco e navegadores estão verdes; existe smoke test,
checker de ambiente, seed removível, suporte documentado e rollback.

**Piloto: NO-GO até a revisão jurídica e o ambiente.** Nenhum desses dois itens
é implementável por código, e o software **não** os marca como atendidos.

O gargalo deixou de ser funcionalidade faltando.
