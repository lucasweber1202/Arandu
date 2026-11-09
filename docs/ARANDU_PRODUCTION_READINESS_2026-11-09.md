# Arandu — diagnóstico e caminho de produção, 09/11/2026

Escopo: observações remotas somente de leitura, código na branch própria e
ensaios locais com dados sintéticos. Os estados são fotografias, não autorização
para backup hospedado, reativação, mudança de acesso, migration, cutover ou deploy.
As classificações abaixo usam VERIFIED, IMPLEMENTED_LOCAL, BLOCKED_EXTERNAL,
OWNER_APPROVAL_REQUIRED e NOT_VERIFIED.

## Decisão atual

**BLOCKED_EXTERNAL — NO-GO para produção.** O deployment de produção
[`dpl_ACAyshfwfE3nebsXbWrgk75f1QmM`](https://vercel.com/lucas-projects467/arandu/ACAyshfwfE3nebsXbWrgk75f1QmM)
foi criado para `main@a27b3ed96a9526b3a5f41902f508c74f612e757b` e falhou no
build. O log diz que `npm run vercel-build` chamou `finance:env:check` em
`production` e recusou a URL apontada para o legado sem atribuição ativa para
production. A instalação de dependências concluiu antes da recusa. **VERIFIED:**
é o guardrail explícito de `scripts/check-finance-env.mjs` e
`lib/deployment-topology.mjs`, não evidência de que o Vite ou o PostgreSQL falharam.
A ativação do projeto legado não satisfaz, por si só, classificação, recovery,
atribuição e release. Manter o erro até haver destino e cutover aprovados.

**VERIFIED:** o legado ativo não é um banco financeiro pronto: o catálogo tem
16 tabelas públicas da vertical anterior, nenhuma tabela `fin_` e nenhum
`fin_settings`; a lista de migrations do serviço retornou vazia. O marcador
exigido pelo doctor é `financial-contract-email-links-1`. Uma lista vazia de
migrations registradas não prova, isoladamente, que scripts SQL manuais nunca
foram executados; aqui o catálogo também demonstra ausência do schema financeiro.

**IMPLEMENTED_LOCAL:** o doctor deixava um projeto Pilot não atribuído parecer
“dedicado”, e tentava consultas com credenciais mesmo quando o destino era
rejeitado. A correção bloqueia consultas com chaves a destinos não aprovados ou
com refs de chave conflitantes, classifica refs desconhecidos como NO-GO no
Pilot hospedado, mantém ensaio loopback explícito como inconclusivo e recusa
redirecionamentos. Chaves opacas ou JWTs sem ref são INCONCLUSIVE, não prova de
vínculo; refs declarados coincidentes não provam assinatura. Não altera a
atribuição de nenhum projeto nem torna o deployment verde.

## Ambientes observados

| Ambiente | Observação | Limite |
|---|---|---|
| Demo | **VERIFIED:** `arandu-demo.vercel.app` aponta ao deployment READY de `main@a27b3ed`; `/api/health` informa `mode=demo`, `datasource=synthetic-fixtures` e o mesmo commit. Landing e dashboard, RFQs e contratos da Demo abriram em Chromium, sem login, identificados como fictícios. | **NOT_VERIFIED:** jornada hospedada com Auth/banco reais. O Chromium do executor exigiu ignorar a autoridade TLS do proxy para a observação visual; o GET de verificação separado via curl usou a cadeia normal do ambiente. |
| Pilot Vercel | **VERIFIED:** preview READY de `main@a27b3ed` tem `target=null` e está sob proteção Vercel. O alias público `arandu-pilot.vercel.app` aponta ao deployment de produção antigo `pilot@2241d3b94568acfdb99c8b7b31b53810e356846e`, não ao preview da main. O `/api/health` deste alias retornou `alive`. | **NOT_VERIFIED:** autenticação, jornada e compatibilidade da versão 9.1 hospedada. `alive` é liveness da função, não health das dependências. Nenhuma credencial de teste foi usada. |
| Produção Vercel | **VERIFIED:** deployment de `main@a27b3ed` em ERROR no preflight descrito acima. O alias `arandu-bice.vercel.app` ainda aponta ao deployment READY anterior de `main@fd796e6be3e7f9b994552f1866f7ec4632b9e7fa`, não ao build 9.1 que falhou. Nomes de URL, chaves, `CRON_SECRET` e ambiente constam no escopo production; valores não foram revelados. O log informa que não há provedor de e-mail transacional configurado. | **NOT_VERIFIED:** entrega de convites/avisos, acesso a banco e jornada do deployment antigo. Presença de variáveis não comprova chaves válidas. |
| Supabase legado `igacnfjeuqhxcmfyepgj` | **VERIFIED:** `ACTIVE_HEALTHY`, `sa-east-1`, PostgreSQL 17.6; 0 usuários Auth, 0 buckets e 0 objetos Storage no momento da consulta. Em 16 tabelas públicas: 12 artistas, 22 obras, 5 certificados, 2 leads, 1 reserva; demais tabelas consultadas sem linhas. | **NOT_VERIFIED:** classificação do conteúdo ou autorização para exclusão/conversão. Zero Auth/Storage não significa ausência de dados pessoais. |
| Supabase Pilot `offgpyysgdhfemjlchod` | **VERIFIED:** `INACTIVE`, `sa-east-1`, versão reportada 17.6.1.166. Leitura do histórico de migrations expirou. | **BLOCKED_EXTERNAL:** schema, usuários, objetos, dados e causa da inatividade atuais não puderam ser confirmados. Não se deve inferir a causa a partir de `INACTIVE`. Snapshot histórico em `docs/FINANCIAL_RECOVERY_EVIDENCE_2026-10-09.md` não é estado atual. |

O teste direto de Auth do Pilot recebeu `CONNECT 403` do proxy, antes da origem;
não é resposta do Supabase. O projeto Pilot foi observado como inativo pela API
de gestão. No legado, a chamada Auth sem credencial retornou 401 e não prova uma
jornada de autenticação. A API de gestão de ambas as instâncias é distinta da
conexão PostgreSQL usada para dados, schema e recuperação.

**VERIFIED — atenção de segurança do legado:** o advisor identificou duas views
`SECURITY DEFINER` (`v_public_catalog`, `v_available_artworks`) e o catálogo
indica concessão SELECT a `anon` e `authenticated`; outras permissões também
estão registradas. Isso exige revisão da exposição e da intenção dessas views;
não demonstra, por si só, vazamento ou exploração. O advisor também apontou seis
tabelas com RLS habilitada sem policies, um search_path mutável e uma função
SECURITY DEFINER executável pelos papéis públicos. Não alterar grants na
investigação. Referências: [view](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view),
[RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy),
[função pública](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).

## Evidência de validação e recovery

- **VERIFIED:** os quatro gates e Demo Integration passaram no SHA da PR 9.1
  `6af1456f`, cuja árvore Git é idêntica à de `main@a27b3ed`. Na main,
  [run 42670537673](https://github.com/lucasweber1202/Arandu/actions/runs/42670537673)
  registrou sucesso dos subjobs de banco, browsers, apresentação e Demo Integration,
  incluindo clean/upgrade/rollback/RLS e drill isolado de banco + binários
  Storage. O gate agregado `database` falhou porque recebeu
  `FULL_RESULT=abandoned`; a causa dessa classificação e o resultado agregado
  da main não estão comprovados como verdes. Não se enfraqueceu o gate nem se
  repetiu uma suíte longa da mesma árvore apenas para esconder essa divergência.
- **VERIFIED:** no ensaio 9.1 local, PostgreSQL, Auth, PostgREST, Storage e
  Chromium reais executaram 28 etapas e 64 ataques sem falhas; era dado sintético,
  não backup nem restore de dados hospedados. A documentação e os logs indicam
  explicitamente o SHA e as condições.
- **VERIFIED:** existem `test:database`, `pilot:upgrade:rehearse`,
  `pilot:restore:drill`, `pilot:backup:preflight`, `recovery:doctor`, export
  privado, verificação e reconciliação; ver `docs/TWO_ENVIRONMENT_CONSOLIDATION.md`
  e `docs/RECOVERY_PRIVATE_STORE_OPERATOR.md`. O drill da CI é evidência para seu
  conjunto sintético e condições; não comprova um restore das origens hospedadas.
- **NOT_VERIFIED:** backup hospedado atual, classificação de todos os dados,
  recipient age, armazenamento privado durável, credenciais e runner autorizados,
  reconciliação de conteúdo real e um restore recuperável das duas origens.
  `auth.users`/`auth.identities`, MFA e configuração Auth requerem inventário e
  caminho de migração próprios; o drill limita MFA conforme seu preflight. Backup
  PostgreSQL do Supabase contém metadados, não os binários do Storage.

## Alternativas e custos

**VERIFIED:** a organização Supabase informa plano Free. A documentação oficial
oferece dois projetos Free por proprietário/administrador, com projetos pausados
fora do limite; projetos Free com pouca atividade podem ser pausados. Isso é um
risco operacional conhecido, não prova de que a inatividade observada tenha essa
causa. Backups de banco de projetos Free não estão disponíveis para download no
painel; um processo de export autorizado precisa ser definido e testado.

**OWNER_APPROVAL_REQUIRED — estimativas de tabela pública, não fatura:** Pro a
partir de US$25/mês por organização, com US$10/mês de crédito de compute que cobre
um projeto Micro/Nano; a página anuncia projetos adicionais a partir de US$10/mês.
Um cenário simples de dois projetos Micro sempre ligados seria aproximadamente
US$35/mês antes de impostos, uso excedente, rede e outros produtos; preço e
aplicabilidade exatos devem ser confirmados na conta. Storage do Pro inclui 100 GB
na organização e excedente publicado de US$0,0213/GB; egress e outros limites
podem gerar custo. PITR é adicional por projeto, fora do Spend Cap: 7 dias
~US$100/mês, 14 dias ~US$200 e 28 dias ~US$400, além de plano/compute e outras
cobranças. Reativação, tamanho de compute, uso, retenção, armazenamento de backup,
Vercel, impostos e custos reais da conta: **NOT_VERIFIED**.
Fontes: [preços](https://supabase.com/pricing), [cobrança](https://supabase.com/docs/guides/platform/billing-on-supabase),
[compute](https://supabase.com/docs/guides/platform/manage-your-usage/compute),
[backups](https://supabase.com/docs/guides/platform/backups),
[PITR](https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery).

| Opção | Benefício | Limite e decisão |
|---|---|---|
| Legado como destino de produção | Evita novo projeto | Contém dados de arte e nenhum schema financeiro; classificação, export, restore isolado e decisão sobre preservação são pré-requisitos. Não é seguro convertê-lo por estar ativo. |
| Pilot como produção | Reutiliza stack financeira histórica | Está inativo; inventário atual é desconhecido. Reutilização mistura finalidade e elimina a separação de teste; recuperação, isolamento e aprovação explícita continuam necessários. |
| Projeto dedicado à produção | Isola o ambiente real de Demo/Pilot e facilita rollback | Pode aumentar custo; exige aprovação, provisionamento, backup e validação. Não implica que a criação seja obrigatória. |

**Recomendação:** escolher um destino de produção isolado após classificar as
origens e obter custo/recuperação confirmados; manter o legado como origem
preservada até decisão de retenção. A topologia vigente planeja conversões do
Pilot para Demo e do legado para produção, mas nenhuma é atribuição ativa. Não
se deve tratar esta recomendação como alteração dessa política ou escolha aprovada.

## Plano de liberação após decisão do proprietário

1. **Preparação — OWNER_APPROVAL_REQUIRED:** decidir finalidade e destino de
   cada projeto, orçamento/retencão, responsáveis, acessos, janela, RPO/RTO,
   tratamento dos registros legados, e confirmar identidade, região, billing e
   dependências. Reativação do Pilot, recursos pagos ou upgrade exigem aprovação
   específica; primeiro obter o custo e a consequência de disponibilidade.
2. **Preservação — OWNER_APPROVAL_REQUIRED:** aprovar destino privado durável,
   chave/recipient e acesso do executor. Inventariar schema, dados, usuários,
   identidades, MFA, configuração Auth, permissões, objetos e binários Storage,
   funções, grants, RLS, extensões, migrations e configurações não secretas.
   Usar os mecanismos existentes de `RECOVERY_PRIVATE_STORE_OPERATOR.md`;
   exportar cifrado, verificar hashes e readback. Nenhum backup hospedado foi feito.
3. **Restore e schema — OWNER_APPROVAL_REQUIRED:** restaurar cópia verificada
   em alvo isolado compatível com PG17/Supabase; reconciliar conteúdo, contagens,
   owners, roles/ACL, RLS, Auth e referências/binários Storage. Ensaiar sequência
   correta do manifesto `docs/supabase-migrations.json`, clean/upgrade/rollback
   suportado e reaplicação. Resolver divergências antes de aplicar no destino.
4. **Aplicação — OWNER_APPROVAL_REQUIRED:** propor PR de cutover com atribuição
   exata e evidência da origem/destino; só após aprovação aplicar migrations,
   configurar secrets e integração de e-mail/cron fora do Git. Não apontar para
   refs desconhecidos ou usar Pilot como fallback. Preservar o caminho anterior.
5. **Smoke — OWNER_APPROVAL_REQUIRED:** no candidato autorizado, validar
   identidade e SHA, doctor/readiness, Auth e sessão autorizada, API, RLS por
   organização, schema/marker, Storage privado/assinatura e uma jornada financeira
   controlada. Liveness, build READY e mocks não substituem essas provas.
6. **Monitoramento — OWNER_APPROVAL_REQUIRED:** confirmar métricas, alertas,
   logs e retenção viáveis no plano; acompanhar erros Auth/API, fila de e-mail,
   jobs, consistência e disponibilidade; definir responsável e período de observação.
7. **Rollback — OWNER_APPROVAL_REQUIRED:** antes do corte, testar restauração e
   congelamento de escritas; definir limiar de reversão e reconciliação para dados
   criados após o corte. Reapontar um deployment antigo não reverte schema/dados;
   não restaurar sobre dados novos sem decidir sua preservação.
8. **GO/NO-GO — BLOCKED_EXTERNAL:** exigir inventário e classificação aprovados,
   backup cifrado com readback, restore reconciliado, destino/atribuição aprovados,
   schema/authorization/Storage validados, quatro gates no SHA liberado, smoke
   autenticado, monitoramento e rollback ensaiados, custos aceitos e decisão humana.
   Qualquer ausência mantém NO-GO. Este documento é plano, não autorização.
