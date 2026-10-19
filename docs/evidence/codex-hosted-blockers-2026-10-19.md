# Desbloqueio hospedado — seguimento de 19/10/2026

Base remota `4f98226545ef71a83aee18ca689436e82922b1a4`, branch
`codex/hosted-release-blocker-remediation`. #232 e #233 são ancestrais da base;
nenhuma PR aberta na reconciliação inicial. A preservação sintética já comprovada
pela #232 não foi reapresentada como evidência hospedada nem repetida localmente.

## Infraestrutura e Vercel

Status GitHub do SHA exato da base, relidos nesta rodada:

| Projeto | Estado | Deployment |
| --- | --- | --- |
| arandu-demo | success | DZzbp8o68zVU5LPuiegoPCEyWZRC |
| arandu-pilot | success | 7nWVsEQpvaJGLcDA15odvqhLUQzi |
| arandu | failure | C7cbE4hXaADrnF9jqyKMkWRsMCNa |

Consulta autenticada GET project arandu com team explícito
team_BBpDcLVx5izJjXz5qBEq2cRy retornou 403 no escopo lucas-projects467,
request id gru1:sfo1::tmjz8-1792429626161-a7a2688fb4e1. Não repetida nem
substituída por outro escopo. CLI Vercel não instalado/autenticado.
**ACCESS_BLOCKED** para logs/configuração; primeira causa causal de
`dpl_C7cbE4hXaADrnF9jqyKMkWRsMCNa` **NOT_PROVEN**. Branch/target efetivos,
root directory, Node remoto, overrides e escopos das variáveis não comprovados.
Não inferir causa pelo build da #232 ou por uma configuração sintética.

GETs públicos atuais: Demo health 200, branch main/SHA da base,
environment null, datasource synthetic-fixtures; readiness 503. Pilot e
arandu-bice retornam 200 alive, sem identidade de release, inclusive no probe.
arandu.vercel.app retorna 404. Esses aliases não comprovam backend/readiness.
Plano A **BLOCKED**. Production: código/build técnico validados pela base;
deployment oficial falhou, backend/recovery hospedados NOT_PROVEN e release
não aprovado. Nenhuma promoção ou mudança hospedada nesta rodada.

## Inventários e topologia atuais

Queries Supabase em READ ONLY às 14:08 BRT. Fontes e manifestos sanitizados em
`ops/consolidation/followup-2026-10-19/`. Contagens exatas, não estimativas.

| Projeto / atribuição ativa | public tabelas/views/funções/policies | Linhas | Auth usuários/sessões/MFA | Storage buckets/objetos |
| --- | --- | --- | --- | --- |
| offgpyysgdhfemjlchod / pilot | 71/18/101/51 | 14 | 0/0/0 | 1 privado/0 |
| igacnfjeuqhxcmfyepgj / legacy | 16/5/2/12 | 42 | 0/0/0 | 0/0 |

Ambos ACTIVE_HEALTHY, PostgreSQL 17.6, sa-east-1. Pilot tem três migrations:
20260927151042, 20260927151230, 20260929142139; schema_version
financial-surface-hardening-1, sem deployment_environment. Legado sem migrations
registradas ou fin_settings. Todas as tabelas public observadas têm RLS enabled.
Demo e Production continuam com atribuições ativas vazias. Identidades de banco
são distintas; isolamento operacional e credenciais dos deployments não provados.
Inventários têm validade de 24 h e não são backup nem autorização de descarte.

## Matriz de classificação para decisão humana

Não foram recuperados nomes, contatos, linhas de negócio, tokens ou caminhos de
objetos. As categorias abaixo não autorizam exclusão nem cópia para a Demo.

| Conjunto | Contagem | Classificação atual | Retenção/decisão pendente |
| --- | --- | --- | --- |
| Dados hospedados comprovadamente sintéticos | Nenhum conjunto comprovado | Não atribuir essa categoria por antiguidade/nome do projeto | Responsável deve apresentar proveniência |
| Pilot: marker schema_version consultado | 1 dos 3 settings | Metadado operacional não pessoal observado | Preservar configuração; outros settings não classificados |
| Pilot: api_rate_limits / fin_job_runs | 2 / 4 | Origem/conteúdo operacional não classificados; logs/identificadores podem ser pessoais | Examinar campos e obrigações em ambiente seguro |
| Pilot: curated_collections / catalog_releases | 4 / 1 | Origem desconhecida | Classificar conteúdo, propriedade e dependências |
| Legado: leads / reservations / certificates | 2 / 1 / 5 | Oito registros com campos de contato/destinatário, potencialmente pessoais | Decisão do responsável pelos dados; preservar até classificação |
| Legado: artists | 12 | Possíveis identificadores de pessoas; origem desconhecida | Classificar além dos oito registros de contato já sinalizados |
| Legado: artworks | 22 | Conteúdo/payload não inspecionado; origem e retenção desconhecidas | Revisar texto livre, direitos e eventual vínculo com cliente |
| Auth e binários Storage | Zero usuários, sessões, MFA e objetos nas duas origens | Não há conteúdo nesses conjuntos no snapshot | Não implica ausência de PII em public ou ausência de configuração externa |
| Retenção/hold externos | Não comprovados | Dependência de decisão do proprietário | Preservar até declarar obrigações; não inventar ausência de legal hold |

Ambos manifests mantêm personal_data_rows e customer_rows null. Contadores de
contato zero no Pilot não classificam texto livre. Ausência de Auth não prova
ausência de dados pessoais. O classificador humano deve registrar categoria,
finalidade, proveniência, retenção/hold, destino e referência de decisão por conjunto.

## Segurança contextual

Catálogo atual: anon/authenticated não são superuser nem bypassrls; service_role
tem bypassrls esperado. Grants efetivos e tipos foram consultados, sem chamar RPC.

- Pilot: 101 funções, 16 retornam trigger; 43 definer não-trigger executáveis por
  authenticated e zero por anon. Exposição no schema da Data API precisa de prova
  separada; privilégio SQL não confirma sozinho a alcançabilidade HTTP.
- fin_has_role exige auth.uid e membership da organização; fin_is_operator exige
  auth.uid, papel finance_ops e registro de operador; fin_create_organization exige
  autenticação e allowlist, além de validação de entrada. Esses grants sustentam
  funcionamento legítimo e não devem ser revogados indiscriminadamente.
- fin_record_decision antigo verifica organização/papel, estado, proposta elegível
  e aprovação, mas continua sem a expectativa de versão da v2. É schema antigo,
  não equivalência ao contrato atual. A migration enterprise-integrity já fecha
  sua entrada cliente e mantém a chamada interna do owner da v2. Exigir o rollout
  completo e testes existentes; não aplicar uma revogação isolada no hospedado.
- Legado: as duas funções são triggers, portanto EXECUTE não prova RPC explorável.
  set_updated_at não declara search_path. v_public_catalog e v_available_artworks
  têm SELECT efetivo para anon/authenticated e privilégios do criador. Não foi lido
  seu conteúdo; risco de contornar RLS exige revisão de consumidores antes de agir.
- O hardening canônico já configura security_invoker e remove grants legados,
  incluindo funções de trigger, na instalação futura. Não foi criada migration
  redundante nem alterada permissão remota. RLS sem policy pode ser negação
  intencional para tabelas internas; não criar policies abertas para silenciar INFO.

Referências: [views](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view),
[search_path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable),
[definer authenticated](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Engenharia implementada

Novo `scripts/hosted-infrastructure-doctor.mjs`: composição somente leitura dos
verificadores existentes, com identificador/categoria/resultado/evidência/ação/
responsável/autorização/segurança automática por bloqueio. Documentos importados
não são autenticados; nenhum PASS autoriza cutover. Readiness exige SHA/ambiente/
datasource e expira após cinco minutos; resposta alive ou fixture não passa.
As presenças de variáveis são do executor, não alegações sobre a Vercel.

Preflight corrigido: plano precisa do hash do bundle atual, calculado pelo gerador
canônico em --stdout. Bundle ausente, gerador falho, hash antigo e referências
pending/TODO/TBD/placeholder/NOT_RUN bloqueiam. Antes, qualquer hash bem formado
e pending:verified-recovery podiam passar como plano de reconstrução controlado.
Nenhuma dessas declarações altera atribuições ativas ou executa operações.

## Recovery e rollout preparados

Cliente PG17.11 e age1.3.2 disponíveis no executor; preflight só de configuração
confirmou ferramentas e identidade. Conexão administrativa, destinatário age,
destino privado durável e confirmação de export continuam ausentes localmente.
Configuração remota dos secrets não foi inferida. Não há store durável atestado
nem prova de alvo Supabase compatível para restore nesta sessão.
Export/restore hospedados **NOT_RUN**; última execução de preservation permanece
38179837512, failure. Não disparada novamente sem as pré-condições.

Bundles regenerados a partir da base atual, não aplicados:

| Fluxo | Arquivos | Marker final | SHA256 |
| --- | --- | --- | --- |
| cleanInstall | 73 | financial-decision-authorization-1 | 0dfe6da2e0d6022797084e5e74128c174ff36d9a70ab1163b294a395140ce953 |
| upgrade após marker observado | 38 | financial-decision-authorization-1 | 1b1642cc6ef4575dec7f4be11fafc50d254673c5f4d9180f6dbae254bcc718f8 |
| prefixo antes de decommission | 12; 26 adiados | financial-data-governance-1 | 0fd98cb1e34788e26985625ec0f274ff40c6f2e1b03ebe9e73bb001121ba5f9f |

Ordem, atomicidade por migration, dependências e retomada seguem
`HOSTED_SCHEMA_ROLLOUT.md`. Não atravessar a etapa destrutiva para obter marker
novo. Restore deve usar o mesmo export, em alvo isolado, com reconciliação,
Auth/configuração, roles/grants/RLS e binários quando aplicável. Em falha, parar,
reler marker/catálogos e regenerar o sufixo; preferir forward-fix revisado.

## Ações mínimas que dependem do proprietário

Validação local desta alteração: npm ci, audit:ci (zero vulnerabilidades),
check:all, build, listagem E2E (1185 testes), regressões do diagnóstico/preflight,
CLI real com hash atual versus antigo, bundles pendentes e links PASS.
check:all inclui supply-chain, security, env, staging, governance, routing,
deploy/release separation, recovery contratual e release candidate. Caso negativo
do diagnóstico publicado: FAIL de readiness, esperado pelo sandbox; estado geral
BLOCKED. Nenhuma jornada canônica hospedada, export ou restore hospedado executado.
Os quatro gates do HEAD próprio serão conferidos na PR, sem herdar o CI da base.

| Sistema/procedimento | Permissão e informação a preparar | Como confirmar | Bloqueio removido |
| --- | --- | --- | --- |
| Vercel: conexão oficial da integração + Team Settings/Members/Project access | Owner do team confirma a identidade conectada e concede leitura compatível com o plano em lucas-projects467 aos três projetos; reautorizar a conexão nesse escopo se necessário, sem expor token | GET project arandu no team exato retorna 200; depois ler build logs do deployment C7cbE4hXaADrnF9jqyKMkWRsMCNa, configuração e nomes/escopos de envs | ACCESS_BLOCKED; permite comprovar primeira causa oficial |
| Supabase Connect + executor confiável de recovery | Responsável pelo banco configura conexão administrativa da origem em canal de secrets autorizado, nunca no chat/repositório | recovery:doctor confirma identidade/TLS/configuração com PG17, sem conectar no preflight | Acesso administrativo para preservação |
| Máquina/store do operador, procedimento SUPABASE_ENCRYPTED_PRESERVATION | Custódia durável aprovada, retenção definida; identidade age privada separada do ciphertext e CI; destinatário validado | key roundtrip e store marker/permissões/retention; doctor sem bloqueios de configuração | Destino e criptografia preparados; ainda não backup |
| Governança de dados, matriz acima | Responsável registra proveniência, cliente/PII, retenção/hold e destino por conjunto | Evidência revisável, inventário renovado e classification gate satisfeito sem placeholders | DATA_REVIEW_REQUIRED |
| Preservação/restore e mudança de schema | Aprovação específica do export/destino e de restore isolado; após prova, autorização separada do rollout/cutover | Mesmo export cifrado, hashes e reconciliação; provas gerenciadas; consolidation:check e quatro gates da PR de cutover | Recovery e autorização de conversão |

Não configurar variáveis para simular conversão. Depois dessas condições, o
engenheiro executa o procedimento autorizado, configura isolamento/marker,
propõe a atribuição ativa em PR específica e valida doctor, canário e jornadas
hospedadas do mesmo SHA. Nenhuma intervenção é solicitada para testes locais,
bundles, diagnóstico ou preparação já executáveis por código.
