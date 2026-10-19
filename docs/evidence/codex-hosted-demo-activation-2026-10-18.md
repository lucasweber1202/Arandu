# Ativação da Demo hospedada — 18/10/2026

**PARTIAL / APPROVAL_REQUIRED; apresentação C / NO-GO.** Há correções materiais
de admissão/capacidade, laboratório e preparação operacional. O domínio público
continua sandbox; nenhuma operação hospedada sensível foi executada. M3/M4 não
atingidos. A escolha A continua autorizando preparação, não conversão.

Base efetiva: `41513ee408f58dff6386eabea4d45f03205aeadd` (main).
#223 e #224 integradas; sem PR aberta no início da coleta.
Branch exclusiva: `codex/p0-hosted-canonical-demo-release-20261018`.
Código, handoff e autorizações são consolidados antes do push; o HEAD literal e
os resultados finais dos workflows devem ser reconciliados no `head.sha` da
[PR desta branch](https://github.com/lucasweber1202/Arandu/pulls?q=is%3Apr+head%3Acodex%2Fp0-hosted-canonical-demo-release-20261018).
Não usar o CI da base ou da #223 como CI desta mudança. O relatório final/PR
complementa esta coleta pré-push com URL direta, HEAD e quatro gates efetivos.

## Correções e provas novas

**IMPLEMENTED / LOCAL_VALIDATED:**

- Antes: linha ready contendo apenas status/baseline era aceita pelo assessor
  do pool. Agora exige organização, provedores, nove IDs de usuário e todas as
  personas coerentes com o baseline/slug; duplicação de contas ou organizações
  entre workspaces impede GO.
- Antes: a consulta só via ready, ignorando 25 claims ativos e truncamento da
  Data API. Agora lê fotografia limitada de ready + claims vivos, exige
  `Prefer: count=exact` e total correspondente ao corpo. Teto ocupado → sem
  capacidade; total desconhecido/truncado/snapshot expirado → INCONCLUSIVE.
  Expiração é filtrada pelo PostgreSQL; relógio da aplicação não remove claims
  do total para fabricar vaga. Cache não é reserva; RPC continua atômica.
- Antes: uma persona podia apontar para outra pessoa no mesmo slug. Agora o
  servidor exige o e-mail canônico daquela chave e baseline, metadados completos
  e UUID do Auth pertencente ao workspace antes de emitir cookie. Mapa parcial,
  baseline antigo ou conta recriada com outro UUID → 503 existente, sem sessão.
- Novo ensaio SQL determinístico observa todos os participantes bloqueados no
  lock antes da liberação. Resultados: 2 sessões → 2 IDs únicos; 10 → 10;
  10 com teto 4 → exatamente 4. Nenhum sleep é prova de sobreposição. As cotas
  HTTP não foram alteradas; são sessões SQL independentes em laboratório.
- O smoke existente do CI efêmero recebe uma prova real do filtro PostgREST e
  count=exact no pool pré-seed vazio. Não é um pipeline novo nem prova hospedada.

Arquivos principais (lista completa no diff da PR): `lib/finance/demo-entry-readiness.mjs`, `demo-workspaces.mjs`,
`pilot-doctor.mjs`, `lib/api/domains/auth.mjs`, `lib/readiness.mjs`;
`scripts/fixtures/demo-workspace.mjs`, `test-readiness.mjs`,
`test-demo-hosted-readiness.mjs`, `test-demo-personas.mjs`, `test-database.sh`,
`scripts/ci-demo/smoke.mjs`, `tests/database/demo-claim-concurrency.mjs`;
runbook canônico, Implementation Matrix e os três documentos desta ativação.
Nenhum arquivo de frontend/E2E/scripts-demo do Claude, package/lockfile,
migration histórica ou assignment foi modificado. O workflow efêmero existente
foi ampliado para pool/visitantes; os quatro gates obrigatórios foram preservados.

## Verdade pública reconfirmada

| Prova | Resultado efetivo |
| --- | --- |
| Health | 200 alive, main/SHA da base; environment null, mode demo, datasource synthetic-fixtures |
| Readiness | 503 not_ready |
| Demo personas | 404 route_not_found |
| Login/finance/provider | HTML 200; não comprova sessão, API ou persistência |
| Raiz e /demo/index.html | Sandbox; entrada `/assets/demo/index-BGcO0oPD.js` |
| Bytes do artefato | Build standalone de checkout limpo 41513ee comparado ao asset público: SHA256 local/remoto iguais `b987e634a575faef94093881efbfd54f539ebed06ad0f3e10148df8321bf7a86` |
| Build canônico Demo × Production | Gate existente, sem duplicação: 31 rotas, entrypoints e 40 JS/CSS idênticos; worktree modificada não recebe SHA |
| hosted-parity do Claude | Executado somente leitura no domínio: NOT_READY. Defeito latente reproduzido em HTTPS isolado: aceita readiness de outro ambiente/SHA; handoff preciso adjacente, arquivo preservado |
| Vercel | GitHub status Demo/Pilot success e Production failure na base. GET projeto arandu-demo e arandu: 403 scope lucas-projects467. ACCESS_BLOCKED para configuração, logs, deployment ID e rollback target; CLI alternativo ausente |

O hash comprova correspondência da entrada publicada ao build standalone, não
revela o build command real da Vercel. READY de deployment e SHA atualizado não
comprovam runtime canônico. Não se tentou outro scope nem se repetiu chamada
403 em loop. O alias ativo e suas variáveis foram preservados.

## Inventário read-only do Pilot e classificação

Origem identificada: Arandu Pilot `offgpyysgdhfemjlchod`, sa-east-1,
PostgreSQL 17.6.1.166. Histórico `igacnfjeuqhxcmfyepgj` não foi usado como
atalho. Assignments Demo/Production continuam vazios.

Marker antigo `financial-surface-hardening-1`; decisão v2, buyer names e catálogo
de workspace ausentes. Esperado pelo manifesto: `financial-decision-authorization-1`.
108 tabelas contadas em public/auth/storage/history/vault. Auth users/objetos
Storage = 0; bucket privado = 1, limite 10 MiB e cinco MIME types. Há registros
operacionais e legados: api_rate_limits 2, catalog_releases 1,
curated_collections 4, fin_job_runs 4, fin_settings 3, além de histories.
Nenhum conteúdo pessoal ou secreto foi lido. Ausência de PII não atestada.

Catálogo: 51 policies, 101 funções públicas, um trigger Auth; cron.job ausente;
nenhuma tabela fin_* sem RLS habilitado. Papéis anon/authenticated sem login
ou bypass, authenticator com login, service_role com bypass esperado. Isso não
prova grants, bodies, sessões ou isolamento efetivo. Extensões observadas:
pg_stat_statements 1.11, pgcrypto 1.3, plpgsql 1.0, supabase_vault 0.3.1,
uuid-ossp 1.1. Configuração gerenciada, hooks externos, secrets/KMS e integrações
precisam de inventário/custódia próprios; catálogo SQL não os recupera.

Classificação conservadora: schema/catalog/roles/grants = SECURITY_SENSITIVE;
registros operacionais = INTERNAL/SECURITY_SENSITIVE conforme registro canônico;
conteúdo legado não classificado = potencialmente CONFIDENTIAL/PERSONAL_DATA.
Não se concluiu que a origem pode ser descartada. Backup cifrado continua fora
de Git/worktree/runner, com custódia durável e identidade separada aprovadas.

## Schema, recovery e segurança em laboratório

Laboratório exclusivo codex-*, PostgreSQL 17.6, porta 55571; sem recursos do
Claude. `test:database` passou instalação limpa, upgrade, reaplicação, rollback,
grants/triggers/RLS/catálogo, decisão versionada/aprovações, workspace e canário.
Mecanismo existente da #217 preservado: 38 migrations em ordem, bundle SHA256
`1b1642cc6ef4575dec7f4be11fafc50d254673c5f4d9180f6dbae254bcc718f8`.
Falha injetada reverteu DDL/dados; fronteira destrutiva recusou sem restore ACK;
retomada desde financial-data-governance-1 preservou histórico e chegou ao marker
esperado. Canário: 6 pessoas sintéticas, 594 verificações, zero vazamentos.

Ordem executável: manifesto e bundles existentes, nunca só última migration.
Aposentadoria legada é destrutiva; exige preservação/restore e aceite específico.
Rollback transacional antes do commit é distinto de downgrade após novo uso:
histórico/descarte e mudanças gerenciadas podem não ser reversíveis; nesses casos
pausar e fazer forward-fix/restore somente no destino aprovado. Marker, grants,
catálogo, ownership ou isolamento divergente interrompem o rollout.

Recovery real existente passou: PostgreSQL 17 + age 1.3.2 verificado, restore do
mesmo export, roles/dados/funções/triggers e reconciliação; fixture de dois
objetos e duas referências com RLS. Teardown VERIFIED; recursos próprios
parados/removidos. Janela observada de gravação dos logs: cerca de 94 s na suíte
SQL integral e 4 s no recovery, resolução de 1 s; não é tempo exclusivo das 38
migrations, RTO/RPO, SLA ou previsão hospedada. Auth gerenciado, Storage
gerenciado e configuração externa permanecem NOT_RUN/INCONCLUSIVE.

## Testes e release

Node 24.19.0; npm ci com lockfile e opcionais. PASS locais: check:all, build,
check:security, check:governance, check:supply-chain, audit:ci (zero
vulnerabilidades), check:demo-parity, test:database, deploy:check,
check:env, regressões Auth/readiness/doctor/release/recovery/transfer/Storage e
migration bundle, git diff --check. Deploy check usa domínio sintético do CI.
Listagem de 1.150 E2E não foi contada como execução local. Navegador local da
stack reservada ao Claude: NOT_RUN. Provas anteriores da #223 foram reutilizadas
como histórico, não como evidência deste HEAD.

CI_VALIDATED requer database, deploy-boundaries, validate e presentation no
head.sha final e merge:gates; verificar na PR após o push da correção vigente.
O smoke alterado aciona o workflow efêmero existente; seu resultado precisa
incluir recovery, teardown e arquivamento. Não gerar retentativas até passar.

O primeiro ensaio desta PR (`39174230394`, HEAD `521ebe94`) encontrou um defeito
adicional: seed/sanity passaram, mas recovery recusou a imagem do fallback
Docker Hub, embora fosse o mesmo digest fixado no CI. Resultado FAIL, jornadas
NOT_RUN; teardown e arquivamento PASS. Corrigido em
`lib/pilot-backup-preflight.mjs`: somente origem local aceita a referência
Docker Hub exata já fixada, com versão e digest completos. A política hospedada
permanece ECR; tag sem digest, digest alterado, outro registry/repositório e
major divergente continuam bloqueados. Regressões em
`scripts/test-pilot-backup-preflight.mjs` verificam o contrato real do pin do CI.
Um novo push é necessário por esta falha demonstrada, não para retrigger vazio;
os quatro gates e o ensaio precisam ser revalidados no novo HEAD.

O ensaio seguinte `39175471160` (`ef3bc545`) passou: recovery COMPLETE no escopo
da aplicação, cleanup removed, 38 checks; seed 39/39, jornada 87 PASS e sondas
24 PASS. Artefato `12153968207`, SHA256 verificado após download:
`13f5899803a024487e55a0c92312f9be1e853adc06fdd8c7ab600483e8083b1b`.
Mas desktop/mobile tinham seis testes PASS e dois SKIPPED cada: os visitantes
estavam desativados por ausência de pool. Isso não comprova entrada pública,
isolamento de visitantes nem estação B.

Lacuna tratada no harness existente: provisionar quatro workspaces pelos scripts
oficiais, verificar contagem exata/identidades/capacidade e incluir o pool no
mesmo export/restore antes de mutações. Ativar as duas suítes existentes do
Claude; exigir seus resultados JSON efetivamente passed no desktop, sem skip
ou retry. JSON bruto fica só em .state descartável; evidência expõe apenas
veredito seguro. Pool ausente/falho torna o resumo NO-GO. O endpoint REST de
teste também entra na trava loopback. A fase é limitada a 35 minutos, dois
seeds simultâneos; job permanece limitado a 75 minutos. Esse custo adicional
é necessário para provar a entrada de visitantes, antes apenas listada.
Nenhum teste/configuração Playwright ou script Demo reservado foi modificado.
Os workflows finais devem validar novamente este escopo ampliado.
Os quatro gates também passaram em `ef3bc545` (run `39175471143`), mas não
substituem os gates do HEAD que acrescenta o pool. Validação local desse
acréscimo: deploy:check e 23 testes do harness PASS; os negativos rejeitam
resultado visitante ausente/skipped/failed/timedOut/interrupted ou com retry.

No HEAD `392bf61`, os quatro gates passaram (`39176967287`) e merge:gates
confirmou base atual/HEAD exato. Pool real e restore passaram; ambas as suítes
de visitantes executaram com sucesso. O ensaio `39176967451` falhou depois:
adversarial buscava organizações globalmente pelo nome, agora repetido nos
workspaces. Vários UUIDs concatenados geraram SQL inválido. Isso foi tratado
como FAIL; cleanup e upload PASS, sem conversão para GO.

Corrigido o contexto do harness: IDs vêm da API autenticada do respectivo ator,
com organização única, ambiente Demo e UUID válidos; ambiguidade é recusada.
Sondas SQL subsequentes continuam vinculadas a esses IDs. Diagnósticos SQL
retêm somente SQLSTATE, sem query/credenciais. Regressões cobrem nomes
repetidos, ausência, papel/ambiente inválido e conteúdo sensível no stderr.
Este novo HEAD exige revalidar novamente os quatro gates e o ensaio completo.
Artefato da falha `12155049855`, hash conferido após download:
`fa56eb499aa94e82c960a767d5e7a9591a41ce8e1d87da38889d5f510b651833`.
Desktop: 8 PASS, incluindo as duas suítes de visitantes; mobile: 6 PASS e dois
SKIPPED intencionais, restritos pelos testes ao desktop. Cada um dos quatro
seeds levou 623 s, em dois pares paralelos; isso é medida do runner, não SLA.
O novo defeito era seleção global de fixture no harness, não vazamento no
produto. Nenhuma assert de segurança foi removida para resolvê-lo.

Production: leitura de logs ACCESS_BLOCKED. Build local hermético sem
configuração foi recusado por seis pré-condições, conforme esperado; isso
não prova a causa do deployment real. Nenhuma guarda foi retirada.

## Decisão e próximos passos autorizáveis

M1 implementado/LOCAL_VALIDATED; M2 depende do CI próprio. M3/M4/M5/M6 não
promovidos. A indisponível; B exige estação e pool operáveis no SHA aprovado;
C permanece para a apresentação hospedada. Não usar sandbox como produto integral.

Preservação, restore, migração, seed/Auth/Storage e cutover continuam
APPROVAL_REQUIRED. O menor pacote de permissões/risco/rollback está em
`codex-hosted-demo-owner-authorization-2026-10-18.md`. Contratos e correção do
verificador reservado estão em
`codex-canonical-demo-activation-handoff-2026-10-18.md`. Depois das aprovações:
preservar e restaurar o mesmo export, rollout integral, atribuição comprovada,
seed/pool sintéticos, candidato, cutover aprovado e jornadas com escrita/releitura
no domínio real. Não haverá conversão por inferência ou reset para acelerar.
