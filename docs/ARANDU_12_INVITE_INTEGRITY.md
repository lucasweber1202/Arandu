# Arandu 12 — Integridade de convites e prévia para a instituição

Base: `main` em `d12987226674f735aae0f30991fd615a2f00625a` (PR #363, 11.3), sem
commits posteriores no momento do início. Branch: `claude/great-wright-ohopmo`.
Maturidade: **M1 → M2 pendente** (código + testes locais; CI no HEAD exato e
aplicação hospedada ainda não ocorreram). Nada foi aplicado em Demo ou Production.

## 1. Escopo desta rodada (e o que ficou de fora)

A missão 12 lista nove frentes. Esta entrega cobre, com evidência, a prioridade
1 da Frente E (integridade/idempotência de convites) e a pendência registrada
desde a 11.0 (prévia segura do convite, Frentes D/E item 4). As demais frentes
(Workspace, Relationship/Contract 360, Decision Studio, auditoria dos 189
alertas `SECURITY DEFINER`, performance) **não foram trabalhadas** nesta PR;
ver §6. Preferi uma correção de fonte canônica completa, testada em PostgreSQL
real e nos três navegadores, a mudanças amplas sem prova.

## 2. Defeitos encontrados e causa

| # | Defeito | Causa | Efeito para quem usa |
| --- | --- | --- | --- |
| D1 | Repetir "Convidar" após timeout/queda de rede devolvia erro 500 genérico | `fin_rfq_invites` tem `unique (rfq_id, provider_id)`; `fin_invite_provider` sempre inseria e a violação de unicidade não tinha tradução | O comprador não sabia se o convite existia nem recuperava o link; a UI precisava bloquear o botão no frontend |
| D2 | "Cadastre o contato e convide de novo para restringir ao e-mail dele" (texto da UI) era impossível | Mesmo `unique`: segundo envio falhava | Convite aberto a qualquer conta provedora não podia ser restrito ao contato |
| D3 | Instituição aceitava/recusava sem ver no portal o que o e-mail já dizia | Não havia leitura autorizada do convite antes do aceite (pendência da 11.0) | Fricção e risco de recusar/aceitar às cegas |
| D4 | `fin_invite_provider` não verificava bloqueio de governança da organização compradora | Função anterior à camada de governança | Organização sob bloqueio ainda podia emitir convites (recusa/aceite já checavam) |

Duplicidade de convite **não** existia no banco (a unique já impedia); o
defeito real era a falta de idempotência da resposta. E-mail duplicado também
não ocorria (chave `provider_invite:<id>` no outbox).

## 3. Correções (fonte canônica)

`docs/supabase-financial-invite-integrity.sql` (aditiva, marcador
`financial-invite-integrity-1`):

- **`fin_send_provider_invite(rfq, provider) → jsonb`** — trava a linha da RFQ
  (`for update`) para serializar duplo clique/abas/retries; checa papel
  (`admin|finance_manager`) e governança; então:
  - sem convite → cria (como antes) e devolve `outcome: created`;
  - convite aberto, mesmo destinatário → **replay**: o mesmo token (derivado de
    `invite_secret` + id; o hash é conferido contra `token_hash`), sem novo
    evento nem e-mail, `outcome: replayed`;
  - convite aberto e contato alterado → **retarget** no lugar, só estreitando
    para o e-mail atual (nunca de exato para aberto), um evento
    `provider_invite_retargeted` e um e-mail com chave por destinatário;
  - aceito / recusado / expirado-revogado → erro explícito, nada muda.
- **`fin_invite_provider`** mantém assinatura e passa a delegar ao comando acima.
- **`fin_invite_preview(token, org) → jsonb`** — mesmo portão de
  `fin_decline_provider_invite` (membro provedor, e-mail confirmado igual ao
  destinatário em `exact_email`, vínculo canônico, governança) e ainda recusa
  convite já respondido por outra organização. Devolve só
  `buyer, product, response_deadline, expires_at, state`. Toda recusa é o mesmo
  `invalid invitation`. `stable`, sem escrita.
- Grants: `revoke` de `public, anon, authenticated, service_role`; `execute` só
  para `authenticated`.

API (`lib/api/domains/finance.mjs`): `POST invites/send` usa o comando
canônico (201 criado / 200 replay ou retarget, com `outcome`); se a função não
existir (`schema_incompatible`, migration ainda não aplicada) cai no caminho
legado. Novo `POST invites/preview` responde `available:false` sem a migration.
Erros novos traduzidos em `finance-core.mjs` (`invite_already_accepted`,
`invite_already_declined`, `invite_closed`, `invite_recipient_required`,
`invite_exists` para o 23505 legado).

UI: o diálogo do convite diz "Convite já enviado" (mesmo link, nenhum e-mail
novo) ou "Convite atualizado"; a página de convite da instituição mostra "O que
este convite pede" (empresa, produto, prazo, validade, situação), descarta
resposta atrasada de outra organização/token (sequência) e trava aceite/recusa
quando o convite já não está aberto. Falha ou ausência da prévia mantém a tela
anterior. O botão "Convidar" continua sem reenvio cego após resposta incerta
enquanto a Demo não tiver a migration.

## 4. Evidências (local; SHA no corpo da PR)

| Verificação | Tipo | Resultado |
| --- | --- | --- |
| `tests/database/financial-invite-integrity.sql` em clean/upgrade/fresh, com rollback e reaplicação dupla (`npm run test:database`) | PostgreSQL 16 real local | ver PR |
| ACL: anon/service_role sem execute; viewer e outro comprador `forbidden`; prévia recusada a outro provedor, a e-mail divergente e a token inexistente | PostgreSQL real | incluído acima |
| Contagens: 3 convites, 2 `provider_invited`, 1 `provider_invite_retargeted`, 2 e-mails para 5 chamadas de envio | PostgreSQL real | incluído acima |
| `npm run check:all`, `npm run build`, `npm run check:design` | estático/puro | PASS |
| E2E `finance-provider-draft` (37, incl. 2 novos de prévia), `finance-relationship-center`, `finance-procurement` em chromium-desktop, webkit-desktop, mobile-chrome | navegador com API simulada | ver PR |
| Hospedado (Demo/Production) | — | **não validado**; nenhuma escrita hospedada |

## 5. Migration pendente e publicação segura

`docs/supabase-financial-invite-integrity.sql` entra no manifesto após
`arandu-10`. Ao fazer merge, o preflight da Demo passa a ver o schema como
**`SCHEMA_PENDING` (incremental)** até a aplicação autorizada. A aplicação
**não muda dados**: só funções e o marcador. Enquanto isso, a Demo continua
funcional: `invites/send` usa o caminho legado e `invites/preview` responde
indisponível. Procedimento: `npm run migrations:release -- --environment=demo --flow=existingDatabase`
`--after-schema=financial-arandu-10-1` (procedimento em
`docs/demo/DEMO_HOSTED_RECOVERY_RUNBOOK.md`), backup + restore comprovado, depois
`ops/sql/post-migration-probes.sql` (novo probe de ACL) e canário de
isolamento. Rollback: `docs/rollback/supabase-financial-invite-integrity.rollback.sql`
(restaura o corpo anterior, revoga as novas funções, não apaga nada).

**Decisão do owner necessária:** se a P0 da Demo não puder ficar com
`SCHEMA_PENDING` nem por curto período, segurar o merge até a janela de
aplicação autorizada.

## 6. Não entregue / riscos residuais

- Frentes A, B, C, F (auditoria dos 189/17 alertas do advisor), G e H: não
  trabalhadas nesta PR. Os alertas continuam **não classificados**.
- Convite expirado/revogado não pode ser reemitido para a mesma instituição na
  mesma RFQ (limitação da unique; reemissão exigiria rotação de id/token).
- Retarget troca o destinatário de um convite aberto; o link antigo passa a
  valer só para o novo contato. É intencional, mas não há aviso ao contato antigo.
- Sem teste de concorrência multi-conexão específico para o envio (a trava
  `for update` + unique cobrem; prova adicional seria um `*-concurrency.mjs`).
- Validação com instituições reais e Demo hospedada: inexistentes.

## 7. Adendo — achados da auditoria hospedada da 11.3

| Achado | Causa confirmada no código | Correção | Regressão |
| --- | --- | --- | --- |
| DATA-01 (P1) plano de renovações contava 7 "tarefas abertas" (5 open + 2 done) | `finance-work-intelligence.mjs` buscava o enriquecimento de tarefas sem filtro de status; `renewal-workbench.js` usava `tasks.length` | Fonte canônica: enriquecimento só com `status=eq.open` (o rótulo e a cobertura/limite de 500 passam a se referir a tarefas abertas); a UI filtra `open` por defesa contra API antiga. Histórico de tarefas concluídas intocado | `scripts/test-arandu-10.mjs` exige `status=eq.open` em toda leitura de `fin_tasks` do plano |
| UX-01 (P2) comparar um único cenário salvo dizia "recalculado" sem resultado | `drawComparison` devolvia só `comparisonSource()` quando havia 1 cenário | Um cenário pontuado mostra sua tabela (posição, pontuação, cobertura, faltantes) e orienta a selecionar outro; cenário recusado mostra o motivo do motor | E2E `um cenário salvo comparado mostra o resultado…`; teste de rascunho único em `finance-procurement` |
| UX-02 (P2) dossiê dizia "Nenhum cenário calculado" após comparar salvos | `buildDossier` só recebia os rascunhos | `buildDossier` recebe a comparação do servidor: nome, versão, pesos, origem (salvo × rascunho), revisão do contexto, instante do cálculo, cobertura e motivo de não pontuação. Continua sem recomendação | Mesmos E2E (dossiê com "cenário salvo v1, recalculado pelo servidor em … com a revisão 1" e "Não pontuado") |
| UX-03 (P3) "Prazo vencido em 2026-11-03" na Caixa de Trabalho | `workReason` interpolava `due_on` cru | `formatDate` (pt-BR) | E2E da Caixa: nenhum motivo com data ISO |
| OPS-01 pool da Demo | — | **Sem mudança de código** nesta PR, por coordenação com o Modo Work (reposição é dele). Revisão de claims/expiração não realizada; segue como pendência | — |

Segurança (189 `SECURITY DEFINER` executáveis por `authenticated`, 17 tabelas
com RLS sem policy): **não classificados nesta PR**. As duas funções novas
nascem com `revoke` explícito de `public, anon, authenticated, service_role`,
`execute` só para `authenticated`, `search_path=''` e testes adversariais.
