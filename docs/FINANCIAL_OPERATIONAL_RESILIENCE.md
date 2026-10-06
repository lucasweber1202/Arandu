# Resiliência operacional financeira — P0.10

Documento canônico do produto financeiro. O runbook da vertical de arte é
histórico. Esta foundation prepara a operação; não certifica disponibilidade,
restore hospedado, SLA, RPO ou RTO. Controles hospedados continuam bloqueados
até existir evidência do ambiente exato.

## Severidade e responsabilidade

| Nível | Impacto concreto e exemplos | Responsável funcional | Escalação e comunicação |
| --- | --- | --- | --- |
| SEV-1 | Suspeita de acesso entre tenants, bypass de autorização, segredo exposto ou integridade financeira sem limite conhecido | Comandante de incidente + segurança | Acionar owner e segurança assim que detectado; interromper escritas afetadas; comunicação externa aprovada pelo owner/jurídico |
| SEV-2 | Operação crítica indisponível, Auth/SSO obrigatório indisponível, migração/deploy impede usuários autorizados | Comandante + plataforma | Acionar owner e responsável técnico; comunicar impacto, alternativa segura e próxima atualização sem prometer recuperação |
| SEV-3 | Falha parcial limitada, webhook/outbox em atraso, job que pode retomar sem perda | Plataforma + dono da integração | Registrar escopo e idade da fila; escalar para SEV-2 se atingir operação crítica ou para SEV-1 se integridade/isolamento ficar incerto |
| SEV-4 | Defeito visual/documental sem efeito em dados, autorização ou tarefa crítica | Responsável do módulo | Registrar ação, responsável e prazo interno; escalonar se o impacto mudar |

Antes de operar com clientes, o owner deve nomear os titulares e substitutos
para comandante, plataforma, segurança, suporte e jurídico, com um canal
externo ao serviço afetado. Papéis acima não significam que pessoas já foram
contratadas ou escaladas. Não há tempo comercial de resposta garantido.

O comandante mantém um único registro de incidente: identificador aleatório,
severidade, início UTC, escopo conhecido, estado, responsáveis funcionais,
request/correlation IDs, commit/deploy, schema marker, evidências sanitizadas e
próxima atualização. Não copiar payload, e-mail, documento, assertion, URL
privada, JWT, token ou segredo. Reclassificar quando aparecer novo impacto.

## Ciclo obrigatório

1. **Detectar:** alertas, sintomas, request IDs, falhas/idade das filas e leases.
2. **Classificar:** impacto observado, tenants afetados sem listar PII, riscos e
   incertezas; definir comandante e abrir registro.
3. **Conter:** pausar somente escritas/integrações afetadas, preservar evidência,
   revogar credenciais comprometidas. Nunca abrir autorização como fallback.
4. **Investigar:** comparar deploy/schema e último estado conhecido; reproduzir
   em ambiente isolado com fixtures; distinguir confirmação de hipótese.
5. **Recuperar:** rollback de código compatível ou forward-fix por PR; recuperar
   dados apenas após validar backup e destino. Não reexecutar escrita incerta
   sem sua chave de idempotência/fencing.
6. **Verificar:** gates completos, doctor, canário e jornada autenticada no
   ambiente correto; conferir integridade e drenagem da fila por contagens.
7. **Comunicar:** fatos, impacto, contenção, progresso e próxima atualização;
   owner/jurídico decide comunicação a cliente/titular/regulador. Não declarar
   incidente encerrado enquanto isolamento ou integridade for incerto.
8. **Postmortem:** usar `FINANCIAL_INCIDENT_POSTMORTEM.md`, com ações rastreáveis
   e evidências. Encerrar somente com responsável e verificação registrada.

## Cenários e ações específicas

A sequência acima aplica-se a cada linha; a verificação abaixo complementa os
gates gerais. A ausência de uma prova necessária impede o encerramento.

| Cenário / detecção | Classificação inicial | Contenção / investigação | Recuperação e verificação |
| --- | --- | --- | --- |
| Isolamento: canário ou usuário vê objeto alheio | SEV-1 | Bloquear superfície afetada; preservar IDs; conferir RLS, grants, entity scope e RPC com JWT de dois tenants | Corrigir no banco/código; testes negativos de acesso direto e API; owner avalia exposição |
| Suspeita de bypass de autorização | SEV-1 | Fechar rota/credencial afetada; conferir papel, MFA, sessão, tenant e decisões no servidor | Correção com provas de permissão e recusa; nunca usar enforcement apenas no browser |
| Migração ruim: marker/grants/schema divergentes | SEV-1 se integridade incerta; senão SEV-2 | Pausar escritas; registrar marker real e aplicação exata; não reaplicar bundle antigo | Rollback somente compatível e sem perda de histórico; preferir forward-fix se houver dados novos; restore validado se necessário |
| Deploy quebrado: jornada/erros após release | SEV-2 | Pausar rollout; comparar commit anterior e compatibilidade com schema | Reverter código por PR/deploy aprovado; gates + doctor + jornada autenticada |
| PostgreSQL indisponível ou degradação Supabase | SEV-2 | Escritas e autenticação falham fechadas; não repetir POST incerto; preservar tarefa/fila persistida | Retomar após saúde e canário; rerun idempotente, conferir saldo de filas e consistência |
| Região/serviço Vercel indisponível | SEV-2 | Comando/comunicação por canal independente; suspender agendadores externos para evitar storm | Owner/executor provisiona destino compatível e segredos novos; conferir ambiente, Auth, Storage, jobs, DNS e jornada |
| Backlog/dead letters de webhook | SEV-3 | Isolar endpoint; conferir códigos e idade, DNS, assinatura, credencial e estado; não copiar payload | Corrigir endpoint/segredo; replay administrativo explícito; dedupe pelo delivery ID; confirmar contagens, sem desfazer negócio |
| Credencial API/webhook comprometida | SEV-1 | Revogar credential/service account ou endpoint, rotacionar chave se exposta; preservar auditoria | Nova credencial por fluxo autorizado; provar token antigo negado e integração nova válida |
| IdP/SSO obrigatório indisponível | SEV-2 | Preservar exigência de SSO; verificar broker, state, domínio e sessões; não liberar senha automaticamente | Restabelecer IdP ou procedimento administrativo explícito, auditado e aprovado; verificar login real e recusas |
| E-mail indisponível | SEV-3; SEV-2 se operação crítica afetada | Manter tarefa/notificação no banco; conferir outbox, lease e provedor | Retomar outbox com fencing e limite; não anunciar entregue só porque enfileirou |
| Job/cron parado: lease vencido, erro ou ausência de execução | SEV-3 ou SEV-2 | Conferir auth do cron, run, início/fim, processed/failed, timeout e schema; impedir execução concorrente | Lease expira, próximo ciclo retoma; execução SQL idempotente e limitada; validar fila e histórico |
| Integridade financeira: snapshot ou workflow inconsistente | SEV-1 | Pausar escrita no domínio; preservar versões e eventos; não editar ledger/snapshot silenciosamente | Correção versionada/forward-fix e provas de invariantes; verificação humana do impacto econômico |
| Dependência secundária/analytics fora | SEV-3 | Desativar somente subsistema secundário; não bloquear transação já commitada | Retomar sem duplicar negócio; conferir backlog/eventos e ausência de dados sensíveis no log |

## Dependências e comportamento degradado

Os owners abaixo são papéis funcionais, pendentes de nomeação pelo owner.
`lib/finance/operational-resilience.mjs` contém classificação de falhas e
prazos de operações coordenadas; provedores mantêm seu transporte existente.

| Dependência | Finalidade / criticidade | Falha, prazo e retries | Fallback / sinal / owner |
| --- | --- | --- | --- |
| Vercel | Frontend, API e cron; crítica | Deploy/runtime/região; requisições a DB/Auth com limite; sem retry de escrita | Rollback compatível, canal externo; 5xx e jornadas; plataforma |
| Supabase REST / PostgreSQL | Autoridade transacional; crítica | Timeout 8 s por RPC do job; lote 100 de renovação/marcos, 100 de expiração + 100 de escalação; sem retry HTTP de escrita | Falha fechada; rerun SQL idempotente; doctor, canário, jobs e fila; plataforma |
| Supabase Auth | Sessão e MFA; crítica | Transportes existentes com limite de 8 s; erro não equivale a sessão válida | Login falha fechado; doctor e motivos seguros; segurança |
| Supabase Storage | Documentos privados; crítica para documentos | Upload/download autorizado e prazo de 8 s no transporte; não repetir upload sem identidade/versionamento | Documento fica pending/failed; sem URL pública; doctor + contagens; plataforma |
| Provedor de e-mail | Aviso secundário; não transacional | Transporte 4 s; 5 tentativas totais por padrão (configuração por item, máximo 20); outbox com lease/fencing, lote máximo 50 e orçamento 45 s; 4xx semântico terminal | Notificação/tarefa persistida; estado outbox e idade; plataforma |
| DNS | Destino de webhook e verificação de domínio; crítica à integração | Lookup/TXT 2 s; sem retry na mesma chamada | Recusa segura; webhook fixa IP validado no TLS, não segue redirect; dns_timeout/503; plataforma |
| IdP do cliente | SSO obrigatório; crítica para login SSO | Broker com validação/state; não repetir callback como login novo | Sem password fallback automático; motivo e teste real por cliente; segurança + admin do cliente |
| GitHub Actions | Verificação de alterações; crítica ao release | Jobs com limites existentes; não retry-until-pass | Bloquear merge/liberação; quatro gates completos no head exato; engenharia |
| ERP/TMS/API downstream | Integração de cliente; secundária ao commit de negócio | Webhook 10 s, orçamento 45 s no cron; 8 tentativas totais, backoff persistido + jitter; 401/403 e demais 4xx semânticos viram dead (408/429 elegíveis) | Fila/dead letter, replay explícito e dedupe; integração |

A API v1 mantém sua chave de idempotência/fingerprint; Auth nunca usa dado
não verificado como identidade. Para uma dependência nova, declarar timeout,
max retries, classificação, backoff/jitter, idempotência, sinal e owner antes
de ativá-la. Não retry 401/403 ou erro semântico. Não retry na camada HTTP uma
RPC que possa ter commitado. O transporte só retransmite uma entrega pelo
estado persistido e lease do banco; delivery ID permanece estável no retry.

## Jobs e console

`fin_job_begin` registra running e adquire lease global por job (90 s, máximo
120). Concorrente recebe busy; HTTP 202 não é sucesso operacional. O início é
pré-condição da execução: sem registro/lease, não executa negócio.
`fin_job_finish` valida token, run e validade; conclusão idêntica é idempotente.
Lease expirado vira failed ao próximo begin. Trabalho SQL já commitado não é
desfeito por falha no registro final; API retorna falha e rerun é idempotente.

Cron retorna 502 em falha parcial, resposta inválida, timeout ou falha de
telemetria. Jobs independentes continuam; não há retry automático. Webhook
com erro de completion permanece sob lease e volta à fila; isso aparece em
`completion_failed`, nunca succeeded. Orçamento excedido gera deferred.
Entrega é **at-least-once**, não exactly-once; o receptor deduplica delivery ID.

Console exige `finance_ops`, MFA AAL2 e registro de operador no banco; audita
acesso. Mostra jobs, failed/duração/correlação, leases vencidos, filas/dead
letters de webhooks/e-mail, recusas SSO e marker. Estado configured é somente
presença de configuração, não probe de disponibilidade/restore/IdP.
`fin_job_leases` é estado de plataforma, não dado do tenant nem fixture de
cliente; reset local recria o banco, seed da demo não fabrica lease real.

## Restore e continuidade

1. Confirmar projeto/ambiente e marker real por leitura, sem inferir do código.
2. `pilot:backup:preflight`: somente Pilot conhecido ou localhost explícito,
   direct/session pooler, TLS obrigatório, PG major igual entre origem,
   pg_dump/pg_restore/imagem versionada; recusa transaction pooler, projeto
   estranho, parâmetro não reconhecido, contagem/marcador inválido.
3. Database-only drill recusa objetos Storage, fatores MFA e policies Auth que
   não consegue recuperar; isso é bloqueio de escopo, não autorização para
   apagá-los. Exigem procedimento ampliado pelo owner.
4. `pilot:restore:drill`: destino Supabase descartável; compara fingerprint,
   marker **igual ao da origem**, settings, contagens, constraints, grants,
   RLS/FORCE RLS, owners, políticas Storage e triggers Auth; executa canário.
   Relatório inclui hash do backup e duração medida. PASS antigo é removido
   antes de nova tentativa; falha não é evidência de restore.
5. Guardar referência e hash protegidos, sem dump/credencial em git/logs.
6. Gerar bundle **novo** do marker observado; aplicar só esse bundle no alvo
   confirmado após backup/restore aprovados. Doctor + canário + jornada
   autenticada e teste de acesso de dois tenants são obrigatórios.

Executor/credencial, backup hospedado recente, drill hospedado, prova Auth/
Storage/SSO e jornada real **não foram obtidos nesta rodada**. Estado BLOCKED;
nenhuma migration hospedada foi aplicada. CI local/disposable não substitui
essas provas. Não usar PASS de ambiente local para autorizar ambiente real.

| Medida | Target interno proposto | Hipótese | Método | Evidência |
| --- | --- | --- | --- | --- |
| RPO | Até 24 h | Backup recuperável diário; depende de contratação/configuração e escopo Auth/Storage | Medir diferença entre última escrita reconhecida e última escrita recuperada em drill | NÃO MEDIDO no hospedado |
| RTO | Até 4 h | Executor disponível, destino provisionável, backup validado, DNS/segredos/Auth/Storage recuperáveis | Cronometrar do início da indisponibilidade até jornada autenticada + isolamento + integridade validados | NÃO MEDIDO no hospedado |

Targets são propostas de planejamento, dependentes de aprovação/ensaio, não
SLA nem garantia. Tempos do script medem etapas do drill; não cobrem detecção,
coordenação, DNS, IdP, comunicação ou operação humana e não são RTO real.

Rollback de código quando o deploy anterior continua compatível com o schema.
Forward-fix quando novo estado/histórico torna downgrade destrutivo. Pausar
escritas quando integridade ou isolamento for incerto; revogar credencial se
comprometida; isolar integração quando falha downstream não exige parar
negócio. Downgrade desta migration recusa presença de histórico novo de email_outbox (usar forward-fix); nos demais casos preserva registros de jobs e encerra running
como failed, restaura funções prévias e marker SSO; remover leases requer
pausa dos agendadores. Reverter código junto do schema: código novo falha
fechado sem RPCs novas. Não fazer restore sobre projeto existente sem plano
aprovado, executor e evidência do destino exato.

## Exercício hospedado para o gate Pilot v2

Depois do restore e da migration, no mesmo SHA/projeto/schema, um operador
autorizado deve exercitar o runbook e registrar IDs opacos de evidência
conforme `FINANCIAL_PILOT_RELEASE_GATE.md`. Usar cenário sintético em Pilot
ou destino descartável autorizado; não provocar indisponibilidade no Oficial.

1. Localizar uma requisição de teste pelo request/correlation ID, sem registrar
   corpo, credenciais ou PII: `request_correlation`.
2. Observar falha controlada de job e backlog de fila no console com MFA;
   conferir contagens/idade e reação operacional: `job_failure_detection`,
   `queue_backlog_detection`. Teste unitário dessas funções não substitui isso.
3. Registrar severidade, escopo, contenção e papel responsável no cenário:
   `incident_triage`.
4. Exercitar o handoff de suporte com responsável e evidência do recebimento,
   sem dados de cliente: `support_handoff`.
5. Provar, em destino descartável, rollback compatível ou forward-fix apropriado
   ao cenário, seguido de doctor/canário/jornada: `rollback_forward_fix`.

`owner_role` identifica o responsável funcional; `runbook_reference` resolve
para o registro protegido do exercício. Não usar referência desta documentação
como prova de execução. Os comprovantes são posteriores ao restore/migration e
recentes (24 h). Esta rodada não executou exercício hospedado nem mediu RPO/RTO.
