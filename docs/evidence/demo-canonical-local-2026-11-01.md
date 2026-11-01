# Demo canônica local e jornadas reais de plataforma — 01/11/2026

Base: `main@6a0d66c` (inclui #297–#302). Branch `claude/demo-canonical-consolidation`.
Execução nesta sessão de nuvem, **sem acesso a nenhum Supabase hospedado** (ver "Bloqueios").

## O que foi executado (banco e Auth reais, locais)

| Item | Comando | Resultado | Estado |
|---|---|---|---|
| Stack Supabase local (Postgres 15.14 `supabase/postgres`, GoTrue v2.181, PostgREST, Storage) + app em `ARANDU_ENV=demo` | `npm run demo:setup` | sequência canônica de migrations da main aplicada; seed sintético pela API real concluído (exit 0) | VALIDADO EM BANCO REAL (local) |
| Checagens da Demo canônica | `npm run demo:local:check` | **41/41 OK** — inclui CRM ligado ao contrato, pipeline privado da instituição, "Provedor não vê concorrentes", aplicação e banco marcados `demo` | VALIDADO EM BANCO REAL (local) |
| Jornada de plataforma (nova) | `npm run demo:local:platform-journey` | **8 passos, 10 ataques, 0 falhas** (detalhe abaixo) | VALIDADO EM BANCO REAL (local) |
| Jornada do piloto (`journey.sh`) | `bash scripts/pilot-local/journey.sh` | **não validada nesta sessão**: login recusado por rate limit real (`auth-login` 12/10 min por origem) após as execuções anteriores, e a jornada pressupõe o app em modo `pilot`; 55 falhas em cascata de 401. Não é regressão nem evidência de sucesso | NÃO VALIDADO |

### Jornada de plataforma — passos (API do Arandu, sessão da pessoa, RLS)

1. Três contas sintéticas no GoTrue e login real com cookie HttpOnly.
2. Duas organizações compradoras (A, B); leitor entra em A por convite como `viewer`.
3. Contrato de fiança registrado; condições especializadas (`bank_guarantee`) gravadas como v2 preservando os demais termos.
4. Economics de fiança: cenário dentro da vigência = BRL 20.150 (comissão 20.000 + 100 + 50, `bank-guarantee-explicit-cost-v1`); cenário fora da vigência = incomparável, `total:null`.
5. CRM: contato, reunião (replay com a mesma chave devolve o mesmo registro), processo ligado ao contrato, etapa v1→v2, 409 em edição concorrente, histórico.
6. Copilot: sem credencial de modelo, `copilot/ask` = 503 `copilot_not_configured` e nenhuma resposta; `copilot/confirm` grava a atividade (201), replay idempotente, sem `confirmation:true` = 400.
7. Importação CSV: prévia `[valid, valid, incomplete]`, 2 linhas confirmadas, replay com a mesma chave, reimportação reconhecida como 2 duplicadas, 1 recibo no histórico, 2 observações no banco.
8. ERP Hub: configuração v1 `not_tested` → prévia 503 `erp_not_configured` (nenhuma chamada externa) → v2 suspensa (prévia 409) → v3 revogada.

### Ataques (todos PASS)

Versão de termos sem `product_terms` → 409 `specialized_contract_terms_required`; termos de fiança com vigência invertida → 400, versão inalterada; B usa contrato de A em Economics → 404; viewer cria contato → 403; B lê processos de A → 403; B altera processo de A → 404 e etapa preservada; viewer confirma importação → recusado (400 `invalid_fee_import`) e nada gravado; B pré-visualiza importação no contrato de A → 404; viewer configura ERP → 403; B lê contrato de A → 404.

Observação: a recusa ao viewer na confirmação de importação vem como 400, não 403 como o contrato descreve para papel. O efeito (nada gravado) está correto; a mensagem pode ser refinada no backend.

## Bloqueios (externos à sessão)

| Ação bloqueada | Por quê é necessária | Recursos | Custo | Verificação | Retorno |
|---|---|---|---|---|---|
| Auditar/reativar o Supabase `offgpyysgdhfemjlchod` (INACTIVE) | inventário, export e conversão em Demo | projeto Pilot | depende do plano da organização Supabase: no gratuito, retomar não cobra mas ocupa uma das vagas de projeto ativo; em plano pago, há custo de computação. Não verificado daqui — confirmar no painel antes de retomar | `npm run recovery:doctor`, inventário por `scripts/recovery.mjs` | pausar novamente pelo painel |
| Acesso de rede e credencial | esta sessão não alcança `*.supabase.co` (proxy recusa) e não tem `SUPABASE_ACCESS_TOKEN`/connection string | ambiente da sessão | nenhum | `curl` ao projeto e `recovery:doctor` | remover o domínio/segredo do ambiente |
| Export criptografado + restore isolado do Pilot e do legado | sem restore comprovado não há conversão | Environment `database-recovery` (secrets vazios desde a run 38179837512) | nenhum (store privado, sem AWS) | `recovery:export:private` → `recovery:restore:verify` | descartar o restore isolado |
| Vercel `arandu-demo`: variáveis `ARANDU_ENV=demo`, `SUPABASE_*`, `CRON_SECRET`, `ARANDU_SITE_URL`, `ARANDU_DEMO_PASSWORD` | ligar a Demo pública ao banco canônico | projeto Vercel | nenhum | `demo:check` e jornadas contra a URL pública no SHA exato | reverter variáveis e redeploy do deployment anterior (Instant Rollback) |
| Promover `offgpyysgdhfemjlchod` em `ACTIVE_SUPABASE_ASSIGNMENTS.demo` | o gate de topologia exige atribuição aprovada | `lib/deployment-topology.mjs` (PR) | nenhum | `finance:env:check` e `release:candidate:doctor` com `ARANDU_ENV=demo` | reverter a PR |

Nada hospedado foi lido, alterado, exportado ou apagado nesta sessão. Nenhum dado pessoal foi copiado.
