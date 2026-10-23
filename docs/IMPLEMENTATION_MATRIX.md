# Implementation Matrix — Arandu Financial Procurement & Vendor Management OS

## 22/10/2026 — Missão master: publicação 257ce1d e handoff operacional

Main reconciliada em `257ce1dee610f03e510a3f09e68291e4f03a3a16`, PRs #255–#259
incorporadas. Quatro gates e merge-audit **SUCCESS nesse SHA**. Prova externa
nova: **PUBLIC_SHAREABLE PASS**, 229 verificações, 185 artefatos e 36 capturas
recém-renderizadas, 13 etapas em desktop/mobile com Tab/Enter e deep links.
Visita M2 informativa, `synthetic-fixtures`; não promove M3.

**LOCAL_STATION_READY: STATION_NOT_VERIFIED.** Executor cloud; tentativa de
laboratório bloqueada ao registrar camada da imagem oficial PostgreSQL
(`no space left on device`). Nenhuma stack, seed ou jornada real executada
nesta rodada. `station --fast` BLOCKED, sem freeze. Ensaio anterior do Claude
continua evidência histórica local, não comprovação desta main nem do WSL2 físico.

Correção operacional documental: preparar/retomar sem reset, ensaiar antes do
freeze, reposição apenas do pool consumido, janela final sem suites e 429 sem
contorno por persona. Cartão Windows/WSL2 e roteiro mantêm os cinco atos.
Covenant: owner da obrigação e assignee da tarefa são objetos distintos;
a migration de task-accountability proíbe herança automática até haver sync
source-specific. Lacuna de orientação P1 adiada com critérios de
correção/adversariais; nenhuma migration antes da apresentação.
Production segue failure; leitura Vercel 403 no scope correto. M3/M5 BLOCKED,
sem alteração de assignments, schema, segredos, billing ou deployments.

Evidência, limites e próximos gates: [missão master](evidence/codex-master-release-2026-10-22.md).
A PR documental exige CI no seu próprio HEAD; o SHA público acima não é o seu HEAD.

## 22/10/2026 — Release assurance P0-A/P0-B e preparação M3

Base `main@42dd92bbb99e807b6a342195fa31cbe94d760ef9` relida por fetch.
**PUBLIC_SHAREABLE PASS** no domínio público desse SHA: HTTP/artefatos e
Chromium 156.0.8078.4 (Playwright 1.64.1 do lockfile), 17 etapas por viewport,
desktop/móvel, Tab/Enter real, reload, 34 capturas e hashes; 203 verificações.
Modalidade visita informativa/sandbox synthetic-fixtures, sem backend canônico.
Prova de 22/10 às 10:39:59 BRT não valida um SHA publicado posteriormente.

Station agora recusa app com SHA diferente do checkout, seed reduzido ou sem
denominador 39/39, pool com identidade/baseline/isolamento/capacidade inválidos
e relatório resumido incompatível com seus detalhes. Baseline reproduziu READY
com processo de outro SHA. **LOCAL_VALIDATED para tooling/negativos; estação
definitiva NOT_VERIFIED**. Stack deste executor observada BLOCKED, sem setup/seed;
não é LAB_VALIDATED da jornada canônica nem STATION_READY do proprietário.

Production: status GitHub Vercel failure na base, eventos/listagem Vercel **403**
no scope autorizado; causa inicial remota não confirmada. Configuração completa
passa estruturalmente em topologia sintética descartável; faltas/incompatibilidades
e refs não aprovados são recusados. Atribuições Demo/Production continuam vazias.
Pilot read-only: marker surface-hardening, sem marker de ambiente, 41/190 nomes
RPC exigidos presentes; 39 migrations pendentes até external-proposals-1.
**M3/M4/M5 não promovidos**, recovery/cutover hospedados NOT_RUN.

Gates locais: npm ci, check:all, build, security/governance/routing/budget e
testes da área PASS; banco/Auth/Storage/seed locais e Firefox/WebKit NOT_RUN
nesta rodada. CI/M2 desta alteração depende dos quatro gates no HEAD próprio
da PR; CI da base não é herdado. Nenhum arquivo visual, migration, workflow,
dependência, configuração ou dado hospedado alterado. Evidências, matriz M3,
rollback e riscos: [relatório de release assurance](evidence/codex-release-assurance-2026-10-22.md).

## 21/10/2026 — V3.7: prova pública e identidade da prontidão local

Base `main@ca879292`; branch `codex/v37-demo-reliability`. Visita pública
no SHA completo: HTTP/assets e Chromium desktop/mobile PASS (17 etapas por
viewport), classificada como visita informativa/simulação synthetic-fixtures,
sem backend hospedado canônico. Station passa a exigir JSON de readiness ligado
a SHA/máquina/lockfile/smoke e schema/runtime canônicos; negativa reproduziu READY
indevido com relatório de outro commit na baseline. Estação definitiva Windows/WSL2:
**STATION_NOT_VERIFIED**. Auditoria financeira sintética e PostgreSQL integral
PASS; produção **ACCESS_BLOCKED** por 403 nos logs; M3 **BLOCKED**, atribuições
inalteradas. Código novo M1/local; M2 exige quatro gates no HEAD próprio da PR.
Evidência e plano operacional: [relatório V3.7](evidence/codex-v37-demo-reliability-2026-10-21.md).
Nenhuma promoção M3–M6 ou mutação hospedada.

## 20/10/2026 — Decisão estratégica v3.7: segmentação tripla, adoção de instituições e qualidade integral

**STATUS: NORMATIVE_DECISION / HYPOTHESIS, SEM FEATURE OU DEPLOY NOVO.** Guideline §§39–44: `docs/ARANDU_PRODUCT_ENGINEERING_GUIDELINES.md`. Desenho de serviços e jornadas: `docs/ARANDU_SEGMENTED_PRODUCT_OPERATING_MODEL_V37.md`. Pesquisa, evidências e aceitação: `docs/ARANDU_V37_EVIDENCE_AND_DECISION_GATES.md`. Esta atualização documental NÃO muda M0–M6, **não** promove P0-A/P0-B e **não** afirma receita, clientes, plano comercial ou integração bancária.

| ID | Direção core e entrega possível | Status neste registro | Gate para executar/afirmar sucesso |
| --- | --- | --- | --- |
| N37-SEG | Plataforma única com Essencial/Gestão/Enterprise por complexidade; mesma segurança e domínio | **DECIDIDO / PLANOS NÃO IMPLEMENTADOS** | Pesquisa ICP e jobs por porte; entitlement server-side, política comercial, QA de upgrade/downgrade e suporte |
| N37-ICP | Gestão como primeiro candidato de investigação; Essencial/Enterprise mantidos | **HIPÓTESE NÃO VALIDADA** | Entrevistas com compradores dos três perfis e comparação de tarefas/WTP |
| N37-BUYER | Primeiro valor sem conta de banco, usando relacionamento ou contrato existente | **TARGET; capacidades parciais já no core** | Teste humano e evidência de esforço líquido; verificar backend e UX antes de marcar concluído |
| N37-INST | Instituição tem valor próprio: convite compreensível, resposta/recusa sem atrito, workspace opcional, integração só após prova | **VISÃO / ADOÇÃO NÃO COMPROVADA** | Sessões reais instituição; tempo, recusa, retorno, identidade/isolamento e segurança de convites |
| N37-EXT | Propostas recebidas fora do portal com emissor, canal, arquivo/versão, autoria do comprador e revisão | **TARGET; NÃO PRESUMIR CONCLUÍDO** | RLS, anti-spoof, arquivo hostil, reconciliação, idempotência e UI honesta |
| N37-CENTER | Central contextual por banco/entidade ligando módulos existentes sem duplicar storage | **DESENHO-ALVO, NÃO NOVA FEATURE ENTREGUE** | UX de próxima ação + composição autorizada; fonte/partial state, E2E por persona |
| N37-TRUST | Dossiê do Passport por finalidade e destinatário, sem falsa validação | **DIREÇÃO / base de evidência #246 existente** | Policy granular, versionamento, revogação futura e parecer jurídico sobre compartilhamento |
| N37-COST | Medir redução líquida de trabalho e custo de serviço por fluxo/porte | **HIPÓTESE SEM BASELINE DE CLIENTE** | Tarefa observada, custo de preenchimento, ciclo de retorno e comparador da alternativa |
| N37-QUALITY | UX, permissão, erros recuperáveis, desempenho, suporte, integridade e incidentes por superfície | **CRITÉRIO NORMATIVO; NÃO CERTIFICAÇÃO** | QA, segurança, teste usuário, operação e provas no ambiente correto |
| N37-LEGAL | Revisão de monetização, conflitos, consentimento, documentação, dados e termos | **OWNER_ACTION_REQUIRED** | Parecer humano; não usar dados reais, contratação ou anúncios de conformidade antecipadamente |

**Regra de precedência:** 29/10 mantém P0-A (link público no SHA aprovado) e P0-B (station READY na máquina definitiva). M3 continua trilha técnica P1 independente e BLOCKED até seus gates. A PR v3.7 é DOCUMENTAL; não reclassificar qualquer item por sua integração. O histórico v3.6 abaixo permanece como fotografia da data, sem atualização retroativa.

---




## 20/10/2026 — Direção v3.6: benchmark, adoção bilateral e contrato de performance

**Status: decisão documentada; NÃO é entrega, deploy, teste de performance ou validação com clientes.** Fonte: guideline §38 e \`docs/FINANCIAL_COMPETITIVE_EXECUTION_PLAN_2026-10-20.md\`. Preservados §37/P0-A/P0-B para apresentação de 29/10, M3 como P1 separado e os gates M1–M6. Nenhuma linha existente foi promovida de maturidade.

| ID | Trabalho e risco atacado | Prioridade após os P0 | Estado real neste registro | Próxima evidência obrigatória |
| --- | --- | --- | --- | --- |
| N36-P0-A | Visita pública fiel ao SHA, buyer/provider, assets, responsividade e verdade de simulação | **P0-A inalterado** | URL/SHA servido e paridade externa **NOT_PROVEN** nesta revisão documental | HTTP + navegador anônimo real contra arandu-demo; screenshots, SHA e artefatos |
| N36-P0-B | Demo canônica com backend e estação final do owner | **P0-B inalterado** | Máquina definitiva **NOT_PROVEN** | Freeze + station READY + jornada na própria máquina |
| N36-P1-A1 | Portal instituição de baixo atrito e workspace de oportunidades; adoção bilateral | **P1-A** | D33-12 ainda precisa de validação de entrega; **nenhuma implementação neste registro** | E2E de convite, rascunho, revisão, estados, mobile e isolamento, avaliação com instituição |
| N36-P1-A2 | Primeiro valor e onboarding por intenção, histórico por instituição | **P1-A** | D33-09/14 **PARTIAL**; pesquisa real pendente | Usuário conclui jornada por objetivo/contrato existente sem assistência; métricas sem PII |
| N36-P1-A3 | Proposta externa com origem e confirmação humana | **P1-A** | Gap/escopo a auditar contra capacidades existentes; **não reivindicado** | Proveniência por campo, testes arquivo hostil, RLS, revisões, no duplicate, UI honesta |
| N36-P1-A4 | Validação com usuários de ambos os lados | **P1-A** | D33-16 **OWNER_ACTION_REQUIRED** | Sessões com papéis reais, taxa de conclusão, tempo, bloqueios e hipótese reavaliada |
| N36-P1-B | Demo hospedada canônica Auth/RLS/Storage + recovery/cutover autorizados | **P1-B**, mesmo P1 de §37 | M3 **BLOCKED/NOT_PROVEN** | Preservação, restore e provas hospedadas, sem confundir tour com backend |
| N36-P2-A | Piloto controlado e ROI/WTP comprovados | **P2** | **NOT_STARTED / OWNER_ACTION_REQUIRED** | Liberação jurídica/operacional + métricas reais, sem afirmações comerciais inventadas |
| N36-P2-B | Integrações de fontes com ingestão idempotente e reconciliação | **P2** | API/webhooks base em código; conectores operacionais **NOT_PROVEN** | Dados autorizados, contrato versionado, source of truth, reconciliador e testes negativos |
| N36-P3 | FX/garantias/cash management/network/benchmark externo | **P3** | **DEFERRED** | Evidência de demanda, dados, maturidade de core e revisão jurídico-produto |
| N36-PERF | Web Vitals, latência, escalabilidade, integridade e recovery | **Transversal — não feature** | **Metas propostas, NÃO medidas nem SLA** | Protocolo por SHA/ambiente/dataset; RUM/lab, carga escalonada e falhas parciais |

**Metas de benchmark propostas, não SLAs:** Core Web Vitals p75 LCP ≤2,5s / INP ≤200ms / CLS ≤0,1 (referência web.dev); API leitura comum p95 ≤500ms; escrita p95 ≤1s; comparação de 10 propostas p95 ≤2s; erro elegível <0,5%. Escalonar carga com 10 org/30 usuários e 50 org/100 usuários, depois 10 mil contratos/100 mil observações sintéticas. Nunca declarar PASS sem medição real do ambiente e dataset especificados.

**Ordem operacional imediata:** concluir e provar P0-A/P0-B; preparação de P1-A e P1-B apenas sem atrasar a apresentação, respeitando ownership e gates. Claude Code prefere UX/portal/primeiro valor; Codex prefere identidade da publicação, smoke externo, prova técnica, performance/integridade. Revisão jurídica, dados de clientes, secrets e cutover continuam sujeitos a autorização. Não executar PR de feature baseada apenas nesta tabela sem reconciliar a \`main\` atual.


## 19/10/2026 — Repriorização oficial: link público atualizado e estação local como dois P0

**Decisão de prioridade, não prova de publicação.** A guideline v3.5 §37 e docs/PUBLIC_DEMO_2026-10-29_PRIORITY.md passam a orientar os próximos PRs. Nenhuma maturidade foi elevada por esta alteração documental.

| Resultado | Prioridade | Estado observado na main 18a2ccf | Próximo gate |
| --- | --- | --- | --- |
| Link arandu-demo.vercel.app fiel ao produto atual | **P0-A** | Status Vercel SUCCESS; última evidência de health indicava synthetic-fixtures. Acesso anônimo externo e fidelidade ao produto aprovado NOT_PROVEN | Provar acesso sem proteção, navegação comprador/provedor e mobile, assets, SHA, telas/capturas reais, limites da simulação |
| Estação local da apresentação | **P0-B** | Software e prepare-station validados em Linux efêmero (#235/#237); computador definitivo NOT_PROVEN | Freeze, station READY e smoke na própria máquina |
| Demo canônica hospedada com backend real | **P1** | BLOCKED; Demo sem atribuição ativa Supabase; recovery hospedado e cutover pendentes | Inventário/classificação, export e restore do mesmo conjunto, cutover autorizado, doctor e jornadas M3 |
| Production pronta a clientes | **P2** | Vercel Official FAILURE no SHA da base; logs sem acesso (403), M5 NOT_PROVEN | Logs autorizados, ambiente próprio, recovery e release formal |

Ações de código/UX da visita pública: Claude Code. Deploy, controle do SHA e testes externos, paridade técnica: Codex. Os agentes NÃO devem atualizar a matriz para PASS sem execução hospedada. Segurança crítica sempre precede prioridades comerciais.


## 19/10/2026 — Restore com identidade e reconciliação de schema

Base mainb5fa804, branch `codex/hosted-release-execution-readiness`. Restore
exige origem explícita, custódia privada sem links e fingerprint do mesmo
snapshot de export; contagens iguais não ocultam drift de schema/RLS/grants.
PG17.11/age1.3.2 sintéticos e teardown PASS; inventários e catálogo hospedados
relidos read-only. Dados legados continuam sob decisão humana, sem classificação
fictícia presumida. Export/restore hospedados NOT_RUN; Vercel ACCESS_BLOCKED403,
Demo sandbox readiness503, cutover/Production BLOCKED. Sem promoção M3/M4/M5.
Evidência: `docs/evidence/codex-hosted-execution-readiness-2026-10-19.md`.
M2 depende dos quatro gates no HEAD próprio, registrados na PR.

## 19/10/2026 — Diagnóstico P0 e preflight vinculado à árvore atual

Base main4f98226, branch `codex/hosted-release-blocker-remediation`. Composição
somente leitura dos gates existentes por bloqueio, sem nova autorização de
release. Plano de conversão exige bundle atual; referências pending/placeholder
não comprovam export ou rollback. Inventários e grants relidos; classificação
humana e preservação hospedada pendentes. Demo canônica BLOCKED, Vercel 403,
M3/M4/M5 não promovidos. Evidências e ações externas:
`docs/evidence/codex-hosted-blockers-2026-10-19.md`. M2 depende do CI no HEAD da PR.

## 19/10/2026 — Diagnóstico hospedado e papéis de credenciais

Base main0eb6a4a; branch `codex/hosted-infrastructure-recovery`. Gate estrutural
agora recusa anon no campo service role e chaves trocadas/malformadas, com
regressões. Inventário read-only exato renovado; Pilot 14 linhas, legado 42
(oito registros potencialmente pessoais). Recovery PG17.11/age1.3.2 sintético
validado; preservação hospedada NOT_RUN. Demo canônica BLOCKED (sandbox público,
readiness 503). Acesso Vercel 403; causa causal do último erro oficial NOT_PROVEN.
Evidências: `docs/evidence/codex-infrastructure-recovery-2026-10-19.md`.
Nenhuma promoção de M3/M4/M5; M2 da alteração depende do CI no HEAD próprio.

## 18/10/2026 — Admissão de visitantes e capacidade verificável

Base `41513ee408f58dff6386eabea4d45f03205aeadd`; branch
`codex/p0-hosted-canonical-demo-release-20261018`. Corrigidos readiness de pool
sem identidades completas, omissão do teto de ativos e seleção de pessoa
incorreta no mesmo slug. Respostas truncadas/sem contagem exata são inconclusivas.
Ensaio determinístico novo: 2 e 10 sessões SQL independentes, sem dupla entrega;
10 sessões com teto 4 entregam exatamente 4. Manifesto/38 migrations e recovery
sintético reutilizados. Evidência e limites:
`docs/evidence/codex-hosted-demo-activation-2026-10-18.md`. Publicação ainda
sandbox no SHA da base; preservação hospedada, rollout e cutover não autorizados.
M3/M4 não promovidos; M2 depende dos quatro gates do HEAD final desta frente.

## 18/10/2026 — Paridade de artefatos e entrada real da Demo

Base `005676a0ddc10ccabdee9c728f653f8f13de6de8`; branch
`codex/p0-canonical-hosted-demo-20261018`. A publicação pública observada nessa
base ainda declara sandbox / `synthetic-fixtures`, com readiness 503. Novas
regressões exigem segredo de personas, RPCs de workspace e capacidade no
baseline esperado; build canônico compara rotas, entrypoints e hashes JS/CSS
Demo × Production. Evidências e limites:
`docs/evidence/codex-canonical-hosted-demo-2026-10-18.md`. Não promove M3/M4:
destino dedicado, autorização, recovery gerenciado e cutover continuam bloqueados.


## 18/10/2026 — Readiness sem liveness como falso GO e custódia de recovery

Base efetiva `c359cb97b0b943ebab91cf7d6e0da7c696af2a69`; #215–#220 ancestrais
confirmadas. Código `4a70697051d34fa4da0991449dc1e8195e7db02d`, branch
`codex/release-engineering-20261018`. Evidência e limites em
`docs/evidence/codex-release-2026-10-18.md` e JSON adjacente. CI próprio do
HEAD final deve ser conferido na PR; o CI da base não é herdado.

| Capacidade | Estado verificado | Limite / próximo gate |
| --- | --- | --- |
| Readiness e doctor | IMPLEMENTED / LOCAL_VALIDATED; schema/RPCs versionadas, Auth/settings, Data API, Storage e identidade; cache por valor; falha/inconclusão recusa GO | Catálogo não comprova bodies/grants/hooks; quatro gates no HEAD próprio e provas hospedadas continuam necessários |
| Candidato v3 / live check | LOCAL_VALIDATED; prova hosted_readiness obrigatória, SHA/ambiente exatos; liveness/READY não bastam | JSON declarado não autentica origem; não inventar prova para liberar candidato |
| Storage recovery | LOCAL_VALIDATED; bytes limitados durante streaming, escrita por objeto, paths/duplicatas/buckets e hardlinks recusados | Índice cresce por quantidade; limite 50 MiB por objeto; serviço gerenciado não reproduzido pela fixture |
| Transferência/custódia | LOCAL_VALIDATED; symlink de manifest reproduziu sobrescrita na baseline; O_NOFOLLOW e validação do descriptor preservam vítima | PUT condicional/readback mantidos; sem export real ou exclusão automática |
| Banco / recovery sintético | LOCAL_VALIDATED; PG17.6 integral, interleavings determinísticos, age1.3.2, mesmo conjunto com dois objetos/referências e RLS; teardown verificado | Uma tentativa intermediária falhou na inicialização pg_ctl, causa não comprovada; execução serial final PASS não comprova estabilidade |
| M3/M4 / apresentação | BLOCKED / C no estado observado | Pilot marker surface-hardening, sem v2/names/trigger; Vercel 403 mesmo scope. B requer Demo completa na estação; A requer hosted completo |

Build, check:all/deploy:check, security/governance/supply-chain, audit zero e
banco integral passaram localmente. Browser local NOT_RUN. Runbook de 29/10:
`docs/DEMO_PRESENTATION_2026-10-29.md`. Sem frontend, E2E, Compose/.state Claude,
workflow, dependência ou assignment alterado; sem operação hospedada sensível.
M3–M6 permanecem não promovidos.

## 17/10/2026 — Reconciliação de schema, decisão no commit e recovery do conjunto

Base `e459f901f89a92ab61cc35877e863a0abf8ab932` (#215/#216 integradas), branch
`codex/hosted-readiness-integrity-20261017`. Evidências desta rodada em
`docs/evidence/codex-hosted-readiness-2026-10-17.md`, contratos em
`docs/evidence/codex-hosted-api-handoff-2026-10-17.md`, procedimento em
`docs/HOSTED_SCHEMA_ROLLOUT.md`. O CI da #215 passou no SHA 3159ede; não é
herdado como prova do lote novo. CI final próprio registrado na PR desta rodada.

| Capacidade | Estado da rodada | Prova / limite |
| --- | --- | --- |
| Decisão × autorização vigente | IMPLEMENTED / LOCAL_VALIDATED | Novo defeito reproduzido após checagem e antes de INSERT; trigger checa ator/papel/entidade com locks até commit. Remoção/rebaixamento/escopo, ordem inversa e ausência de parcial passam |
| Upgrade do Pilot | LOCAL_VALIDATED | 38 migrations do manifesto desde surface-hardening; dump/restore sintético, falha injetada, recusa na fronteira destrutiva e retomada pelo marker real. SQL histórico sem transação recebe wrapper no bundle |
| Compatibilidade e HTTP | IMPLEMENTED / LOCAL_VALIDATED | PGRST202 → 503 schema_incompatible; assignments conserva JWT, sem fallback privilegiado. 429 do roteador tem rate_limited/Retry-After e correlação, sem mudar limites |
| Custódia de binários | IMPLEMENTED / LOCAL_VALIDATED | Manifesto/artefatos privados regulares e diretório sem symlink; hash correto não valida permissões 0644 |
| Recovery do mesmo conjunto | LOCAL_VALIDATED | PG17 + age + binários/HTTP sintéticos, referências de dois tenants, restore/reconciliação/RLS e teardown verificado. Auth/Storage gerenciados e configuração externa NOT_PROVEN |
| Performance de autorização | LOCAL_VALIDATED, fixture pequena | 100 chamadas v2 com escrita e rollback, p50/p95/p99 emitidos; interleavings determinísticos e contador de deadlocks. Sem SLA ou latência hospedada |
| M3 hospedado | BLOCKED | Pilot no marker antigo, sem v2/nomes/hooks/guardas e RPC antiga concedida; detalhe Vercel 403 no mesmo scope. Sem export, migration, configuração, cutover ou mudança de assignments |

Banco integral, check:all, build/deploy:check e audit zero vulnerabilidades
passaram localmente. Browser local NOT_RUN; CI próprio precisa dos quatro gates
no HEAD final. Sem frontend, Demo, E2E, workflow, dependência ou evidence Claude
alterados. Demo/Production seguem permanentes, Pilot transitório; M3–M6 não
promovidos. Rollback SQL conserva a guarda; rollout exige schema antes do app.

## 17/10/2026 — Fechamento da decisão antiga e autorização no commit do voto

Base `605c7f5a9ff619e18fec6f1e7160949d878f345a`, branch
`codex/enterprise-integrity-m3-20261017`. Evidência e limites em
`docs/evidence/codex-enterprise-integrity-2026-10-17.md`; contratos e rollout em
`docs/evidence/codex-integrity-api-handoff-2026-10-17.md`.

| Capacidade | Estado da rodada | Prova / limite |
| --- | --- | --- |
| Decisão pela versão vista | IMPLEMENTED / LOCAL_VALIDATED | Baseline aceitava RPC antiga sem versão e registrava v2; grants diretos fechados, implementação interna preservada. v2, conflitos, RLS e histórico passam no banco |
| Aprovação versus revogação | IMPLEMENTED / LOCAL_VALIDATED | Corrida determinística baseline gravava voto depois de remoção commitada; guarda na escrita serializa vínculo/grants. Ordens inversas, eventos e ausência de escrita parcial verificados |
| Nome do comprador no portal | IMPLEMENTED / LOCAL_VALIDATED | buyer_name aditivo, fonte do convite aceito, JWT, sem ampliar SELECT em organizações; outro provedor/tenant e membro removido recusados |
| Prontidão por tipo de falha | IMPLEMENTED / LOCAL_VALIDATED | Doctor distingue NOT_CONFIGURED, ACCESS_BLOCKED, SERVICE_FAILURE e CONNECTION_FAILED; espera marker e RPCs novos, probes conferem grants e trigger |
| Migration e regressões | LOCAL_VALIDATED; CI próprio pendente | Migration financial-enterprise-integrity-1, rollback compatível retém correções de segurança; clean/upgrade/reapply/rollback/RLS/concorrência aprovados em PG17.6 descartável |
| Recovery sintético | LOCAL_VALIDATED | Export cifrado/restore do mesmo backup com age 1.3.2; Auth/Storage/configuração hospedada e recuperação completa NOT_RUN/NOT_PROVEN |
| Operação hospedada / M3 | BLOCKED / não comprovado | Pilot observado no marker surface-hardening, sem v2, sessão ou hook; Official status FAILURE, Vercel detalhada 403 já registrado. Sem alterações hospedadas |

Nenhum frontend, Demo, E2E ou workflow modificado. Rate limit permanece intacto;
perfil local não introduzido sem contrato de identidade local não herdável.
Não promover M3–M6; resultados finais de CI no SHA exato serão registrados na PR.

## 17/10/2026 — Limites reais de documentos e logs de configuração

Base remota `0fb48d3e202cb71942a608fb427b0e7e2bec44e9` (#212). Branch
`codex/enterprise-platform-release-20261017`. Evidência desta execução:
`docs/evidence/codex-enterprise-platform-2026-10-17.md`; contrato compatível e
handoff em `docs/evidence/codex-api-handoff-2026-10-17.md`.

| Capacidade | Estado desta rodada | Prova e limite |
| --- | --- | --- |
| Leitura de documento para extração | M1 / LOCAL_VALIDATED | Limite real durante streaming (10 MiB), cancelamento em overflow, sem fatos ou sucesso após falha; autorização e JWT preservados |
| Integridade de DOCX/XLSX | M1 / LOCAL_VALIDATED | Tamanho real e CRC conferidos, inflate limitado à declaração, entradas duplicadas/truncadas recusadas; negativos baseline falharam e evals positivos passam |
| Diagnóstico de ambiente | M1 / LOCAL_VALIDATED | URLs não são impressas e URL pública com credenciais/query/fragmento é recusada; guardas de assignment inalterados |
| Banco e gates locais | LOCAL_VALIDATED | check:all, build, audit zero vulnerabilidades, superfície/navegação e PostgreSQL 17.6 descartável (clean/upgrade/reapply/rollback/RLS/concorrência) passaram; CI final próprio continua necessário |
| Recovery de banco sintético | LOCAL_VALIDATED | PostgreSQL 17.6 + age 1.3.2: export cifrado, restore do mesmo backup e reconciliação; não equivale a recovery hospedado completo de Auth/Storage/configuração |
| Demo/Pilot/Production hospedados | INCONCLUSIVE / ACCESS_BLOCKED | GitHub da base: Demo/Pilot SUCCESS, Official FAILURE; Vercel detalhada 403 no scope lucas-projects467; Supabase lista Pilot e legado. Nenhuma mutação hospedada |

Nenhuma migration, grant, frontend, seed, E2E, lockfile ou workflow alterado.
M3–M6 não promovidos. A causa efetiva do build hospedado permanece inconclusiva;
conversão/recovery hospedados exigem acesso, classificação e aprovação própria.

## 16/10/2026 — O veredito do ensaio Demo inclui recovery, teardown e arquivamento

Base reconciliada: `origin/main@168e60d3a5ae12ecf2e9e671e3369a2855336e14`.
PR #207 e #208 estão integradas; os quatro gates da #208 passaram no run
`38943086346`. Nesta rodada, os status GitHub associados à main mostram
`arandu-demo` SUCCESS, `arandu-pilot` SUCCESS e `arandu` FAILURE. A leitura
detalhada do escopo Vercel `lucas-projects467` continua ACCESS_BLOCKED por 403
previamente observado. Nenhum datasource/schema hospedado foi inferido.

O relatório anterior da integração efêmera era emitido antes do teardown e do
upload do artifact, sem decisão que os incluísse. O workflow agora gera B apenas
com SHA completo e todos os outcomes, inclusive cleanup e artifact; qualquer
falha/skip dá C, e hosted M3 sempre fica NOT_PROVEN. C também encerra o processo
de resumo com exit 1 para impedir status verde em NO-GO, coberto por teste
negativo. O preflight exige Node 24 e ferramentas `age`/`age-keygen`. Detalhes,
reprodução e limites em
`docs/evidence/codex-demo-release-2026-10-16.md`; ensaio e critérios da Demo em
`docs/DEMO_RELEASE_REHEARSAL.md`.

| Capacidade / prova | Estado observado | Evidência | Próximo gate / limite |
| --- | --- | --- | --- |
| Veredito do ensaio da Demo | LOCAL_VALIDATED; CI_VALIDATED no SHA de código `3d8e92b`; repetição efêmera atual em andamento | Run Arandu CI `38961465310`: quatro gates SUCCESS no SHA exato. Assessor B/C negativo/positivo passou. Resumo B→exit 0 e C→exit 1 verificados diretamente; regressão do exit code aguarda execução CI do HEAD publicado. Ensaio `38961187110` emitiu B no código `891e266`; repetição serial no SHA atual não presumida como aprovada | Verificar repetição efêmera e os quatro gates no HEAD final; B prova só laboratório, nunca M3 |
| Demo e Production hospedadas | Demo/Pilot deployment status SUCCESS; Production status FAILURE; detalhes INCONCLUSIVE/ACCESS_BLOCKED | Status GitHub consultados em `168e60d`; scope Vercel detalhado 403; assignments ativos `demo=[]`, `production=[]` | Acesso read-only autorizado no mesmo scope, identidade do datasource/schema e decisão sobre origem/destino antes de qualquer operação |
| Recovery hospedado e conversão | NOT_RUN; recovery sintético CI passou | Ensaio efêmero executou restore isolado PostgreSQL+Storage no runner; nenhum export, restore, migration, cutover ou alteração de segredo hospedado | Classificar dados, aprovar snapshot/custódia durável e provar restore hospedado (incluindo Auth/config) antes de qualquer cutover |
| Gates de release | 1/13 no nível mínimo declarado | `npm run check:evidence`; `migration_ci` possui referência de 11/08/2026; 12 demais gates `not_started` | Não converter estado de CI em evidência externa; tratar decisões/acessos listados na evidência desta rodada |
| Validação local | Parcial por restrição do executor | Build, backend, segurança, migrations, platform e `git diff --check` PASS; npm audit passou na repetição com rede. Subprocessos Node recebem EPERM; Docker daemon negado e psql/age ausentes | `npm run merge:gates -- 209` não acessou a API (`fetch failed`); conector GitHub confirma 4 gates e main ancestral no SHA `3d8e92b`. Não houve merge |

**Maturidade:** M3 continua **NOT PROVEN**. O status Vercel de Demo SUCCESS
não confirma deployment detalhado, datasource, schema, Auth/RLS/Storage,
isolamento nem recovery real. A execução completa de laboratório e a
conversão/cutover dependem de executor com Docker/PG tools e decisões/acessos
externos. Nenhum guard foi relaxado.

## 16/10/2026 — Evidência de release não pode promover ensaio local a prova externa

Base revalidada: `origin/main@ab3dda8d8a65c621855b8774bd30180d7366f690`, com os
quatro gates obrigatórios e merge audit SUCCESS. Corrigido um falso positivo em
`lib/release-evidence.mjs`: alegações `externally_verified` agora exigem um
ambiente hospedado reconhecido e rejeitam origens identificadas como local,
CI, fixture, mock, synthetic, rehearsal ou runner. Regressões reproduzíveis e
limites desta alteração estão em
`docs/evidence/codex-release-readiness-m3-2026-10-16.md`.

| Capacidade / prova | Estado nesta branch | Evidência | Próximo gate / limite |
| --- | --- | --- | --- |
| Validador de evidência externa | LOCAL_VALIDATED | Baseline aceitava `localhost` e `production` com origem `local_rehearsal`; testes negativos agora recusam ambos e mantêm prova Demo com origem externa aceita | CI nos quatro gates no SHA da PR; o validador analisa evidência declarada e não autentica por si só a fonte externa |
| Main e status de deployment | CI_VALIDATED na base; M3 NOT_PROVEN | `ab3dda8`: database, deploy-boundaries, validate, presentation e merge-audit SUCCESS; status GitHub Demo/Pilot SUCCESS e Official FAILURE | statuses não comprovam alias, datasource, schema, Auth/RLS/Storage ou recovery; Official FAILURE sem causa detalhada acessível |
| Demo canônica hospedada | ACCESS_BLOCKED / INCONCLUSIVE | Não foi encontrado projeto Supabase dedicado à Demo na listagem read-only; consultas detalhadas Vercel ao scope autorizado continuam bloqueadas pelo 403 previamente observado | obter leitura autorizada do projeto `arandu-demo` e do scope, depois vincular deployment/SHA, ambiente, datasource/schema, readiness e provas de isolamento |
| Recovery hospedado e cutover | NOT_RUN | Nenhum export, restore, migration, secret, binding ou dado hospedado alterado | classificação/preservação autorizada, restore isolado do mesmo snapshot e validação Auth/Storage/config são pré-requisitos; nenhum M3 inferido de CI |
| Suíte local | PARCIAL; limitações ambientais | backend, security, migrations, build, release evidence e release-candidate passaram; governance/staging/supply-chain mutations falham em subprocessos Node com `EPERM`; Docker daemon negou acesso e npm audit não alcançou proxy | reexecutar checks bloqueados em runner autorizado; não promover stderr vazio a PASS |

**Maturidade:** M3 continua não comprovado. Esta mudança reduz risco de classificação falsa em evidência, mas não muda topologia, status hospedado, schema, recovery ou autorização operacional.

## 16/10/2026 — PATCH seguro de tarefas, filtros e reconciliação M3

Base revalidada `main@8d1a18d39d0d5b72bdd5c8382d3240012f6d30e5`. Os quatro gates
obrigatórios e o merge audit SUCCESS nesse HEAD. A API de tarefas foi corrigida
para não confirmar PATCH com representação vazia e recebeu filtros/paginação
server-side aditivos. Evidência e limites operacionais:
`docs/evidence/codex-m3-api-hardening-2026-10-16.md`.

| Capacidade / prova | Estado observado nesta branch | Evidência | Próximo gate / limite |
| --- | --- | --- | --- |
| PATCH de tarefa ausente/invisível | LOCAL_VALIDATED | baseline reproduziu HTTP 200 + representação vazia como falso sucesso; correção exige linha retornada e responde 404 neutro, igual para RLS/ausente/remoção concorrente | quatro gates no HEAD da PR; `test:database` não executou localmente por falta de `psql`/daemon Docker |
| Erro de assignment | LOCAL_VALIDATED | ator sem papel: `task_assignment_forbidden`; alvo inelegível: `task_assignee_unavailable`, mensagem sem motivo/membership | validação SQL existente segue autoritativa; sem mudança de dados/schema |
| Filtros de tarefa | LOCAL_VALIDATED | `status`, `assignee_id`, `unassigned=true`, todos na consulta sob RLS; lookup de nome permanece limitado às linhas autorizadas | Claude pode adotar filtros sem alterar API; não usar filtro client-side como controle de acesso |
| Paginação de tarefas | LOCAL_VALIDATED | cursor keyset determinístico `(due_on NULLS LAST, created_at, id)`, limite 1–200, `has_more` por uma linha extra, sem contagem global | interface pode continuar com primeiras 200 linhas ou consumir `next_cursor`; filtros devem ser repetidos nas páginas |
| Official e prontidão hospedada | INCONCLUSIVE / ACCESS_BLOCKED | GitHub: Demo/Pilot deploy SUCCESS e Official FAILURE no SHA; Vercel detalhada 403. Guard local recusa ambiente/ref sem atribuição conforme esperado. Pilot SQL read-only confirma schema antigo, sem assignment/revogação/config `db_pre_request`; sem Demo Supabase listado | nenhuma causa hospedada de Official comprovada; sem datasource Demo, schema atual, probes Auth/Storage ou recovery hospedado; M3 não atingido |
| CI/local | BASELINE CI_VALIDATED; branch aguardando CI | main atual: quatro gates + merge audit SUCCESS. Branch: API, backend, security, migrations e build passaram; `check:all`/`check:finance` param em stderr vazio de subprocessos; PostgreSQL e audit npm bloqueados pelo executor/proxy | aguardar CI da PR no HEAD exato; não contar testes de banco/audit como PASS local |

## 15/10/2026 — Responsabilidade persistida de tarefas e reconciliação M3

A branch `codex/task-accountability-m3-20261015`, baseada em `b84efd3e822a7aa4ef4c89647047f9b9692c7baa`, implementa a migration aditiva `financial-task-accountability-1` e estende `GET/POST/PATCH /api/finance/tasks` e `overview.tasks` com `assignee_id`/`assignee_name`. Testes de autorização no banco e API cobrem mesma organização/entidade, papéis, remoção/offboarding, auditoria, idempotência e concorrência. Tarefas antigas ficam sem responsável; não há herança automática ambígua nem concessão de acesso ao objeto relacionado. Migration ainda não foi aplicada em hospedagem. A matriz de readiness e testes detalhados estão em `docs/evidence/codex-task-accountability-m3-2026-10-15.md`.

| Capacidade / prova | Estado observado nesta branch | Evidência | Próximo gate / limite |
| --- | --- | --- | --- |
| `fin_tasks` com responsável persistido | M1 / LOCAL_VALIDATED | `test:database` PASS em PostgreSQL 17.6 descartável, incluindo clean install/upgrade, RLS, atribuição, retry idempotente, auditoria e corridas; migration/rollback aditivos, sem dados existentes reescritos | confirmar quatro gates no SHA exato e aprovação; migration hospedada segue separada e não autorizada nesta missão |
| Demo/Pilot hospedados | INCONCLUSIVE / ACCESS_BLOCKED | status GitHub para baseline `b84efd3`: Demo e Pilot deployment SUCCESS; sem identidade de datasource, logs ou schema vinculados | fonte autorizada para datasource/schema e probes autenticados |
| Production hospedada | FAIL no status Vercel; causa desconhecida | status FAILURE para baseline `b84efd3`; logs/configuração indisponíveis | diagnóstico read-only autorizado, corrigir causa comprovada e validar release exato |
| Recuperação real | NOT_RUN | sem export/restore hospedado; recuperação sintética não prova Auth/Storage/config externa | autorização, snapshot custodiado, restore isolado do mesmo snapshot e probes completos |

**Maturidade:** M3 não atingido. CI e validações locais não comprovam deploy, datasource, schema, autorização efetiva nem recovery hospedado. Nenhuma migration, segredo, banco ou binding hospedado foi alterado.


## 15/10/2026 — Readiness operacional pós-#199

**Atualização desta rodada:** a migration aditiva `financial-implementation-task-labels-1` padroniza os rótulos legíveis das tarefas de implantação, mantendo `kind` estável e preservando títulos humanos via backfill por correspondência exata. Validada em PostgreSQL descartável com teste direcionado; não aplicada em hospedagem. Persistência de responsável para `fin_tasks` segue não implementada e não deve ser inferida como autorização.

Durante a rodada, #200 foi integrada e `main` avançou para `bf6eb712bb17739d173e4b6c258e9b7ed90b15bc`; branch desta trilha incorporou-a. PR #201 foi integrada em `45323515403bbab26a017936fdafa8003da63ce4`; CI `38813025926` passou os quatro gates obrigatórios no HEAD `0d675bacaecc9fc665c0642c2b9ae8ba99fad176`, e merge audit `38815216716` passou na main resultante. Esta matriz e a evidência operacional estão sendo adicionadas por PR documental de seguimento, que ainda requer gates no novo HEAD.

Baseline confirmada no GitHub e na ref local `main@0aeb2e6c93bc0abbd1f4b4fc8ce91b62171fcaf5` (#198 e #199 ancestrais). CI run `38804369287`: `database`, `deploy-boundaries`, `validate` e `presentation` SUCCESS no SHA exato; merge audit `38804369334` SUCCESS. PR aberta observada: #177 (Dependabot; fora desta trilha). Node `v24.19.0`. Diagnóstico e validações desta rodada em `docs/evidence/codex-operational-readiness-2026-10-15.md`.

| Capacidade / prova | Estado observado | Evidência atual | Próximo gate / limite |
| --- | --- | --- | --- |
| Backend e recovery no repositório | M2 no HEAD da main; mecanismo segue M1/M2 conforme capability | `npm ci --include=optional`, `check:all`, `build`, `test:database` (PostgreSQL 17.6 descartável), `audit:ci` e `test:e2e:list` (795 casos listados) passaram localmente; não foi executado browser E2E | esta validação pertence a `0aeb2e6`; alterações desta rodada exigem seus próprios testes e quatro gates |
| Projeto Supabase Pilot `offgpyysgdhfemjlchod` | BLOCKED para M3 | leitura autorizada: `ACTIVE_HEALTHY`, PostgreSQL 17.6, marker `financial-surface-hardening-1`, sem `deployment_environment`; 3 migrations registradas; 33 tabelas `fin_*` e 33 policies; 0 tabelas públicas sem RLS; usuário/fator MFA = 0; bucket privado `fin-documents` com limite 10 MiB e MIME allowlist | `financial-session-revocation-1` não consta; funções `fin_request_session_guard()` e `fin_current_session_alive()` ausentes; configuração `pgrst.db_pre_request` ausente nos settings consultados. Aplicação exige recovery/aprovação; sem teste HTTP autenticado não declarar alcance comportamental |
| Storage/Auth hospedados do Pilot | INCONCLUSIVE para efetividade funcional | catálogo somente leitura: 1 bucket privado e 0 policies no schema `storage`; Auth tinha 0 usuários e 0 fatores MFA. Advisor reportou 43 funções `SECURITY DEFINER` executáveis por `authenticated` (WARN) e 30 tabelas com RLS sem policy (INFO, recusa por padrão) | reconciliar permissões e advisors com o schema/migration esperados; validar Auth, Storage e RLS com identidades sintéticas após rollout autorizado. Nenhum dado de objeto/usuário foi lido |
| Projeto Supabase legado `igacnfjeuqhxcmfyepgj` | NÃO É Production financeiro | leitura de catálogo: ativo, PostgreSQL 17.6, sem migrations registradas, `fin_settings` ausente, zero tabelas `fin_*`, zero bucket e zero usuário/fator MFA | preservação, classificação e decisão de cutover continuam bloqueando; não usar como banco de Production nem exportar/restaurar sem autorização |
| Demo canônica hospedada | BLOCKED / datasource inconclusivo | GitHub recebeu status Vercel de sucesso para o projeto `arandu-demo`, associado ao commit `0aeb2e6`; não foi possível verificar alias, ambiente, datasource ou health exato. A listagem Supabase só contém Pilot e legado — nenhum projeto dedicado de Demo | acesso read-only autenticado ao escopo Vercel ou prova pública equivalente; depois recovery/seleção do slot, cutover aprovado, doctor, canário e jornadas autenticadas |
| Production hospedada | FAIL no status de deploy; causa INCONCLUSIVE | status Vercel `arandu` falhou para `0aeb2e6` (deployment `KrFrUJ8MGgJfh8D4pM9dPJQHgWeE`); logs/configuração não lidos. Não atribuir causa ao build/código/env | recuperar acesso read-only Vercel no escopo autorizado; manter o guard e não promover |
| Pilot Vercel | sucesso técnico de deployment associado ao SHA; não é ambiente permanente nem prova de M3 | status GitHub Vercel `arandu-pilot` SUCCESS no commit `0aeb2e6` | tratar só como estágio de validação; nenhuma migration ou cutover hospedado foi executado |
| Recovery hosted | NOT_RUN | nenhum export, restore, migration ou configuração hospedada alterados; mecanismo sintético existente permanece sem prova de ambiente real | autorização, identidade exata, classificação, custódia durável, restore do mesmo export incluindo Auth/Storage/config essencial, probes e jornada no SHA/schema corretos |

**Maturidade:** M3 não atingido. Código e CI verdes não fecham o gap: o Pilot hospedado está em schema antigo sem o hook de revogação de sessão, a Demo não tem datasource canônico comprovado e Production falha no status de deployment. Não promover `ACTIVE_SUPABASE_ASSIGNMENTS`, reduzir guardas ou inferir causa de build sem evidência.

## 15/10/2026 — Plataforma: datas, histórico do provedor e prova de recovery

Base revalidada `main@f66136edcb01b8065661baebd3309fd722ceb113` (#196 e #197
ancestrais). Quatro gates da main SUCCESS no run `38757947129`; merge audit
`38757947078` SUCCESS. Evidência desta entrega e limites em
`docs/evidence/work-platform-m3-2026-10-15.md`. Nenhum frontend, migration,
segredo, banco hospedado ou atribuição ativa alterado.

| Item | Estado comprovado | Evidência | Próximo gate / limite |
| --- | --- | --- | --- |
| API `days_to_end` por calendário UTC | M1 / LOCAL_VALIDATED | baseline 84 em vez de 85 à tarde; 40 fronteiras temporais passam; `review_from` preservado | CI no HEAD final; calendário local do navegador pode diferir perto da meia-noite |
| Histórico financeiro do provedor | M1 / LOCAL_VALIDATED | `history[].terms` dos snapshots e `rfq_revision` nas duas consultas; regressão baseline vermelha, negativos JWT/organização/concorrente passam | Claude pode consumir termos históricos; limites de paginação anteriores mantidos |
| Recovery compara limites/MIME e conjunto de buckets | M1 / LOCAL_VALIDATED | falso MATCH reproduzido; negativos passam, registros exigem `reconciliation_version:2` | prova antiga exige repetir restore do mesmo export isolado; não certifica configuração externa |
| SHA real do checkout no resumo da integração efêmera | M1 / LOCAL_VALIDATED | merge commit executado separado do HEAD PR; teste baseline vermelho, CI-demo 20/20 | execução do workflow no SHA final; nenhum gate relaxado |
| Regressões integradas | LOCAL_VALIDATED | check:all, build, listagem E2E, audit (0 vulnerabilidades), test:database PG17, export/restore cifrado sintético com age e diff --check PASS | M2 somente com quatro gates no HEAD final e base atual contida, registrados na PR |
| Demo/Production hospedadas | BLOCKED para M3 | Demo health no SHA base ainda `synthetic-fixtures`; Production deployment failure e health 404; Vercel config/logs/env 403 | autorização/custódia para recovery real, classificação, restore Supabase compatível, cutover e provas hospedadas |

Os registros históricos abaixo preservam o estado conhecido em cada rodada;
esta seção resolve as duas dependências de backend da #197 sem atribuir M3.

## 15/10/2026 — Clareza de produto: comparação, decisão, contratos e Painel (lote UX)

Base: `main` @ `57afa79` (#195), atualizada com `ee69005` (#196, trilha de plataforma do Codex; evidência própria em `docs/evidence/codex-foundation-2026-10-15.md`, sem sobreposição de arquivos). Detalhe, antes/depois e dependências de backend em
`docs/evidence/claude-product-2026-10-15.md`. Só interface (`finance/**`), testes
E2E e o checador de design; nenhuma API, SQL, migration, workflow ou ambiente
hospedado alterado.

| Item | Estado | Evidência | Limite |
| --- | --- | --- | --- |
| D33-10 — comparação mostra a condição alterada na versão atual (valor anterior na célula) e a cobertura por proposta | M1 + local | E2E `comparação: condição alterada…` (falha no código anterior); Demo local: Atlas Bank v2 com 5 condições marcadas, desktop e 390 px | Firefox/WebKit NOT RUN localmente; M2 só com os quatro gates no HEAD da PR |
| §36.2 na interface — conflito de versão na decisão mostra o que mudou e exige confirmação antes de nova tentativa | M1 + local | E2E `decisão com versão alterada pelo provedor…` (409 `proposal_version_changed`; segunda tentativa bloqueada sem confirmação; `expected_version` 1 → 2) | a regra de servidor segue a de `financial-decision-integrity-1` |
| Painel × Contratos com a mesma contagem de dias e categoria sem código interno | M1 + local | E2E `painel e contratos contam os mesmos dias…`; cartão de contrato reescrito com `days_to_end` errado de propósito | `days_to_end` da API segue arredondando por instante (dependência registrada, P3) |
| Saída não confirmada (`503 auth_logout_unconfirmed`, AUTH-1 da #196) aparece na tela de login como aviso, nunca como saída concluída | M1 + local | E2E `sair: resposta 503…` (falha no código anterior) e `sair: resposta 200…` | a revogação efetiva depende do Auth (ver `docs/evidence/codex-foundation-2026-10-15.md`); não cobre Storage/Realtime/URLs assinadas |
| Constitution §2 aplicada: sem gradiente decorativo nem lavanda fora dos tokens | M1 + local | `check:design` recusa gradiente fora da lista funcional e as cores antigas (mutação negativa → FAIL) | — |

## 15/10/2026 — Recovery completo com binários do Storage (Stage 0.5, PR B)

Base: `main` @ `e0116af` (#193). Nenhum banco, Storage, segredo ou projeto hospedado acessado.

| Item | Estado | Evidência | Limite |
| --- | --- | --- | --- |
| Export/restore cifrado dos binários do Storage (`scripts/storage-recovery.mjs`) | M1 + local | ensaio `pilot-restore-drill.sh` sobre a Demo semeada: 6 objetos, negativos (ausente, adulterado, identidade errada), restore só do banco recusado (`missing_binary` 6/6), MATCH, permissões diretas negadas, `recovery_complete` COMPLETE (38/38 checagens) | M2 depende do job `demo-integration` no HEAD; **nada exportado do Pilot/legado** |
| Cadeia canônica exige binários (`recovery:verify` nível 5 só com Storage restaurado) | M1 + local | `test-storage-recovery.mjs` com `verifyExport` real: DATABASE_ONLY = nível 4 | idem |
| ACLs do schema `storage` no restore (achado) | corrigido no ensaio | probe `storage_grants`; sem os ACLs o `service_role` recebia `42501` | — |
| Falha mascarada no workflow da integração efêmera (`bash -e` sem pipefail com `| tee`) | corrigido | log da #191: `shell: /usr/bin/bash -e {0}`; nenhuma fase escondeu falha; autoteste exige `shell: bash` | — |

## 14/10/2026 — Stage 0: revogação de sessão, integridade da decisão e prontidão

Base: `main` @ `fa551c0` (#190). Detalhe e estados em
`docs/STAGE0_READINESS_2026-10-14.md`. Nenhum banco, segredo, atribuição ou
projeto hospedado alterado.

| Item | Estado | Evidência | Limite |
| --- | --- | --- | --- |
| R1 — token de sessão encerrada no PostgREST direto (`financial-session-revocation-1`) | M1 + local | `db_pre_request` confere `session_id` em `auth.sessions`: 401 `session_revoked` imediato após logout; +0,2 ms p50; `tests/database/financial-session-revocation.sql`, smoke do laboratório efêmero | M2 depende do CI no HEAD do PR; **não aplicada** em banco hospedado |
| D2/R3 — decisão vinculada a versão não vista; impasse envio × decisão (`financial-decision-integrity-1`) | M1 + local | `fin_record_decision_v2` com versão esperada (409 na API); ordem de locks RFQ → proposta; `financial-decision-race.sh` (duas sessões reais, falha sem a migration) | idem |
| R2 — oráculo de existência de UUID em RPCs definer | aceito (P3) | 59 de 171 RPCs com mensagens distintas; exige sessão viva e UUID vazado; API já iguala 404 | regra para RPC nova |
| Recovery / Demo canônica hospedada / Production | BLOCKED | `recovery:doctor`, `consolidation:check`, `release:candidate:check` recusam sem evidência; build de Production falha por desenho com allowlist vazia (reproduzido em cinco configurações) | runner e secrets de recovery; autorização |

## 14/10/2026 — Primeiro valor sem RFQ e incidente de merge da #184

Base: `main` @ `dba2d88` (#184). Estado: M1 + E2E (mocks da API); nada hospedado.

- Incidente de governança: a #184 foi integrada com o HEAD `a05b11d`, que não
  continha a ponta da `main` (`1e1aa20`, merge da #183). O merge-audit
  (`38457898151`) falhou corretamente (`behind`). Causa: o merge foi feito pela
  integração sem rodar `merge:gates`, e o GitHub reportou `mergeable_state:
  clean` porque a regra "branch atualizada" não está imposta no servidor (exige
  admin). Os quatro gates da #184 passaram no seu HEAD e a #184 só toca o
  frontend, sem conflito com a #183. Regra adotada pelo agente: antes de todo
  merge, `git merge-base --is-ancestor origin/main <HEAD>`, além dos check runs
  do HEAD exato. Nenhum histórico foi reescrito.
- Primeiros passos: novo passo "Registre um contrato que já existe" leva a
  `contracts.html?acao=registrar-contrato`, que abre o formulário de contrato
  existente (valor antes da primeira proposta, guideline v3.3). `?acao=` aceita
  só nomes simples e aciona o `data-intent` da própria tela, sujeito ao papel.

## 13/10/2026 — Ações sem gravação duplicada, aprovação com condições à vista e rascunho do provedor protegido

Base: `main` @ `ff9c9bb` (#181). Estado: M1 + testes E2E (mocks da API); nada hospedado.

- `button`/`iconButton` (finance/src/ui.js): ação assíncrona em andamento deixa o
  botão ocupado (`aria-busy`) e ignora novos cliques. Antes, "Ativar",
  "Aposentar", "Processar prazos" e afins mandavam uma gravação por clique.
- Caixa de aprovações: quem decide vê valor, taxa e prazo da proposta na própria
  linha, antes dos botões; pedido desatualizado não conta em "Aguardando você".
- Portal do provedor: rascunho com alteração pendente ou falha de rede avisa ao
  sair, salva ao ir para segundo plano e tenta de novo quando a conexão volta
  (paridade com o editor de solicitação).
- Testes: `tests/e2e/finance-policy.spec.js` (duplo clique, condições, pedido
  desatualizado) e `tests/e2e/finance-provider-draft.spec.js`; cada um falha sem
  a correção.

## 13/10/2026 — Fatos confirmados de documentos preenchem os termos do contrato

Base: `main` @ `5725915` (#180). Estado: M1 + testes locais e E2E (mocks da API);
nada hospedado.

| Item | Antes | Agora | Evidência |
| --- | --- | --- | --- |
| Document Intelligence × Contract Center | valor confirmado na revisão era redigitado no formulário de termos (limitação registrada em `FINANCIAL_DOCUMENT_INTELLIGENCE.md`) | `GET contract-fact-suggestions` (só leitura, JWT/RLS) + `lib/finance/fact-application.mjs`: fatos **confirmados** de documentos do contrato e da proposta que o originou preenchem só campos vazios, com documento, página e data da confirmação; conflito entre documentos, unidade incompatível e moedas diferentes viram aviso; nada é gravado sem a pessoa gravar a versão | `test-finance-contracts` (mapeamento, 4 recusas, conflito, moeda, adquirência, marcação, 404 sem consultar documentos, só GET com JWT); E2E `finance-contracts` 18 passed (Chromium desktop + mobile); suíte financeira 257 passed / 7 skipped |
| Benchmark | — | `ARANDU_COMPETITIVE_LANDSCAPE.md` §7: ERPNext (GPL-3.0, só leitura do código, nada reutilizado); SAP Ariba sem leitura possível (não verificado) | — |

Limites: sem captura visual antes/depois (`design:capture` exige a Demo local
com Docker, ausente: NOT RUN); Firefox/WebKit NOT RUN; ganho de redigitação é
hipótese, não medida.

## 13/10/2026 — Fechamento técnico pós-#179: recuperação real local, build de Production e requisito externo mínimo

Base: `main` @ `f00fd30` (#179; quatro gates success no HEAD `0ee4c79`). Nenhum
dado, segredo, atribuição, deploy ou projeto hospedado alterado.

| Item | Estado | Evidência | Limite |
| --- | --- | --- | --- |
| Migrations `financial-security-closure-1`, `financial-request-receipts-1`, `financial-followup-hardening-1` | M2 | `test:database` (instalação limpa, upgrade, rollback, reaplicação, concorrência) exit 0 local e job `database` success no CI da #179 | **não aplicadas** em nenhum banco hospedado |
| Cadeia de recuperação real | E2 local | `scripts/install-recovery-tools.sh` (PostgreSQL 17.11 e age 1.3.2 com checksum fixo) + `test-recovery-real.mjs`: export cifrado → verify → restore isolado → reconciliação, `VALIDATED` | sintético; `hosted_backup: NOT RUN`, compatibilidade Supabase não provada |
| Export hospedado (Pilot e legado) | BLOCKED | `consolidation-export.yml` exige runner `[self-hosted, linux, arandu-recovery]` e, no environment `database-recovery`: `ARANDU_PILOT_RECOVERY_DATABASE_URL`, `ARANDU_LEGACY_RECOVERY_DATABASE_URL`, `ARANDU_RECOVERY_RECIPIENT` e `ARANDU_RECOVERY_DIRECTORY` (store privado) ou `ARANDU_RECOVERY_DESTINATION` | esta sessão não lê nem grava secrets e não tem runner nem credencial de banco; nada foi fabricado |
| Build de Production (`arandu`) | BLOCKED (fail-closed correto) | reproduzido no HEAD: sem `ARANDU_ENV` o build para; com `ARANDU_ENV=production` e o ref legado, `finance:env:check` recusa o ref sem atribuição ativa e as ausências de anon/service key, `CRON_SECRET` e `ARANDU_SITE_URL` | log hospedado da Vercel inacessível nesta sessão; a causa remota não foi observada diretamente |
| `consolidation:check` / `release:candidate:check` | BLOCKED (esperado) | ambos recusam sem a evidência hospedada | — |
| Demo canônica hospedada | BLOCKED | sem atribuição ativa do Supabase DEMO e sem backup do Pilot | Demo local exige Docker (ausente neste executor) |

## 13/10/2026 — Pendências da #178: fila de e-mail, IP de origem e evidência de exceção

Base: `main` @ `7ccbfa6` (#176). Estado: M1 + testes locais; **nada hospedado
alterado**; a migration `financial-followup-hardening-1` não foi aplicada em
banco hospedado (as da #178 também não).

| Pendência | Causa comprovada | Correção | Evidência local |
| --- | --- | --- | --- |
| P0-A fila de e-mail | sem teto por organização/destinatário; claim em ordem global (20/dia) permitia inanição; nome livre da empresa no assunto | tetos por organização (60/h, 300/dia, 200 pendentes → convite recusado) e por destinatário (3/dia por organização, 5/dia somando → e-mail suprimido com trilha); contagem serializada por organização; claim em rodízio; nome com link vira descrição neutra | `financial-followup-hardening.sql` (blocos 0–5 reprovam após o rollback); rajada 10 → 5 (sem o lock, 10); `test-email-outbox` |
| P0-B `X-Forwarded-For` | primeiro valor do cabeçalho do cliente usado como IP em qualquer ambiente | `lib/client-address.mjs`: Vercel pela borda; proxy próprio só com `ARANDU_TRUSTED_PROXY_HOPS` (pela direita); senão só a conexão; IPv6 por /64 | `test-client-address`; `test-auth-api`: 13 logins com XFF girando → 429 |
| P0-C `fin_request_policy_exception` | evidência buscada em `fin_documents` e conferida com `fin_can_read_document` (só `fin_private_documents`): toda evidência com documento recusada | aceita documento privado legível pela pessoa ou referência externa no escopo de entidade; outra empresa, outra entidade, removido e interno do provedor recusados | bloco 6 reprova após o rollback (evidência legítima recusada) |

Lote 4 (segurança, mesma rodada): XLSX e DOCX ainda tinham regex preguiçoso sobre o
arquivo inteiro (`<si>`, `<row>`, `<c>`, `<w:t>`) e `<[^>]+>` na remoção de
marcação: 320 KB de `<si>` sem fechamento levavam 10 s (o teto de 24 MB, horas);
`&#99999999;` lançava `RangeError`. Varredura linear com o mesmo recorte; célula
autofechada não engole a seguinte e `<w:tab/>` não vira texto. O código anterior
não terminou o teste em 60 s; o novo roda a suíte em 0,4 s.

Ajustes de testes antigos: `email-outbox.sql` e `financial-pilot.sql` enfileiravam
para RFQ/contrato inexistentes; agora criam a origem real (a fila recusa e-mail
sem organização). `test:database` exit 0 (instalação limpa, upgrade, rollback,
reaplicação). Lote 2 (legado de arte): runtime já limpo; quatro estados
registrados em `docs/LEGACY_ART_RETIREMENT.md`.

## 13/10/2026 — Fechamento de segurança, criação idempotente de RFQ e recuperação de senha

Base: `main` @ `1664fb7` (#174). Auditoria de fronteiras (sessão/CSRF, API/IDOR,
SQL efetivo com as 61 migrations aplicadas, uploads/e-mail/logs); cada achado
abaixo foi reproduzido antes da correção e tem teste que reprova no código
anterior. Estado: M1 + testes locais; **nada hospedado foi alterado** (sem acesso
a Vercel/Supabase nesta sessão; as migrations não foram aplicadas em banco hospedado).

| Defeito comprovado | Correção | Evidência local |
| --- | --- | --- |
| Cookie de sessão sem assinatura: apagar o marcador `sso` escapava do limite de sessão, da revogação e da conexão desativada | HMAC-SHA256 (`lib/session-cookie.mjs`, chave derivada da service role, sem env novo); SSO conferido em toda requisição (cache 30 s) | `test-auth-api`: sem assinatura, `sso` removido, outra chave e revogado com token válido recusados; reprova no código anterior |
| Limite "por conta" era por IP + conta | teto de 100/h por conta em qualquer IP | 101 IPs contra a mesma conta → 429 na 101ª |
| PDF hostil (`<<>>` repetido) e hexadecimal sem `>` prendiam a extração (regex quadrático; laço infinito) | varreduras lineares | código anterior não terminou em 60 s; novo em ms |
| `fin_documents` sem escopo de entidade (leitura e anexo) | RLS com `fin_object_visible` | `financial-security-closure.sql` (6 blocos; todos reprovam após o rollback) |
| `fin_document_remove` removia documento de outra entidade | exige `fin_can_read_document` | idem |
| `fin_providers` gravável em todas as colunas (evidência regulatória e vínculo sem RPC) | grants por coluna | idem; teste antigo de procurement aceita a recusa mais forte |
| `fin_qualification_readiness` executável por qualquer usuário | `EXECUTE` revogado | idem |
| Webhooks da API v1 ignoravam escopo de entidade (listar/desativar/entregas/reenvio) | `fin_api_endpoint_allowed` | idem |
| Domínio SSO pendente de outra organização bloqueado para sempre | pendente/revogado vence em 7 dias; verificado não muda de dono | idem |
| RFQ duplicada ao repetir criação sem resposta | `request_key` por intenção (ligada ao conteúdo) + recibo na mesma transação (`financial-request-receipts-1`) | SQL + concorrência (6 envios → 1 RFQ; sem a migration, 6); E2E reprova na interface anterior |
| Recuperação de senha nunca concluía (token ficava no fragmento) | `POST /api/auth/update-password` sem abrir sessão; página apaga o fragmento | `test-auth-api`; E2E desktop/mobile |
| E-mail transacional saía numa linha só (HTML cortado em 4.000) | corpo preserva quebras; escape sem corte | `test-email-outbox` reprova sem a correção |

Gates locais no HEAD do lote: `check:all` exit 0; `build` exit 0; `test:database`
(Postgres 16.15) exit 0 com as duas migrations (instalação limpa, upgrade,
rollback, reaplicação); E2E financeiro Chromium desktop + mobile 251 passed /
7 skipped (antes da tela de recuperação; specs de login refeitas depois: 14
passed); apresentação 125 passed / 19 skipped. **Firefox e WebKit: NOT RUN**
(navegadores ausentes neste executor). `check:build-size`: aviso preexistente
inalterado (rota `rfq` a 91%).

Impacto operacional: ao publicar, **todas as sessões ativas pedem novo login uma
vez** (carga antiga sem assinatura). O seed da Demo e a jornada local assinam o
cookie com a mesma chave do app (precisam da mesma service role do alvo).
Rollback: `docs/rollback/supabase-financial-request-receipts.rollback.sql` e
`docs/rollback/supabase-financial-security-closure.rollback.sql`, nesta ordem;
revert do commit da aplicação reabre as lacunas descritas.

Itens abertos (não corrigidos nesta rodada): convite a provedor pode ser
abusado para enfileirar e-mails com texto livre do comprador (falta teto por
organização/destinatário e fila justa); `X-Forwarded-For` confiado fora da
Vercel (só afeta execução local); `fin_request_policy_exception` confere
evidência em `fin_documents` com `fin_can_read_document` (de documentos
privados) e recusa toda evidência (defeito funcional).

## 12/10/2026 — Falhas visíveis à pessoa: rede, banco e rascunho de RFQ

Base: `main` @ `5672c04` (#173). Estado: M1 + E2 local (Demo canônica em Docker, seed 36/36); nada hospedado.

| Defeito | Correção | Evidência |
| --- | --- | --- |
| Queda de rede/sem resposta: erro cru do navegador ("Failed to fetch") e tela presa em "Carregando…"; em escrita, sem saber se gravou | transporte com prazo (30 s leitura, 60 s escrita) e mensagem em português; escrita avisa que o resultado é desconhecido | E2E desktop/mobile; falha sem a correção |
| 4 exceções do banco caíam em "Operação inválida ou sem permissão." (performance fechada/sem confirmação/limite de cobertura; escopo do Passport) | mensagens com o que houve e o que fazer; teste exige tradução das 305 exceções ou justificativa de uso interno | `test-finance-api` acusa as 4 sem a correção |
| Rascunho de RFQ recuperado reabria na etapa 1 | retoma na primeira etapa incompleta, sem erros antecipados | Demo local + jornada de apresentação (125 passed) |

## 12/10/2026 — Varredura de UX/a11y e isolamento na Demo canônica local

Base: `main` @ `1dcb4d9`. Varredura das 27 superfícies (comprador, CFO, provedor) em 1440 e 390 px contra o produto real local (Supabase em Docker, seed 36/36). Estado: M1 + E2 local; nada hospedado.

| Defeito encontrado | Correção | Evidência |
| --- | --- | --- |
| Texto "null" na tela (Configurações para quem só lê; importação de contrato e facility em empresa sem entidades; política no limite; erro de salvamento da RFQ) | filhos condicionais filtrados; `check:design` recusa o padrão (`scripts/check-ui-null-children.mjs`) | checador acusa os 5 casos na base e passa após a correção |
| Filtros dos 9 módulos (tarifas, covenants, spend…) um por linha: `.form-grid` sem CSS | grade fluida | Tarifas: altura da página 1.371 → 969 px; tabela acima da dobra |
| UUID do contrato no filtro de Tarifas; data ISO na busca (Ctrl+K) | nome legível (instituição · produto · vencimento); `formatDate` | varredura sem vazamento |
| Alvos de toque de 30 px (Aprovar/Rejeitar, filtros do portal) | `(pointer:coarse)` ≥ 44 px; verificado em `check:design` | varredura mobile sem alvo pequeno |
| Painel repetia tarefas de "Precisa de você" | card "Outras tarefas" sem repetição | captura |
| Isolamento: sem varredura dos módulos pós-contrato | `demo-workspaces.spec.js`: 19 módulos → 403 entre tenants; 5 caminhos IDOR sem dado do outro | E2E real local 1 passed |

## 12/10/2026 — Stage 0: recovery durável, probe de catálogo e Demo canônica local

Base: `main` @ `51341fd` (#171; CI #854 e merge-audit #45 success). Nenhum dado,
segredo, atribuição, deploy ou projeto hospedado alterado.

| Item | Estado | Evidência | Limite |
| --- | --- | --- | --- |
| Export de recuperação durável (fsync) e registro de restore vinculado | M1 + E2 local | `test-recovery-real.mjs` com PostgreSQL 17.11 + age 1.3.2: export → verify nível 4 → restore isolado MATCH → nível 5; registro de outro export, symlink, 0644 e MATCH com diferenças não elevam o nível | Pilot e legado `RECOVERY_BLOCKED` (secrets do environment `database-recovery` ausentes; run 38179837512) |
| Estados `RECOVERY_*` explícitos | M1 | doctor/export/verify emitem `state`; conversão sempre BLOCKED | — |
| Probe de catálogo security definer / anon | M1 + DB | 271 funções security definer, todas com `search_path`, 0 executáveis por anon, 0 privilégios de anon em tabela/view; `test:database` prova a recusa de cada regressão | advisors hospedados não reexecutados (sem acesso) |
| Build de Production (`arandu`) | BLOCKED (esperado) | reproduzido localmente: ref legado sem atribuição ativa + `ARANDU_SITE_URL` ausente; mensagem corrigida para não contradizer o destino planejado | causa do log hospedado não observada (403) |
| Demo canônica local (Supabase em Docker) | E2 local | `demo:setup` 36/36; Chromium desktop 5/5 e mobile 5/5 (execuções separadas); dois visitantes isolados 1/1; pool 2 workspaces em 632 s cada | Firefox/WebKit e hospedado não executados; desktop+mobile seguidos esgotam o rate limit por usuário |

## 11/10/2026 — Operação contínua dos workspaces da Demo (DW-02)

Base: `main` @ `5d48b18` (#168).

| Item | Estado | Evidência local | Limite |
| --- | --- | --- | --- |
| Quota atômica por workspace | M1 + DB | race reproduzida (quota 1 → 3 RFQs) e corrigida (6 concorrentes, quota 2 → 2); `test:database` exit 0 com `demo-quota-concurrency.sh` | — |
| Controlador do pool (`maintain`) com lease exclusivo | E2 local | 2 execuções simultâneas: 1 `skipped`; 3 workspaces em 1.256 s, 0 falhas; cleanup só do vencido | sem agendamento hospedado |
| Workflow `demo-pool.yml` | M1 | manual, main revisada, environment `demo`, timeout 40 min | secrets do environment `demo` inexistentes até o cutover |
| E2E dois visitantes + quota pela API | E2 local | Chromium desktop: 1 passed (24,6 s), 429 `demo_workspace_quota` sem detalhe interno | Firefox/WebKit e hospedado não executados |

## 11/10/2026 — Isolamento de visitantes da Demo canônica (PR A–C da missão de conclusão)

Base: `main` @ `9753b5e` (#167). Implementa `docs/demo/VISITOR_ISOLATION.md`,
com uma adaptação justificada: um pool de workspaces montados pelo seed real
substitui a cópia SQL com remapeamento de UUIDs. O schema tem 74 gatilhos,
148 referências a `auth.users`, registros imutáveis e hashes sobre fatos com
IDs, o que tornaria a cópia frágil.

| Item | Estado | Evidência local | Limite |
| --- | --- | --- | --- |
| Migration `financial-demo-workspaces-1` (tabela sem policies, claim/resume/active só `service_role`, recusa fora de banco demo, quotas por gatilho) | M1 + DB | `npm run test:database` (Postgres 16, clean/upgrade/rollback/reaplicação) exit 0; PostgREST local: `anon` recebe 42501 na função e na tabela | não aplicada em banco hospedado |
| Seed em modo workspace + `scripts/demo/workspaces.mjs` | E2 local | 2 workspaces em paralelo, **631 s cada, 36/36 checagens cada**; falha parcial removida automaticamente (observado com o primeiro erro de sessão); `cleanup` em 2 s removeu só o vencido (6 orgs, 9 contas) e manteve o baseline e o workspace ativo | reabastecimento automático do pool hospedado em aberto |
| `demo-login` por workspace e sessão vinculada ao workspace | M1 local | `scripts/test-demo-personas.mjs` com reivindicação, retomada por hash, troca de persona com logout, token adulterado, pool vazio, mapa cruzado, 429 por origem, sessão derrubada com workspace inativo ou fora da Demo | — |
| Dois visitantes simultâneos | E2 local | `tests/e2e/demo-workspaces.spec.js` contra o produto real (Chromium desktop): orgs distintas, leitura cruzada recusada, RFQ de A invisível para B, aprovação de A sem afetar B, troca de persona no mesmo workspace, portal do provedor isolado, cookie forjado, sessão de B derrubada ao vencer; `demo-baseline.spec.js` 5/5 | Firefox/WebKit e Demo hospedada não executados |
| Gate de paridade | M1 | 31/31 local; 16 cenários (3 novos de isolamento) | hospedado `BLOCKED` |

Achado corrigido no caminho: `tests/database/financial-public-api.sql` reprovava
de forma intermitente quando o UUID aleatório continha `7777`. A regex agora
usa fronteira de palavra.

## 11/10/2026 — Consolidação Demo × Oficial: contrato de paridade (lotes A–C)

Base: `main` @ `c6363f8` (#165; merge audit success, CI do HEAD em execução na
consulta). Escopo: tornar a fidelidade da Demo canônica verificável antes de
qualquer cutover. Nada hospedado foi alterado.

| Item | Estado | Evidência | Limite |
| --- | --- | --- | --- |
| Manifesto de paridade (`lib/finance/parity-manifest.mjs`) | M1 | 31 capacidades ligadas a telas canônicas, recursos reais da API e checagens do seed; decisões sobre as 4 telas exclusivas do sandbox | estado calculado, não escrito à mão |
| Gate `npm run check:demo-parity` (em `check:all`) | M1 local | 31/31 `PARITY_VERIFIED` locais; 13 cenários negativos/positivos em `scripts/test-demo-parity.mjs` (um deles expôs import puro do sandbox que o primeiro rascunho não pegava; corrigido) | não prova publicação: eixo hospedado `BLOCKED` |
| Matriz `docs/DEMO_PRODUCTION_PARITY_MATRIX.md` | M1 | gerada pelo gate; diverge → CI falha | — |
| Seed: valor de procurement, relacionamento e comparação #163 | E2 local | `npm run demo:setup` em Supabase local descartável: **36/36** checagens OK (eram 32) | não executado em Supabase hospedado |
| Demo canônica hospedada | BLOCKED | `ACTIVE_SUPABASE_ASSIGNMENTS.demo = []`; `arandu-demo` ainda publica o sandbox | depende de Stage 0 (recuperação comprovada) e cutover |
| Production oficial | BLOCKED (fail-closed correto) | reproduzido localmente: `ARANDU_ENV=production` com o ref legado `igacnfjeuqhxcmfyepgj` reprova `finance:env:check` ("SUPABASE_URL da produção aponta para o projeto legado de arte") e `ARANDU_SITE_URL` ausente — coerente com o `npm run vercel-build exited with 1` observado | exige preservação/classificação do legado e Supabase de produção aprovado; não é defeito de código |

Achados que ficam abertos (matriz de paridade, "Itens abertos"): visitantes
compartilham personas e dataset (`OPS-CONCURRENCY`) e o login por persona herda
o limite de 20 logins/h por conta (`OPS-PERSONA-RATE`), o que inviabiliza uma
Demo pública com vários visitantes simultâneos sem redesenho (lote D).

## 11/10/2026 — Relacionamento contextual por instituição (D33-11, lote C)

Base: `main` @ `7b16978` (#163). PR #164 mergeada em `39cf1af`.
M2 comprovado no HEAD `f5d5d1d0833d4bca46a872e1c60200c502387beb`, CI
`38157115191`: database, deploy-boundaries, validate e presentation success;
`merge:gates -- 164` aprovado com a ponta viva de main como ancestral. Evolui o painel existente,
sem segundo cadastro ou nova rota de API. `provider-relationship` entrega
solicitações vinculadas aos convites/propostas, fotografias de saldo com data e
referência, e limites de cobertura. Leituras mantêm JWT/RLS, organização e
instituição; instituição invisível é recusada antes das consultas relacionadas.

`relationship-context.js` apresenta contratos ativos/encerrados, facilities e
limites sem somar moedas, saldos históricos ou ausência explícita, solicitações,
convites/propostas submetidas e atalhos autorizados a tarifas, covenants,
renovações, qualificação, performance e spend. Garantias/documentos e outros
objetos usam a consulta paginada do Financial Graph, sob demanda. O painel declara
que os indicadores antigos também representam o recorte; não declara histórico
completo ou saldo atual. Preserva scorecards e avaliação humana existentes.

`providers.html?provider_id=` abre a instituição do escopo carregado; fechar limpa
o contexto da URL. Contrato e facility apontam para rotas existentes. Link contextual de contrato (`?abrir=contrato#contract-…`) abre termos e versões;
as âncoras antigas preservam o comportamento de foco. Fora do overview consulta o endpoint
existente e confere organização/entidade antes de mostrar. Destino da facility
recebe foco após carregamento. Papéis leitores não ganham ações de
escrita. Graph humaniza estados em vez de mostrar enums técnicos. Primeiro registro de
facility sem instituição disponível explica o pré-requisito e só oferece
cadastro para quem já pode fazê-lo. Edição preserva a instituição autorizada
da própria facility quando ela está fora do índice carregado. Sem grants novos.

Checks, testes de API/escopo e E2E local de desktop/mobile aprovados antes do
push: 247 passed / 7 skipped; apresentação integrada: 125 passed / 19 skipped.
Ajuste final de espaçamento: check:design, build, bundle e 44 testes contextuais
aprovados. Os quatro gates acima validam o HEAD final em todos os motores do CI.
Capturas sintéticas locais desktop/mobile inspecionadas, sem overflow. RFQ
227.942/250.000 bytes (91%): otimizar a rota antes de consumir a margem; sem
aumento de orçamento. Evidência final e limitações também na PR. Demo canônica local não disponível sem Docker;
nenhuma validação hospedada ou promoção a M3/M4/M5. Ainda parcial: conteúdo de
documentos, condições efetivas e cada obrigação são consultados nas jornadas
originais; não agregados como se fossem verificados nesta tela.

## 11/10/2026 — Comparação financeira contextual (D33-10, lote B)

PR #163 mergeada em `7b16978`. M2 comprovado no HEAD `f5254afdd9f0b8d41e4dbf49f2506d0caf2f0445`: CI `38155196792`, quatro gates aprovados e merge audit aprovado. Sem validação hospedada.

Base de implementação: `main` @ `d0ba642` (#162). M2 confirmado acima. A matriz
existente usa grupos econômicos por produto, filtros de diferenças/pendências/
alterações, resumo/detalhe e consulta da versão imediatamente anterior quando
ela foi efetivamente carregada. Desktop mantém colunas alinhadas; mobile mantém
pares e informa moeda, validade e revisão. Nenhum ranking universal.

`lib/finance/comparison-context.mjs` valida células sem converter ausência,
booleanos ou dados inválidos em zero; normaliza premissas equivalentes e impede
destaques/pesos de taxas em bases de indexador incompatíveis, custo total em
premissas diferentes/ausentes e ponderação em moedas incompatíveis. O schema
atual continua em BRL: não há novo campo de entrada nem câmbio. Moeda histórica
explícita é exibida e não é convertida. Estimativa de crédito exige indexador,
amortização, carência e tarifas explícitos; adquirência exige mix, terminais e
custos fixos aplicáveis explícitos. Ausência não é premissa padrão.

Fluxo real reutiliza `POST comparison` para matriz e pesos com JWT/RLS; erro do
servidor não cai em pontuação local. Exportação existente inclui o contexto,
metodologia e metadados de origem. Origem por condição informa apenas envio,
versão e data existentes; autor/documento por campo não disponíveis e verificação
não realizada são explícitos. Não inventa vínculo documental ou CET calculado.
Covenants não são campos estruturados neste catálogo; continuam nos documentos
associados e no módulo existente, sem simular um novo schema.

Testes: domínio (moedas, incompletude, indexadores, premissas, extremos, versões,
vencimento e origem), API (comprador, provedor recusado antes da consulta,
RFQ invisível/malformada, JWT e export), E2E (filtros, versões, teclado,
mobile, recusa recuperável). Validação local: `check:all`, build, `check:build-size` e `audit:ci` aprovados;
E2E financeiro Chromium desktop/mobile **229 passed, 7 skipped**. Apresentação
local **125 passed, 19 skipped**. `deploy:check` aprovado com origem sintética
`VERCEL_URL=arandu-local-validation.vercel.app` apenas para metadados de SEO
do teste; sem essa origem o gate local recusa validação SEO de dist. Nenhuma
URL sintética representa deployment real. CI final registrado na PR. Demo canônica/API real local não executável sem Docker;
capturas locais de fixtures sintéticas não são evidência hospedada. Sandbox
legado mantém a compatibilidade do fluxo compartilhado, sem novo motor/API.

Limitações: só a versão imediatamente anterior carregada; propostas/versões têm
limites declarados; revisão documental continua humana. Validação com usuários,
Demo hospedada e M3/M4/M5 pendentes. Bundle não teve orçamento aumentado.


## 11/10/2026 — Missão autônoma v3.3, lote A

Baseline confirmada por GitHub/API: `15fe2b20bc0c3810be7032c43391c87ccc7fa375`,
main protegida, sem PR aberta, CI `38144313278` com quatro gates success e
merge-audit `38144313228` success. PRs #159–#161 integradas. D33-09/11/13
recebem M2 somente para essa baseline; nenhuma promoção hospedada.

Correções do lote A (M2 · #162 mergeada, HEAD `b1b1e699`, CI `38153272028` com quatro gates success; merge `d0ba642`): facility usa `edit_profile`, como a
RPC `fin_assert_portfolio_write` (admin/finance_manager/analyst); contrato,
instituição, tarifa e renovação continuam admin/finance_manager. Papéis da UI
centralizados em `lib/finance/permissions.mjs`, sem fallback permissivo para
papel ausente ou capacidade desconhecida. Backend e grants não ampliados.
Testes por papel, deep link e submissão em `finance-portfolio.spec.js`, recusa
SQL de viewer, contrato unitário em `test-finance-command-center.mjs`.

Índice de instituições declara o recorte carregado do overview: limites de
200 instituições/contratos/RFQs, propostas submetidas não retiradas e convites
só das RFQs presentes. Não afirma totais históricos nem ausência de contrato
fora do recorte; contrato sem fim é “Vencimento não informado”. Primeiro valor
não exige três instituições. Runbook corrigido para “Cadastrar instituições”.

Vercel no SHA inicial: Production arandu ERROR `dpl_4rNFWhKTkM9ntbWXYzLbaxhgVwPY`;
Demo READY `dpl_5kDPRD3hZBrF72j1PX87Upv2BbF3`; três previews READY.
Build events retornaram 403 no escopo `lucas-projects467`; sem CLI autenticada,
sem repetição ou browser. Atribuições ativas Demo/Production continuam vazias.
READY não comprova Demo canônica nem M3/M4/M5. Nenhum dado/ambiente alterado.

Validação local do lote A: `check:all`, `build`, `check:build-size`,
`audit:ci` aprovados; E2E financeiro Chromium desktop/mobile **225 passed,
7 skipped**, incluindo 64 testes direcionados aprovados. `test:database` não
executável aqui (psql/Docker indisponíveis); nova asserção SQL aprovada no gate database do CI `38153272028`.
Firefox/WebKit e apresentação aprovados no CI do HEAD `b1b1e699`.

## 11/10/2026 — Arandu 3.3: produto, design e prontidão comercial (lotes 1 e 2)

Partiu de `main` @ `4271cca` (#158; `pilot` contida em `main`). Guideline v3.3 (§35) e
Design Constitution criadas. Estados abaixo: **DONE** só com implementação e evidência
verificável; documentação sozinha conta como `DONE (doc)`. Maturidade M2 só após os
quatro gates verdes no HEAD exato da PR; antes disso, M1.

| ID | Iniciativa | Escopo | Dep. | Prioridade | Estado | Evidência / arquivos / testes | Risco | Próximo gate | Critério de conclusão |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| D33-01 | Panorama competitivo | 23 empresas/referências, fonte, data, confiança | — | P0 | DONE (doc) | `docs/ARANDU_COMPETITIVE_LANDSCAPE.md` (páginas públicas lidas em 11/10; Coupa 403) | observação só pública | revisão trimestral (§35.16) | revisado com dados de demos/usuários |
| D33-02 | Guideline v3.3 | capítulo 35 (20 temas), §22 atualizado | D33-01 | P0 | DONE (doc) | `docs/ARANDU_PRODUCT_ENGINEERING_GUIDELINES.md` §35 | — | — | — |
| D33-03 | Design Constitution + checador | tokens, cor, tipo, componentes, IA, QA | D33-02 | P0 | implemented (M2 · CI #159 run 38138747566, HEAD 28aa8f5; merge 6c71ba6) | `docs/ARANDU_DESIGN_CONSTITUTION.md`, `scripts/check-design-tokens.mjs` (`npm run check:design`, em `check:all`) | — | CI verde no HEAD | checador no CI |
| D33-04 | Identidade unificada | tinta/petróleo no app e no site, monograma SVG, superfícies planas, numerais tabulares, avatares sóbrios; ícones PNG/OG regenerados no lote 2 | D33-03 | P0 | implemented (M2 · CI #159 run 38138747566, HEAD 28aa8f5; merge 6c71ba6) | `finance/style.css`, `financial-public.css`, `favicon.svg`, páginas públicas, `scripts/generate-finance-pages.mjs`, `finance/src/shell.js`; capturas antes/depois locais | — | CI + revisão visual | — |
| D33-05 | Navegação em cinco áreas | fonte única, grupos recolhíveis, área na barra superior, folha "Mais" agrupada, rótulos curtos | D33-02 | P0 | implemented (M2 · CI #159 run 38138747566, HEAD 28aa8f5; merge 6c71ba6) · hipótese de UX não validada | `lib/finance/navigation.mjs`, `finance/src/shell.js`, `finance/app.js`, `scripts/test-finance-command-center.mjs` (rotas preservadas, deep links, isolamento do provedor) | aprendizado de quem usa o menu antigo | CI; sessões com usuários (§35.13) | validação com ≥ 3 pessoas do público |
| D33-06 | Início sem vazamento técnico | Performance/Spend/Covenants humanizados no servidor; feed com títulos e agrupamento; contagens viram atalhos; filtros em linha | — | P0 | implemented (M2 · CI #159 run 38138747566, HEAD 28aa8f5; merge 6c71ba6) | `lib/finance/executive-presenter.mjs`, `lib/api/domains/finance-executive.mjs`, `finance/src/views/{dashboard,executive,shared}.js`; `scripts/test-finance-executive.mjs` recusa UUID/enum/função/ISO | detalhe de covenants humanizado na #160 | CI | — |
| D33-07 | Design QA reprodutível | capturas autenticadas desktop/celular, overflow, falha em tela de erro, um login por persona | — | P1 | implemented (local) | `scripts/design/capture-surfaces.mjs` (`npm run design:capture`); 46 capturas antes/depois em `reports/design/` (fora do git) | depende da Demo local | CI com artefato | rodar no CI contra Demo efêmera |
| D33-08 | Correção do site: título invisível | faixa escura com h2 tinta sobre tinta | — | P0 | implemented (M2 · CI #159 run 38138747566, HEAD 28aa8f5; merge 6c71ba6) | `financial-public.css`; guarda em `check-design-tokens.mjs` | — | CI | — |
| D33-09 | Intake por objetivo | entrada "O que você precisa fazer?" no Início, por papel, levando aos fluxos existentes (crédito/adquirência pré-selecionados, `?acao=` abre o formulário de destino) | D33-05 | P1 | PARTIAL (lote 2 mergeado na #160; M2 no main `15fe2b20`, run `38144313278`; correções #162 M2 · `b1b1e699`, CI `38153272028`) | `lib/finance/intents.mjs`, `finance/src/views/intake.js`, `finance/app.js`, wizard `rfqs.js`; testes `test-finance-command-center.mjs` (fluxos existentes, permissão, lista fechada de ações) e E2E (gestor, leitor, ação inválida) | perguntas condicionais e conflito Passport ainda pelo wizard existente | CI | perguntas condicionais por objetivo; métrica de abandono |
| D33-10 | Comparação profissional | grupos econômicos, diferenças, pendências, versões, premissas, origem e export | — | P1 | PARTIAL (lote B M2 · #163 mergeada; HEAD `f5254afd`, CI `38155196792`, quatro gates aprovados) | `comparison-context.mjs`, `comparison.mjs`, `finance.mjs`, `shared.js`, `rfq.js`; domínio/API/E2E | histórico completo e vínculo de evidência por campo pendentes | quatro gates no HEAD próprio; usuários reais | validar a jornada na Demo canônica/hospedada |
| D33-11 | Relacionamento bancário integrado | visão por instituição sobre o Graph; detalhe de covenants sem IDs | — | P1 | PARTIAL (lote 2: detalhe de covenants com nomes; lote 3: lista de instituições vira índice de relacionamento — contratos vigentes, próximo vencimento, convites/propostas, ordem alfabética sem ranking; #160/#161 mergeadas, M2 no main `15fe2b20`, run `38144313278`; correções #162 M2 · `b1b1e699`, CI `38153272028`; painel contextual #164 M2 · `f5d5d1d`, CI `38157115191`) | `lib/finance/covenant-presenter.mjs`, `lib/api/domains/finance-covenants.mjs`, `finance/src/views/{company,relationship-context,provider-relationship,contract-center,portfolio,graph-context}.js`, `finance-portfolio.mjs`; `test-finance-portfolio.mjs`, E2E contratos/portfólio; `test-finance-covenants.mjs` recusa UUID/ISO; captura 1440/390 px sem overflow | histórico completo, documentos e revisão humana nas jornadas originais | CI | quatro gates aprovados; validação com usuários |

| D33-12 | Portal do provedor | resposta de baixo atrito, estados, celular | — | P1 | NOT_STARTED | portal existente | — | lote F | — |
| D33-13 | Site comercial redesenhado | homepage com narrativa de ciclo de vida, capturas reais da Demo rotuladas, escopo honesto; Plataforma em cinco áreas; ícones e OG com a marca nova | D33-04 | P1 | implemented (lote 2 mergeado na #160; M2 no main `15fe2b20`, run `38144313278`) | `index.html`, `produto.html`, `financial-public.css`, `site/*.webp`, `scripts/design/capture-marketing.mjs` (só Demo local ou confirmação explícita), `financial-icon-*.png`, `financial-og.png` | claims (revisado contra §35.12) | CI; revisão humana do texto | páginas Crédito/Adquirência/Segurança no mesmo padrão |
| D33-14 | Onboarding e métricas de ativação | primeiro valor, eventos mínimos sem PII | — | P1 | PARTIAL (lote C: pré-requisito de instituição para primeiro registro de facility; #164 M2 · `f5d5d1d`, CI `38157115191`) | `portfolio.js`; E2E gestor/analista e instituição fora do índice | métricas não implementadas; sem novo fornecedor ou transmissão de dados | quatro gates aprovados; validação com usuários | continuidade e ativação com telemetria existente |
| D33-15 | IA assistiva | só sobre objetos reais e infraestrutura autorizada | P1.4 | P2 | NOT_STARTED (sem fornecedor autorizado) | — | — | autorização de fornecedor | — |
| D33-16 | Validação com usuários reais | sessões registradas | D33-05 | P1 | OWNER_ACTION_REQUIRED | — | — | recrutamento | — |

Lote 1 mergeado na #159 (`6c71ba6`) com os quatro gates verdes no HEAD exato `28aa8f5` (run `38138747566`). Validação local do lote 1: `check:all` verde; `test:e2e` (Chromium desktop + mobile) 209 passed / 0 failed / 7 skipped; `test:e2e:presentation` (Chromium desktop + mobile) 125 passed / 0 failed / 19 skipped; jornada da Demo canônica contra API real local 10/10; build e orçamentos aprovados (JS 440.810/800.000). Firefox/WebKit só no CI.

## 11/10/2026 — Seed canônico da Demo completo (Fee Intelligence)

Executado em ambiente local descartável (`npm run demo:local:reset`, Supabase em
Docker, `ARANDU_ENV=demo`), o seed parava em `POST fees/observe` com 403: a
observação era feita por Rafael (analyst), mas `fin_record_fee_observation` e
`fin_verify_fee_observation` exigem admin/finance_manager. O seed agora observa
com Juliana (finance_manager) e verifica com Helena (admin) — quem registra não é
quem verifica —, sem afrouxar a regra do banco. `scripts/test-demo-guard.mjs`
falha se escrita de tarifa voltar a uma persona sem papel de gestão ou se
observação e verificação forem da mesma pessoa. Resultado local: seed completo e
**32/32 checagens OK**. Maturidade: seed canônico M1 até o CI verde no HEAD
exato; Demo hospedada continua sem evidência nova (M3 não reivindicado).

## 11/10/2026 — `main` vermelha após #154/#156: duas corridas reais no WebKit

CI de `main` #819 (`d6786c3`, após #154) e #823 (`0e444cd`, após #156) falharam
só em `presentation`; as PRs tinham passado (#818, #822). A árvore do HEAD da PR
e a do commit de merge são idênticas nos dois casos (`git rev-parse <sha>^{tree}`),
então não houve código diferente: eram falhas intermitentes, reproduzidas
localmente no WebKit da imagem oficial Playwright 1.63.0 (`:330` falhou 10/30;
`:100` 1/15), e as duas eram defeitos do produto, não do teste:

- **Central de comando (sandbox):** o WebKit não tem `requestIdleCallback`, então
  o pré-carregamento cai para 1,2 s e o Ctrl+K rápido chega antes do módulo. A
  tecla guardada no buffer entra no campo e `input.focus()` no WebKit põe o
  cursor no início: o resto da digitação ia antes dela (`"ema escurot"`), a
  busca ficava vazia e Enter não executava. Correção: cursor no fim ao abrir.
- **Dica da barra compacta:** qualquer `mouseover` fora da barra escondia a dica
  aberta pelo foco; o WebKit dispara um `mouseover` sintético quando a barra
  encolhe sob o ponteiro. Correção: a dica do foco persiste enquanto o foco
  estiver no item (WCAG 1.4.13) e some quando o foco sai da barra ou com Esc.

Regressões determinísticas: falhavam 6/6 no código antigo (WebKit/Safari móvel
para a central; WebKit, Chromium e Firefox para a dica). Com a correção: 200/200
e 75/75 em repetição; suíte de apresentação inteira sem retries nos cinco
projetos 316 passed/44 skipped. O merge audit cumpriu seu contrato (detecção
pós-merge de gates da PR) e o `release:candidate:check` já exige os quatro gates
no SHA exato, então um `main` vermelho nunca vira candidato. Por isso as
entradas M2 abaixo de #154 e #156 valem para o HEAD da PR; o commit de `main`
só volta a valer como M2 com os quatro gates verdes no seu próprio CI.


Baseline `main@9c08f6c793c0084736f9f6ed5330eb40c1cdfde4` (#152), sem PR aberta.
Sessão sem conector Vercel/Supabase: nada hospedado lido, alterado ou promovido.

- **Seed da Demo canônica (P0-C): defeito corrigido, M2/E2 (#153, quatro gates no HEAD `2a55e50`, merge `b41c91e`).** Executado contra o
  Supabase local real (`npm run demo:setup`: Postgres, GoTrue, PostgREST e
  Storage em Docker, app em `ARANDU_ENV=demo`), o seed parava no pós-contrato:
  `POST fees/schedules` → `400 fee_contract_version`. O contrato da Lumina nasce
  da decisão sem termos (versão 0) e `fin_insert_fee_version` exige uma versão
  de termos — regra correta de proveniência; o seed é que pulava o passo. Agora
  registra os termos assinados (fictícios, via `contract-terms`) antes da
  tabela. Regressão em `scripts/test-demo-guard.mjs` (falha no seed antigo).
  Reexecução ponta a ponta do seed depois da correção ainda pendente nesta
  sessão; passos seguintes (qualificação, documento, regras) não foram
  observados. Demo hospedada continua sem banco DEMO: nenhum M3.
- **Recovery (P0-B): reconciliação e restore isolado executáveis, M2/E2 (#154, quatro gates no HEAD `6b5eaef`, merge `d6786c3`).**
  Export conta as tabelas de public/auth/storage/supabase_migrations no mesmo
  snapshot exportado que o `pg_dump --snapshot` importa (manifest com
  `snapshot_counts` + digest); `npm run recovery:restore:verify` restaura só em
  PG17 loopback sem dados, confere hashes antes de descriptografar, aborta e
  reverte se faltar role e reconcilia tabela a tabela, gravando registro 0600
  sem tocar o manifest. Ensaio real PG17 + age local (usuário sem privilégio)
  aprovado com negativos. **Nenhum backup ou restore hospedado executado**:
  depende do executor privado aprovado, identidade age e destino aprovado.
- **Busca e navegação (bugs), M2/E2 (#155, quatro gates no HEAD `2e26312`, merge `2d83635`).** A API recusava `type=performance|spend`
  aceitos por `fin_search`; lista única `SEARCH_KINDS` testada contra a última
  definição SQL do manifesto. O menu montado em JS omitia Implantação, Spend,
  Performance, Covenants, Documentos e Qualificação (sem entrada após o boot);
  teste de paridade casca estática × runtime. E2E Chromium local 209/7 skip,
  presentation 123/19 skip (baseline).
- **Readiness separada de liveness (P0-D/A6), M1/E1.** `/api/health?probe=ready`
  (mesma função Vercel): ambiente, configuração, atribuição aprovada do banco e
  Supabase Auth/REST alcançáveis; resposta pública só pronto/não pronto (200/503),
  motivo no log estruturado sem valores. Testes
  `scripts/test-readiness.mjs`. Não confere schema/SHA (doctor/canário seguem
  obrigatórios); nenhuma sonda hospedada executada nesta sessão.
- **Production `arandu` (`vercel-build` exit 1): causa reproduzida, sem correção
  de código cabível.** Árvore sem `.git`, `VERCEL_ENV=production`,
  `ARANDU_ENV=production` e credenciais sintéticas de formato válido:
  `check-finance-env` reprova *qualquer* ref com "projeto Supabase sem atribuição
  ativa aprovada para production" (`ACTIVE_SUPABASE_ASSIGNMENTS.production` vazio
  em `lib/deployment-topology.mjs`, destino `PENDING_DATA_REVIEW`). Com a
  topologia satisfeita, o `deploy:check` completo passa em modo production
  (build, check:all hermético, dist, superfície, navegação, SEO, 520 testes E2E
  listados). Controle fail-closed deliberado, já coberto por
  `scripts/test-deploy-release-separation.mjs`; resolve-se com recovery +
  cutover aprovados, nunca afrouxando a atribuição. Logs reais da Vercel não
  lidos (sem conector); se mostrarem falha anterior, ela precede esta.

## Recovery — preparação de 09/10/2026 (ARA-8)

M1 tooling: export completo criptografado em streaming para mount privado,
workflow_dispatch somente main/SHA revisado/Environment database-recovery,
allowlist dos dois refs e testes negativos em check:staging. O drill existente
continua Pilot-only; atribuições Demo/Production não mudaram. Não confundir
export preparado com backup executado ou restore aprovado.

Inventários e advisors atualizados em ops/consolidation/*-2026-10-09.json:
Pilot 13 linhas; legado 42, oito registros com campos de contato/destinatário.
customer_rows/personal_data_rows permanecem desconhecidos. Nenhuma alteração
SQL, infraestrutura paga, seed, reset ou cutover executados. M3/M4/M5 pendentes.
Próximo gate: revisar/merge com quatro checks no HEAD, configurar proteção do
Environment e executor privado autorizado com PG17/age/credenciais/destino;
export real e restore isolado do mesmo backup, classificação e owner approval.
Runbook: SUPABASE_ENCRYPTED_PRESERVATION.md. Não declarar M2 antes do CI exato.

Documento vivo. É o **estado vivo** exigido pela Guideline v3 (§1.3): decompõe
`docs/ARANDU_PRODUCT_ENGINEERING_GUIDELINES.md` (**v3.3, autoridade estratégica e operacional**)
em capabilities e registra, por capability, escopo, maturity state (M0–M6),
evidência, blockers, dependências, última validação, ambiente validado e próximo gate.
Outra sessão deve conseguir continuar a partir daqui sem refazer a auditoria.

- **Estado vivo (09/10/2026, lote analytics em branch, M1/E1).**
  Baseline `main@595796ca656863fd6c159ebbe6ca53388716c660`, CI #807 success;
  merge-audit #22 failure (base stale em #148), main protected=false.
  Adaptador PostHog server-only desativado por padrão, cinco operações
  autorizadas, HMAC por tenant e Web Vitals com URL mínima. Junção de propostas
  indexada, testes de API/analytics e deploy check locais aprovados. Dashboard
  PostHog 2191077 preparado sem amostra; Linear P-ARA-1 e ARA-5–ARA-9 criados.
  Coleta/privacidade/retention hospedadas não comprovadas. Production Vercel
  ERROR; primeiro build log 403, browser em login. Recovery e conversão
  Supabase não executadas. E2E/banco local bloqueados por binários ausentes;
  quatro gates CI do novo HEAD pendentes. **Não elevar a M2–M6.** Contrato e
  próximos gates: `PRODUCT_ANALYTICS.md` e
  `FINANCIAL_RELEASE_EVIDENCE_2026-10-09_ANALYTICS.md`.
- **Estado histórico (08/10/2026, após #146, reconciliação 20:46 UTC).**
  `main@0b2a53dbf1fef9ac70a7865af89030e966024009`, CI #803
  (`37834383887`) e merge-audit #20 (`37834383878`) success. Sem PR aberta
  na leitura inicial. Vercel: Demo READY (`dpl_2QDbQzVp1aa5uWVj5MsGGkMHAYja`),
  Pilot preview READY (`dpl_6iLZTK8KVLu1A6Q6SMiLYDEfpYcP`), Production ERROR
  (`dpl_AvWtUbtgBgn4Fhz9f7Mfi9dENKkm`). A integração lê projetos/deployments;
  somente build events retornam 403. Browser redirecionou ao login nesta
  sessão; causa histórica anterior à #146 continua sem log comprovado.
  `governance:live` BLOCKED: protected=false, regras efetivas vazias.
  Ambos os Supabase permanecem ACTIVE_HEALTHY; não houve cutover, recovery,
  migration ou alteração de configuração. M3/M4/M5/M6 continuam pendentes.
  Lote local de hardening: cálculos com entradas inválidas, evidência de restore
  contraditória e export anterior ao inventário corrigidos com regressões.
  **M1/E1 para as correções novas**, sem herdar o CI #803. Evidência na seção
  de continuação de `FINANCIAL_RELEASE_EVIDENCE_2026-10-08_STAGE0.md`.
- **Estado histórico (08/10/2026, após #144).** `main` =
  `296b0357383e09a49348307b2921b3cf496c589b`, árvore
  `45497e6dff1306e49849cd6812fb471ccedac8d6`. **M2/E2 comprovado** pelo
  run #799 (`37677370704`), quatro gates success no SHA exato; merge-audit
  `37677370697` success. Sem PR aberta na leitura inicial. Não há blocker de CI
  nessa baseline. GitHub público: `protected=false`, rulesets `[]`; leitura
  administrativa 403. Falha Vercel `arandu` no mesmo SHA (`dpl_DPwnPBkBq5d22LzgS9YQ2PSRyjXL`)
  é independente de CI; acesso à equipe retorna 403, causa específica não comprovada.
  Demo no SHA atual ainda `synthetic-fixtures`; API de organizações 404.
  Official: Passport/Portfolio 404, health sem SHA. Supabase: Pilot no marker
  `financial-surface-hardening-1`, sem `deployment_environment`; 13 linhas,
  zero Auth/MFA/objetos Storage. Legado: 42 linhas, oito registros com campos
  de contato/destinatário sem classificação fictício/real. Inventário não é backup.
  Nenhum banco, secret, alias ou allowlist alterado. **M3/M4/M5/M6 não comprovados**.
  Ver `FINANCIAL_RELEASE_EVIDENCE_2026-10-08_STAGE0.md` e inventários de 08/10.
  Ferramenta nova `governance:live`: M1/E1 até CI desta PR; não equivale a regra aplicada.
- **Autoridade.** A direção estratégica é a Guideline v3. Documentos especializados
  (`FINANCIAL_PRODUCT_BOUNDARIES.md`, data model/migrations, segurança, deployment,
  operação, runbooks, releases) regem a implementação concreta (v3 §1.3 e Apêndice D).
  `docs/ARANDU_PRODUCT_ENGINEERING_GUIDELINES_V2_1_ADDENDUM.md` é **histórico/superseded**:
  continua como referência técnica para os IDs `Add. X.Y` citados nas tabelas abaixo,
  mas **não prevalece** sobre a v3. As colunas `Guideline` das tabelas detalhadas citam
  seções da v2/v2.1 vigentes quando cada linha foi escrita; a numeração não foi
  reescrita para não perder rastreabilidade.
- **Estado histórico (07/10/2026, após #142).** main =
  `477ad8be5b95733e8ac97aa3a6f3e1c6a2e54d62`, árvore
  `6575db8fb0dbf9895676464b07cef2ba75c6911c`. **M2/E2 comprovado** pelo run
  #794 (`37664210563`): database/deploy-boundaries/validate/presentation success
  no commit mergeado. O bloqueio de CI descrito nos snapshots anteriores é
  histórico e não constitui regressão atual. merge-audit `37664210727` failure
  é incidente separado: #142 entrou às 18:06:00Z com dois gates em execução
  (MGI-2026-10-07-08). Nenhum rollback automático ou reescrita de histórico.
  Vercel no mesmo SHA: arandu-demo e arandu-pilot com status success;
  arandu failure (`dpl_Aj44zzVxwHt139cYZ3H4XZNLuZVE`). Health da Demo pública
  confirma main477, runtime demo, synthetic-fixtures; portanto não promove M3
  da Demo canônica. Official público ainda não expõe SHA e retorna 404 em
  Passport/Portfolio. Logs/settings Vercel 403 no escopo lucas-projects467;
  CLI/token autenticado indisponíveis. Causa exata do build não comprovada;
  nenhuma configuração, credencial ou banco alterado. **M3/M4/M5 não
  comprovados**. Registro de capabilities abaixo mantém o escopo/histórico;
  a evidência CI atual da árvore é BL-794, sem claim de rollout hospedado.
  Próximo gate: obter logs completos do deployment identificado e aplicar
  somente a correção demonstrada. `FINANCIAL_DEPLOYMENT_FAILURE_2026-10-07.md`.
- **Estado histórico (07/10/2026, antes do merge #142).** `main` =
  `59806334e038f2b3a01f363a63e4ca577949b26b`; #140/#141 merged com gates failure,
  incidente MG-I-07 registrado. Topologia alvo: Demo + Production permanentes;
  Pilot passa a release validation stage. `fix/two-environment-consolidation`
  prepara guards, release candidate v3, inventários e travas de conversão/retirada.
  Destinos offgpyysgdhfemjlchod → Demo e igacnfjeuqhxcmfyepgj → Production não
  alteram as allowlists ativas antes de recovery/cutover. Legado contém 42 linhas,
  8 registros com contato/destinatário sem classificação real/teste. Nenhum reset,
  migration ou promoção. Metadata TO_BE_DECOMMISSIONED criada no Pilot Vercel;
  releitura bloqueada 403. Demo main598 ainda sandbox; Official alias ainda
  fd796e6b, build main598 ERROR. CI run37635735477 sem runner/steps, causa exata
  externa não comprovada. PostgreSQL administrativo sem DNS, cliente 16 versus
  servidor 17, sem Docker para restore; database local connection refused.
  Chrome local desktop/mobile 209 pass + 7 skips com fixtures, não E2E hosted.
  **M1/E1; M2/M3/M4/M5 não atingidos.** Evidência e próximos gates:
  `docs/TWO_ENVIRONMENT_CONSOLIDATION.md`, `ops/consolidation/`.
- **Estado histórico (07/10/2026, antes do merge #141).** `main` =
  `8be66cab705c8bdf41707a34848c0cf4afb3c65a`, árvore
  `01d31ae879f72e565f9e337eba30a38305c37192`; #140 já merged.
  Run #788 (`37628077116`): quatro gates failure, sem steps ou runner atribuído.
  Correção proposta em `fix/hosted-release-verification`: doctor cobre 120
  tabelas/views do registro canônico e 183 RPCs; bloqueia leituras inconclusivas,
  demo sem seed, identidade pública incompatível e SHA esperado divergente.
  Health publica apenas a projeção segura de runtime/branch/SHA.
  `CRON_SECRET` criado no projeto Official, Sensitive/Production, presença
  confirmada sem exposição. Nenhum alias promovido ou migration aplicada.
  Demo pública `main@8be66cab`, READY, ainda sandbox; criação do Supabase DEMO
  recusada por limite de dois projetos Free ativos, após seleção da organização
  e consulta/confirmação de custo. Pilot público `pilot@2241d3b9`, marker
  `financial-surface-hardening-1`; backup preflight bloqueado por conexão
  administrativa ausente. Official público `main@fd796e6b`; build de 8be66cab
  ERROR, logs 403, causa específica ainda não comprovada.
  Evidência e comandos: `docs/HOSTED_ALIGNMENT_2026-10-07.md`.
  **M1/E1 permanece; M2 bloqueado, M3/M4/M5 não atingidos no release integrado.**
- **Estado histórico (06/10/2026, após #138).** `main` =
  `fcc68f91c9dae997adcbacd7f82bdeaaf04ef2ed`, árvore `20c11ac3bbf58107e4f853d17e56eeb7f5a87a81`.
  #136 consolidou `main`; #137 integrou personas e dataset Portfolio/Fee/Spend;
  #138 ampliou doctor fail-closed e evidência operacional v2. As três PRs
  já estão merged. Nenhum commit posterior ou PR aberta na leitura inicial.
  Run #784 (`37505201208`) no SHA atual: quatro gates failure, steps vazios;
  merge-audit #12 também failure. **M2 externally blocked** no release atual;
  BL-V3 abaixo é evidência histórica, não valida este release.
- **Ambientes observados (06/10/2026, rodada de alinhamento).** Demo:
  `dpl_4PSczMxhAS73dmAB59w1MFziPhdu`, `main@fcc68f91`, READY/production,
  alias `arandu-demo.vercel.app`, ainda sandbox legado (somente
  `ARANDU_DEPLOYMENT_KIND` em Production). Pilot:
  `dpl_6LupNLnhVq73y4Yoqf271tb1RDCN`, mesmo SHA, READY/preview, apenas
  alias git-main; o alias público ainda resolve para `pilot@2241d3b9`
  (`dpl_E8iHaoFCrjHiNDbnh2RrcNxtC4Cm`). Production Branch definitiva
  não exposta pelo conector.
  Banco Pilot `offgpyysgdhfemjlchod`, marker `financial-surface-hardening-1`,
  24 migrations pendentes; `deployment_environment` ausente. Official:
  `dpl_5h4GH8QVKkRxANzeo1bVgvtcDnKq`, mesmo SHA, ERROR/production
  (`BUILD_UTILS_SPAWN_1`, vercel-build exit 1). `ARANDU_ENV=production` já
  existe; `CRON_SECRET` ausente. Logs 403 mesmo com teamId explícito; causa
  específica desconhecida. Alias oficial `arandu-bice.vercel.app` ainda serve
  `main@fd796e6b` (#81, `dpl_4Dd6HusgFXDMiPeFRvF72J8Mo6mD`). Health
  público 200 e organizations 401 nesses aliases antigos não validam fcc68f91.
  Supabase só Pilot e legado acessíveis; Demo/PROD
  dedicados não encontrados. Criação depende de escolha da organização e
  confirmação de custo exigidas pelo conector; não inferir autorização.
  Nenhuma capability M3/M4/M5/M6 promovida. Plano de cutover e artefatos:
  `docs/HOSTED_ALIGNMENT_2026-10-06.md`.
- **Estado anterior (05/10/2026, rodada de reconciliação pós-merge v3; histórico).** `pilot` @
  `d828a44027506a9d4a4eddd807914f85dd8dde4c` (merge #127, Guideline v3) **não é baseline
  limpa**: a #127 foi mergeada com `validate`/`presentation` ainda em execução e sem conter
  a ponta da `pilot` após a #125 (incidente de governança de merge, ver
  `FINANCIAL_REPO_GOVERNANCE.md`). `main` @ `ed5da41c5244040d9e3b1ddb501053280d692622`
  (merge #126, Vite 8.3.2). A PR de reconciliação v3 incorpora #125 + #127 + o bump da #126
  e revalida a árvore combinada; HEAD e runs ficam registrados na PR e em
  `FINANCIAL_RELEASE_EVIDENCE_2026-10-05_V3_BASELINE.md` (um commit não pode conter o
  próprio SHA). **Pilot hospedado: NO-GO.**
- **Baselines anteriores (históricas, superseded):** `pilot@556258c` + `main@201adb4`
  (baseline de 05/10 antes da #125); `pilot@399b7ac` (merge #125, `merge-audit` verde).
  Evidência de CI da árvore completa ainda válida como referência: `e2212af` (HEAD da #125,
  run `37258668278`, quatro gates success).
- **Escopo de rodada.** A matriz não autoriza ampliar missão (v3 §33 e `CLAUDE.md`). P1.4
  (Proposal & Document Intelligence) só começa depois de baseline limpa + fechamento
  hospedado suficiente do Pilot + operational readiness (Stage 0, v3 §29).

## Modelo de maturidade (Guideline v3 §5)

`implemented` **nunca** significa `PRODUCTION_READY`. A coluna `Status` das tabelas
detalhadas mede **completude de escopo** (o que existe no código frente ao escopo da linha);
a **maturidade** é a coluna `Maturity` do registro abaixo. Um estado superior exige evidência
dos anteriores; incidente ou regressão pode rebaixar; blocker externo não eleva estado.

| Estado | Critério objetivo de promoção (entrada) | Não implica |
| --- | --- | --- |
| `NOT_STARTED` | nada além da definição normativa na guideline | — |
| **M0 — DESIGNED** | problema, persona, boundaries e source of truth definidos; modelo/fluxo alvo em documento técnico; sem claim de implementação | código |
| **M1 — CODE_COMPLETE** | código existe (domínio/modelo/API/UI conforme aplicável); migration + rollback + registro no manifesto quando houver SQL; testes locais relevantes (incluindo negativos) existem; documentação técnica acompanha | CI verde, deploy, ambiente real |
| **M2 — CI_VALIDATED** | `database`, `deploy-boundaries`, `validate`, `presentation` = `success` no **HEAD exato** que contém a capability, com a ponta da base contida (`merge:gates`); banco e os cinco projetos de navegador aplicáveis verdes; nenhuma evidência herdada de SHA anterior | ambiente hospedado saudável |
| **M3 — HOSTED_VALIDATED** | migration/config aplicada no ambiente hospedado alvo; schema (marker) e deploy observados correspondem ao release; doctor/canário/probes relevantes passam; evidência vinculada a ambiente + SHA. Local ≠ hospedado | uso por pessoas, recuperação exercitada |
| **M4 — RELEASE_VALIDATED** | jornada autenticada real ou representativa ponta a ponta na Demo canônica ou preview temporário; restore/recovery aplicável exercitado; runbook, observabilidade e suporte exercitados; evidência ligada ao SHA; `release:candidate:check` GO; blockers críticos fechados ou aceitos por responsável nomeado | produção |
| **M5 — PRODUCTION_READY** | ambiente PROD dedicado (`ARANDU_ENV=production`, Supabase próprio, migrations próprias, secrets corretos); backup + restore provados; security/admin blockers relevantes fechados; owner, suporte, rollback/forward-fix e resposta a incidente definidos; release validado na Demo canônica no mesmo SHA de `main` antes de liberar Production | validação por cliente |
| **M6 — CUSTOMER_VALIDATED** | uso real por cliente/design partner no problema alvo; jornada observada; valor/usabilidade medidos; feedback e gaps registrados | fim da evolução |

**Nível de evidência** (coluna `Evidence level`): `E0` documento; `E1` teste local; `E2` CI no
HEAD exato; `E3` sonda/doctor/canário hospedado ligado ao release; `E4` jornada + recuperação
no Pilot; `E5` produção; `E6` uso por cliente.

**Baselines de validação** usadas no registro:

| Código | SHA | Evidência | Estado |
| --- | --- | --- | --- |
| `BL-3.3` | `15fe2b20bc0c3810be7032c43391c87ccc7fa375` | run `38144313278`: database/deploy-boundaries/validate/presentation success; merge-audit `38144313228` success em 11/10 | **baseline atual M2/E2**; alterações posteriores exigem CI próprio; sem M3+ |
| `BL-803` | `0b2a53dbf1fef9ac70a7865af89030e966024009` | run `37834383887`, CI success; merge-audit `37834383878` success em 08/10 | **baseline histórica M2/E2**; superseded por BL-3.3 |
| `BL-799` | `296b0357383e09a49348307b2921b3cf496c589b` | run `37677370704`, quatro gates success; merge-audit `37677370697` success em 07/10 | **baseline histórica M2/E2**; hosted/recovery pendentes |
| `BL-794` | `477ad8be5b95733e8ac97aa3a6f3e1c6a2e54d62` | run `37664210563`, quatro gates success em 07/10 | **baseline histórica CI-validada**; incidente de merge separado; hosted/recovery pendentes |
| `BL-125` | `e2212af5a49707cf9ecd44b3384a2eaccf270756` (HEAD da #125, contém tudo até #124) | run `37258668278`: quatro gates success em 05/10 | **superseded** pela BL-V3 |
| `BL-V3` | `4a93fa60b51ae4c094e95d25cee8be4748363cfb` (HEAD da #128; árvore idêntica a `pilot@d4d6c22`) | run `37320266260`: `database`, `deploy-boundaries`, `validate`, `presentation` success no HEAD exato (05/10 14:15Z) | **árvore CI-validada**; a #128 foi mergeada antes do fim do CI (MGI-2026-10-05-02, `merge-audit` `37320702496` failure). Baseline limpa = esta árvore + merge-audit verde da PR documental de seguimento |

Regras de leitura: nenhuma capability está em **M3+** — o Pilot hospedado foi observado pela
em 08/10 no marker `financial-surface-hardening-1`, sem doctor/canário/jornada
hospedados vinculados a um release, e a configuração histórica registra `ARANDU_ENV=production`, mas não há Supabase PROD
próprio comprovado nem build saudável. Nenhuma capability é **M6**: não há cliente real em operação.

## Registro de maturidade por capability (v3)

Detalhe de escopo, evidência de código, riscos e histórico de PRs permanece nas tabelas
por bloco abaixo (IDs preservados). `Validated SHA` = última árvore com quatro gates verdes
que contém a capability. `Ambiente validado` = onde a evidência mais alta foi obtida.

| ID | Capability | Escopo | Maturity | Evidence level | Ambiente validado | Validated SHA | Última validação | Blockers externos | Próximo gate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0.1-01 | Demo/Production por configuração; Pilot transitório | partial | M2 | E2 | CI (`deploy-boundaries`) | BL-799 | 08/10 | conversão dos dois bancos com recovery; build oficial e settings | M3: banco isolado + doctor/canário |
| P0.1-02 | Manifesto de migrations, clean/upgrade/reapply/rollback | implemented | M2 | E2 | CI (`database`) | BL-799 | 08/10 | — | manter por migration |
| P0.1-03 | Migrations aplicadas no Pilot hospedado | blocked | M2 (bundle/ferramenta) · hosted não atingido | E2 | CI | BL-799 | 08/10 | executor Docker/PG17; conexão administrativa não provisionada nesta sessão; backup/restore antes | M3: recovery do mesmo backup + prefixo de 12 migrations (`8e15a95…`) até data-governance; depois export/owner ack + restantes + doctor GO |
| P0.1-04 | Ruleset main e preservação histórica pilot | blocked | M2 (templates) · proteção não aplicada | E2 (templates); observação API | CI + API GitHub | BL-799 | 08/10 | permissão administrativa; main pública sem rulesets | importar main.json; governance:live PROTECTED |
| ST0-ID | Identidade aprovada dos bancos Demo/Production | implemented | M1 | E1: tests finance-env/doctor/consolidation | local, sem escrita hospedada | PR desta rodada | 08/10 | atribuições ativas vazias; recovery e cutover pendentes | quatro gates no HEAD; depois conversão comprovada e ativação por PR |
| P0.1-05 | Restore drill local + procedimento hospedado | partial | M2 (mecanismo) | E1/E2 | local + CI (preflight) | BL-799 | 08/10 | Docker/PG17 e conexão administrativa segura (DNS failure na rodada histórica) | M4: drill hospedado PASS |
| P0.1-06 | Doctor, canary, env check | implemented | M2 (ferramentas) | E2 | CI | BL-799 | 08/10 | credencial operacional, schema atrasado e conversão | M3: doctor/canário no marker final e SHA correto |
| P0.1-07 | Severidade, runbook, postmortem | partial | M1 | E0 | documento | — | 08/10 | responsáveis nomeados | M4: exercício de resposta |
| P0.2-01..08 | Multi-entity (grupo, escopo, RLS, guardas, consolidado, moeda, trilha, UI) | implemented | M2 | E2 | CI | BL-799 | 08/10 | rollout hospedado | M3 |
| P0.2-09 | Aprovação cruzada / tesouraria por policy | partial | M2 | E2 | CI | BL-799 | 08/10 | rollout hospedado | M3 |
| P0.3-01 | Passport com proveniência por campo | implemented | M2 | E2 | CI | BL-799 | 08/10 | rollout hospedado | M3 |
| P0.3-02 | Passport por entidade legal | partial | M2 | E2 | CI | BL-799 | 08/10 | rollout hospedado | M3 |
| P0.3-03 | Financial Graph consultável | partial | M2 | E2 | CI | BL-799 | 08/10 | rollout hospedado | M3 |
| P0.4-01..05 | Contract & Renewal Center v2 | implemented | M2 | E2 | CI | BL-799 | 08/10 | rollout; provedor de e-mail | M3 |
| P0.5-01..06 | Provider / Bank Relationship | implemented | M2 | E2 | CI | BL-799 | 08/10 | rollout hospedado | M3 |
| P0.6-01..04 | Debt / Facilities / Limits / Guarantees | implemented | M2 | E2 | CI | BL-799 | 08/10 | rollout hospedado | M3 |
| P0.7-01 | Aprovação sequencial com snapshot e SoD | implemented | M2 | E2 | CI | BL-799 | 08/10 | rollout hospedado | M3 |
| P0.7-02..03 | Policy engine v2, prazos, escalonamento, exceção | partial | M2 | E2 | CI | BL-799 | 08/10 | rollout; agendador em minutos | M3 |
| P0.8-01..02 | API v1 e webhooks | partial | M2 | E2 | CI | BL-799 | 08/10 | rollout; chave de cifragem por ambiente; agendador | M3 |
| P0.8-03 | Docs/versioning/deprecation da API | implemented | M2 | E2 | CI (paridade OpenAPI) | BL-799 | 08/10 | — | manter |
| P0.9-01 | MFA do operador da plataforma | implemented | M2 | E2 | CI | BL-799 | 08/10 | cadastro de MFA do `finance_ops` (O3) | M3 |
| P0.9-02..03 | SSO SAML/OIDC fail-closed | partial | M2 | E2 | CI (IdP de teste) | BL-799 | 08/10 | SSO no Supabase, IdP real, DNS, segredos | M3: login real com IdP |
| P0.10-01 | Backup preflight / restore drill | partial | M2 (mecanismo) | E1/E2 | local + CI | BL-799 | 08/10 | conexão administrativa do Pilot | M4 |
| P0.10-02 | Incident/DR/RPO-RTO honestos | partial | M1 | E0 | documento | — | 08/10 | responsáveis; ensaio DR hospedado | M4 |
| P0.10-03 | Health, request IDs, job runs, outbox | implemented | M2 | E2 | CI | BL-799 | 08/10 | — | M3 |
| P0.11-01 | Classificação, minimização, SoR | implemented | M2 | E2 | CI | BL-799 | 08/10 | — | M3 |
| P0.11-02 | Retenção, hold, export, offboarding | partial | M2 | E2 | CI | BL-799 | 08/10 | jurídico (exclusão física); decisão de produto (offboarding de provedor) | M3 |
| P0.11-03 | Subprocessadores / readiness jurídica | blocked | M0 | E0 | documento | — | 08/10 | parecer jurídico | decisão jurídica |
| LEG-01..02 | Runtime e artefatos de arte fora do tree | implemented | M2 | E2 | CI (`check:legacy-art`, superfície) | BL-799 | 08/10 | deploy de produção antigo ainda serve API legada | M3 após deploy |
| LEG-03 | Objetos de banco/storage da arte | partial | M2 (migration) | E2 | CI | BL-799 | 08/10 | backup/restore + export + decisão do owner | M3 |
| P1.1 | Savings & Value Realization Ledger | implemented | M2 | E2 | CI | BL-799 (primeira: `189bc9d`) | 08/10 | rollout hospedado | M3 |
| P1.2 | Bank Fee Intelligence | implemented | M2 | E2 | CI | BL-799 (primeira: `e889aff`) | 08/10 | rollout hospedado | M3 |
| P1.3 | Opportunity Engine determinístico | implemented | M2 | E2 | CI | BL-799 (primeira: `70df5d3`) | 08/10 | rollout; cadência do cron | M3 |
| P1.4 | Proposal & Document Intelligence | partial (foundation completa) | M2 | E2 | CI (DB, domínio, UI com fixtures) | BL-799 | 08/10 | OCR/modelo externo (contrato de dados); Stage 0 hospedado | M3: rollout isolado + doctor/canário/jornada real |
| PQ-01 | Provider Qualification & Due Diligence (v3 §11) | partial (core completo; vencimento integrado na cron) | M2 core; M1 integração cron | E2 core; E1 jobs | CI core; local cron | BL-799 core; PR de integração cron pendente | 08/10 | Stage 0; schema antigo não contém RPC | M2 cron: quatro gates; M3: rollout isolado + doctor/canário/jornada real |
| PA-01 | Post-Award Implementation & Transition | partial (core implementado) | M2 | E2 | CI (DB, domínio, UI com fixtures) | BL-799 | 08/10 | Stage 0 | M3: rollout isolado + doctor/canário/jornada real |
| CO-01 | Covenant & Obligation Monitor | partial (core implementado) | M2 | E2 | CI (DB, domínio, UI com fixtures) | BL-799 | 08/10 | Stage 0 | M3: rollout isolado + doctor/canário/jornada real |
| P1.5 | SCIM / JIT / access reviews | missing | NOT_STARTED | — | — | — | — | — | — |
| P1.6 | Executive Portfolio | partial | M2 (fatia executiva) | E2 | CI | BL-799 | 08/10 | rollout hospedado | M3 |
| P1.7 / SI-01 | Financial Spend Intelligence | partial (reconciled evidence slice) | M2 | E2 | CI (DB, domínio, UI com fixtures) | BL-799 | 08/10 | Stage 0; allocation/wallet/Opportunity/tasks depth | M3: rollout isolado + doctor/canário/jornada real |
| PP-01 | Provider Performance | partial (core implementado) | M2 | E2 | CI (DB, domínio, UI com fixtures) | BL-799 | 08/10 | Stage 0 | M3: rollout isolado + doctor/canário/jornada real |
| P1.10 | Enterprise Search | partial | M2 (escopo limitado) | E2 | CI | BL-799 | 08/10 | — | — |
| P1.11–P1.12 | Enterprise Intake, Scenario Builder | missing | NOT_STARTED | — | — | — | — | — | — |
| P2.1–P2.4, P2.6, P2.8 | Product Packs e integrações | missing | NOT_STARTED | — | — | — | — | gate §43.1 / Stage 4 | — |
| P2.5 | Acquiring Intelligence (v1 existente) | partial | M2 (v1) | E2 | CI | BL-799 | 08/10 | — | — |
| P2.7 | Open Finance | blocked | NOT_STARTED | — | — | — | — | consentimento/parceiro | — |
| P3.1–P3.3 | Network, benchmarks | missing/blocked | NOT_STARTED | — | — | — | — | maturidade buyer-side; jurídico | não iniciar |
| AI-01 | Assistente factual | missing | NOT_STARTED | — | — | — | — | provedor de modelo; revisão de dados | — |

Estados agregados (08/10): **Código/CI** — M2 em `BL-799`, quatro gates verdes
no SHA exato e merge-audit success. **Demo canônica** — BLOCKED (sandbox não
prova M3). **Release validation** — NO-GO, sem M4. **Production** — BLOCKED,
sem M5. **Cliente** — M6 não comprovado. A nova ferramenta desta PR continua
M1/E1 até seus próprios quatro gates; BL-799 não a valida.

## Legenda de escopo (coluna `Status` das tabelas detalhadas)

| Status | Significado |
| --- | --- |
| `implemented` | escopo da linha completo no código (domínio + persistência + autorização + API + UI/workflow + estados + auditoria + testes + docs, conforme aplicável). **Não** é maturidade: ver `Maturity` |
| `partial` | existe parte da capacidade; as lacunas estão listadas |
| `missing` | não há implementação |
| `blocked` | depende de algo externo (credencial, decisão humana/jurídica/comercial, parceiro, dado licenciado, permissão administrativa); o que já foi preparado está listado |
| `not-applicable` | não se aplica nesta fase por boundary documentado |

Evidência sempre aponta arquivo, migration, API, teste ou UI. Página sozinha não é evidência
de capacidade completa. "Verde no CI" só vale quando o run existe no HEAD exato. Linhas
históricas abaixo que dizem "testado" sem run referem-se a validação **local** da sessão
que as escreveu.

### Contexto histórico do cabeçalho anterior (superseded)

- Baseline reconciliada em 05/10/2026 antes da #125: `pilot@556258c` (merge #124 sobre
  #123) e `main@201adb4` (merge #99). Superseded por este cabeçalho.
- Autorização de escopo da rodada de 03–04/10 (P0, P1, P2 com pré-requisitos, P3 com gates)
  não se estende a rodadas seguintes.
- Validação local histórica de referência: PostgreSQL 16 local e Chromium do Playwright;
  Firefox/WebKit sempre pelo job `validate` do CI.

---

## P0 — Fundação comercial e enterprise

### P0.1 — Ambientes, migrations, runbooks e governança

| ID | Guideline | Capability | Pri | Dependency | Status | Evidence | Gaps | Risk | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0.1-01 | §38.3, Add. H.1 | Demo/Pilot/Production por configuração, mesma árvore | P0 | — | partial | `docs/FINANCIAL_DEPLOYMENT_WORKFLOW.md`, `scripts/vercel-build.mjs`, `scripts/check-finance-env.mjs`, `lib/demo-mode.mjs`, `lib/deployment-surface.mjs` | Supabase DEMO não existe (limite Free 2 projetos); produção com `ARANDU_ENV=production` desde 06/10, mas sem banco próprio comprovado; build oficial ERROR | demo/prod mal configurados | Owner: criar Supabase DEMO/PROD, setar env (ver lista de blockers) | — |
| P0.1-02 | §38.4 | Manifesto de migrations, clean install, upgrade, reapply, rollback | P0 | — | implemented | `docs/supabase-migrations.json`, `scripts/check-migrations.mjs`, `scripts/test-database.sh` (clean+upgrade+reapply+rollback), `docs/rollback/*` | — (cada migration nova deve repetir o padrão) | migration fora do manifesto | manter | — |
| P0.1-03 | §38.4, Add. E.6 | Migrations aplicadas no Pilot hospedado | P0 | P0.1-02 | blocked | Pilot em `financial-surface-hardening-1` (02/10); bundle `npm run migrations:bundle -- --after-schema` | conector SQL administrativo disponível; sem conexão de dump/restore e drill hospedado comprovado; 24 migrations pendentes em 06/10 | piloto atrás do código | Owner aplica bundle após backup+drill | — |
| P0.1-04 | §38.1–38.2, Add. G.3 | Branch protection/rulesets em `main` e `pilot` | P0 | — | blocked | rulesets versionados e testados `.github/rulesets/{pilot,main}.json` (`scripts/test-merge-gates.mjs`), `npm run merge:gates` com frescor de base, `.github/workflows/merge-audit.yml` (detecção pós-merge), `docs/BRANCH_PROTECTION.md` | OWNER_ACTION_REQUIRED: importar as rulesets (executor sem administração; 05/10 `protected=false`) | merge com CI vermelho (ocorreu na #118 e na #124) | Owner importa as rulesets; verificar `protected=true` | PR de baseline 05/10 |
| P0.1-05 | Add. E.1 | Restore drill local e procedimento hospedado | P0 | — | partial | `scripts/pilot-restore-drill.sh`, `scripts/pilot-backup-preflight.mjs`, `ops/sql/post-restore-probes.sql`, `docs/FINANCIAL_PILOT_PASSPORT_ROLLOUT.md` | drill hospedado nunca executado (sem DB URL) | backup ≠ restore | Owner roda `pilot:restore:drill` com `PILOT_SOURCE_DATABASE_URL` | — |
| P0.1-06 | §38, Add. E.6 | Doctor, canary e env check | P0 | — | implemented | `scripts/finance-pilot-doctor.mjs`, `lib/finance/pilot-doctor.mjs` (espera `financial-operational-resilience-1`), `scripts/pilot-canary.sh`, `ops/sql/pilot-isolation-canary.sql` (inclui isolamento por entidade), `scripts/test-pilot-doctor.mjs` | marcador esperado precisa acompanhar cada migration | GO falso | manter a cada migration | PR multi-entity |
| P0.1-07 | Add. E.4 | Incident severity model, runbook, postmortem template | P0 | — | partial | `docs/FINANCIAL_OPERATIONAL_RESILIENCE.md`, `docs/FINANCIAL_INCIDENT_POSTMORTEM.md` | nomeação de responsáveis e exercício de resposta/DR hospedado | procedimento não exercitado | owner + P0.10 | — |

### P0.2 — Multi-Entity Foundation

Migration `docs/supabase-financial-multi-entity.sql` (`financial-multi-entity-1`), rollback
`docs/rollback/supabase-financial-multi-entity.rollback.sql`. Testes: `tests/database/financial-multi-entity.sql`
(clean install, upgrade sobre base povoada, reapply, rollback no `test:database`),
`scripts/test-finance-entities.mjs` (domínio + API), `tests/e2e/finance-entities.spec.js` (Chromium desktop e mobile
locais; Firefox/WebKit no CI), canário `ops/sql/pilot-isolation-canary.sql` por membro restrito.

| ID | Guideline | Capability | Pri | Dependency | Status | Evidence | Gaps | Risk | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0.2-01 | §11 | Grupo econômico (= organização compradora) + entidades legais + unidades (1 nível) | P0 | Enterprise Core | implemented | `fin_legal_entities`, `fin_create_legal_entity`/`fin_update_legal_entity` (arquivar sem apagar), `/api/finance/entities`, Configurações → Entidades do grupo | relações societárias entre entidades (participação %) e mais de um nível de unidade não modelados | — | modelar só quando um workflow exigir | PR multi-entity |
| P0.2-02 | §11, §47.2 | Escopo por membro: tesouraria do grupo × entidades concedidas; admin sempre do grupo | P0 | P0.2-01 | implemented | `fin_members.entity_scope`, `fin_member_entity_grants`, `fin_set_member_entity_scope`, constraint `fin_members_admin_group_scope`, Configurações → Escopo | delegated admin por entidade (P1.5) | — | P1.5 | PR multi-entity |
| P0.2-03 | §11 | RLS entity-aware (RFQ, convite, proposta, versão, decisão, contrato, aprovação, etapa, revisão, snapshot, marco, tarefa, evento, comentário, documento, busca, autores) | P0 | P0.2-02 | implemented | policies + `fin_search`/`fin_can_read_document`/`fin_comment_authors` reescritas; teste de banco e canário | Passport por entidade (P0.3-02) | — | — | PR multi-entity |
| P0.2-04 | §11 | Escrita cross-entity bloqueada centralmente (gatilhos), inclusive via RPC existente; aprovador precisa de escopo | P0 | P0.2-02 | implemented | `fin_*_entity_guard`, `fin_assert_entity_write`; casos negativos de transição, convite, comentário, tarefa, decisão, renovação, aprovação | — | — | — | PR multi-entity |
| P0.2-05 | §11 | Consolidado sem expor detalhe não autorizado | P0 | P0.2-03 | implemented | `consolidateByEntity` (`lib/finance/entities.mjs`) sobre linhas do RLS; `/api/finance/entity-summary`; card no Painel | consolidado de valores por moeda (depende de P0.6) | soma entre moedas | P0.6/P1.6 | PR multi-entity |
| P0.2-06 | §11 | Moeda base do grupo e moeda local por entidade | P0 | P0.2-01 | implemented | `fin_organizations.base_currency`, `fin_legal_entities.currency`, `fin_set_base_currency` | sem câmbio por decisão (boundary); objetos financeiros ainda sem moeda própria (P0.4/P0.6) | — | P0.4/P0.6 | PR multi-entity |
| P0.2-07 | §11, §34 | Escopo de entidade na trilha | P0 | P0.2-01 | implemented | `fin_events.legal_entity_id` (gatilho `fin_event_entity_stamp`), eventos `rfq_entity_changed`, `contract_entity_assigned`, `member_entity_scope_set`, `legal_entity_*` | Audit Center como superfície (§34) | — | P1 | PR multi-entity |
| P0.2-08 | §11, §39 | UI: contexto/filtro de entidade, entidade na criação de RFQ (obrigatória para restrito), reatribuição auditada, atribuição única de contrato legado, consolidado | P0 | P0.2-01..04 | implemented | `finance/src/views/entities.js` + integrações em `rfqs.js`, `rfq.js`, `company.js`, `dashboard.js`; E2E com overflow check | demo sandbox legado não emula entidades (degrada sem a seção) | — | aposentar sandbox (P0.1-01) | PR multi-entity |
| P0.2-09 | §11 | Aprovação cruzada / group treasury approval por policy | P0 | P0.2, P0.7 | partial | policy da entidade (etapa local, escopo `entity`) + policy do grupo (tesouraria, escopo `group`) somam etapas em sequência ou paralelo; aprovador não ganha acesso por ser aprovador; `tests/database/financial-policy-engine.sql` §4/§6/§9 | rollout hospedado pendente | alçada mal configurada pelo cliente | rollout com gates do piloto | feature/policy-engine-v2 |

### P0.3 — Financial Passport → Financial Graph

| ID | Guideline | Capability | Pri | Dependency | Status | Evidence | Gaps | Risk | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0.3-01 | §10.2 | Proveniência por campo (source, owner, verified_at, review_after, valid_until), histórico append-only, snapshot imutável na RFQ | P0 | — | implemented | `docs/supabase-financial-passport.sql`, `lib/finance/passport.mjs`, `tests/database/financial-passport.sql`, `scripts/test-finance-passport.mjs`, `tests/e2e/finance-passport.spec.js`, `/finance/passport.html` | — | — | manter | #95 |
| P0.3-02 | §10.1 | Passport por entidade legal | P0 | P0.2 | partial | migration aditiva, RLS, history, snapshot, API, resolver, UI e prefill; docs/FINANCIAL_PASSPORT_ENTITIES.md | PostgreSQL CI 37155391334 success; quatro jobs CI success; rollout hospedado pendente | Vercel 403; banco antigo sem backup/restore executor | herança financeira indevida evitada por whitelist; rollback recusa dados de entidade | domínio/API aprovados; financeiro 239 passed/21 skips; apresentação local 301 passed/44 skips; DB remoto success | PR #105 / a2906d6 |
| P0.3-03 | §10.1, Add. B | Graph relacional dos registros canônicos, consultável | P0 | P0.2, P0.4–P0.6 | partial | views SECURITY INVOKER, RPC paginada, API sob JWT, contexto UI; docs/FINANCIAL_GRAPH.md | rollout hospedado pendente; fees sem system of record dedicado | Vercel 403; banco antigo sem executor seguro | joins de ancestrais ocultos retornam null; sem edges redundantes | CI #106 run 37156727940 (4 jobs success) na mesma árvore; reintegrado na pilot por cherry-pick (feature/integrate-financial-graph) com test:database, check:all e E2E Chromium locais | feature/integrate-financial-graph |

### P0.4 — Contract & Renewal Center v2

Migration `docs/supabase-financial-contracts-v2.sql` (`financial-contracts-v2-1`) + rollback fail-closed; testes
`tests/database/financial-contracts-v2.sql`, `scripts/test-finance-contracts.mjs`, `tests/e2e/finance-contracts.spec.js`.

| ID | Guideline | Capability | Pri | Dependency | Status | Evidence | Gaps | Risk | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0.4-01 | §14.2 | Marcos de renovação D-180/120/90/60/30/7, tarefa e aviso idempotentes, nova RFQ a partir do contrato | P0 | — | implemented | `docs/supabase-financial-renewals.sql`, `fin_run_renewal_schedule`, `/api/jobs/renewals`, `fin_start_contract_rfq` (agora também para contrato importado, herdando entidade) | — | — | — | PR contratos/portfólio |
| P0.4-02 | §14.1 | Termos estruturados (partes, valores/limites, pricing, indexador, spread, fees, garantias, covenants, SLA, rescisão, repricing, renovação, campos de adquirência) | P0 | P0.2 | implemented | `lib/finance/contract-terms.mjs` (allowlist), `fin_contract_versions`, `fin_record_contract_terms`, UI "Abrir contrato" | covenants seguem como texto contratual (monitor estruturado é P1.8) | termo inferido | P1.8 | PR contratos/portfólio |
| P0.4-03 | §14.3 | Aditivos imutáveis com versão temporal e contrato pai/filho | P0 | P0.4-02 | implemented | `fin_contract_amendments`, `fin_record_contract_amendment` (preserva fim/aviso anteriores), `parent_contract_id`, diff factual (`diffContractTerms`) | — | — | — | PR contratos/portfólio |
| P0.4-04 | §14.2 | Marcos próprios e obrigações recorrentes com tarefa por ocorrência e job | P0 | P0.4-02 | implemented | `fin_contract_milestones`, `fin_contract_milestone_runs`, `fin_process_contract_milestones`, `fin_run_contract_milestones` no cron | notificação por e-mail do marco depende do provedor de e-mail (owner) | — | — | PR contratos/portfólio |
| P0.4-05 | §14.1 | Contrato existente da carteira (fora de RFQ) e categorias além de crédito/adquirência | P0 | P0.4-02 | implemented | `origin='imported'`, `fin_import_contract`, botão "Registrar contrato existente" | importação em lote (CSV/ERP) é P2.6 | — | P2.6 | PR contratos/portfólio |

### P0.5 — Provider / Bank Relationship Management

Migration `docs/supabase-financial-relationships-portfolio.sql` (`financial-relationships-portfolio-1`); testes
`tests/database/financial-relationships-portfolio.sql`, `scripts/test-finance-portfolio.mjs`, `tests/e2e/finance-portfolio.spec.js`.

| ID | Guideline | Capability | Pri | Dependency | Status | Evidence | Gaps | Risk | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0.5-01 | §12.1 | Cadastro do provedor (tipo, contato, região, evidência regulatória) | P0 | — | implemented | `fin_providers`, `fin_record_provider_evidence`, `/finance/providers.html` | — | — | — | — |
| P0.5-02 | §12.1 | Múltiplos contatos (grupo/entidade), relação provedor × entidade com owner e categorias | P0 | P0.2 | implemented | `fin_provider_contacts`, `fin_provider_relationships`, painel "Relacionamento" | — | — | — | PR contratos/portfólio |
| P0.5-03 | §12.1 | Métricas factuais: convidados, respondidos, taxa e mediana de resposta, contratos, facilities, issues | P0 | — | implemented | `relationshipMetrics` com definições; `GET /api/finance/provider-relationship` sob RLS | — | métrica inventada | — | PR contratos/portfólio |
| P0.5-04 | §12.1, §25 | Issues/follow-ups com resolução e linha do tempo | P0 | P0.5-02 | implemented | `fin_provider_issues`, `fin_open_provider_issue`/`fin_update_provider_issue`, timeline no painel | performance records importados (SLA de serviço) são P1.9 | — | P1.9 | PR contratos/portfólio |
| P0.5-05 | §12.3, §25 | Scorecards definidos pelo cliente, versionados, avaliação imutável, sem score default | P0 | P0.5-04 | implemented | `fin_scorecard_templates`, `fin_provider_reviews`, Configurações → Scorecards | — | score subjetivo | — | PR contratos/portfólio |
| P0.5-06 | §12.2 | Relationship map provedor × entidade × categoria × contratos × limites | P0 | P0.4, P0.6 | implemented | `relationshipMap` + tabela no painel | participação no wallet (exige spend, P1.7) | — | P1.7 | PR contratos/portfólio |

### P0.6 — Debt / Facilities / Limits / Guarantees

| ID | Guideline | Capability | Pri | Dependency | Status | Evidence | Gaps | Risk | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0.6-01 | §13.1 | Facility com provenance (origem, referência, verificado em, revisar depois de), histórico de alterações | P0 | P0.2, P0.4 | implemented | `fin_facilities`, `fin_facility_history` (gatilho), `fin_save_facility`, `fin_confirm_facility`, `/finance/portfolio.html` | importação/integração automática (P2.6/P2.7) | ledger paralelo | — | PR contratos/portfólio |
| P0.6-02 | §13.1 | Saldo/uso point-in-time e cronograma declarado versionado | P0 | P0.6-01 | implemented | `fin_facility_balances` (append-only), `fin_facility_repayments` (`schedule_version`) | — | — | — | PR contratos/portfólio |
| P0.6-03 | §13.1 | Garantias comprometidas | P0 | P0.6-01 | implemented | `fin_guarantees`, `fin_save_guarantee` | — | — | — | PR contratos/portfólio |
| P0.6-04 | §13.2 | Visões por moeda: limites aprovado/usado/disponível, maturity wall, mix de indexadores, concentração, refinanciamento, garantias, revisão vencida | P0 | P0.6-01 | implemented | `portfolioViews` (`lib/finance/portfolio.mjs`), definições por métrica | conversão entre moedas deliberadamente ausente | soma de moedas | — | PR contratos/portfólio |

### P0.7 — Policy & Approval Engine v2

| ID | Guideline | Capability | Pri | Dependency | Status | Evidence | Gaps | Risk | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0.7-01 | §27 | Aprovação sequencial com snapshot, stale detection, segregação solicitante ≠ aprovador | P0 | — | implemented | `docs/supabase-financial-enterprise-approvals.sql`, `docs/supabase-financial-approval-handoff.sql`, `tests/database/financial-enterprise-approvals.sql`, `/finance/approvals.html`; preservado como caminho `legacy` sem policy | — | — | — | — |
| P0.7-02 | §27 | Policies por valor/categoria/entidade/N propostas/provedor novo/garantia/covenant/prazo, versionadas, global vs local, snapshot no processo | P0 | P0.2 | partial | `docs/supabase-financial-policy-engine.sql`, `docs/FINANCIAL_POLICY_ENGINE.md` (fatos, precedência determinística grupo+entidade+fallback, fronteira de moeda), versões imutáveis, snapshot no pedido, `lib/finance/policy.mjs`, Configurações → Governança; testes DB/unit/API/E2E | rollout hospedado pendente; covenant é fato declarado (sem covenant estruturado); sem câmbio por desenho | regra do cliente incompleta (mitigado por fato desconhecido = conservador) | rollout com backup/restore drill/doctor/canário | feature/policy-engine-v2 |
| P0.7-03 | §27 | Escalonamento, prazos de aprovação, justificativa de exceção, group treasury approval | P0 | P0.7-02 | partial | prazos por etapa, escalação idempotente e expiração (`fin_process_approval_deadlines`, job `approval_deadlines`), exceção explícita (`fin_policy_exceptions`), delegação (`fin_approval_delegations`), SoD padrão + configurável, devolução com `reason_code`, substituição explícita | escalação na cadência do cron diário (+ acionamento manual); rollout pendente (aviso próprio de exceção pedida/decidida entregue em `financial-p0-closure-1`) | prazo vencido sem ação humana (mitigado por tarefa + aviso) | idem | feature/policy-engine-v2 |

### P0.8 — Public API & Webhooks Foundation

| ID | Guideline | Capability | Pri | Dependency | Status | Evidence | Gaps | Risk | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0.8-01 | §31.1 | API versionada com service accounts/API keys, scopes, tenant/entity auth, paginação, rate limit, idempotency, audit | P0 | P0.2 | partial | `/api/v1/*` (`lib/api/domains/public-api.mjs`), `docs/supabase-financial-public-api.sql` (token só por hash, credencial AND organização AND entidade AND escopo AND objeto em `fin_api_*`), keyset, filtros fechados, rate limit por credencial fail-closed, `Idempotency-Key`, correlação, trilha em `fin_events`; administração em Configurações → Integrações; `docs/FINANCIAL_PUBLIC_API.md`, OpenAPI | rollout hospedado pendente; escrita v1 só cria rascunho de RFQ | token vazado (mitigado: expiração, revogação imediata, last_used, prefixo por ambiente) | rollout + chave de cifragem por ambiente | feature/public-api-webhooks |
| P0.8-02 | §31.1 | Webhooks: registro, assinatura HMAC, replay protection, retries, delivery log, dead-letter | P0 | P0.8-01 | partial | outbox por gatilho em `fin_events` (payload mínimo), `fin_webhook_claim`/`complete` com lease/fencing, backoff 1 min→24 h, dead-letter na 8ª, auto-desativação em 20 falhas, replay manual, HMAC sobre `t.delivery_id.body`, segredo AES-256-GCM, SSRF (URL + DNS na entrega), `lib/finance/webhook-dispatch.mjs`, job `webhooks` | cadência diária do cron (blocker: agendador em minutos); DNS rebinding resolvido (IP validado fixado no socket, `test-operational-resilience`) | receptor sem verificação (doc + exemplo) | blockers em `docs/FINANCIAL_PUBLIC_API.md` | feature/public-api-webhooks |
| P0.8-03 | §31.1 | Docs, versioning e deprecation policy | P0 | P0.8-01 | implemented | `docs/FINANCIAL_PUBLIC_API.md` (compatibilidade, deprecação ≥ 180 dias com `Deprecation`/`Sunset`, envelopes, erros), `docs/openapi/arandu-public-api-v1.json` com teste de paridade rota↔contrato | — | — | manter Histórico a cada mudança | feature/public-api-webhooks |

### P0.9 — Enterprise IAM / SSO Foundation

| ID | Guideline | Capability | Pri | Dependency | Status | Evidence | Gaps | Risk | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0.9-01 | §33 | MFA para operador da plataforma | P0 | — | implemented | `lib/finance/ops-access.mjs`, `scripts/finance-operator-mfa.mjs` | MFA de usuários de cliente por policy não existe | — | P0.9-02 | — |
| P0.9-02 | §33, Add. F.1 | Abstração SAML/OIDC, mapeamento domínio→organização, session policy, readiness | P0 | P0.2 | partial | `docs/supabase-financial-sso.sql` (conexões, domínio verificado por TXT e globalmente único, `fin_sso_authorize` fail-closed, `fin_sso_session_valid`, revogação, trilha sem PII), adapters `lib/finance/sso-adapters.mjs` (Supabase SAML + IdP de teste), `verifyIdToken` estrito, state HMAC + PKCE, `/api/auth/sso/*`, Configurações → Segurança com prontidão honesta; `docs/FINANCIAL_SSO.md` | nenhum login real com IdP de cliente; rollout hospedado; adapter OIDC direto (além do broker) não ligado ao callback | SSO "funcionando" sem prova (mitigado: "operacional" exige broker real + login de teste registrado) | blockers em `docs/FINANCIAL_SSO.md` (SSO no Supabase, IdP do cliente, DNS, segredos por ambiente, rollout) | feature/enterprise-sso-foundation |
| P0.9-03 | §33, Add. F.1 | Exigência de SSO por organização e falha fechada (issuer, audience, nonce, state, expiração, domínio, organização, membro bloqueado, sessão revogada, tenant sem configuração) | P0 | P0.9-02 | partial | 403 `sso_required` antes da senha e 503 se a política não puder ser lida (`lib/api/domains/auth.mjs`); recusas com motivo estável testadas em `scripts/test-finance-sso.mjs` e `tests/database/financial-sso.sql`; E2E `tests/e2e/finance-sso.spec.js` | depende de P0.9-02 hospedado; MFA de quem entra por SSO fica com o IdP | admin trancado fora (runbook com forward-fix) | rollout + primeiro cliente com IdP | feature/enterprise-sso-foundation |

### P0.10 — Operational Resilience

| ID | Guideline | Capability | Pri | Dependency | Status | Evidence | Gaps | Risk | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0.10-01 | Add. E.1 | Backup preflight, restore drill, probes pós-restore | P0 | — | partial | ver P0.1-05 | hospedado | — | owner | — |
| P0.10-02 | Add. E.4 | Severidade, incident runbook, postmortem, dependency failure modes, RPO/RTO honestos | P0 | — | partial | `FINANCIAL_OPERATIONAL_RESILIENCE.md`, `FINANCIAL_INCIDENT_POSTMORTEM.md` | nomeação de responsáveis e ensaio DR hospedado | não há SLA/RPO/RTO garantidos | owner + drill | CI pendente |
| P0.10-03 | Add. E.5 | Health, request IDs, job runs, outbox retry/backoff | P0 | — | implemented | `/api/health`, `X-Request-ID`, `fin_job_runs` (inclui `approval_deadlines`, `webhooks`), `lib/email-outbox.mjs`, estado por entrega de webhook, `X-Correlation-Id` na API v1, `scripts/test-observability.mjs` | console ampliado; CI da rodada pendente | nenhuma disponibilidade inferida de configuração | P0.10 | CI pendente |

### P0.11 — Data Governance Baseline

| ID | Guideline | Capability | Pri | Dependency | Status | Evidence | Gaps | Risk | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0.11-01 | Add. D.1–D.2 | Classificação, minimização e source of truth consultáveis | P0 | — | implemented | registro por tabela `lib/finance/data-governance.mjs` (77 tabelas/views + infra compartilhada: SoR, classificação, PII/financeiro/credencial, retenção, exclusão, export, hold, dono), gate de cobertura contra as migrations em `scripts/test-finance-data-governance.mjs`, mapa SoR (Graph/busca/painel derivados), gate de minimização da trilha em `tests/database/financial-data-governance.sql`; `docs/FINANCIAL_DATA_GOVERNANCE.md` | metadado não é consultável por SQL (vive no código, verificado em CI) | tabela nova sem classificação (mitigado: gate falha) | P1 nasce classificada | branch `claude/stoic-archimedes-5tb1jj` |
| P0.11-02 | Add. D.4–D.5 | Retenção, legal hold, export, offboarding de tenant, revogação de integrações | P0 | P0.8, P0.9, P0.10 | partial | `docs/supabase-financial-data-governance.sql` (`financial-data-governance-1`): políticas versionadas sem prazo padrão (pisos/tetos técnicos), executor em lote com dry-run, lock, rerun idempotente, hold-aware e trilha `fin_governance_log`; legal hold com escopo validado; export assíncrono com manifesto + sha256 por conjunto, sem segredos, expiração 7 dias; offboarding determinístico com revogação idempotente (contas de serviço, credenciais, webhooks, SSO, convites, membros) sem cascade; job `/api/jobs/governance` com lease em `fin_job_runs`; UI Configurações → Governança de dados; card no console; rollback só sem uso; testes DB (matriz negativa: outro tenant, provedor, viewer, analista, escopo de entidade, sem vínculo, membro e conta de serviço revogados, export/hold/offboarding cross-tenant), JS, concorrência e E2E | exclusão física do tenant não implementada (`closed` exige zero linhas); export até 64 MB/conjunto com download em faixas de 4 MB e checksum (`financial-p0-closure-1`); offboarding de organização provedora; rollout hospedado | exclusão descrita como total (mitigado: docs e UI dizem o contrário) | decisão jurídica de retenção pós-contrato → executor de purge; rollout piloto | branch `claude/stoic-archimedes-5tb1jj` |
| P0.11-03 | Add. D.6 | Superfície de subprocessadores e readiness jurídica | P0 | — | blocked | `docs/FINANCIAL_LEGAL_REVIEW_REQUIRED.md` | parecer jurídico | claim LGPD | owner/jurídico | — |

---

### Legacy Art Marketplace Decommission

Inventário, categorias e procedimento em `docs/LEGACY_ART_RETIREMENT.md` (ponte para o Git: `76c50bf` último estado só de arte, `cfd51ea` último `pilot` com o runtime de arte no tree).

| ID | Capability | Status | Evidence | Gaps / blockers | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- |
| LEG-01 | Runtime, assets, client JS/CSS, dados estáticos, funções serverless, rotas de API e libs só de arte fora do tree | implemented (code complete, CI validated no merge) | ~150 páginas, `js/`, `css/`, `assets/`, `data/`, `content/`, `types/`, `supabase/`, stack Next/TS, 9 funções `api/*`; 23 rotas de arte removidas do roteador `api/[...path].js`; 8 módulos de domínio e 6 libs de arte apagados; `check:legacy-art` (tree, com prova negativa `test-legacy-art-gate`) e `check:financial-surface --dist` | deploys hospedados anteriores ainda respondem `legacy_surface_closed` até o próximo deploy | — | #114, PR final legacy runtime cleanup |
| LEG-02 | Scripts, testes, dependências, variáveis de ambiente e documentos de arte fora do tree | implemented (code complete) | ~35 scripts, 5 specs E2E, `typescript`, ~115 documentos; 8 testes de rotas de arte trocados por ausência (`test-auth-api`: 23 rotas em 404; `test-deployment-surface`); 27 variáveis de arte fora do `.env.example`/validadores, com gate | variáveis antigas podem continuar definidas nos projetos Vercel (não lidas) | limpeza opcional no painel pelo owner | #114, PR final legacy runtime cleanup |
| LEG-03 | Objetos de banco e storage da arte | partial | migration nova `docs/supabase-financial-legacy-art-decommission.sql` (marker `financial-legacy-art-decommission-1`): recusa sem `arandu.legacy_art_decommission_ack=export-verified:<ref>`, grava evidência só de contagens, remove ~36 tabelas, 18 views, ~29 funções e o trigger de perfil sem CASCADE, preserva rate limit e outbox transacional; rollback recusa (restore + forward-fix); clean install, upgrade povoado, reaplicação, canário e probes no `test:database` | aplicação hospedada e bucket de mídia hospedado BLOCKED (backup/restore verificado, export, decisão do owner) | owner executa o procedimento hospedado de `docs/LEGACY_ART_RETIREMENT.md` | PR legacy database decommission |

## P1 — Recorrência, ROI e diferenciação

| ID | Guideline | Capability | Pri | Dependency | Status | Evidence | Gaps | Risk | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P1.1 | §19 | Savings & Value Realization Ledger | P1 | P0.4, P0.2 | implemented | Mergeado na #118 (`pilot@d0d5deb`): tabelas próprias, baseline documentado, metodologias v1 imutáveis por tipo, observação e verificação humana, RLS/FORCE/entity scope, API JWT, `/finance/value.html`, totais por tipo/moeda, Graph derivado, registry/export/hold, migration/rollback, testes negativos. CI do HEAD final `f4b78a2` falhou e foi corrigido na #119 (`pilot@1016b0f`, quatro gates verdes no HEAD exato `189bc9d`, run `37212668535`) | **code complete + CI validated**; hosted validated e production ready pendentes (rollout) | merge com gate pendente (ocorreu); mitigado por `npm run merge:gates` + template; branch protection = BLOCKER | rollout hospedado (BLOCKER) | #118, #119 |
| P1.2 | §17 | Bank Fee Intelligence | P1 | P0.4, P0.5 | implemented | Mergeado na #120 (`pilot@4f97e16`): `fin_fee_schedules`/`_versions` (versionadas, vinculadas a `fin_contract_versions`), `fin_fee_observations` (origem, referência, evidência, verificação humana, dedupe idempotente), `fin_fee_variances` (snapshot imutável, comparabilidade com motivos, sem número forçado), `fin_fee_reviews` (máquina de estados humana); RLS/FORCE/entity scope; RPCs; API JWT; `/finance/fees.html` (renderer genérico + apresentador no servidor, linguagem segura); painel do provedor; Graph; registry/export/hold/offboarding; migration/rollback; testes SQL/API/E2E (`docs/FINANCIAL_FEE_INTELLIGENCE.md`) | ingestão automática (API/ERP/arquivo/extração) inexistente por desenho; API pública sem `fees:read`; hosted pendente | falso positivo de diferença (mitigado: só comparável calcula, linguagem segura, revisão humana); **code complete + CI validated** (run `37214713845`, quatro gates success no HEAD exato `e889aff`); hosted validated e production ready pendentes | rollout hospedado (BLOCKER) | #120 |
| P1.3 | §18 | Opportunity Engine determinístico | P1 | P0.4–P0.6, P0.10, P1.1, P1.2 | implemented | Mergeado na #121 (`pilot@5c4b88a`): regras versionadas da empresa (14 tipos, limiares financeiros sem padrão), `fin_opportunities` com fatos congelados, fingerprint/dedupe, cooldown, reabertura por mudança material, expiração com motivo, máquina de estados humana com revisor, job `opportunities` (lease/fencing/lotes/cursor) na cron diária, gatilho incremental de tarifas, rascunho de RFQ com confirmação, worklist `/finance/opportunities.html`, Graph, registry/export/hold, migration/rollback, testes (`docs/FINANCIAL_OPPORTUNITY_ENGINE.md`) | notificações por oportunidade; API pública sem `opportunities:read`; cadência da cron diária (BLOCKER P0.10); hosted pendente | virar recomendação (mitigado: fato+regra da empresa+ação possível, sem ranking, linguagem testada); **code complete + CI validated** (run `37217236168`, quatro gates success no HEAD exato `70df5d3`); hosted validated e production ready pendentes | rollout hospedado (BLOCKER) | #121 |
| P1.4 | v3 §15 | Proposal & Document Intelligence | P1 | docs privados | partial | `docs/supabase-financial-document-intelligence.sql` (`fin_document_extractions`, `fin_extraction_facts`, `fin_extraction_reviews`, RPCs begin/record/fail/review, RLS via `fin_can_read_document`, imutabilidade, tarefa idempotente, export), leitores determinísticos PDF/XLSX/DOCX atrás de `ExtractionProvider` (`lib/finance/extraction-providers.mjs`), `ModelProvider` só abstração, normalização com estados sem inventar, diff semântico com proveniência, `untrustedText`, evals sintéticos com limiares por criticidade, API `extractions/*`, `/finance/extractions.html` (fora do pacote demo), testes Node/DB/E2E, `docs/FINANCIAL_DOCUMENT_INTELLIGENCE.md` | sem OCR nem modelo configurado; fatos confirmados ainda não alimentam proposta/contrato automaticamente; Opportunity/busca/Graph ainda não consomem fatos | extração errada (mitigado: crítico exige confirmação, eval gate, estados explícitos) | M2 quando o CI rodar; hosted após Stage 0 | branch `claude/vibrant-lovelace-gnz9qs` |
| PQ-01 | v3 §11 | Provider Qualification & Due Diligence | P1 | P0.5 | partial | `docs/supabase-financial-provider-qualification.sql` (exigências versionadas do cliente, qualificação por provedor×categoria×entidade, evidência com origem/validade incl. serviço externo, exceções com SoD, trilha, prontidão no banco, consulta `fin_provider_qualification_status`, job de vencimento), API `qualifications/*`, `/finance/qualifications.html`, testes Node/DB/E2E, `docs/FINANCIAL_PROVIDER_QUALIFICATION.md` | portal do provedor não envia evidência; vencimento ligado à cron com lease e contadores validados (M1/E1, check:all/build locais PASS; CI próprio pendente); policy ainda não consome o estado | virar "aprovação do Arandu" (mitigado: linguagem testada, serviço externo como evidência) | M2 quando o CI rodar | branch `claude/vibrant-lovelace-gnz9qs` |
| P1.5 | §33, Add. F.2 | SCIM / JIT / access reviews / service accounts | P1 | P0.9 | missing | — | — | misconfiguration | — | — |
| P1.6 | §26 | Executive Portfolio | P1 | P0.4–P0.6 | partial | `/finance/dashboard.html` (pipeline, tarefas, prazos, consolidado por entidade, **Inteligência de valor**: valor negociado/realizado/evitado, diferenças e revisões de tarifa, cobertura, oportunidades — por moeda, entidade e período, com links de ação; `docs/FINANCIAL_VALUE_INTELLIGENCE_EXECUTIVE.md`), `/finance/portfolio.html` (dívida, limites, concentração, garantias) | cycle times; P1.7 Spend Analytics; export executivo | dashboard sem ação (mitigado: cada cartão leva ao trabalho); soma entre moedas/tipos (proibida e testada) | fatia executiva CI validated e mergeada na #122; validar hosted | #122 |
| P1.7 / SI-01 | v3 §16 | Financial Spend Intelligence | P1 | P1.2, PP-01 | partial (M1/E1 evidence slice) | `FINANCIAL_SPEND_INTELLIGENCE.md`; immutable records/reconciliation; fee projections; currency/type/entity/provider/product totals; API/UI; Search/Graph/export/Executive | allocation splits, wallet/concentration, Opportunity candidates, tasks/reminders, bulk imports, E2E/CI/hosted | duplicate references require independent human reconciliation; no FX or savings inferred | aprofundar antes de M2 | main #136/#137 |
| P1.8 / CO-01 | v3 §13 | Covenant & Obligation Monitor | P1 | P0.4 | partial (core implementado, M1) | `FINANCIAL_COVENANTS.md`; #133 incorporated in pilot a2face3 without valid CI | hosted, independent CI | breach falso | M2 after exact-SHA gates | #133 |
| P1.9 / PP-01 | v3 §12 | Provider Performance | P1 | P0.5 | partial (core implementado, M1/E1) | `FINANCIAL_PROVIDER_PERFORMANCE.md`; 5 SoRs; metas/métodos do cliente; observações/revisões imutáveis; fechamento; API/UI; Search/Graph/Executive/Opportunity/exports/lembretes | CI, browser execution, hosted; sem score agregado ou conector externo | score universal (proibido); dado ausente ≠ zero | M2 com gates exatos | main #136/#137 |
| P1.10 | §35 | Enterprise Search | P1 | P0.2 | partial | `fin_search` (RFQ/proposta/provedor/contrato/tarefa, limitado), entity-aware desde a multi-entity | sem filtros de entidade/data/estado/categoria; não cobre documentos, comentários, obrigações | leakage | após P0.4–P0.6 | — |
| P1.11 | §22 | Enterprise Intake | P1 | P0.2 | missing | intake só na demo (`DEMO_ONLY_PAGES`) | — | campo crítico inferido | — | — |
| P1.12 | §21 | Scenario Builder / split award | P1 | comparação | missing | — | — | parecer recomendação | — | — |

## P2 — Product Packs e integrações

| ID | Guideline | Capability | Pri | Dependency | Status | Evidence | Gaps | Risk | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P2.1 | §30.2 | FX Pack | P2 | gate §43.1 | missing | catálogo `lib/finance/products.mjs` com 2 produtos | gate §43.1 não respondido | boundary regulatório | após P0/P1 | — |
| P2.2 | §30.2 | Guarantees/Surety Pack | P2 | gate §43.1 | missing | — | — | — | — | — |
| P2.3 | §30.2 | Cash Management RFP | P2 | gate §43.1 | missing | — | — | escopo virar TMS | — | — |
| P2.4 | §30.2 | Working Capital / Receivables | P2 | gate §43.1 | missing | — | — | — | — | — |
| P2.5 | §30.2 | Acquiring Intelligence v2 | P2 | P1.2 | partial | adquirência v1 (MDR, PIX, antecipação, liquidação) | contrato vs realizado | — | — | — |
| P2.6 | §31 | ERP/TMS connector framework | P2 | P0.8 | missing | — | — | source conflict | — | — |
| P2.7 | §32 | Open Finance | P2 | P0.11, consentimento | blocked | — | consentimento real/parceiro | privacy | readiness | — |
| P2.8 | §31.4 | Teams/Slack/BI/provider APIs | P2 | P0.8 | missing | — | — | decisão fora do contexto | — | — |

## P3 — Network effects e data moat

| ID | Guideline | Capability | Pri | Dependency | Status | Evidence | Gaps | Risk | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P3.1 | §28 | Provider Discovery Network | P3 | buyer-side maturity | blocked | — | gate de maturidade buyer-side não comprovado (sem cliente real em operação) | privacy/neutrality | não iniciar | — |
| P3.2 | §29.2 | Internal benchmarks | P3 | P1.1, P1.2 | missing | — | — | — | após P1 | — |
| P3.3 | §29.3, §43.2 | External benchmark | P3 | gates jurídicos/estatísticos | blocked | — | volume, contrato/legal basis, anonimização, revisão jurídica | reidentificação | não iniciar | — |

## Camada assistiva — AI Financial Procurement Analyst

| ID | Guideline | Capability | Pri | Dependency | Status | Evidence | Gaps | Risk | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AI-01 | §24 | Assistente factual com grounding sob RLS | P1+ | P0/P1 dados confiáveis | missing | — | provedor de modelo, revisão de dados em IA (§50) | retrieval sem permissão | depois de P1 | — |

---

## Log de execução da rodada (03/10/2026)

### Estabilização pós-#103

Baseline viva `pilot@742fc1f`; ver `PILOT_STABILIZATION_2026-10-03.md`.
`presentation` no run 37148718617 falhou por overflow determinístico de 31 px
no Mobile Safari, causado pelo rótulo nowrap da ação de Contract Center. Correção
localizada nos botões de contratos e teste 320/393 px, light/dark, teclado e scroll
de marcos. Gates locais e resultados remotos constam na PR de estabilização.
Os deploys dos três projetos Vercel falharam nesse SHA; logs/configuração bloqueados
por 403 de acesso à equipe. Causa do deploy ainda não comprovada. Pilot **não** é
declarada saudável. P0.3-02/P0.3-03 continuam `missing`; P0.7 não foi antecipado.

1. Sincronizado `pilot` (`6ad0d4f`), confirmado `main` ⊂ `pilot`, branch de trabalho a partir de `pilot`.
2. Auditoria acima. Primeiro gap P0 não bloqueado: **P0.2 Multi-Entity Foundation** (P0.1
   restante é externo/owner).
3. P0.2 implementado (migration, RLS, guardas, API, UI, testes, docs). Validação local: `test:database`
   verde (clean/upgrade/reapply/rollback/canário com membros restritos: 0 vazamentos), `check:all` verde,
   build + gates de dist, E2E financeiro em Chromium desktop/mobile (65 + 14 passaram, 7 pulados por
   projeto), `audit:ci` 0 vulnerabilidades. PR #101.
4. P0.4 Contract Center v2, P0.5 Provider RM e P0.6 Debt/Facilities implementados em `agent/contract-center-v2`
   (PR empilhada sobre #101). Próximo: P0.7 Policy & Approval Engine v2 → P0.8 API/Webhooks → P0.9 IAM/SSO.

### Continuação P0.3 após #104

Baseline pilot 69e1472, #104 mergeado; quatro jobs CI success (run 37151733366). Blockers hospedados permanecem no documento de estabilização, com owner/ação/verificação. Passport entity-aware está em implementação/teste, sem claim de operação hospedada. Próximo passo independente: Financial Graph relacional; Policy v2 depende desta base.

## Continuação Passport e Graph — 2026-10-03

#105: banco e deploy-boundaries success no run 37155391334; validate success; presentation success. Local Passport: 239 financeiros e 301 apresentação aprovados, 21/44 skips existentes. O estado histórico acima registra observações anteriores; P0.3-02 e P0.3-03 agora partial. Graph é camada de consulta, sem duplicar records. Próxima ação: validar Graph no CI real e seguir P0.7. Vercel/rollout continuam externos, sem claim de saúde.

## Integração do Financial Graph na pilot — 2026-10-03

O #106 foi mergeado em `feature/passport-legal-entity` (PR empilhada), não na `pilot`. A recuperação nasce de `pilot@1caa67f` e traz só `b59ab5d` + `b3449e2` por cherry-pick (`-x`); a árvore resultante é idêntica à validada no run 37156727940. Gates locais nesta branch: audit, SBOM, check:all, build, dist-assets, build-size, test:database (Postgres 16), E2E financeiro e apresentação em Chromium desktop/mobile; Firefox/WebKit ficam com o CI. Regra desta rodada: nenhuma PR empilhada; cada feature nasce da `pilot` e volta para a `pilot`.

## P0.7 Policy & Approval Engine v2 — 2026-10-03

Branch `feature/policy-engine-v2` nasce de `pilot@dc43f57` (merge do #107, Graph integrado), sem empilhamento. Entrega: migration `financial-policy-engine-1` (aditiva, idempotente, rollback que aborta diante de trilha), domínio, API, UI (Governança, aba Aprovações, caixa de aprovações), job de prazos e docs (`docs/FINANCIAL_POLICY_ENGINE.md`). Evidência local: `test:database` completo (clean, upgrade sobre aprovações v1, reaplicação, rollback), `check:all`, testes de domínio/API e E2E. Status `partial` (não `implemented`) porque o rollout hospedado segue bloqueado pelos gates do piloto. Próximo: P0.8 Public API & Webhooks a partir da `pilot` após o merge.

## P0.8 Public API v1 & Webhooks — 2026-10-03

Branch `feature/public-api-webhooks` rebaseada sobre `pilot@582291c` (merge do #108), sem empilhamento. Entrega: migration `financial-public-api-1` (contas de serviço, credenciais por hash, idempotência, endpoints, eventos, entregas; rollback que aborta diante de trilha), borda `/api/v1/*` com contrato estável e OpenAPI, administração em Configurações → Integrações, worker de entrega e job `webhooks`. Evidência local: `test:database` completo, testes de domínio/API/integrações, E2E. Blockers externos (chave de cifragem por ambiente, agendador em minutos, rollout hospedado) com BLOCKER/WHY/WHO/ACTION/READY/VERIFY em `docs/FINANCIAL_PUBLIC_API.md`. Próximo: P0.9 Enterprise IAM/SSO foundation a partir da `pilot` após o merge.

## P0.9 Enterprise SSO foundation — 2026-10-04

Branch `feature/enterprise-sso-foundation` nasce da `pilot` após o merge do #109, sem empilhamento. Entrega: migration `financial-sso-1` (aditiva, idempotente, rollback que aborta diante de configuração ou trilha), validação estrita de identidade com IdP de teste de chaves reais, adapter Supabase SAML, callback com motivos estáveis, exigência de SSO no login por senha, limite e revogação de sessão, administração e prontidão em Configurações → Segurança, "Entrar com SSO" no login, runbook e threat model. Status `partial`: não houve login real com IdP de cliente e o rollout hospedado segue bloqueado; não há claim de SSO funcionando. Próximo: P0.10 Operational Resilience a partir da `pilot` após o merge.

## Correção do gate pós-#110 — 2026-10-04

Baseline viva `pilot@13532e188bc7547e4042440e61b45988d5278e80`.
O run `37165743881` terminou com `validate`, `database` e `deploy-boundaries`
aprovados; `presentation` falhou no teste de desempenho da RFQ em WebKit desktop:
p95 de navegação de 1892 ms, 1592 ms e 1557 ms nas três tentativas, contra o
orçamento obrigatório de 1500 ms. Os limites, navegadores, retries e assertions
permanecem intactos.

Branch `fix/pilot-webkit-route-performance`, diretamente desta `pilot`, remove
cascatas independentes no caminho crítico: imports do transporte local em
paralelo, transporte e workspace em paralelo, preload apenas do módulo da tela
atual durante o bootstrap, e consulta de entidades em paralelo às consultas de
aprovação no detalhe da RFQ. Regras de autorização e validação da política
continuam no servidor; somente a ordem de início das leituras independentes muda.

Validação local: `npm ci --include=optional`; `check:all` executado sem
credenciais herdadas e com conexões reais de rede bloqueadas; build aprovado.
WebKit local não pôde iniciar por bibliotecas de sistema ausentes; a instalação
das dependências também foi recusada pelo ambiente de execução. Evidência
cross-browser e os quatro gates completos ficam pendentes do CI desta PR.
Nenhum merge está autorizado enquanto algum gate obrigatório estiver pendente
ou falhando. P0.10, P0.11 e P1 permanecem com seus estados anteriores.

A revisão cirúrgica identificou para P0.10: preflight de backup com allowlist
de marcadores desatualizada, conclusão de webhook com falha ocultada, cron de
renovação respondendo sucesso apesar de falhas nos jobs dependentes e resolução
DNS de webhook sem timeout próprio. São lacunas encontradas, ainda não corrigidas
nesta PR de estabilização. Próximo: concluir os gates desta correção, merge
verde e nova branch da `pilot` para P0.10.


### P0.10 — rodada de resiliência, 2026-10-04

A PR #111 foi mergeada em `3be02b4c60631dfb592184e1d42bed1063239586` após os quatro gates verdes ([CI](https://github.com/lucasweber1202/Arandu/actions/runs/37167183736)): validate 319 passed/21 skips preexistentes; presentation 301 passed/44 skips preexistentes, sem flaky e performance desktop aprovada na primeira tentativa nos três motores. Branch de resiliência nasce diretamente desse merge.

Entrega da rodada: schema `financial-operational-resilience-1`; jobs running/início/fim/failed e leases com fencing; conclusão idempotente, expiração e retomada; lotes limitados e sem starvation de ocorrências já processadas; falha parcial/telemetria não vira sucesso HTTP; resposta externa inválida não vira zero; DNS com prazo, IP de webhook fixado no TLS, completion_failed/deferred visíveis, lease vencido rejeitado, 4xx semântico terminal e backoff com jitter; preflight reconhece os marcadores recentes sem liberar origem/escopo desconhecido; console existente ampliado mantendo finance_ops + MFA e auditoria; runbook canônico, severidades, dependências, DR e postmortem.

P0.10 permanece **partial**: nomes e escala de responsáveis, restore/DR hospedados, RPO/RTO medidos, IdP real e jornada hospedada dependem do owner/executor. Nenhum banco hospedado alterado, nenhum gate externo marcado pronto, nenhum SLA ou recovery garantido. Testes locais de contratos, banco/upgrade/rollback e quatro gates remotos são necessários; Local: check:all sem credenciais/rede real, build limpo, assets e budgets aprovados (406236 bytes JS/800000); testes de timeout, DNS, respostas malformadas, lote parcial, UTF-8 e códigos seguros aprovados. Banco/concorrência/upgrade/rollback e CI desta rodada ainda pendentes. P0.11 e P1 não avançaram antes do merge verde de P0.10.


## P0.11 Data Governance — 2026-10-04

Partiu de `pilot` @ `cfd51ea` (merge da #112, P0.10), sem PR posterior e com `feature/data-governance` idêntica à `pilot`. Entregue no código: registro de classificação/SoR, retenção versionada, legal hold, export portável, offboarding com revogação, semântica de exclusão, trilha, UI, job e documentação (`docs/FINANCIAL_DATA_GOVERNANCE.md`). Local: `npm run test:database` verde (clean install, reaplicação, upgrade sobre base povoada, rollback recusado com estado e aceito sem uso, canário com as tabelas novas, concorrência), `npm run check:all` verde, build e budgets aprovados (governança em chunk próprio sob demanda), E2E financeiro em Chromium desktop + mobile. Firefox/WebKit ficam para o CI. Hospedado: nada aplicado; P0.11 permanece `partial` até a exclusão física (decisão jurídica) e o rollout do piloto. Próximo: aposentadoria do legado de arte (runtime, depois banco/storage).


## Legacy art runtime cleanup — 2026-10-04

Partiu de `pilot` @ `07f6221` (merge da #113, P0.11). Removido do tree: 567 arquivos (−35,6 mil linhas): tracked files 1259 → 721; bytes versionados 31,6 MB → 28,6 MB (o restante é majoritariamente evidência visual da demo financeira). Artefato publicado inalterado em superfície (JS 421 kB / 800 kB, sem página, texto, asset ou SEO de arte, conferido pelo novo `check-legacy-art --dist`). Blocker registrado: a leitura do roteador `api/[...path].js` foi negada pela política de permissões desta sessão; as rotas de arte dentro dele seguem fechadas (404) em piloto/produção/demo e são o próximo passo do owner.


## Legacy art database decommission — 2026-10-04

Partiu de `pilot` @ `0738693` (merge da #114). Migration aditiva nova; nenhuma migration histórica editada. Local: `npm run test:database` verde (clean install em passada única com 25 suítes financeiras, upgrade sobre base com dados de arte recusado sem ack e com ack inválido e aceito com ack, reaplicação idempotente, canário, probes pós-migração, rollback recusado). Hospedado: nada aplicado; piloto e produção só recebem a migration depois de backup com restore verificado, export dos dados de arte e decisão registrada do owner (BLOCKER em `docs/LEGACY_ART_RETIREMENT.md`).


## Final legacy runtime cleanup — 2026-10-04

Partiu de `pilot` @ `051f10f` (merge da #115). `api/[...path].js` lido por inteiro e reescrito para a superfície financeira (finance/*, auth/*, v1/*, crons, security.txt); 23 rotas de arte, 8 módulos de domínio e 6 libs de arte removidos; `authSessionCookie` (console finance_ops) e security.txt preservados em módulos próprios; modelos de e-mail de arte e 27 variáveis de ambiente de arte removidos; `lib/legacy-surface.mjs` → `lib/deployment-surface.mjs` (`route_not_found`). Gate `check:legacy-art` ampliado (módulos, imports, rotas do roteador, env, modelos de e-mail) com prova negativa. Login, cadastro, refresh, logout, recuperação, SSO, MFA do console, API financeira, Public API, crons, health e security.txt cobertos por `test-auth-api`, `test-finance-sso`, `test-finance-public-api`, `test-deployment-surface`, `check-security-contact` e E2E.


## Clean-room final e P0 closure — 2026-10-04

Clean-room num clone limpo de `pilot` @ `63dddd5` (merge da #116), sem artefato do checkout de trabalho: `npm ci --include=optional`, `audit:ci`, `sbom:ci`, `check:all`, `build`, `check:dist-assets`, `check:build-size`, `check:seo:dist`, `check:financial-surface`, `check:legacy-art`, `test:e2e:list`, `test:database`, `test:e2e`, `test:e2e:presentation`, `git diff --check` — todos verdes: audit 0 vulnerabilidades, SBOM 21 componentes, E2E Chromium desktop+mobile 135 aprovados (7 skipped), apresentação 119 aprovados (19 skipped), 0 falhas. Estado final da arte em `docs/LEGACY_ART_RETIREMENT.md`: runtime, rotas, assets, dependências e variáveis = 0; testes de arte = só ausência/aposentadoria (testes de comportamento de reserva, pedido, perfil, status operacional e retenção de arte saíram do `test:database`; a outbox compartilhada passou a ser testada pelo caminho financeiro); migrations históricas preservadas; limpeza hospedada de banco e storage controlada por blocker.

Revisão de todos os P0 `partial`/`missing`:

| ID | Gap | Classe | Resultado |
| --- | --- | --- | --- |
| P0.7-03 | aviso de exceção sem notificação própria | CODE_IMPLEMENTABLE | **feito**: `financial-p0-closure-1` (pedida → quem decide; decidida → quem pediu), preferência própria, teste DB |
| P0.11-02 | export > 4 MB por conjunto falha | CODE_IMPLEMENTABLE | **feito**: teto 64 MB, `fin_governance_export_part_range`, manifesto isolado, download em faixas conferido por sha256 na interface |
| P0.8-02 | DNS rebinding residual | CODE_IMPLEMENTABLE | **já resolvido no código** (P0.10); documentação corrigida |
| P0.7-02 | covenant estruturado; câmbio | INTENTIONAL_BOUNDARY | Covenant Monitor é P1 (addendum P1.8); sem câmbio por desenho |
| P0.8-01 | escrita v1 só rascunho de RFQ | INTENTIONAL_BOUNDARY | ação material permanece humana |
| P0.9-02 | adapter OIDC direto sem callback | INTENTIONAL_BOUNDARY | a sessão é emitida pelo broker (Supabase Auth); adapter direto só com cliente que exija, sem broker |
| P0.11-02 | offboarding de organização provedora | EXTERNAL_BLOCKER | exige decisão de produto sobre propostas que pertencem a compradores |
| P0.11-02 | exclusão física do tenant | EXTERNAL_BLOCKER | exige decisão jurídica de retenção pós-contrato |
| P0.1-01, P0.1-05, P0.1-07, P0.2-09, P0.3-02, P0.3-03, P0.7-02/03, P0.8-01/02, P0.9-02/03, P0.10-01/02, P0.11-02 | rollout/drill/DR/IdP/cron/DEMO/produção | EXTERNAL_BLOCKER | blocos abaixo |

```
BLOCKER: rollout hospedado das migrations financeiras (piloto; produção depois)
WHY: o banco do piloto está atrás do código; aplicar exige ambiente confirmado e restore verificado
WHO MUST ACT: owner com acesso ao Supabase do piloto
EXACT ACTION: ARANDU_ENV=pilot npm run finance:pilot:doctor; npm run pilot:backup:preflight; npm run pilot:restore:drill (destino descartável); npm run migrations:bundle -- --after-schema=<marker atual>; aplicar; doctor, canário e jornada autenticada. A aposentadoria da arte só com o procedimento de docs/LEGACY_ART_RETIREMENT.md
WHAT IS READY: migrations com rollback/forward-fix, bundle por marker, canário, probes, doctor com marker esperado
HOW TO VERIFY: doctor GO com o marker esperado; canário sem falha; jornada autenticada
```

```
BLOCKER: restore drill e ensaio de DR hospedados; RPO/RTO medidos
WHY: nenhum restore hospedado foi executado; sem medição não há RPO/RTO declarável
WHO MUST ACT: owner / responsável pela plataforma
EXACT ACTION: npm run pilot:restore:drill contra o backup real em destino descartável, cronometrado; registrar em docs/FINANCIAL_RELEASE_EVIDENCE_<data>.md
WHAT IS READY: scripts de preflight, drill e probes pós-restore
HOW TO VERIFY: evidência datada com tempo de restore e probes verdes
```

```
BLOCKER: login real com IdP de cliente (SSO)
WHY: o caminho broker foi testado com IdP de teste; nenhum IdP corporativo real
WHO MUST ACT: owner + primeiro cliente com IdP
EXACT ACTION: configurar SSO no Supabase do ambiente, domínio verificado por TXT, login de teste registrado (docs/FINANCIAL_SSO.md)
WHAT IS READY: fluxo fail-closed, prontidão honesta na interface, testes
HOW TO VERIFY: login SSO real registrado; prontidão "operacional" na tela
```

```
BLOCKER: cadência de cron em minutos (webhooks, escalação de aprovação, governança)
WHY: o plano atual do Vercel executa cron diariamente
WHO MUST ACT: responsável pela plataforma
EXACT ACTION: agendar /api/jobs/* com CRON_SECRET a cada 1–5 min (plano Vercel adequado, pg_cron + pg_net, ou agendador externo)
WHAT IS READY: endpoints idempotentes com lease e fin_job_runs
HOW TO VERIFY: fin_job_runs na cadência configurada
```

```
BLOCKER: ambiente DEMO com Supabase próprio e produção com banco próprio
WHY: limite do plano Supabase e configuração de projetos fora do repositório
WHO MUST ACT: owner
EXACT ACTION: criar projetos dedicados e definir ARANDU_ENV/SUPABASE_* por projeto Vercel (docs/FINANCIAL_OWNER_ACTIONS.md)
WHAT IS READY: build e doctor por ambiente, guarda contra banco legado
HOW TO VERIFY: ARANDU_ENV=<env> npm run finance:pilot:doctor GO em cada ambiente
```

```
BLOCKER: proteção de branch no GitHub
WHY: não verificada nesta sessão (sem permissão de administração); não se afirma que está ativa
WHO MUST ACT: owner do repositório
EXACT ACTION: exigir os quatro checks (database, validate, presentation, deploy-boundaries) e PR para pilot e main
WHAT IS READY: CI com os quatro jobs
HOW TO VERIFY: Settings → Branches mostra as regras
```

Status de entrega: **code complete** e **CI validated** para o que entra por PR; **hosted validated** e **production ready** continuam dependentes dos blockers acima.

## P1.1 — implementação em andamento, 2026-10-04

Base viva: `pilot@0445e750525f7671e04fe1c482fd7e7cc88970b3`, PR #117 mergeada; run `37195610327` com os quatro jobs verdes. `main...pilot`: ahead 63, behind 0. Branch nova `feature/savings-value-realization`, sem PR empilhada. Novas fontes canônicas: `fin_value_records`, `fin_value_methodologies`, `fin_value_observations`. Graph, totais e busca contextual são projeções. Custos incomparáveis não recebem número; realização exige observação posterior ao baseline, período encerrado, cobertura completa, mesma moeda e verificação humana.

Local: domínio/API de valor passou; check:all hermético final passou (inclui domínio/API de valor, paridade registry/export, manifest e preflight); build passou, JS 435602/800000, maior chunk 82339/100000, sem aumento de thresholds. SBOM gerado (21 componentes); assets 30 páginas/232 referências, navegação 30 páginas e financial-surface/legacy-art passaram. SEO dist passou com ARANDU_SITE_URL de fixture igual ao CI (30 páginas, zero erros), sem claim de domínio real. npm ci/audit bloqueados por DNS de registry.npmjs.org. test:database não executou SQL: psql ausente. E2E tentou os cinco projetos, falhou na inicialização por executáveis Playwright ausentes; não constitui evidência de comportamento da UI. Nenhum gate externo foi marcado pronto.

CI da PR #118, primeiro HEAD `fda0c6be`, run `37207857787`: presentation passou; deploy-boundaries falhou por JS preview 812530/800000; database falhou por fixture com product credito em vez do catálogo credit; validate falhou no seletor exato de Título com indicador obrigatório. As causas foram corrigidas em lote, preservando testes/projetos/thresholds. Nova validação local: check:all hermético e vercel-build preview passaram, JS 798442/800000, maior chunk 88479/100000; E2E list 365 testes em nove arquivos. Sprite mantém exatamente os 42 glyphs originais; teste browser exige bbox positivo. Run corretivo `37210038487` em `e70ce5e`: deploy-boundaries passou; database avançou até a suíte histórica da instalação final e revelou duas assertions de compatibilidade sem o novo marker. Atualizadas para reconhecer a migration aditiva, mantendo a rejeição de markers desconhecidos; adicionados negativos de replay, precisão, escrita direta e freeze antes da revogação. Revisão de profundidade adicionou filtro de categoria com paridade lista/totais, metodologia própria contrafactual de custo evitado (sem claim de caixa) e metodologia observada de realização; negativos de provedor e invalidação em cascata. Run `37210272796` em `e0775164`: database e deploy-boundaries passaram; navegadores ainda em execução nesse HEAD. Revisão final local passou check:all e preview vercel-build, JS 798701/800000 (maior chunk 88479/100000). CI do lote final continua pendente; nenhum merge autorizado por gates da base ou do HEAD anterior.

BLOCKER: validação local de banco/browser e dependências novas.
WHY: este executor não tem psql nem browsers e DNS de registry.npmjs.org não resolve.
WHO MUST ACT: executor com PostgreSQL e navegadores disponíveis; CI valida o lote em PR draft.
EXACT ACTION: executar npm ci --include=optional, gates completos e testes SQL clean/upgrade/reapply/rollback, todos os projetos Playwright; corrigir qualquer falha antes do merge.
WHAT IS READY: implementação, migration aditiva, rollback fail-closed, canário, testes negativos e documentação nesta branch.
HOW TO VERIFY: quatro jobs obrigatórios no SHA exato da PR, sem falhas, além de revisão do diff e evidência local declarada.

BLOCKER: rollout do Pilot hospedado.
WHY: não foi disponibilizado acesso autenticado ao banco/ambiente, backup e restore drill verificáveis.
WHO MUST ACT: owner do ambiente e operador autorizado.
EXACT ACTION: confirmar projeto e markers vivos; backup; restore em alvo descartável; comparação pós-restore; gerar bundle exato após marker observado; doctor e canário; jornada autenticada. Para decommission com dados, export verificado e reconhecimento export-verified:<ref> são obrigatórios.
WHAT IS READY: manifest, bundle determinístico, doctor e canário incluindo financial-value-realization-1; não houve aplicação hospedada.
HOW TO VERIFY: docs/FINANCIAL_PILOT_GO_LIVE.md e evidência datada dos comandos, checks e jornada no ambiente correto.


## P1.1 pós-merge — reconciliação da #118, 2026-10-04

A #118 foi mergeada em `pilot` (`d0d5deb`) com `validate` e `presentation` ainda em execução no HEAD final `f4b78a2`. Resultado final do run `37210594484` nesse SHA: `database` success, `deploy-boundaries` success, **`validate` failure**, **`presentation` failure**. P1.1, portanto, **não** estava CI validated; P1.2 não foi iniciada sobre essa base.

Causas raiz (reproduzidas localmente com Chromium antes de corrigir):

- `presentation` (chromium/firefox/webkit desktop, `demo-workspace-next` "tema escuro sem vazamento"): o `h1` saía com `--text` claro (`#101828`) sobre fundo escuro. A #118 desligou `modulePreload` para caber no orçamento de JS; com isso o Vite passou a emitir o CSS da demo (`boot-*.css`, de `finance/demo/experience.css`) antes de `finance/style.css`. Os aliases de token da demo ficavam em `.dw{}` e os do produto em `:root{}` — mesma especificidade — e a ordem passou a decidir. Correção: os três blocos-base da demo passam a `html.dw{}` (0-1-1), tornando a precedência independente da ordem de carregamento; relação com os seletores de atributo (`.dw[data-theme=dark]`, 0-2-0) inalterada. Restaurar o `modulePreload` padrão também corrigia, mas estourava o orçamento (804.226/800.000); preload só de CSS não corrigia (o problema é ordem, não ausência).
- `validate` (mobile-chrome, mobile-safari, `finance-value`): o teste do sprite media o primeiro `svg.icon use` do DOM, que no celular está na barra lateral oculta (bbox 0). No mesmo celular, os ícones visíveis (topbar, tabbar, estado vazio) desenham com bbox 16–18. O produto estava correto; o teste passa a medir o primeiro ícone **visível**, com a mesma asserção (bbox > 0).
- `presentation` também registrou um *flaky* em webkit-desktop (`demo-workspace-v2` aria-expanded após Escape) que passou no retry; não é causa da falha do job e não foi alterado.

Sem aumento de orçamento, threshold, retry ou skip; nenhum navegador ou assertion removido. Orçamento preview inalterado: JS 798.701/800.000 (maior chunk 88.479/100.000); produção 426.641.

Trava de governança nova: `lib/merge-gates.mjs` + `npm run merge:gates -- <PR>` exigem os quatro jobs concluídos com sucesso no SHA exato do HEAD da PR (pending/in_progress/falha/cancelado/skip/ausente/run de outro SHA bloqueiam), testado em `check:governance` (`scripts/test-merge-gates.mjs`, inclui o cenário exato da #118). Template de PR e CONTRIBUTING exigem a verificação. Branch protection: `pilot` e `main` observadas com `protected=false` via API nesta sessão; sem permissão administrativa, permanece BLOCKER em `docs/BRANCH_PROTECTION.md`.

Status P1.1: code complete; **CI validated** pela #119 — run `37212668535` no HEAD exato `189bc9d`: `database`, `deploy-boundaries`, `validate` e `presentation` success; mergeada em `pilot@1016b0f` com `expectedHeadSha`. Hosted validated e production ready pendentes (BLOCKER de rollout acima).
## P1.2 Bank Fee Intelligence — 2026-10-04

Branch `feature/bank-fee-intelligence`, criada da `pilot` só depois de reconciliar a #118 (P1.2 não foi construída sobre base com CI vermelho; a branch recebe a `pilot` com a correção da #119 antes do PR). Migration aditiva `financial-fee-intelligence-1` após `financial-value-realization-1`.

Orçamento de JS: a primeira versão da tela levou o preview a 817.209/800.000. Em vez de relaxar o orçamento, a interface de registros factuais passou a ser **composta no servidor** (apresentadores `lib/finance/fee-presenter.mjs` e `lib/finance/value-presenter.mjs`) e desenhada por um renderer genérico (`finance/src/views/ledger.js` + `formDrawer` em `ui.js`); a tela de Valor (P1.1) foi migrada para o mesmo renderer, mantendo rótulos e textos. Preview com P1.2: 795.717/800.000 — menor que a baseline anterior sem P1.2 (798.701). Produção sem demo: ver PR. Os E2E de Valor e Tarifas usam o apresentador real nos mocks, então a cópia vista pelo usuário segue testada no navegador; a linguagem segura é testada também em Node sobre a saída do apresentador.

Local (este executor): `test:database` verde (clean com a suíte nova, upgrade com rollback + reaplicação dupla + suíte, fresh com todas as suítes, canário, probes); `check:all` verde; prova negativa do gate de governança (tabela de tarifa fora do registry falha). E2E Chromium desktop + mobile: tarifas 8/8, valor 7/8 antes de receber a correção da #119 (o restante é exatamente o teste de sprite corrigido lá). Firefox/WebKit só no CI.

Status P1.2: code complete; **CI validated** pela #120 — run `37214713845` no HEAD exato `e889aff`: `database`, `deploy-boundaries`, `validate` e `presentation` success (verificados antes do merge); mergeada em `pilot@4f97e16` com `expectedHeadSha`. `mergeable_state=unstable` no momento do merge refletia apenas o status externo do Vercel (cota diária de deploys), que não é gate obrigatório. Hosted validated e production ready pendentes (BLOCKER de rollout).

## P1.3 Opportunity Engine — 2026-10-04

Branch `feature/opportunity-engine`, criada da `pilot` só depois do merge da #120 (P1.2 CI validated); não empilha sobre branch não mergeada. Migration aditiva `financial-opportunity-engine-1` após `financial-fee-intelligence-1`; inclui o job `opportunities` nas listas do P0.10 e roda na cron diária com lease/fencing. Worklist composta no servidor (`lib/finance/opportunity-presenter.mjs`) e desenhada pelo renderer genérico, mantendo o orçamento de JS sem alterá-lo. Regras com limiar financeiro (concentração, utilização, propostas, exceções, sourcing) não têm padrão: só existem quando a empresa as configura. Detalhes em `docs/FINANCIAL_OPPORTUNITY_ENGINE.md`.

Status P1.3: code complete; **CI validated** pela #121 — run `37217236168` no HEAD exato `70df5d3`: `database`, `deploy-boundaries`, `validate` e `presentation` success (verificados antes do merge); mergeada em `pilot@5c4b88a` com `expectedHeadSha` (`mergeable_state=unstable` refletia só o status externo do Vercel, não gate obrigatório). Hosted validated e production ready pendentes (BLOCKER de rollout).

## Value Intelligence executivo — 2026-10-04

Branch `feature/value-intelligence-executive`, PR pequena e separada, criada da `pilot` depois do merge de P1.3. Seção no Painel sobre os resumos existentes de P1.1/P1.2/P1.3; nenhuma tabela, migration ou RPC nova. Não é P1.7. Preview JS 798.135/800.000 com orçamento inalterado — margem curta: a próxima interface precisa vir acompanhada de redução de bundle (candidatos: migrar outras telas factuais para o renderer genérico).

Status: code complete na branch; CI validated só com os quatro gates no HEAD exato; hosted validated e production ready pendentes (rollout de P1.1–P1.3).

Avaliação de P1.4 (Proposal & Document Intelligence) nesta rodada: **não iniciada**. Uma vertical robusta exige provedor de extração (IA/OCR) com contrato, minimização de dados e avaliação de erro — inexistente no ambiente e sem decisão de produto registrada — e interface nova, que hoje caberia só com redução prévia de bundle (margem de ~1,9 kB no preview). Começar sem esses pré-requisitos produziria extração inventada ou tela fora do orçamento; fica como próxima prioridade com esses pré-requisitos explícitos.


## Pilot hosted closure e headroom — 04/10/2026

| Bloco | Status | Código / evidência | CI / hosted | Gap / próxima ação |
| --- | --- | --- | --- | --- |
| Gate de evidência Pilot | partial | lib/finance/pilot-release.mjs, scripts/check-pilot-release.mjs, test-pilot-release.mjs, FINANCIAL_PILOT_RELEASE_GATE.md | testes Node aprovados; novos checks ainda pendentes | avaliar comprovantes reais; não autentica a origem sozinho |
| Bundle staged | code_complete | --stop-before no gerador, testes de prefixo determinístico sem saltos | local aprovado; sem aplicação hospedada | backup/restore e decisão destrutiva específicos |
| Pilot hospedado | blocked | FINANCIAL_RELEASE_EVIDENCE_2026-10-04.md: marker surface-hardening, 17 pendentes; identidade/bucket/inventário reais | NO-GO | conexão de dump, restore descartável, rollout, doctor/canário/jornada |
| Headroom financeiro | partial | mudança proposta em perf/bundle-headroom: preview sem sandbox implícito, perfil de chunks | medição local 426.007 JS, maior 82.324; CI da PR pendente | merge com quatro gates; demo independente ainda 798.135 JS |
| P1.4 | missing | upload privado anterior preservado; nenhum domínio de extração/review/mapping novo nesta entrega | sem validação P1.4 | completar pré-requisito de headroom/merge e implementar foundation com provider fixture sem claim de IA real |
| Primeiro cliente | blocked | FIRST_CUSTOMER_PILOT_CHECKLIST.md | não pronto | recuperação, schema, jornada, jurídico/dados, contas, proteção e P1.4 |

Nesta sessão: npm ci limpo, audit zero vulnerabilidades, SBOM, check:all e
builds/fronteiras aprovados. Banco local indisponível (psql ausente); download
de browsers inválido, portanto E2E/p95 não comprovados localmente. Não confundir
CI da baseline com CI desta entrega nem ferramenta de avaliação com hosted proof.

## Baseline da pilot e fechamento operacional — 05/10/2026

Partiu de `pilot@556258c` (#123 + #124). Detalhes, comandos e números em `FINANCIAL_RELEASE_EVIDENCE_2026-10-05.md`.

| Bloco | Status | Código / evidência | CI / hosted | Gap / próxima ação |
| --- | --- | --- | --- | --- |
| Regressão de reset da demo (#124) | DONE no código; CI pendente no HEAD da PR | causa-raiz: `lazyPalette` perdia teclas e executava o 1º item da lista vazia; buffer em captura com Enter pendente/Esc (`finance/demo/workspace/index.js`, `command.js`); 2 testes determinísticos que falham sem a correção + asserção mais estrita no cenário original | local Chromium desktop + mobile: apresentação 123/0 falhas; Firefox/WebKit só no CI | quatro gates no HEAD exato |
| Mock de download divergente | DONE no código | `tests/e2e/finance-procurement.spec.js` espelha `download=` + anexo de `document-storage.mjs`; exige o GET assinado e permanência na solicitação (evento `download` não existe no WebKit para resposta interceptada) | local 30/30; `test:e2e` 167/0 falhas | — |
| Jornada local com cron concorrente | DONE no código | verificação ajustada ao lease do P0.10 e mais estrita (cada job `succeeded` em alguma execução, nenhum falho, sem duplicação) | local 24 passos, 63 ataques, 0 falhas | jornada **hospedada** (owner) |
| Prevenção de merge vermelho | PARTIAL | rulesets versionados, `merge:gates` com frescor de base, `merge-audit` | testes Node aprovados | OWNER_ACTION_REQUIRED: importar rulesets |
| Restore drill | PARTIAL | mecanismo PASS local com dados (28 sondas + canário); clientes PG 15/16/17 no executor | hospedado não executado | conexão administrativa (owner); binários do Storage e MFA fora do drill — rodar antes de O3/uploads |
| Pilot hospedado | BLOCKED | sondas públicas 05/10: fronteiras corretas, cabeçalhos presentes, chunks coerentes com o HEAD | schema/backup/restore/jornada não observados | ações 1–4 da evidência de 05/10 |
| Produção | BLOCKED | sondas 05/10: API legada ainda roteada (`/api/forms` 405, `/api/catalog` 503) | não pronta | Supabase próprio + `ARANDU_ENV=production` (owner) |
| P0.11 Data Governance | partial (inalterado) | `test:database` e `check:finance` verdes em 05/10 | — | exclusão física (jurídico), offboarding de provedor (produto), rollout |
| P1.4 | NOT_STARTED | §23 da guideline; ordem da missão exige fechamento hospedado antes | — | após ações do owner; provedor de extração e headroom (demo a 1.162 bytes do teto) |

## Reconciliação pós-merge + Guideline v3 — 05/10/2026

Partiu de `pilot@d828a44` (#125 + #127) e `main@ed5da41` (#126). Sem feature nova.
Detalhes, comandos e números em `FINANCIAL_RELEASE_EVIDENCE_2026-10-05_V3_BASELINE.md`.

| Bloco | Status | Código / evidência | CI / hosted | Gap / próxima ação |
| --- | --- | --- | --- | --- |
| `main → pilot` | DONE (`main...pilot` behind 0 após #128) | merge consciente de `main@ed5da41`: única mudança exclusiva de `main` desde o merge-base `201adb4` é `cba84af` (Vite 8.3.1 → 8.3.2); lock regenerado; `typescript` legado de `main` **não** reintroduzido | `main...pilot` passa a `behind_by=0` depois do merge desta PR | Dependabot passa a mirar `pilot` (efetivo quando `.github/dependabot.yml` chegar a `main`) |
| Matriz v3 | DONE | autoridade v3, M0–M6 com critérios de promoção, registro de maturidade por capability, addendum v2.1 marcado histórico | — | atualizar `Maturity`/`Validated SHA` a cada gate |
| Incidente #127 | DONE (registro) | `FINANCIAL_REPO_GOVERNANCE.md` → incidentes de governança de merge | `merge-audit` run `37317090124` failure (detecção correta) | prevenção definitiva = rulesets (OWNER_ACTION_REQUIRED) |
| Rulesets | OWNER_ACTION_REQUIRED | `.github/rulesets/{pilot,main}.json` inalterados e testados | `protected=false` | owner importa |
| Capacity headroom | RISK | financeiro 426.174 / 800.000; demo 799.005 / 800.000 (995 bytes) | — | `technical capacity risk` na demo; ver `FINANCIAL_BUNDLE_HEADROOM.md` |
| Pilot hospedado | BLOCKED / NO-GO | nada hospedado executado nesta rodada | — | Stage 0 hosted closure (ações do owner) |
| P1.4 | NOT_STARTED | fora desta rodada por desenho | — | após baseline limpa + Stage 0 |

### Seguimento pós-#128 — 05/10/2026

A #128 entrou em `pilot@d4d6c22` às 13:56Z com `validate`/`presentation` em execução
(MGI-2026-10-05-02). Os quatro gates terminaram **success** no HEAD `4a93fa6` (run
`37320266260`), e a árvore de `pilot` é idêntica a ele: a capability do registro passa a
`Validated SHA = BL-V3`. O `merge-audit` do merge falhou (`37320702496`); esta PR documental
corrige o registro e precisa ser mergeada com os gates limpos para fechar a baseline.
`main...pilot`: behind 0.

### Governança pós-#129 e Stage 0 — 05/10/2026 (tarde)

| Bloco | Status | Evidência | Próxima ação |
| --- | --- | --- | --- |
| MGI-2026-10-05-03 (#129 com `presentation` em execução) | registrado | `FINANCIAL_REPO_GOVERNANCE.md`; `merge-audit` `37326353933` failure | merge desta PR só com quatro gates + `merge:gates` |
| Rulesets | OWNER_ACTION_REQUIRED (plano) | API 403 "Upgrade to GitHub Pro or make this repository public" | owner decide upgrade; depois importar |
| Plano de migration do Pilot | DONE (contra marker observado em 04/10) | 17 pendentes; etapa 1 = 12 até `financial-data-governance-1` | reconfirmar marker real |
| Ensaio do rollout staged | PASS local | bundle exato, idempotência, recusa do decommission sem ack, canário e probes | repetir sobre a cópia restaurada do Pilot |
| Preflight / drill / doctor / canário / jornada / release gate hospedados | BLOCKED (credencial) | todos fail-closed sem credencial | runbook em `FINANCIAL_RELEASE_EVIDENCE_2026-10-05_V3_BASELINE.md` |
| Cadência de jobs | GAP | crons 1×/dia em `vercel.json` | plano Vercel com crons sub-diárias ou agendador externo |
| Promoções de maturidade | nenhuma | — | — |

### P1.4 Proposal & Document Intelligence — 05/10/2026 (rodada de expansão)

Implementada a foundation completa (M1, evidência local E1). CI indisponível: GitHub Actions bloqueado por cobrança desde 15:24Z — sem M2 até o owner regularizar.

| Item | Evidência local |
| --- | --- |
| Migration + rollback + manifesto + doctor/canário/probes/preflight | `test:database` (clean, upgrade com rollback/reaplicação, fresh), `check:migrations` |
| Ataques (viewer, outra org, provedor, entidade restrita, campo fora do schema, org forjada, método falso, não-solicitante, estado velho, escrita direta, crítico "extraído") | `tests/database/financial-document-intelligence.sql` |
| Leitores + evals (10 casos sintéticos, 5 falhas fechadas) | `scripts/test-document-intelligence.mjs` no `check:finance` |
| UI | `tests/e2e/finance-extractions.spec.js`: 10/10 Chromium desktop + mobile |
| Bundle | financeiro 426.603 (+429); demo 799.005 (**inalterado**: página e código fora do pacote demonstrativo) |

| PA-01 | v3 lifecycle / Phase 3 | Post-Award Implementation & Transition | P1 | contratos, Value Realization, Graph | partial | `docs/FINANCIAL_IMPLEMENTATION.md`, migration/rollback, 5 tabelas, RPCs, API JWT, UI, tasks, reminders, Search, Graph, Opportunity Engine | templates editáveis, portal de provedor, UI analyst, hosted | aceite sem evidência e acesso fora do escopo recusados no banco | M2 após CI no SHA | feature/post-award-implementation |

| CO-01 | v3 lifecycle / Phase 4 | Covenant & Obligation Monitor | P1 | contratos, Post-Award shared job/owner scope | partial | `docs/FINANCIAL_COVENANTS.md`, migration/rollback, 7 tabelas, fatos invoker, revisão independente/waiver SoD, API/UI, recorrência, tarefas/lembretes, Search, Graph, export e Executive | editor versionado, calendário avançado, analyst UI, notificações externas, hosted | dados ausentes nunca estabelecem conformidade | M2 após CI no SHA | feature/covenant-obligation-monitor |

## Continuidade da Demo — 06/10/2026

Personas, apresentação de Spend/Performance, seed de Portfolio/Fee Intelligence
com USD estimado e rehearsal descartável preparados em
`feature/demo-presentation-closure`. Evidência:
`FINANCIAL_RELEASE_EVIDENCE_2026-10-06_DEMO_CLOSURE.md`. Sem alteração de
maturidade: testes Node/build passam, SQL/seed/E2E/visual QA ainda dependem de
executor com ferramentas; CI sem runner. Pilot com 24 migrations pendentes;
ARANDU_ENV=production configurado na Vercel oficial, sem deploy ou claim de M5.

## Fechamento operacional — 06/10/2026 após #137

M2 do release atual permanece bloqueado externamente; M3/M4/M5/M6 não
atingidos. As observações E3 de metadados/health e canário no schema antigo
não são E3 suficiente para promover capabilities do release atual.

| Gap executável | Mudança | Maturity / Evidence | Próximo gate |
| --- | --- | --- | --- |
| P0.1-06 doctor não exigia RPCs pós-contrato | 24 RPCs e 19 tabelas anônimas adicionais; probe inconclusivo e inventário anônimo indisponível bloqueiam GO | M1/E1; negativos Node passam | CI exato, doctor hospedado após upgrade |
| P0.10-02 release assessor incompleto | contrato v2 exige CI exato, 26 etapas, 15 probes, observabilidade e exercício de runbook/suporte | M1/E1; negativos Node passam | executar os comprovantes E3/E4, `pilot:release:check` GO |
| P1.4/PQ-01/PA-01/CO-01/PP-01/SI-01 UI sem execução nesta sessão | suíte financeira Chromium desktop/mobile: 209 passed, 7 skips preexistentes; APIs de fixture | M1/E1; não M2/M3 | Firefox/WebKit/Mobile Safari, SQL e quatro gates no SHA |

Rehearsal da #137 preservado. A evidência E1 anterior de 297 checks não foi
reproduzida no executor atual: Docker ausente e servidor PostgreSQL local
inutilizável. Nenhuma migration Demo/Pilot/Production foi aplicada. Prefixos
regenerados (12 + 12) sem saltar o decommission. Etapa B não liberada pelo
Stage 0; P1.5/P1.11/P1.12, P2/P3/AI não iniciados.

## Alinhamento dos ambientes após #138 (06/10/2026)

Estado e cutover: `HOSTED_ALIGNMENT_2026-10-06.md`. Nenhuma env/migration/
release hospedada alterada nesta rodada. Demo ainda sandbox; Pilot público
2241d3b9; Official público fd796e6b. Os três latest deployments em fcc68f91
não equivalem a três releases canônicos saudáveis. Demo M1/E1, Pilot M1/E1
do release atual (canário E3 só marker antigo), Official sem M5.

CleanInstall 59 arquivos preparado, hash bed3fa64…; prefixo Pilot 12 arquivos
8e15a95…; total pendente 24. Canary via SQL novamente passou com ROLLBACK,
sem prova das capabilities pendentes. Catálogo SQL: 75 de 90 RPCs exigidas
pelo doctor ausentes. Backup preflight aceita identidade do
Pilot, mas executor sem Docker/cliente 17 e DNS direct falha; restore NOT RUN.
Não arquivar pilot enquanto o alias ainda depende dela. Próximo gate: escolha
de organização/custo e provisionamento Demo, CI exato, cleanInstall/seed/
persona/QA reais; depois recovery e Pilot; Official somente após Pilot válido.


## Recovery execution — 09/10/2026, continuação da PR #151

M1/E1: alternativa GitHub-hosted ubuntu-24.04 com PG17/age fixados, destino S3
privado aprovado por Environment, PUT sem sobrescrita e readback SHA-256.
Runner privado preservado como fallback. `database` passa a exigir export real
sintético e restore do mesmo dump, sem reduzir a suíte existente. Controles de
identidade/TLS/topologia permanecem fail-closed. A aprovação do destino e seus
atestados não são prova de lifecycle/IAM configurados. Backup e restore dos refs
hospedados ainda NOT RUN; não promove M3/M4/M5, não ativa Demo/Production.
Runbook: `SUPABASE_ENCRYPTED_PRESERVATION.md`. ARA-8 reaberta In Progress.

### Mission F — lifecycle/backend, 16/10/2026 (local evidence)

Filtros opcionais exatos por contrato em listas de implantação e covenants,
combinados com organização/entidade/provedor e RLS existente. Detalhe de implantação
resolve proveniência legível por consultas limitadas com JWT do ator; IDs permanecem
no contrato técnico. Criação de tarefa não confirma sucesso sem uma representação
válida e mantém replay por chave de idempotência. Sem migration ou alteração de
grants. Evidência e limites: [Mission F](evidence/codex-backend-platform-2026-10-16.md).
Contrato aditivo: [Lifecycle API](FINANCIAL_CONTRACT_LIFECYCLE_API.md).
Não promove M3: identidade canônica hospedada, recovery e provas de Auth/Storage
continuam dependentes de acesso e autorização específicos.
