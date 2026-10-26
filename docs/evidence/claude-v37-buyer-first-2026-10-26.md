# Claude v3.7 — Buyer-first: contrato existente → próxima ação (2026-10-26)

- SHA inicial (`origin/main`): `e987a1472d81a4a3476eede07c6a24853a2bb619`
- Branch: `claude/practical-turing-s07mn2` (branch designada pela sessão; a sugestão `claude/v37-buyer-first-lifecycle` não foi usada). Sessão em contêiner na nuvem, sem worktree do Codex presente.
- SHA final e PR: ver a PR aberta a partir desta branch.
- Maturidade: nenhuma capability foi promovida. Mudança é M1 (código) até CI verde no HEAD exato (M2).

## Auditoria: o que já funcionava (não mexido)

Entrada por objetivo (`lib/finance/intents.mjs`, `intake.js`) ordenando "Registrar o que já existe" em org vazia;
registro de contrato existente com cadastro contextual de instituição, entidade, aviso prévio não presumido e prévia
do prazo (`contract-center.js`); contrato → "Trabalho deste contrato" com tarefas, responsável e criação idempotente
(`contract-work.js`); deep link `?abrir=contrato#contract-<id>` com fallback ao detalhe autorizado; Central de
Relacionamentos com recorte declarado. Tudo coberto por E2E existentes.

## Rupturas comprovadas e correções

| Etapa | Antes | Problema | Mudança | Teste |
|---|---|---|---|---|
| Gravação | "Registrar contrato" gravava direto | Sem revisão antes de gravação material (missão §8.10) | Etapa "Revisar registro" → resumo (instituição, entidade, vigência, próximo prazo, termos, origem "carteira declarada, sem RFQ/proposta/aprovação", responsável não atribuído automaticamente) → "Confirmar registro"; "Voltar e editar" preserva dados | `buyer-first: revisão antes de gravar…` |
| Falha de rede/5xx | Toast e botão reabilitado | Reenvio às cegas; sem caminho para descobrir se gravou | Estado incerto: bloqueia reenvio, "Conferir na carteira" recarrega do servidor e abre o contrato se ele existir | `buyer-first: queda de rede…` |
| Duplicata (409) | Erro no título | Beco sem saída | Mensagem do servidor + "Abrir o contrato já registrado" quando está no recorte carregado | teste de duplicata ajustado |
| 401/403 | Toast genérico | Não diz que nada foi gravado | Mensagens explícitas, formulário preservado | `buyer-first: recusa de permissão e sessão expirada…` |
| Pós-gravação | Na carteira só destacava o cartão | Próxima ação ficava a um clique escondido | Abre o contrato (`?abrir=contrato#…`) com "Trabalho deste contrato" e link ao relacionamento; resiste a refresh | `buyer-first: gravado pelo servidor…` |
| Prazo indeterminado | Prévia sumia sem aviso prévio | Ausência silenciosa | "O prazo para decidir a renovação não pode ser determinado" | idem revisão |
| Resposta 2xx sem id | Fechava como sucesso | Confirmação sem prova | Tratada como incerta | (coberto pelo ramo incerto) |
| Filtro de entidade | "Nenhum contrato registrado ainda" mesmo com contratos em outra entidade | Sugere carteira vazia | "Nenhum contrato nesta entidade" | NOT_RUN em E2E (mock de entidades não montado) |
| Leitor em carteira vazia | Estado vazio sem explicação | Não sabe quem registra | Explica papel e o que verá | `buyer-first: leitor numa carteira vazia…` |
| Entrada por objetivo | Faltavam "acompanhar vencimento" e "revisar condições" | Objetivos da missão §6 | Intenções `deadlines` (Tarefas) e `review` (Contratos), só com contrato registrado | `buyer-first: organização vazia…` |

## Arquivos

`finance/src/views/contract-center.js`, `finance/src/views/company.js`, `finance/src/views/intake.js`,
`lib/finance/intents.mjs`, `tests/e2e/finance-contracts.spec.js`, `tests/e2e/finance-procurement.spec.js`,
`tests/e2e/finance-relationship-center.spec.js`, este documento. Nenhum arquivo vetado ao Codex foi tocado.
APIs reaproveitadas sem mudança: `contract-import`, `providers` (POST), `overview`, `contract-detail`, `tasks`.

Os novos testes foram adicionados a specs já listados em `npm run test:e2e` (o `package.json` é vetado nesta rodada;
um arquivo novo não rodaria no CI).

## Resultados

- PASS: `npm run check:all`; `npm run check:design`; `npm run build`; `scripts/test-finance-command-center.mjs`.
- PASS (local, mocks de UI): `finance-contracts`, `finance-relationship-center`, `finance-procurement` — 281/281
  em Chromium desktop e Pixel 7 (Chromium), via config local apontando para o Chromium pré-instalado.
- NOT_RUN local: Firefox, WebKit, mobile-safari (navegadores ausentes no contêiner) — cobertos pelo CI.
- NOT_RUN: Demo canônica contra API/Auth/RLS real, `test:database` (sem Docker/PostgreSQL), capturas `design:capture`.
- Nenhuma validação com pessoas reais. Impacto de usabilidade é hipótese.

## Limitações de backend / handoff (Codex)

1. `contract-import` não aceita `owner_id`: o responsável do contrato não pode ser definido no registro. A revisão
   declara isso; o responsável segue pela tarefa do contrato. Contrato necessário: `owner_id` opcional validado como
   membro com papel editor.
2. Sem chave de idempotência em `contract-import`: a recuperação usa a lista recarregada (provedor+título+datas) e a
   recusa `contract_duplicate` do servidor. Contrato fora do recorte do `overview` não é localizado pela conferência
   (a tela diz isso). Sugestão: `idempotency_key` como em `tasks`.
3. Instituição criada com sucesso e contrato com falha incerta: reenvio reaproveita a instituição só na mesma aba.

## Rollback

Reverter o commit desta PR. Sem migration, sem dado, sem mudança de API.

## Fora de escopo

Central de Relacionamentos (Lote E) e densidade por papel (Lote F) não receberam mudança nesta rodada além do que
já existia; Lote G limitado a foco, estados e mensagens das telas tocadas. Nenhum claim WCAG.
