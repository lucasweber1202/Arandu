# Operação liberação — engenharia de recovery

Base analisada: `b5fa804c5f161418e5e6c61091d72946b087ecf7`, #234 e #235
integradas, ancestral da branch `codex/hosted-release-execution-readiness`.
Nenhuma PR concorrente aberta na investigação. Datas/horas abaixo são UTC.
Esta rodada não executa export/restore hospedado, migrations remotas ou cutover.

## Resultado técnico novo

O restore operacional aceitava contagens iguais como reconciliação, sem exigir
projeto esperado nem comparar automaticamente schema. Arquivos eram resolvidos
antes de rejeitar links. Correções no fluxo existente, sem novo doctor:

- Ref esperado explícito antes de descriptografar/restaurar; export sintético
  somente pelo harness importado, sem opção CLI de bypass.
- Custódia privada dos artefatos e identidade separada; links recusados.
- Fingerprint v1 calculado no mesmo snapshot de pg_dump/contagens e comparado
  depois do restore. Drift resulta em MISMATCH/saída 1 mesmo com contagens iguais.
- Nível 5 exige também prova de schema do mesmo export. Registros antigos não
  ganham prova retroativa; artefatos antigos continuam preservados.

Regressões reais PG17.11/age1.3.2: marker alterado, body de função diferente,
perda de RLS/grant/policy, tipo de coluna alterado; função extra no destino
produz schema_mismatch após restore com contagens iguais. Projeto divergente,
projeto esperado ausente, identidade errada, arquivo alterado, manifest incompleto
ou duplicado, links e destino ativo/com dados ou não loopback são recusados.
Role ausente aborta a transação inteira. Positivo restaura o mesmo ciphertext,
reconcilia oito tabelas da fixture e compara dados/ACL/RLS/owners/defaults;
conjunto adicional reconcilia dois binários e duas referências. Teardown PASS.
Saídas sanitizadas: `../../ops/consolidation/execution-2026-10-19/synthetic-recovery.json`.

Limites: fingerprint tem escopo documentado em SUPABASE_ENCRYPTED_PRESERVATION,
não cobre todo tipo/extension/role/configuração do cluster nem conteúdo campo a
campo. Loopback não detecta tunnel remoto; operador deve usar cluster local novo
e exclusivo. O ensaio não reproduz GoTrue ou Storage gerenciado e não é prova
de preservação hospedada. Hash/manifest local não autentica o emissor.

## Observações atuais e acesso

Vercel GET arandu no team_BBpDcLVx5izJjXz5qBEq2cRy: 403, escopo
lucas-projects467, request gru1:sfo1::jbl82-1792434612896-8d86afd1711f,
18:30:12.896. Sem repetição/escopo alternativo. CLI Vercel indisponível e
VERCEL_TOKEN ausente no executor; configuração cloud atual sem secrets ou
identidade de saída. Não inferir ausência de secrets remotos.

GitHub statuses do SHA da base: arandu failure
`AExcgR1PQef5VZy8Fkn9PW47pRo2`; Demo success
`C5v7SU7QtVgmEt5Mtxq7iR3PRPi7`; Pilot success
`Hwqo2m6QBQKF96wFR4CQs9BjKDG5`. Primeira causa oficial NOT_PROVEN;
logs/configuração ACCESS_BLOCKED. Nenhuma correção de build foi inventada.
Repo mantém Node24, npm ci --include=optional e vercel-build com gates.

GET público 18:34:07–09: Demo health200 alive e readiness503 not_ready, SHA
da base/main, environment null, datasource synthetic-fixtures. Pilot e bice
respondem alive200 mesmo em probe=ready, sem identidade; não é readiness.
arandu.vercel.app health/probe404. Doctor existente voltou BLOCKED em ambos
os ambientes; o relatório Demo contém a nova observação live, não prova local
de backend. Relatórios em `../../ops/consolidation/execution-2026-10-19/`.

## Supabase e classificação

Inventários READ ONLY exatos às 18:31:27/38 e catálogo às 18:33:19/27:

| Origem | Estado / versão da instância | public tabelas/views/funções/policies | Linhas | Auth usuários/sessões/MFA | Storage buckets/objetos |
| --- | --- | --- | --- | --- | --- |
| Pilot offgpyysgdhfemjlchod | ACTIVE_HEALTHY /17.6.1.166 | 71/18/101/51 | 14 | 0/0/0 | 1 privado/0 |
| Legado igacnfjeuqhxcmfyepgj | ACTIVE_HEALTHY /17.6.1.155 | 16/5/2/12 | 42 | 0/0/0 | 0/0 |

Queries server_version retornaram17.6. Pilot migrations20260927151042,
20260927151230,20260929142139; marker relido18:35:37
financial-surface-hardening-1, sem deployment_environment. Legado sem migrations.
Topologia ativa inalterada: Demo/Production vazios, Pilot/Legacy refs originais.
Metadados sanitizados, nomes/tipos de colunas legadas e fingerprints de rotinas
versionados; nenhuma linha pessoal ou source body recuperado nesta rodada.

Metodologia e decisão por conjunto: `../LEGACY_DATA_CLASSIFICATION_DECISION.md`.
Inclui origem, potencial pessoal/cliente, retenção/hold, destino, descarte,
decisor e evidência. Nenhum conjunto hospedado foi comprovado fictício.
personal_data_rows/customer_rows continuam null, não zero. Matriz preserva
42 linhas legadas e14 Pilot; não resolve obrigação jurídica por inferência.

## Segurança, readiness e cutover

Catálogo atual mantém43 rotinas definer não-trigger com EXECUTE authenticated
no Pilot, zero anon; legado possui apenas duas funções de trigger. Grants não
demonstram exposição HTTP da Data API. RLS enabled em todas as tabelas public
observadas não prova isolamento funcional. Os catálogos incluem assinaturas,
privilégios efetivos, search_path e hashes de definição para revisão posterior.

Revisados os controles canônicos de enterprise-integrity, decision-authorization
e document-upload-authorization: auth.uid, membership/entidade, vínculo de
convite/provedor, ator/versionamento e locks já presentes. Hardening existente
fecha RPC antiga e views legadas; não duplicado nem aplicado remotamente.
Não foi estabelecida nova falha de autorização que justificasse migration.
Provas HTTP cross-tenant/IDOR, revogação por superfície e configuração Data API
continuam NOT_RUN hospedadas. SECURITY DEFINER não é revogado por quantidade.

Readiness existente distingue sandbox/runtime e exige identidade/configuração,
marker, Auth, RPCs, bucket privado, personas/pool onde aplicável. Projeto Vercel,
configuração efetiva, rotas e jornadas permanecem provas separadas do release;
o health público não as atesta. Nenhuma maturidade M3/M4/M5 promovida.

Plano executável após aprovação: inventário/classificação → export cifrado no
destino aprovado → restore do mesmo conjunto e reconciliação → revisão completa
Auth/Storage/configuração → bundle atual/revisão de destrutivos/rollback →
rollout autorizado e marker próprio → PR separada de assignments → quatro gates
→ deploy técnico → readiness/doctor/canário → personas, compradores/provedores,
workspaces/capacidade e jornadas hospedadas → candidato/release do SHA exato.
Em erro, parar; reler marker/catálogos; não atravessar decommission sem recovery.
Revert de código não reverte dados. Procedimento detalhado já existente em
HOSTED_SCHEMA_ROLLOUT e TWO_ENVIRONMENT_CONSOLIDATION permanece autoridade.

Bundle cleanInstall atual regenerado,73 arquivos, marker final
financial-decision-authorization-1, SHA256
0dfe6da2e0d6022797084e5e74128c174ff36d9a70ab1163b294a395140ce953.
Planos atuais vinculados ao hash real, sem rollback inventado; consolidation
permanece BLOCKED. Último workflow de export38179837512 segue failure,
nenhuma nova execução. Conexão administrativa, recipient e store local ausentes.

## Bloqueios e próxima ação mínima

| Bloqueio | Antes | Depois | Correção / evidência | Próxima ação / responsável | Autorização |
| --- | --- | --- | --- | --- | --- |
| Schema perdido com contagens iguais | NOT_PROVEN | PASS sintético | Fingerprint snapshot→restore e negativos reais | Revisar PR / engenharia | Não para código/teste; sim para export real |
| Origem/custódia no restore | NOT_PROVEN | PASS sintético | Ref explícito e links/permissões recusados | Operador usa procedimento atualizado | Sim para origem, destino e restore |
| Vercel logs/config | ACCESS_BLOCKED | ACCESS_BLOCKED atual | 403 acima; causa NOT_PROVEN | Owner concede leitura no mesmo team/projetos | Acesso somente leitura |
| Dados legados | BLOCKED | BLOCKED com estrutura por conjunto | Inventário novo + metodologia | Data owner decide proveniência/retenção/hold | Decisão humana específica |
| Export/restore hospedado | NOT_RUN | NOT_RUN | Ferramentas PASS, ensaio novo PASS, secrets/store ausentes | Owner configura pacote de recovery abaixo | Export/destino/restore específicos |
| Cutover | BLOCKED | BLOCKED | Bundle atual; gates intactos; assignments vazios | Engenharia executa após recovery/classificação | Aprovação separada de rollout/cutover |
| Demo hospedada | BLOCKED | BLOCKED | Fixture SHA base; ready503 | Configurar somente após conversão legítima | Configuração e seed autorizados |
| Production | BLOCKED | BLOCKED | Falha oficial; backend/recovery NOT_PROVEN | Acesso Vercel, preservação e release próprios | Aprovação Production separada |

Vercel: owner verifica a identidade da integração em Team Settings → Members /
Project access do escopo lucas-projects467 e concede leitura dos projetos arandu,
arandu-demo e arandu-pilot: metadados/configuração, deployments, build/runtime
logs e nomes/escopos de variáveis. Não é necessário compartilhar valores de env.
Sucesso: GET arandu no team exato200, depois acesso aos logs do deployment atual
identificado pelo SHA, sem troca de scope. Usar conexão oficial, nunca token no chat.

Recovery: em uma máquina confiável com store persistente aprovado, owner prepara
conexão administrativa TLS da origem no canal de secrets, recipient age cuja
chave privada fica separada, retenção e custódia do destino; autoriza o export e
restore isolado do alvo identificado. Alternativa já implementada: GitHub-hosted
com destino S3 privado aprovado e readback, sem chave privada no CI. Não exigir
AWS nem runner próprio; escolher uma estratégia, não ambas. Não criar fornecedor
pago ou guardar backup sensível neste executor efêmero. Configuração/doctor PASS
não autoriza export; aprovações de dados e conversão continuam decisões separadas.

Risco/automação: correções de schema/custódia têm regressões automáticas locais;
catálogo/inventário e doctor são read-only automatizáveis com acesso autorizado.
Mudanças de grants, migrations, export, restore e topology são de risco material
e exigem autorização e prova de alvo. Classificação/hold não são automatizáveis
como decisão. A resolução de cada bloqueio exige a evidência indicada acima.

## Validação

npm ci PASS; audit:ci PASS (0 vulnerabilidades); check:all PASS, incluindo todos
os gates solicitados (deploy/release separation, supply-chain, security, env,
staging, governance, routing), recovery contratual, migrations, topology,
readiness e candidato. Build e listagem E2E validados no lote antes do push;
resultado final dos quatro gates do HEAD exato registrado na PR. CI da base
não é herdado. Ensaio real PG/age PASS, teardown PASS; jornadas e recovery
hospedados NOT_RUN. Relatórios doctor BLOCKED são recusas esperadas, não PASS
de backend. Nenhuma alteração de workflow, gate, secret, UI ou scripts da estação.
