# Arandu Platform Transformation — registro de execução

Base auditada: `main@d90fb45` (01/11/2026), zero PRs abertas, #297–#300 integradas. Estados: NÃO INICIADO · EM IMPLEMENTAÇÃO · IMPLEMENTADO · TESTADO LOCALMENTE · VALIDADO EM CI · INTEGRADO À MAIN · VALIDADO EM AMBIENTE HOSPEDADO · OPERACIONAL COM PROVEDOR EXTERNO · BLOQUEADO POR DEPENDÊNCIA IDENTIFICADA.

Testes E2E desta missão usam **APIs simuladas** declaradas no topo de cada spec; não substituem validação com banco/provedor reais.

| Onda | Frente | Capacidade | Estado | Evidência / PR | Dependência externa | Próxima ação |
|---|---|---|---|---|---|---|
| 1 | Operação | Diagnóstico do build `arandu` (Vercel) | BLOQUEADO POR DEPENDÊNCIA IDENTIFICADA | ver §Gate A | logs Vercel (403), cutover/segredos de Production | autorização do proprietário |
| 1 | Copilot | Painel global + contexto de instituição e contrato, fontes navegáveis, ação preparada → revisão → `copilot/confirm`, estados sem modelo/erro/limite/cancelamento | TESTADO LOCALMENTE | `tests/e2e/finance-copilot.spec.js` (14 PASS desktop+mobile Chromium) | modelo real via Gateway (`ARANDU_COPILOT_*`, `AI_GATEWAY_API_KEY`) NÃO VERIFICADO | CI + merge |
| 2 | CRM | Workspace por instituição, agenda, pipeline, histórico | INTEGRADO À MAIN | #298 (`d90fb45`) | canônico hospedado | trocar fan-out por `crm-institution-records` |
| 2 | CRM | Portal institucional | NÃO INICIADO | — | — | onda 2 |
| 3 | Product Intelligence | Seção "Condições especializadas" no contrato: formulário por modalidade (fiança, spot, forward, NDF, swap) da fonte única `product-terms.mjs`, gravação como nova versão via `contract-terms` preservando demais termos; editor antigo e aditivo agora preservam `product_terms` | TESTADO LOCALMENTE | `tests/e2e/finance-product-terms.spec.js` (API simulada) | — | CI + merge |
| 3 | Economics | Simulador de fiança: contratos da mesma entidade × até 10 cenários, total e componentes do servidor, incomparabilidade explicada, metodologia, links de volta | TESTADO LOCALMENTE | `tests/e2e/finance-product-terms.spec.js` | — | adquirência v2 segue no Negotiation Studio existente |
| 4 | Ingestão | Assistente CSV/XLSX de tarifas: arquivo → colunas → mapeamento → prévia por linha → seleção → confirmação idempotente → recibo → histórico; entradas em Tarifas e no contrato | TESTADO LOCALMENTE | `tests/e2e/finance-ingestion.spec.js` (API simulada) | XLSX: cabeçalho digitado (servidor não expõe colunas antes do mapeamento) | handoff: endpoint de colunas |
| 4 | ERP Hub | Catálogo verdadeiro (BC implementado, 6 planejados), configuração sem segredo, suspensão/revogação, prévia do ERP com revisão e confirmação | TESTADO LOCALMENTE | `tests/e2e/finance-ingestion.spec.js` (API simulada) | credencial BC aprovada no servidor — NÃO VERIFICADO | CI + merge |
| 5 | Jornadas | Cinco jornadas transversais | NÃO INICIADO | — | — | onda 5 |

## Gate A — build do projeto Vercel `arandu`

- Fato: o status `Vercel – arandu` falhou em todos os 40 merges de `main` verificados (de #259, 22/10, a #298), inclusive PRs só de documentação; `arandu-demo` e `arandu-pilot` passam nos mesmos SHAs. Logo, não é regressão de código.
- `scripts/vercel-build.mjs` recusa por desenho um deploy de produção (a) sem `ARANDU_ENV`/`ARANDU_DEPLOYMENT_KIND` e (b) com `ARANDU_ENV=production` sem topologia aprovada (`check-finance-env`: Supabase/CRON/site ausentes, identidade não verificável com `ACTIVE_SUPABASE_ASSIGNMENTS` vazio). Ambos reproduzidos localmente.
- A matriz já registrava "build de Production falha por desenho com allowlist vazia". Fazer passar exigiria afrouxar o gate ou configurar segredos — proibido sem autorização e contrário ao bloqueio de cutover (CLAUDE.md).
- Ação do proprietário: `npx vercel inspect dpl_3voMpZJqNDEavKz6kx4QsmUU1DZo --logs` (equipe Vercel; a integração desta sessão recebe 403) para confirmar qual dos dois gates recusa, e decidir recovery/cutover de Production. Demo e Pilot não foram alterados.
