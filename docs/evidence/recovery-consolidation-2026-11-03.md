# Recovery e consolidação — 03/11/2026

## Estado inicial e inventário de bloqueios

Baseline remota confirmada: `f83bdeb57b4b6c93839851d1205f77e30aa164b5` (#306).
Não há commits posteriores nessa consulta nem PRs abertas. O checkout entregue
estava em `fa551c01`; trabalho isolado em `codex/recovery-consolidation`.
Durante a execução surgiu a PR #307 (`claude/happy-fermi-hb3jtq`), limitada à
Central/sinais, CSS, package.json e testes próprios; sem sobreposição de arquivos.
Nenhuma alteração de frontend. A última branch comercial integrada é a da #305;
não há outro worktree local nem evidência suficiente para identificar arquivos
que outro executor esteja editando agora. Não houve comunicação externa.

| Bloqueio | Impacto / causa demonstrada | Dependência e critério de resolução |
|---|---|---|
| `schema_fingerprint` no run 41491528812 | Bloqueia todas as jornadas posteriores; deparser altera dois aliases de view | Migration aditiva e regressão real; ensaio completo aprovado no candidato |
| Laboratório completo local | Preflight recusa 7 GiB livres; Docker vfs exige 32 GiB | Runner com capacidade; não reduzir o gate nem trocar driver |
| Pilot desatualizado | Marker `financial-surface-hardening-1`; três migrations hospedadas registradas | Export/restore do mesmo backup, classificação, upgrade aprovado e provas reais |
| Preservação hospedada | Sem conexão administrativa, recipient e destino privado aprovados neste executor | Injeção legítima pelo gerenciador; destino durável e custódia age comprovados |
| Demo canônica | Publicada em modo `synthetic-fixtures`, readiness 503 | Recovery, conversão e atribuição ativa aprovados; seed/Auth/Storage/jornadas hosted |
| Production | Build `dpl_G4wYiW54o1K9EDbmAnLekgnRHZoc` recusa legado sem atribuição ativa | Classificação, preservação e aprovação específica de conversão; manter gate |
| Legado com dados históricos | 42 linhas, oito com campos de contato/destinatário | Decisão do proprietário sobre retenção/destino; nenhum descarte inferido |

Fontes de leitura atuais: `ops/consolidation/hosted-audit-2026-11-03.json` e
`security-advisors-2026-11-03.json`. São inventários, não backups nem prova de
recuperação. Não contêm registros, nomes de pessoas, contatos ou credenciais.

## Causa raiz e correção implementada

O fingerprint do drill usa `pg_dump --schema=public --schema-only --no-owner
--no-acl`, removendo cabeçalhos voláteis e normalizando CHECKs. Não compara
schemas gerenciados nesse hash; Auth/Storage e grants têm probes separados.
No run falho, origem/destino usam major 15; os demais probes e os 30 binários
Storage passaram. Nenhum indício nos logs de mudança de versão do cliente.

Reprodução em PostgreSQL **17.11**, usando cleanInstall da baseline, dump custom
e outro banco descartável: o diff restante depois da normalização histórica é
exatamente este trecho de `public.fin_crm_institution_records`:

```diff
- SELECT 'process'::text,
+ SELECT 'process'::text AS text,
  ...
- NULL::text,
+ NULL::text AS text,
```

São nomes internos de expressões no segundo ramo do UNION ALL dentro de uma
CTE; a projeção externa usa os nomes do primeiro ramo. A migration
`supabase-financial-crm-view-roundtrip.sql` nomeia explicitamente `record_type`,
`kind` e `process_id`, conservando colunas/tipos, joins, `security_invoker`,
grants e dados. A migration histórica permanece imutável. Rollback restaura a
representação anterior e o marker anterior; não apaga dados. Novo marker:
`financial-crm-view-roundtrip-1`; doctor, probes e preflight o reconhecem.

O hash não é substituído por um valor esperado novo. Continua calculado da
origem e do destino. Acrescenta uma projeção independente de todos os CHECKs
públicos, ordenada em C, com `pg_get_constraintdef(...,true)` e estado de
validação. O deparser pretty remove apenas a associatividade redundante;
agrupamento significativo e literais ficam protegidos, apesar da normalização
histórica do dump. Não há remoção do gate `schema_fingerprint`.

`tests/database/recovery-schema-roundtrip.mjs` instala a sequência pré-correção,
reproduz e restringe o diff aos dois aliases, testa instalação/reaplicação,
projeção/ACL/security_invoker, dump/restore, rollback e upgrade novamente.
Rejeita mudança da expressão da view, view ausente e mudança de
`a AND (b OR c)` para `(a AND b) OR c`. O teste usa bancos loopback novos e os
remove em finally; não acessa Supabase hospedado.

O workflow efêmero passa a disparar também para essa correção de recovery e
executa explicitamente o HEAD candidato, conferindo igualdade antes das fases.
Nenhum job, navegador, timeout ou critério de sucesso foi removido.

## Hospedagem e preservação

- Pilot: ACTIVE_HEALTHY, PG17.6; 71 tabelas públicas / 18 views / 101 funções /
  203 índices / 51 políticas; zero tabelas públicas sem RLS; 14 linhas públicas.
  Zero usuários Auth/MFA/objetos; bucket `fin-documents` privado, 10 MiB,
  allowlist MIME inventariada. Não prova autorização funcional das políticas.
- Legado: ACTIVE_HEALTHY, PG17.6; 16 tabelas / 2 funções / 46 índices /
  12 políticas; zero tabelas sem RLS; 42 linhas. Auth/MFA/Storage vazios.
  Dois leads, uma reserva e cinco certificados têm campos potencialmente
  pessoais. Não foram lidos os valores desses campos.
- Advisors: legado tem duas views SECURITY DEFINER, um search_path mutável e
  exposição da função de trigger a anon/authenticated. Revisar antes de cutover:
  https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view .
  Avisos de funções definidoras autenticadas do Pilot não provam vulnerabilidade:
  RPCs canônicas exigem autorização interna. Não se revogou acesso por inferência.
- Vercel Demo e Pilot READY em `f83bdeb`; Production ERROR no mesmo SHA.
  O log atual confirma **um erro**, a atribuição do legado; site/cron/chaves
  constam presentes no build. Valores sensíveis não foram solicitados.
- Demo: única variável configurada é `ARANDU_DEPLOYMENT_KIND=demo` (production).
  GET health 200 declara branch main, SHA exato, modo demo e synthetic-fixtures;
  readiness 503. Não é backend financeiro hospedado validado.
- Vercel Pilot: `ARANDU_ENV=pilot`, URL do Pilot, chaves/cron cadastrados.
  Presença não prova validade das credenciais nem uso do alias público.
- `database-recovery`: reviewer obrigatório, branch policy main somente,
  `prevent_self_review=false`. Listagem de secrets negada (403): valores e
  completude remota **desconhecidos**, não classificados como ausentes.
  O executor cloud não tem secret/runtime binding administrativo configurado.
- Nenhum destino privado durável já aprovado foi identificado. Diretórios
  `/tmp` e `/workspace` não são tratados como preservação durável. Não houve
  export hospedado, decriptação de dado privado, migration ou alteração de env.

## Plano executável de transição (não executado hospedado)

Gerar pelo código candidato, mantendo relatórios/hash:

```sh
npm run migrations:bundle -- --flow=cleanInstall
npm run migrations:bundle -- --flow=existingDatabase --after-schema=financial-surface-hardening-1 --stop-before=docs/supabase-financial-legacy-art-decommission.sql
npm run recovery:doctor
```

Bundle cleanInstall: 84 migrations, SHA-256
`5f1b31b2d79c5a60229fb7a0e2e6f54148b41dd2759cb465545ff41919d05fa7`.
Prefixo pré-decommission: SHA-256
`4f583d0a0a73f6f299bb6015f9fa06f94518288cdea1cca24255ab7f49af17b7`.
São preparação, não aplicação autorizada. Hashes expiram se a árvore mudar.

1. Proprietário classifica os 14 registros operacionais do Pilot e os 42 do
   legado, aprovando retenção/destino; não assumir ausência de PII por tabela vazia.
2. Configurar pelo gerenciador os bindings documentados em
   `SUPABASE_ENCRYPTED_PRESERVATION.md`: URL administrativa de cada origem,
   recipient público age e destino privado durável já existente/aprovado.
   A chave privada fica sob custódia separada. Não enviar valores no chat.
3. Export cifrado e verificação de transferência/integridade; restore dos mesmos
   artefatos em Supabase PG17 isolado, reconciliação de roles, owners, ACL,
   schema/contagens/conteúdo e Auth/Storage. Não aplicar dump completo ao hosted.
4. Somente após provas e aprovação específica, atualizar Pilot. O prefixo gerado
   permite parar antes do decommission; nunca saltá-lo para aplicar o sufixo.
   Provar preservação do histórico, interrupção/resume, rollback e canário.
5. Revisar PR de cutover Demo com recovery e classificação comprovados; ativar
   atribuição Demo. Configurar env/site/cron/chaves próprias, Auth redirects,
   Storage privado e senha de demonstração; substituir o modo sandbox apenas
   quando backend pronto. Executar seed/check/reset e jornadas hosted.
6. Legado permanece intacto até decisão específica. Conversão Production segue
   `PRODUCTION_CONVERSION_PLAN_2026-11.md`: preservar, revisar advisories,
   migrar/canário, rollback pelo backup comprovado, configurar segredos separados,
   publicar candidato e somente então promover. Go/no-go exige gates, identidade,
   readiness e isolamento funcionais; READY isolado não basta.
7. Desativar Pilot somente com dependências zero comprovadas e rollback pronto.

## Backend compartilhado e handoff

A alteração SQL atinge somente a representação da view CRM existente; mantém
fonte canônica e contrato. Nenhum frontend, novo módulo ou tabela paralela.
A suíte database existente valida CRM, contratos, propostas, decisões,
concorrência, Copilot/colunas e importação de tarifas/ERP. Leitura dos contratos
de ingestão confirma locks transacionais, recibos por ator/request_key,
input_hash, confirmação explícita e verificação de organização/entidade.
Esses controles não provam ERP externo ou modelo real sem credenciais aprovadas.

## Validação e limites

Regressão real de fingerprint: PASS local PG17.11. `npm run check:all`,
`npm run build`, `npm run check:build-size` e a suíte integral
`npm run test:database` PASS nesta árvore, com PostgreSQL 17.11 descartável.
`node scripts/test-recovery-real.mjs` PASS com PG17.11 + age1.3.2, inclusive
restore do mesmo backup, negativos e teardown. O runner de banco executa a regressão
também no check database (PG16); a integração usa Supabase PG15 fixado.
Resultados CI pertencem ao SHA candidato exibido na PR; este documento não
antecipa resultado remoto nem eleva maturidade.

`demo:local:check` e `demo:local:platform-journey` dependem da stack completa;
esta execução local não a provisiona por falta de disco. O workflow completo
continua responsável por Auth/Storage reais, seed/pool, restore/binários,
Chromium desktop/mobile, jornada financeira, plataforma, adversariais e cleanup.
Não classificar a missão integral como concluída antes dessas etapas PASS.
