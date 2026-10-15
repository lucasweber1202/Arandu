# Plataforma, segurança e recuperação — 15/10/2026

## Base, isolamento e governança

Base remota revalidada: `f66136edcb01b8065661baebd3309fd722ceb113`.
PRs #196 e #197 integradas e seus HEADs ancestrais dessa main.
CI da main [38757947129](https://github.com/lucasweber1202/Arandu/actions/runs/38757947129):
`database`, `deploy-boundaries`, `validate`, `presentation` SUCCESS.
Merge audit [38757947078](https://github.com/lucasweber1202/Arandu/actions/runs/38757947078): SUCCESS.

Checkout independente `/workspace/arandu-platform`, branch
`work/platform-m3-20261015`; o checkout original não recebeu alterações.
W1, W2 e W3 trabalharam em worktrees próprias; commits revisados e integrados
seletivamente. Nenhum arquivo reservado ao Claude, arquivo global congelado,
dependência, migration ou dado hospedado foi alterado.
Documentação normativa obrigatória lida; guideline v3.4 preservada.

## Falhas reproduzidas e mudanças

### API-1 — `days_to_end` perdia um dia durante a tarde

Baseline: em `2026-10-15T18:00:00Z`, contrato com `ends_on=2027-01-08`
retornava 84 em vez de 85. O arredondamento da diferença de instantes variava
às 12h UTC, apesar de `ends_on` ser uma data de calendário.

`withRenewalWindow` agora subtrai a data UTC corrente da data final, mantendo
o campo numérico existente: vencimento = 0, passado = negativo, inválido = null.
`review_from` e o aviso configurado permanecem com a regra existente.
Consumidores no domínio: contratos, overview e resumo; a interface já calcula
seu próprio calendário local desde #197. Jobs/RPCs de renovação usam datas
(`ends_on - p_day`); nenhum prazo comercial foi alterado.

Regressão falhou na baseline (`84 != 85`). Dez fronteiras em quatro TZ cobrem
meia-noite, tarde, vencimento, negativo, ano, bissexto e transições DST.
UTC é o contrato explícito do servidor: junto à meia-noite, o calendário local
de um navegador pode diferir. Não se promete igualdade entre fusos.

### API-2 — histórico do provedor descartava condições financeiras

As consultas já carregavam snapshots imutáveis de `fin_proposal_versions`,
mas a projeção removia `terms`. Teste na baseline falhou com termos históricos
`undefined` apesar de duas versões terem taxas, tarifas e garantias distintas.

Mudança aditiva em `GET /api/finance/assignments` e
`GET /api/finance/proposals` sem `rfq_id`: `history[].terms` vem do snapshot
daquela versão; `history[].rfq_revision` acompanha ambas as projeções (null se
desconhecida). Versão, horário e nota continuam preservados. Não há leitura de
rascunho nem substituição pelo conteúdo atual.

JWT do usuário, anon key e RLS continuam obrigatórios; organização invisível
é recusada antes dos snapshots. Testes excluem proposta concorrente da resposta,
conferem filtro por IDs e não consultam versões para lista vazia. Não se alteram
decisões, `expected_version`, locks, grants ou trilha financeira. Limites prévios
das consultas continuam existindo; não se promete histórico ilimitado.

### REC-1 — falso `MATCH` com restrições de bucket diferentes

Baseline aceitava `MATCH` quando o destino removia `file_size_limit` ou
`allowed_mime_types`; também ignorava bucket adicional. O índice cifrado já
preservava esses campos, mas a reconciliação comparava somente visibilidade.
Negativo novo falhou antes da correção (`bucket_file_size_limit_changed`
ausente).

Agora compara conjunto de buckets, limite e allowlist MIME. Ordem/duplicação
da allowlist não muda sua política; null continua distinto de lista vazia.
Diferenças são códigos, sem nomes de objetos ou conteúdo privado nos relatórios.
Registros exigem `reconciliation_version: 2`: uma prova antiga não atesta as
novas verificações. Exports formato v1 continuam compatíveis; repetir o restore
do mesmo export em destino descartável gera a nova prova. Nunca editar o JSON
para fabricar aprovação. `verify` isolado não prova que houve restore.

Testes cobrem limite removido/alterado, MIME alargado/removido, ordem equivalente,
bucket extra, prova antiga e emissão real do novo registro pela CLI com transporte
sintético. Regressões de hashes, bytes, credenciais e autorização permanecem.

### CI-1 — evidência atribuída ao SHA errado

Em PR, checkout padrão testa o merge commit temporário. O resumo o rotulava com
o HEAD da PR. Agora o workflow captura `git rev-parse HEAD` em output e o resumo
publica o SHA executado separado do HEAD de referência. Ausência de identificação
é explícita, sem fallback que invente identidade. Teste falhou na baseline;
suíte CI-demo passou com 20 testes. Quatro gates, browsers e proteção preservados.

## Validação realmente executada

Executor Node `24.19.0`, PostgreSQL `17.11` Debian extraído em `/tmp`, age `1.3.2`
com SHA-256 fixado pelo instalador do repositório. Dados e identidades sintéticos,
PostgreSQL somente loopback; nenhum dump hospedado.

| Verificação | Estado / evidência |
| --- | --- |
| `npm ci --include=optional` | PASS, cache em `/tmp` |
| Preflight `check:all`, build e `test:e2e:list` | PASS; listagem não é execução browser |
| Testes API/domínio/readiness direcionados | PASS nas worktrees; regressões baseline vermelhas |
| Testes Storage/reconciliação/export direcionados | PASS; transportes simulados, sem claim de integração hospedada |
| CI-demo | PASS, 20/20 após a correção |
| `scripts/test-recovery-real.mjs` | PASS: `VALIDATED`, PG17 + age, export cifrado e restore do mesmo backup, reconciliação e negativos |
| Suíte integrada `check:all`, build, listagem, audit | PASS, exit 0; audit: zero vulnerabilidades; supply-chain incluído em check:all |
| `npm run test:database` | PASS em PG17 descartável: clean/upgrade/reapply/rollback/RLS/corridas/canário/probes |
| `git diff --check` | PASS no código integrado |
| Browsers locais / Supabase Docker integrado | NOT RUN nesta trilha; responsabilidade de UI/CI |
| Export/restore/configuração hospedados | NOT RUN; exigem autorização específica |

Limitações do executor distinguidas de defeitos: sandbox inicial impedia rede e
subprocessos; fixtures privadas precisavam escrita em `/home/agent`; `umask 0022`
preserva o negativo que cria arquivo deliberadamente 0644. Permissões do executor
foram concedidas sem mudar testes ou guardas. Testes bloqueados não foram contados
como PASS. Logs em `/tmp/arandu-platform-*.log` são efêmeros, não backups duráveis.

## Diagnóstico hospedado somente leitura

Observação em 15/10/2026, cerca de 16h42 BRT (19h42 UTC), no SHA base:

| Alvo | Observado | Limite |
| --- | --- | --- |
| Demo | deployment GitHub `7096435075` success; health e ready HTTP 200, branch main, commit `f66136e`, `environment:null`, `mode:demo`, `datasource:synthetic-fixtures` | sandbox, não Demo canônica; 200 não comprova M3 |
| Production `arandu` | deployment `7096437667` failure, Vercel `dpl_31ggea5MswQqRZXEhDSH7e8AQLxN`; alias `/api/health` HTTP 404 | logs da causa inacessíveis; não atribuir causa remota por inferência |
| Pilot transitório | deployment Preview `7096504464` success no SHA base | não cria terceiro ambiente permanente nem comprova release |
| Vercel projeto/config/logs/env | 403 no escopo `lucas-projects467`; CLI Vercel ausente | build command, Node remoto, nomes/escopos de variáveis e causa exata não revalidados |

Nenhum valor de variável solicitado com decriptação; nenhuma autenticação manual,
binding, segredo, domínio, deploy, grant, banco ou allowlist alterado. As atribuições
ativas Demo/Production continuam bloqueadas até cutover comprovado.

## Impacto, rollback e risco residual

Sem mudança persistida de dados ou schema. Rollout da aplicação é compatível com
o schema atual do repositório; não requer nova migration. Reverter os commits
restaura os contratos anteriores, mas reabre defeitos e enfraquece a prova de
recovery; preferir forward-fix. Rollback de código não recupera dados.

A nova versão da prova pode bloquear evidência antiga que antes passava: é
intencional. Repetir restore isolado, jamais relaxar a versão para passar.
Campos de bucket malformados fora do produtor SQL normal falham fechados;
não há claim de recuperação de configuração externa, MFA, OAuth, SMTP, Vault,
Realtime, links já assinados, RPO ou RTO. Inventário sem objetos mantém a
semântica anterior; não certifica dependências externas.

A revisão é dirigida: regressões de upload após remoção/rebaixamento, sessão,
decisão concorrente e replay vêm das suítes atuais de Auth e database. Não se
reconstruíram controles da #196 nem se afirmou auditoria exaustiva.

## Menor sequência ainda necessária para M3

1. **Exige permissão/credencial:** acesso read-only Vercel no escopo correto
   para observar configuração/logs; autorização separada e executor/custódia/destino
   privado durável para export real de cada origem identificada.
2. **Exige decisão humana:** classificação atual de cliente/PII, retenção,
   recuperação das chaves e aprovação do plano de conversão; legado nunca vira
   dado de Demo.
3. **Pendente de evidência hospedada:** restore do MESMO export em Supabase
   compatível isolado, banco/Auth/Storage/ACLs/binários/configuração reconciliados.
   Reutilizar `SUPABASE_ENCRYPTED_PRESERVATION.md`; não criar outro framework.
4. **Não seguro prosseguir agora:** reconstrução, migrations hospedadas, troca de
   atribuição, seed e cutover sem as provas/autorização anteriores.
5. Depois da operação autorizada: PR de cutover com gates, SHA/schema/datasource
   exatos, hooks efetivamente instalados, doctor, probes, canário, jornadas comprador/
   provedor, isolamento de visitantes e observabilidade. Só então avaliar M3.

Estado desta entrega: IMPLEMENTED/LOCAL_VALIDATED. CI_VALIDATED somente com
quatro gates no HEAD final e base atual contida; nenhum M3/M4/M5/M6 reivindicado.

## Handoff ao Claude

- Consumir `history[].terms` para mostrar condições/diff das próprias versões
  do provedor, preservando origem, versão, revisão e valores ausentes.
- `days_to_end` agora é calendário UTC; UI continua livre para rotular seu
  calendário local. Não pressupor igualdade entre fusos perto da meia-noite.
- Atualizar a branch de produto após a integração desta PR; nenhum arquivo ou
  branch do Claude foi editado. Logout não confirmado já foi tratado pela #197.
- Evidência final de CI, PR, HEAD e eventual SHA integrado será registrada na PR,
  sem push documental posterior para reciclar resultados de outro SHA.
