# Reconciliação de schema e rollout hospedado

Preparação executável e ensaiada em dados sintéticos; **não é aprovação de
operação hospedada**. Topologia permanente: Demo e Production, independentes;
Pilot é transitório. Não alterar assignments para fazer um check passar.

## Compatibilidade observada em 17/10/2026

| Componente | Repositório atual | Pilot observado read-only | Pré-condição / risco |
| --- | --- | --- | --- |
| Marker | financial-decision-authorization-1 | financial-surface-hardening-1 | 38 migrations pendentes, em ordem; não aplicar só a última |
| Decisão | v2 + versão esperada; RPC antiga interna | v2 ausente; antiga executável por authenticated | Risco de decidir sem versão vista; não liberar uso financeiro no estado observado |
| Aprovação | guarda de ator atual na escrita | anterior à guarda | Concorrência e escopo exigem atualização completa |
| Assignments | buyer_name autorizado por RPC | RPC ausente | App novo falha fechado com schema_incompatible |
| Sessão/Data API | função + configuração de authenticator | função/configuração ausentes | Hook SQL não protege Auth/Storage/Realtime; exigir prova HTTP própria |
| Decisão × revogação | trigger fin_decisions_live_actor | ausente | Papel/entidade verificados na inserção e locks até commit |
| Public/RLS/constraints | manifesto, default privileges, grants mínimos e probes | marker não demonstra integridade dos catálogos | Inventário autorizado antes de executar; probes depois |
| Auth/Storage/extensões | contratos e laboratório | existência de projetos não comprova configuração | Compatibilidade gerenciada, owners, extensões, bucket e binários são gates separados |
| Legado histórico | recuperação/classificação própria | fin_settings ausente | Não atribuir a Production nem usar seu estado como baseline financeiro |

O mapa detalhado de ordem vem de `docs/supabase-migrations.json`; relatório do
gerador registra arquivos, SHA-256, quantidade e marker final. Dependências
incluem aprovação/handoff, Passport, multi-entity, contratos/portfólio, policy,
Public API/SSO, governança, aposentadoria de legado, lifecycle, isolamento Demo,
integridade de decisão, sessões, documentos, tarefas e as guardas finais.
Configuração externa não é criada por um marker. Aplicar SQL não instala
provedor OAuth, segredo, domínio, binário de Storage nem infraestrutura paga.

## Procedimento operacional

1. Registrar projeto/ref, owner, SHA do executor, app atual, marker observado,
   catálogos (RPC/grants/trigger/RLS/constraints/owners/search_path), extensões,
   Auth, Storage, hooks, cron e integrações. Não registrar credenciais ou dados
   de cliente no repositório. Confirmar origem e destino independentes.
2. Classificar public/Auth/Storage e dados legados, PII, cliente, documentos,
   retenção e holds. Nomear responsável e decidir o que deve ser preservado.
3. Obter aprovação específica do export e destino privado durável. Preservar
   conjunto coerente cifrado: banco, roles sem senhas, binários e configuração
   externa aplicável; manifesto, hashes, origem, SHA e cadeia de custódia.
4. Restaurar o mesmo export em destino isolado. Reconciliar conteúdo, schema,
   ACL/RLS, Auth/configuração, referências e binários. Ausência de componente
   necessário bloqueia a conversão; PostgreSQL isolado não é restore completo.
5. Gerar plano após o marker efetivamente observado:

   ```sh
   node scripts/build-supabase-migration-bundle.mjs --flow=existingDatabase --after-schema=financial-surface-hardening-1
   ```

   Revisar relatório/hashes e SQL. O gerador acrescenta transação a arquivos
   históricos sem transação própria, sem editar suas fontes. Cada migration
   concluída é fronteira de retomada; o bundle não é uma única transação global.
   Para parar antes da etapa destrutiva, usar
   `--stop-before=docs/supabase-financial-legacy-art-decommission.sql`.
6. Somente após aprovação específica de schema, aplicar no alvo confirmado com
   executor que interrompa no primeiro erro (`psql -v ON_ERROR_STOP=1`). Guardas
   de preservação continuam obrigatórias; acknowledgement só após restore
   comprovado da origem real. O valor sintético do teste não autoriza hosted.
7. Em falha: interromper rollout, reler o marker e catálogos, verificar dados e
   identificar o último commit de migration. Regenerar o sufixo a partir desse
   marker; não pular migrations, continuar SQL depois do erro ou reabrir grants.
   Marker sozinho não autoriza retomar se houver drift ou operação incerta.
8. Rodar `ops/sql/post-migration-probes.sql` e canário no alvo correto. Validar
   grants efetivos, ausência de acesso direto à RPC antiga, v2, triggers,
   SECURITY DEFINER/search_path, constraints e RLS. Conferir Auth e hook real,
   sessões vigentes/encerradas, outra sessão ativa e acessos diretos à Data API.
9. Validar Storage separadamente: bucket privado, próprio/outro tenant/provedor,
   objeto/binário e URL assinada já emitida (válida até TTL). Realtime e
   integrações têm contratos próprios; não inferir revogação global.
10. Implantar aplicação compatível no SHA aprovado. Executar readiness, doctor,
    canário, comprador/provedor e visitantes isolados, observando erros e
    tempos sem PII. READY/HTTP 200 não comprova isso.
11. Critérios de recusa: marker/identidade divergente, grants/trigger ausentes,
    dado perdido, falha de isolamento/versão/sessão, recovery incompleto ou
    erro sem reconciliação. Manter tráfego anterior seguro ou pausar a escrita
    afetada, conforme decisão do operador. Preferir forward-fix versionado.
12. Registrar evidência hospedada, responsáveis e decisão de M3. M4 e M5 exigem
    seus gates próprios. Nenhum merge, cutover ou reset está implícito aqui.

## Ensaio reproduzível

`tests/database/pilot-schema-upgrade.mjs` integra `scripts/test-database.sh`.
Cria apenas bancos loopback descartáveis, aplica o prefixo real até o marker
do Pilot, popula fixtures, faz dump/restore sintético, injeta erro antes do
commit, confere rollback e ensaia recusa/retomada da fronteira destrutiva.
Executa o bundle completo gerado pelo manifesto, preserva versões históricas,
roda probes/canário e verifica zero pendências. O harness principal também
exercita clean install, reaplicação, rollback compatível e forward-fix.

O teste não reproduz integralmente GoTrue ou Supabase gerenciado, nem exporta
dados hospedados. Para hosted ainda faltam preservação, aprovação de schema,
configuração e jornadas HTTP nos alvos reais.
