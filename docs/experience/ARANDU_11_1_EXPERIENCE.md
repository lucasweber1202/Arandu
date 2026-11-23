# Arandu 11.1 — Integridade das jornadas (frontend)

Relatório de encerramento do incremento. Não é guideline nem plano: registra o que
foi verificado, corrigido e provado, e o que ficou bloqueado.

- **SHA inicial:** `main` `79094bf1e0668ad70b0b2bb6558a51d9969bd1b5` (o mesmo commit
  servido pela Demo hospedada em 23/11/2026, conferido em `/api/health`, só leitura).
- **PR #358 (Arandu 11):** aberta, sobre a `main` atual, não mergeada por este
  incremento. Ela toca `dashboard`, `first-value`, `relationship-center`,
  `provider-relationship` e `shared/renegotiation`. Este lote **não altera nenhum
  desses arquivos de código** para não concorrer com ela; sobreposição só em dois
  arquivos de teste (`finance-procurement.spec.js`, regiões diferentes).
- **Maturidade justificável:** M1 com E2E local (API simulada por `page.route`) e
  jornada exercitada na Demo canônica local (Supabase real em Docker). M2 depende dos
  quatro gates no HEAD exato da PR.

## Problemas confirmados e corrigidos

| Sev. | Jornada | Problema (reproduzido) | Causa | Correção |
|---|---|---|---|---|
| P0 | Decisão → contrato | Apagar "Aviso prévio" e registrar enviava `renewal_notice_days: 0`: o contrato nascia sem janela de aviso, sem a pessoa ter digitado 0 (alteração silenciosa de valor que muda prazos de renovação). | `Number('') === 0` no envio; o servidor aceita 0. | Campo obrigatório e sem valor presumido (mesma regra do registro de contrato existente): vazio e não inteiro são recusados no campo, com foco; 0 só se digitado. `finance/src/views/contract-registration.js` |
| P2 | Decisão → contrato | Erro de campo ("fim antes do início", "https") ficava na tela depois de corrigido. | `setError` nunca era limpo. | Cada tentativa limpa e revalida todos os campos. |
| P2 | Decisão → contrato | Fim sugerido por `meses × 30,44 dias` (podia errar o dia) e 12 meses inventados quando a proposta não declarava prazo. | Aproximação; padrão fixo. | Meses de calendário a partir do início (`addMonths`), só quando a proposta declara o prazo, com a origem dita no campo; sem prazo declarado, o campo fica vazio e pede o contrato assinado. |
| P1 | Convite da instituição | Quem abria o link do convite sem sessão clicava "Entrar" e, depois do login, caía numa página pedindo para colar o token (que já tinha saído do endereço): a tarefa interrompida não era retomada. | `next=/provider/invite.html` sem o token, por segurança. | Token pendente só no `sessionStorage` da aba (nunca na URL do login, cookie ou servidor), retomado depois do login e apagado no aceite, na recusa ou quando o convite é definitivamente inválido. `finance/src/views/provider.js` |
| P1 | Convite da instituição | Sessão expirada no aceite/recusa dizia "entre de novo" sem caminho e sem preservar o convite. | — | Link "Entrar de novo e retomar este convite" e token preservado. |
| P1 | Convites (RFQ e renegociação) | Queda de rede/5xx depois de "Convidar" reabilitava o botão; um segundo clique cria **outro convite e outro e-mail**. | `fin_invite_provider` não é idempotente (insere a cada chamada); a tela tratava falha incerta como recusa. | `sendInvite` em `rfq/invite-delivery.js`: resposta incerta não reabilita o envio e manda atualizar e conferir; recusa definitiva (4xx) reabilita. Usado no formulário de convites e no convite da instituição do contrato. |
| P1 | Portal da instituição | Toda instituição via "Resumo de até 200 oportunidades. Consultar todas as páginas" e "Nenhuma pendência *nesta seleção*", mesmo com 3 oportunidades (ver capturas). | O servidor devolve `coverage.complete: false` em todo resumo não exato. | O portal só se declara truncado quando o resumo veio cheio (`rows.length >= coverage.limit`). |
| P2 | Convite | Erro de formato do token não sumia ao corrigir. | — | Limpo ao digitar. |

Capturas (Demo canônica local, dados sintéticos Vitta Foods/Atlas Bank):
`arandu-11-1/provider-home-before-320.png` → `provider-home-after-320.png`,
`provider-home-after-1440.png`; `first-value-contract-saved-1440.png`.

## Auditoria (o que foi verificado sem precisar de correção)

- **Renderização real**, Demo local, comprador e instituição, 12 superfícies × 1440,
  1280, 390 e 320 px (48 capturas): nenhum overflow horizontal, nenhum UUID, data ISO,
  enum `snake_case`, `undefined`/`NaN` visível. Única falha: 429 da API por carga em
  rajada do próprio script, exibido com contagem regressiva e nova tentativa (estado
  correto).
- **Primeiro valor sem instituição** (escrita real na Demo local descartável):
  `contracts.html?acao=registrar-contrato` → instituição já cadastrada → título,
  vigência, aviso prévio 90 → prévia "Próxima ação: Revisar renovação para 31/12/2026,
  90 dias antes do fim" → revisão → confirmação → contrato aberto pelo id devolvido
  pelo servidor, origem "Contrato existente registrado na carteira (sem negociação no
  Arandu)", responsável atribuído; presente após recarregar.
- **Renegociação:** o botão de renovação só aparece para `admin`/`finance_manager`,
  os mesmos papéis que `fin_start_contract_rfq` exige; repetir é seguro porque o
  servidor reabre a concorrência em andamento. A origem contratual, a versão de
  referência, a autoria das propostas e o retorno ao relacionamento já estavam no
  cartão `negotiation-origin`.
- **Portal:** aceite/recusa com confirmação, replay da recusa, rascunho com retry,
  envio incerto com "Conferir envio" e isolamento por instituição já cobertos por
  `finance-provider-draft.spec.js` (baseline 263 testes da área passando antes das
  mudanças).

## Testes executados (local, container Linux)

| Comando | Resultado |
|---|---|
| `npm ci --include=optional` | ok |
| `npm run check:all` (inclui `check:design`) | ok |
| `npm run build` | ok |
| `npm run test:e2e -- --project=chromium-desktop --project=mobile-chrome` | 1011 passed, 11 skipped, 0 failed |
| `playwright test -c playwright.presentation.config.js tests/e2e/demo-journeys.spec.js --project=chromium-desktop` (build de apresentação) | 11 passed |
| Firefox, WebKit, mobile-safari | **não executados** (navegadores ausentes no container); ficam para o CI |
| `npm run test:database` | não aplicável (sem SQL/autorização alterados) |

Testes novos: aviso prévio não presumido e erro limpo (`finance-procurement`), convite
incerto não reenviado (`finance-procurement`), retomada do convite após login, sessão
expirada, convite inválido não guardado e resumo do portal não truncado falsamente
(`finance-provider-draft`). São testes de UI com API simulada; não provam o banco.

## Dependências de backend (handoff para o Codex)

1. **`POST /api/finance/invites/send` não é idempotente.** Observado: cada chamada de
   `fin_invite_provider` insere um convite e enfileira um e-mail. Contrato necessário:
   `request_key` (corpo ou `X-Arandu-Request-Key`, como `contract-import`), replay
   devolvendo o mesmo convite/estado sem novo e-mail; 409 para a mesma chave com outro
   conteúdo. Permissão inalterada (`admin`, `finance_manager`). Teste: dois envios com a
   mesma chave → um convite, um e-mail, mesmo `invite_id`. Até lá, a interface não
   reenvia sem conferência.
2. **`GET assignments` (resumo) declara `coverage.complete: false` sempre.** Contrato:
   `complete = proposals.length < limit`. A interface já se protege pelo limite.
3. **Prévia do convite antes do aceite** (identificada na #358): segue bloqueada por
   contrato de backend + migration com autorização. Nada foi exposto pelo frontend; o
   portal continua funcional sem ela.

## Riscos e limites desta validação

- E2E de produto usa API simulada; a jornada real foi exercitada só na Demo **local**.
  Nenhuma escrita na Demo hospedada; Production não foi tocada.
- A Implementation Matrix não foi alterada: são correções de integridade em
  capacidades já registradas, e o arquivo está em edição pela #358.
- **Próximo gate:** quatro checks obrigatórios verdes no HEAD da PR; depois do merge da
  #358, revisar a Central de Relacionamentos e o primeiro valor por objetivo sobre a
  nova baseline (fora deste lote por concorrência de arquivos).
