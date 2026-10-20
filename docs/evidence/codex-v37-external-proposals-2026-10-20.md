# Evidência v3.7 — propostas externas buyer-owned

20/10/2026. Branch `codex/v37-external-proposal-integrity`. Iniciativa
H37-EXTERNAL: permitir preparar, versionar, revisar e analisar ofertas sem conta
bancária no portal. Hipótese comercial não validada; núcleo comum aos três
segmentos. Implementação e testes locais, sem promoção de M3/M4/M5/M6.

A #248 estava aberta na abertura; suas normas foram lidas diretamente da branch
`docs/v37-three-segments-bank-adoption-quality-20261020`. Após seu merge, a branch
foi reconciliada com main275c57d. Após a integração da UX #249, novo rebase sobre
`2bfa89878586d157d72b6723ad4beeb9cbb7a52c`, sem conflitos ou edição dos arquivos
reservados. Componente técnico medido: `a68e907cec32091fe83720434a6a1fc335a36ef1`.
O commit posterior deste relatório apenas registra evidências; gates da PR devem
ser conferidos no HEAD exato publicado, sem usar aprovação da #248/#249.

## Resultado e fronteiras

Banco/API reais implementados, não endpoints de sucesso fictício: três tabelas,
view invoker, duas RPCs materiais e rotas de criação, histórico paginado,
correção, confirmação e retirada. Alternativa B e seus trade-offs, schema,
autorização, contrato de frontend, exemplos, erros e regras de exibição em
[EXTERNAL_FINANCIAL_PROPOSALS_V37.md](../EXTERNAL_FINANCIAL_PROPOSALS_V37.md).

Comparison/weights reutilizados; sem instituição, convite ou submissão falsa.
A fonte é sempre `buyer_recorded_external`. Revisão é correspondência da
transcrição, não validação econômica, assinatura ou aceite do banco. Documento
sem hash continua sem hash; hash documental pré-existente é metadado não
verificado contra os bytes. Arquivo ausente diz not_presented, nunca available.

**Bloqueio deliberado de P4:** escolha de proposta externa e contrato derivado
retornam indisponibilidade explícita. FKs/approval engine canônicos continuam
exigindo proposta autenticada. O snapshot de uma decisão canônica incorpora
alternativas externas revisadas com origem e limitações, sem alterá-las após
novas versões. Não alegar ciclo de contratação externa completo.

Nenhuma UI/CSS/HTML, navigation, package.json, Vercel, workflow, guideline,
matriz, seed ou estação foi editada. Scripts/guardas de schema/recovery/probes
foram atualizados somente para reconhecer e exigir o novo marker, manter os
checks anteriores e executar testes novos no pipeline existente. Não há job,
retry, skip ou threshold novo. Catálogo financeiro de products.mjs continua
sendo a fonte; o espelho SQL é verificado por teste de paridade.

## Comandos executados

| Comando / escopo | Resultado observado |
| --- | --- |
| `npm run check:all` (umask022) na composição com #249 | PASS: domínio, API, Passport, autorização, documentos, segurança, governança, migrations, recovery estático e supply chain |
| `npm run build` | PASS, build financeiro |
| `npm run check:build-size` | PASS; rota RFQ244222/250000 bytes; aviso de envelope saudável mantido, sem elevar limite |
| `node scripts/test-finance-api.mjs` | PASS; fluxo tradicional e novo script de contrato importado no ponto de CI existente |
| `node scripts/test-finance-external-proposals.mjs` | PASS: schemas/normalização, desconhecidos, zero explícito vs ausência, comparação mista, JWT, limites/erros e operações |
| `node scripts/test-finance-data-governance.mjs` | PASS; classificação/export SQL e registro coincidem |
| `npm run check:migrations` | PASS, nova migration em ambos os fluxos, SQL com search_path seguro |
| `bash scripts/test-database.sh` em cluster descartável | PASS; clean install, upgrade, reaplicação, rollback, RLS, documentos, sessões, decisões/versões e governança existentes; testes externos e corridas nos dois caminhos |
| `CI=true npx playwright test tests/e2e/finance-procurement.spec.js --project=chromium-desktop --project=mobile-chrome --workers=2` após #249 | 117 PASS, 3 skips preexistentes de layout desktop/mobile, sem falha/flaky; nenhum teste UI foi editado |
| `npm run benchmark:domain` | PASS; script existente, 200 amostras CPU; não é latência de API |
| `git diff --check` | PASS |

O E2E valida a regressão da UI existente com seus transportes/fixtures. A UI da
nova ingestão ainda depende do handoff de Claude. Os contratos novos exercitam
o handler de API com transporte simulado, verificando encaminhamento do JWT e
recusa de falhas; persistência/autorização/transações são testadas separadamente
em PostgreSQL real. Não alegar prova HTTP hospedada, Auth broker ou Storage real.

## Cobertura positiva/negativa reproduzível

Fonte principal: `tests/database/financial-external-proposals.sql`,
`tests/database/external-proposal-concurrency.mjs` e
`scripts/test-finance-external-proposals.mjs`.

| Caso | Evidência observada |
| --- | --- |
| Compradora registra sem banco autenticado | ID persistido, sem criar convite/organização provedora, autoria auth.uid |
| RFQ/provedor/produto corretos | FKs compostas + revalidação; provider alheio/inexistente e termos do produto errado recusados |
| Viewer/outro buyer/instituição | Escritas recusadas; tabelas, versões, reviews e view não vazam para outro buyer/provedor |
| Entidade | Membro restrito só lê/grava sua entidade; grupo/irmã recusados; reescopo silencioso de RFQ com registro recusado |
| Origem/autoria forjadas | Não encaminhadas pela API; campos materiais derivam do servidor; SQL recusa chaves de input desconhecidas |
| Repetição após timeout | Seis sessões criam um único registro/versão; cinco recebem o resultado já persistido |
| Confirmação concorrente | Seis sessões recebem um único recibo; uma confirmação material |
| Correção obsoleta | Duas sessões na mesma versão: um commit, um conflito classificado, nenhum erro inesperado ignorado |
| Revisão | Analista não confirma; gestor confirma correspondência; nova versão exige nova revisão e guarda a anterior |
| Revogação durante espera | Barreira de lock observada em pg_stat_activity; papel revogado antes de liberar RFQ; material write recusado, sem recibo parcial |
| Falha parcial | Fault injection na atualização do cabeçalho reverte recibo de revisão; API indisponível não responde sucesso |
| Documentação | Documento alheio/removido recusado, versão fixada, ausência não inventa hash; removido passa a document_available=false e sai da comparação |
| Não compartilhar concorrentes | Documento referenciado não pode virar shared; aceitar convite não concede acesso aos registros externos |
| Histórico/decisão | Correção e retirada preservam snapshot byte-a-byte; fonte externa aparece como alternativa, não envio do banco; escolha externa canônica recusada |
| Dados parciais/neutralidade | Ausência não vira zero; tipos/limites espelhados do catálogo; termos iguais recebem tratamento financeiro igual em ambos os canais |
| Leitura concorrente | Histórico limitado à versão do cabeçalho: correção nova não herda o estado reviewed anterior |
| Governança | Três datasets no export real, atores também classificados no snapshot de decisão, histórico na prévia de exclusão, hold ativo reconhecido, offboarding bloqueia novas mutações; retenção financeira não automatizada |
| Rollback e reaplicação | Pré-dados reverte/reaplica nos dois caminhos; com dados recusa antes de remover objetos; reaplicar preserva versões/recibos |

PostgreSQL16 em container exclusivo sem rede, 768MiB/2CPUs, imagem
`postgres@sha256:0ea6700a3b4f0ae6ce746519073558aed4d88a79d8d07622a9a644946c7319c4`.
Repo montado read-only; fixtures inteiramente sintéticas. Comando no container:
`ARANDU_DATABASE_TEST_URL=postgresql://postgres:synthetic-local-test@127.0.0.1:5432/postgres bash scripts/test-database.sh`.
Senha acima é exclusivamente da fixture descartável, não credencial operacional.

Upgrade sintético de marker histórico validado com39 migrations, interrupção
revertida e histórico preservado; [schema-upgrade.json](codex-v37-external-proposals-2026-10-20/schema-upgrade.json).
Canário final no upgrade:12373 verificações/zero vazamentos; fresh:11482/zero.
Esses números pertencem às fixtures desta execução e não provam capacidade ou
segurança certificada. Sem testes pesados em hospedagem.

## Performance e limites

Reutilizado o benchmark #245 sem duplicar scripts:
[domain-cpu.json](codex-v37-external-proposals-2026-10-20/domain-cpu.json).
Dez propostas sintéticas de crédito, 25 warmups/200 medições, CPU local:
p50≈0,179ms, p95≈0,359ms, p99≈0,470ms. O dataset é o benchmark de domínio
existente, não mede ingestão/RPC/DB/Storage ou ganho de latência da feature.
Perfis30/100 usuários e10mil contratos/100mil observações seguem NOT_RUN.

EXPLAIN ANALYZE com RLS e papel authenticated/viewer em uma fixture com um
registro, duas versões e um review: planejamento3,721ms, execução4,641ms,
uma linha, página de até26 incluindo sentinela.
[sql-observation.json](codex-v37-external-proposals-2026-10-20/sql-observation.json).
Observação única pequena, não p95 de API, benchmark de escala ou produção.
Reprodução após a suíte: EXPLAIN da view filtrada pelo org/RFQ e370…010/020
criados pelo teste de concorrência, sob o ator e370…001. O plano completo local
fica em `/tmp/arandu-v37-query-plan.txt`; não inclui bytes de documentos.

Consultas por RFQ/tenant e versões/reviews indexadas, limite/paginação explícitos;
uma consulta adicional na comparação, sem N+1 de rede. Mais de500 propostas
combinadas ou2000 versões do loader tradicional fecha com422, sem resultado
parcial. Não foram elevados budgets para absorver a feature. API p95 e
capacidade operacional permanecem NOT_MEASURED/NOT_PROVEN.

## Compatibilidade e próximos gates

A aplicação agora exige `financial-external-proposals-1` e as RPCs/tabelas novas;
publicar código contra banco antigo não torna a capacidade operacional. Não
há fallback que oculte dados externos ou relaxe readiness. Coordenar schema e
versão da aplicação pelo workflow existente; rollback de schema isolado não
substitui rollback/forward-fix da aplicação.

P1/P2/P3/P5 implementados no escopo descrito; P4 deliberadamente bloqueado para
seleção/contrato externo e limitado à captura honesta das alternativas. Handoff
P6 documentado, sem UI nova, seed hospedado, billing, conectores ou SDKs.
Contadores/rotas legados de propostas continuam do portal; UI deve consultar a
fila externa e usar comparison/provenance para a análise, sem fingir integração.

Intervenções humanas necessárias: revisão/integração da PR após quatro gates
exatos; Claude implementar a UI pelo contrato; autorização específica de
recovery/restore/migration/cutover antes de usar ambiente hospedado; decisão
posterior sobre evolução formal de decisão externa. Pesquisa e revisão jurídica
continuam necessárias antes de claims comerciais/dados reais. Nenhuma
permissão, segredo, custo contratado ou ambiente remoto foi alterado nesta missão.
