# Arandu 11.2 — Financial Workspace (incremento 1)

Relatório de implementação e evidência. Não é guideline nem plano.

- **SHA base:** `main` `927d9bd823a03b5fce5f396deaee961e7572c7fb`.
- **Maturidade justificável:** M1 com E2E local (API simulada por `page.route`).
  M2 depende dos quatro gates no HEAD exato da PR. Nada foi validado na Demo
  hospedada nem com pessoas reais.
- **Escopo entregue:** Frente A (Financial Workspace) e uma correção de Frente B
  (Central de Relacionamentos). Frentes C, D e E **não foram tocadas** neste lote.

## Defeito encontrado e corrigido (P1)

| Jornada | Problema | Causa | Correção |
|---|---|---|---|
| Painel → renovação | Contrato vigente com `renewal_notice_days` nulo aparecia como "Decidir renovação · aviso prévio em N dias", com N igual aos dias até o fim: o Painel afirmava uma data-limite que ninguém registrou. | `renewalStage` presume 0 dias de aviso. | Item "Confirmar aviso prévio" diz que a data-limite é desconhecida e leva ao Contract 360, onde a lacuna "Registrar aditivo" já existe. `renewalStage` não foi alterado (usado por outros módulos). |
| Central de Relacionamentos | O mesmo contrato aparecia como "aviso prévio de null dias registrado no cadastro". | Interpolação do valor nulo. | Situação `no_notice` ("Aviso prévio não informado") com término e o que fazer. |
| Painel | Contrato vigente sem fim de vigência sumia da fila "Precisa de você" (estado `inactive`). | — | Passa a aparecer como dado incompleto. |

## Funcionalidades

1. **Dados incompletos no Painel** (`kind: 'Dados'`, filtro "Dados incompletos").
   Contrato vigente sem fim de vigência, sem aviso prévio ou sem responsável vira
   "Completar contrato: instituição · o que falta", com motivo "Falta informação
   para acompanhar prazos" e link ao Contract 360 do contrato. Mais de três
   contratos viram um item que leva ao plano de renovações. Campo ausente da
   resposta não é tratado como lacuna; só o valor nulo. Só gestores recebem (mesma
   condição `create_rfq` das demais pendências de contrato).
2. **Aguardando outras pessoas** (antes "Aguardando instituições"). Além dos
   convites sem resposta, mostra aprovações pendentes na vez de outro aprovador,
   com o nome de quem está com a etapa e o progresso, e leva ao pedido em
   Aprovações. Não é pendência de quem lê, por isso não entra em "Precisa de você".
3. **Objetivos permanentes.** Depois da primeira solicitação, o painel por
   objetivo dos primeiros passos (`first-value.js`, mesma fonte
   `lib/finance/first-value.mjs`) continua disponível num bloco recolhido
   "Objetivos", carregado só ao abrir; o estado aberto é lembrado no navegador.
   Não é um segundo onboarding: mesmos passos, mesmo estado vindo do servidor.

APIs usadas: `overview`, `approvals`, `members` (existentes). Nenhuma API, tabela,
migration ou regra de autorização nova.

## Testes (container Linux, local)

| Comando | Resultado |
|---|---|
| `npm ci --include=optional` | ok |
| `npm run check:all` (inclui `check:design`) | ok |
| `npm run build` | ok |
| `playwright test --project=chromium-desktop --project=mobile-chrome` | 1033 passed, 11 skipped, 0 failed |
| `npm run test:e2e:presentation -- --project=chromium-desktop` | 73 passed, 6 skipped |
| Firefox, WebKit, mobile-safari | não executados (navegadores ausentes no container); ficam para o CI |
| `npm run test:database` | não aplicável (sem SQL) |

Testes novos (API simulada): aviso prévio nulo não vira prazo; lacunas levam ao
Contract 360 e filtram por tipo; leitor não recebe "Completar contrato";
aprovação na vez de outra pessoa aparece com o nome e não como pendência própria;
objetivos recolhidos, lembrados após recarregar, sem overflow; Central de
Relacionamentos sem "null dias".

## Limitações e pendências

- Capturas antes/depois (`npm run design:capture`, Demo canônica local) não foram
  produzidas neste lote: o container não tinha a Demo local com Supabase.
- `renewalStage` (`finance/src/core.js`) continua presumindo 0 dias quando o aviso
  é nulo; outros consumidores (plano de renovações já trata, ver
  `renewal-workbench.js`) devem ser revistos no próximo incremento.
- Frentes C (negociação), D (portal) e E não avançaram neste lote. As dependências
  de backend do 11.1 (idempotência de convites, `coverage.complete`, prévia de
  convite) continuam com o Codex.
