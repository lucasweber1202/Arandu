# Consolidação financeira — 04/11/2026

Base reconciliada: `4ce81537780fa0f0ba0055664db792b473444b49`. O checkout inicial
`fa551c01` estava 459 commits atrás; nenhum arquivo local foi perdido. Branch
`codex/financial-consolidation-20261104`; checkpoint de implementação `f1f9f471`.
A PR #320 altera frontend, sem SQL/migration/API; não houve edição das superfícies
de Claude Code, package.json ou workflows. Não houve comunicação externa.

## Implementação e medidas

Instalação adicional `financialBaseline`, compilador sintético loopback, snapshot
financeiro versionado e verificação de prefixo/hash; história e upgrades intactos.
Contrato completo em [FINANCIAL_BASELINE.md](../FINANCIAL_BASELINE.md).

| Medida | Histórico | Baseline |
|---|---:|---:|
| Arquivos SQL aplicados na instalação | 84 | 1 |
| Bytes SQL (sem envelope do bundle) | 1.802.241 | 1.525.956 |
| Primeira comparação local, com outras suítes concorrentes | 24.337 ms | 1.855 ms |
| Comparação posterior, com cache/carga diferentes | 9.082 ms | 4.011 ms |
| Comparação no fim da suíte integral | 4.362 ms | 3.970 ms |

Tempos observados, não benchmark isolado nem promessa de aceleração fixa. Há
variabilidade de CPU/cache; não extrapolar a primeira medição. A instalação direta
não cria os 36 objetos de tabela legados para depois removê-los. A geração/CI
continuam executando a história para provar equivalência. Não foi alegada redução
da duração da suíte, do upgrade ou do recovery sem medição comparável.

## Inventário hospedado renovado, somente leitura

Mesma organização, plano Free confirmado; ambos ACTIVE_HEALTHY/sa-east-1/PG17.6.
Inventários por ref e advisors em `ops/consolidation/*2026-11-04*.json`.
São metadados e contagens, não backups. Nenhum contato, email, identificador de
usuário, nome de objeto Storage, credencial ou valor de fin_settings foi exportado.

| Recurso | Legado → Production candidata | Pilot → Demo candidata |
|---|---:|---:|
| Tabelas públicas | 16 | 71 (33 financeiras, 36 legadas, 2 compartilhadas) |
| Linhas públicas | 42 | 14 |
| Views / funções / índices / policies | 5 / 2 / 46 / 12 | 18 / 101 / 203 / 51 |
| Usuários / identidades / sessões / MFA | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| Objetos Storage | 0 | 0 |
| Bucket financeiro | ausente | privado, 10 MiB e MIME allowlist |
| `pg_database_size` | 12.340.371 B | 16.149.651 B |
| Histórico registrado de migrations | 0 | 3 instalações agrupadas |
| Marker | sem fin_settings | financial-surface-hardening-1 |

Legado: 12 artistas, 22 obras, 5 certificados, 2 leads, 1 reserva. Oito linhas
contêm campos potencialmente pessoais; outros vínculos/textos também podem
identificar pessoas. Nenhuma classificação sintética ou autorização de descarte.
Pilot: quatro coleções, um marcador de catálogo, duas entradas de rate limit,
quatro registros de jobs e três configurações, todos preservados.

`fin_member_default_name` no Pilot consulta `profiles` dinamicamente; o trigger
`trg_auth_user_profile` ainda cria perfil em Auth. A cadeia canônica e a baseline
substituem a função e removem o trigger legado, mantendo Auth e os membros
financeiros. Nada disso foi aplicado hospedado.

Matriz reproduzível: `node scripts/consolidation-audit.mjs`. 608 componentes:
81 LEGACY_UNUSED no runtime financeiro (consumidores externos/retenção UNKNOWN),
2 LEGACY_TRANSFORMED, 9 SHARED_REQUIRED, 516 FINANCIAL_IMPLEMENTED_NOT_HOSTED.
Esta última classe não significa que todos os objetos estejam ausentes: significa
que o contrato atual não está operacionalmente validado no banco desatualizado.
As 84 migrations continuam HISTORICAL_REQUIRED. Cada entrada registra localização,
consumidores, evidência, dependências conhecidas, impacto, destino e aceite.
Zero linhas nunca foi usado como prova de ausência de uso.

## Advisors e Free

Pilot: 43 funções SECURITY DEFINER autenticadas; 66 FKs sem índice sugeridas,
21 initplans Auth e 78 índices com zero uso observado. Legado: duas views definer,
uma função com search_path mutável, trigger function executável por anon/auth;
7 FKs, 2 initplans e 24 índices sem uso. Avisos preservados por objeto e link de
[remediação oficial](https://supabase.com/docs/guides/database/database-linter).
Nenhum índice/policy/RPC foi removido por aviso. Estatísticas com reset ausente
e bancos vazios não permitem concluir que índice seja dispensável.

As 43 funções têm classificação de intenção/helper, papéis executáveis, configuração
de search_path e referências de código/testes na matriz. As provas SQL atuais
exercitam tenant/entidade/papel e sessões; não validam automaticamente os corpos
antigos hospedados. Autorização interna de cada versão hospedada continua review
manual, e nenhuma das 43 foi declarada segura só por existir teste de seu nome.

Documentação [pricing](https://supabase.com/pricing) consultada nesta data:
2 projetos ativos, 500 MB de banco/projeto, 1 GB de arquivos, 5 GB egress +
5 GB cached egress, 50.000 MAU, CPU compartilhada/500 MB RAM; pausa após uma semana
inativa. O SQL mede relações/banco PostgreSQL, não medidor oficial de faturamento,
WAL, egress mensal ou MAU. Objetos/usuários atuais zero não provam consumo mensal
zero. Egress, CPU e medidores oficiais não foram obtidos. Não há SLA Free inferido.

## Provas e limites

| Verificação | Resultado |
|---|---|
| SQL integral PostgreSQL 17.11, clean/upgrade/rollback/permissões/concorrência/canários | PASS_LOCAL |
| Baseline: equivalência, segredo por instalação, bucket e negativos de catálogo | PASS_LOCAL |
| Prefixo/hash alterado, future suffix e recusa de saltos | PASS_LOCAL |
| Upgrade do marker Pilot, interrupção, ack inválido, dependência inesperada, histórico preservado | PASS_LOCAL |
| Export age 1.3.2, mesmo backup PG17, schema/contagens, negativos e teardown | PASS_LOCAL sintético |
| check:all, build, build-size | PASS_LOCAL; JS acima do envelope saudável, dentro do hard limit |
| Inventário/probes hospedados | PASS_HOSTED somente leitura |
| Auth/Storage reais, jornada canônica local completa | BLOCKED por capacidade |
| Backup/restore hospedado, migrations hospedadas, cutover | BLOCKED / NOT_RUN |
| database/deploy-boundaries/validate/presentation do candidato | aguardar SHA da PR; nenhum verde herdado |

Preflight `scripts/ci-demo/run.sh preflight`: Docker vfs, 7 GiB livres, mínimo
32 GiB; bloqueou antes de pull. Não houve repetição da stack nem troca do driver.
O workflow existente de risco D mantém validação completa e integração efêmera.

Vercel na base `4ce81537`: Demo e Pilot READY, Production ERROR. Demo health
declara synthetic-fixtures e readiness 503. READY não comprova backend real.
Atribuições ativas Demo/Production continuam vazias; gate de Production intacto.
Não houve seed, alteração de Auth, env, segredo, deployment ou migration hosted.

## Retomada exata, sem autorização implícita

1. Proprietário resolve a classificação/retention/holds dos 42 e 14 registros;
   [decisão canônica](../LEGACY_DATA_CLASSIFICATION_DECISION.md).
2. Injetar conexão administrativa por ref, recipient age e destino privado durável
   já aprovado. Nenhum desses bindings existe no executor; não usar /workspace
   ou /tmp como preservação durável. Não enviar secrets pelo chat.
3. `npm run recovery:doctor -- --export`; depois `npm run recovery:export:private`.
   Custódia e valores em [preservação](../SUPABASE_ENCRYPTED_PRESERVATION.md).
4. `npm run recovery:restore:verify` com identidade separada, mesmo backup e alvo
   PG17 loopback compatível, parâmetros do runbook; `npm run recovery:verify`.
   Comparação e serviços/binários aplicáveis devem estar comprovados.
5. `npm run migrations:bundle -- --flow=existingDatabase --after-schema=financial-surface-hardening-1 --stop-before=docs/supabase-financial-legacy-art-decommission.sql`.
   Prefixo 12, SHA `4f583d0a0a73f6f299bb6015f9fa06f94518288cdea1cca24255ab7f49af17b7`.
   Aplicação hospedada e reconhecimento de aposentadoria exigem aprovação específica.
6. Após aprovação e aplicação: probes/canário, doctor, Auth/Storage reais, seed
   sintético isolado e jornada; só então revisar atribuição ativa da Demo.
7. Production segue [plano de conversão](../PRODUCTION_CONVERSION_PLAN_2026-11.md),
   com preservação própria; não aplicar baseline diretamente ao schema legado.

Custos adicionais contratados: **R$ 0**. Nenhum projeto, plano, serviço pago ou
armazenamento novo foi criado. Merge e cutover não executados.

## Continuação após publicação da PR #321

Branch publicada integralmente no HEAD `e6c9b80a`, depois de incorporar a #320
(`main@87d635da`) sem conflitos. 21 arquivos no primeiro lote, sem perda dos
artefatos locais. No HEAD publicado: check:all/build/build-size e baseline com
todos os negativos novamente PASS_LOCAL; medição 12.251 / 2.958 ms. CI run
`41848022718`: subjobs `full / database` e `full / deploy-boundaries` SUCCESS;
validate/presentation e integração ainda em execução na observação inicial.
Os quatro contextos agregados finais dependem da integração integral. Esse resultado não é
herdado pelo commit posterior deste complemento.

Continuação segura implementada: benchmark de leitura/escrita com 100 mil tarefas,
EXPLAIN/WAL e índice candidato descartado; comparação individual das 43 definidoras
(27 corpos iguais, 15 diferentes, uma entrada antiga fechada no canônico); auditoria
somente de contagens das exceções de seeds, com regressão SQL de conteúdo alterado;
seleção explícita de baseline no laboratório e falha de plano antes de provisioning.
Detalhes e reprodução em [capacidade e definidoras](../FINANCIAL_CAPACITY_AND_DEFINERS.md).
Nenhuma migration, índice ou alteração de Auth/RLS/grant foi aplicada aos projetos.
