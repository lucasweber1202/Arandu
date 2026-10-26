# Claude v3.7 — Correção buyer-first e Instituições 2.0 (2026-10-26)

- SHA inicial (`origin/main`): `78e3bb36221c6ef4b7bfc3ea450a144bf790ab39` (contém #272 e #273).
- Branch: `claude/practical-turing-s07mn2`, recriada da `main` atual porque a PR anterior (#272) já foi mergeada. Sessão em contêiner na nuvem; nenhuma estação Demo de outro agente foi tocada.
- Maturidade: M1 até CI verde no HEAD exato. Nenhuma validação com pessoas reais.

## Frente A — regressões buyer-first

| Problema | Evidência | Correção | Teste |
|---|---|---|---|
| A1: dois `return` com o mesmo predicado `!rows.length && contracts.length` em `contracts()`; o segundo (com ação e texto por papel) era inalcançável | Confirmado em `company.js:236/238` no SHA inicial | Ramo redundante removido; texto sem convite a registrar para quem só lê; o formulário abre com a entidade em foco já selecionada (`selectedEntity()`) | `filtro de entidade sem contrato não parece carteira vazia…` |
| A2: conferência após resultado incerto dizia "não aparece" como se fosse ausência; instituição nova cuja resposta se perdeu era cadastrada de novo no reenvio | Leitura do código da #272 | Mensagem diz quantos contratos foram carregados e que isso **não prova** ausência; conferência reaproveita a instituição homônima já gravada; resumo de revisão atualizado | `instituição gravada cuja resposta se perdeu é reaproveitada…` (1 POST de instituição) |

O backend de idempotência de `contract-import` é do Codex. Quando existir, a conferência deve trocar a busca no recorte pela chave de idempotência; os testes acima continuam válidos como contrato de UI.

## Frente B — Portal das Instituições

| Etapa | Antes | Problema | Mudança | Teste |
|---|---|---|---|---|
| Aceite (início e cartão) | Um clique enviava | Não explicava que aceitar ≠ proposta ≠ crédito | Confirmação com o significado, comprador, produto e prazo ("sem prazo informado" quando ausente) | `aceite: a confirmação explica…` |
| Aceite com rede/5xx | Toast e botão reabilitado | Reenvio às cegas e, na segunda vez, "convite inválido" para um convite já aceito | Estado incerto: botão fica desabilitado, aviso com "Atualizar portal"; nova tentativa que receba `invite_invalid` diz que pode já ter sido aceito | `aceite com queda de rede…` |
| Página de convite | Mensagem crua do servidor | Expirado/revogado/usado sem orientação; 401 genérico; 403 sem explicação | Mensagens por caso, link para conferir em Oportunidades, sessão expirada explícita | `convite já usado, expirado ou revogado…` |
| Envio da proposta | Toast e reenvio | Rede/5xx pode ter registrado a versão | "O envio não foi confirmado" + "Conferir envio", que lê a própria atribuição e só confirma com versão maior | `envio da proposta sem confirmação…` |

Já existentes e preservados (com testes): caixa por estado real (Para responder, Rascunhos, Enviadas, Encerradas), pendências da própria proposta, revisão antes do envio, diff de revisões, histórico só da própria instituição, fronteira de visibilidade.

**Recusa de convite: NOT_IMPLEMENTED.** Não existe endpoint de recusa (`lib/api/**` só tem `invites/accept`). Nenhum botão de recusa foi criado para não simular persistência. Contrato proposto para o Codex: `POST invites/decline {token, provider_organization_id, reason?}` com o mesmo vínculo de membro do aceite, idempotente, registrando evento auditável e devolvendo `already_responded` quando aplicável.

## Frente C — Central de Relacionamentos

Não alterada nesta rodada: os testes existentes (`finance-relationship-center.spec.js`) seguem verdes e cobrem recorte, ausência de término, deep link para o contrato e retorno. Nenhuma ruptura nova foi reproduzida com evidência dentro do tempo desta missão.

## Arquivos

`finance/src/views/company.js`, `finance/src/views/contract-center.js`, `finance/src/views/provider.js`,
`tests/e2e/finance-contracts.spec.js`, `tests/e2e/finance-provider-draft.spec.js`, `tests/e2e/demo-journeys.spec.js`
(o aceite agora passa pela confirmação), este documento. Nenhum arquivo do Codex (`rfq.js`, `external-proposals.js`, `lib/api/**`, SQL, deploy) foi tocado.

## Resultados

- PASS: `npm run check:all`, `npm run check:design`, `npm run build`.
- PASS (E2E com API simulada): contratos, portal do provedor, procurement, relationship center, entidades e passport — 382/382 em Chromium desktop e Pixel 7.
- PASS: `demo-journeys` (suíte de apresentação) — 11/11 em Chromium.
- AVISO pré-existente: `check:build-size` aponta a rota `rfq` com 98% do limite já na `main` (245 345 bytes; esta PR +7 bytes).
- NOT_RUN: Firefox/WebKit/mobile-safari locais (CI cobre), `test:database`, Demo canônica com Auth/RLS/Storage reais, capturas antes/depois, validação com pessoas reais.

## Rollback

Reverter o commit. Sem migration, dado ou contrato de API alterado.
