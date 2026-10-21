# UI de propostas externas v3.7 — evidência e handoff

Frontend da rodada buyer-first (21/10/2026). Consome o contrato de
`docs/EXTERNAL_FINANCIAL_PROPOSALS_V37.md` sem alterar `lib/api/**`, `lib/finance/**`,
SQL ou deploy. Maturidade: M1 (código) + e2e local com API simulada por `page.route`;
não é M3: a migration `financial-external-proposals-1` não foi aplicada em ambiente hospedado.

## Jornada (Solicitação › aba Propostas › "Propostas recebidas fora do portal")

1. **Entrada**: admin, finance_manager e analyst veem "Registrar proposta recebida"; viewer só lê.
2. **Registro**: instituição já cadastrada, canal (e-mail/documento/planilha/comunicação formal/anotação),
   data de recebimento opcional (vazia = `null`, nunca `recorded_at`), referência, moeda (pode ficar
   "não declarada" = `null`), documento interno já disponível da própria RFQ (opcional) e condições do
   schema tipado do produto. Campo vazio não é enviado (permanece "não informado").
3. **Revisão**: resumo antes de gravar, com aviso de que é transcrição da empresa, não proposta
   autenticada, aprovação de crédito ou aceite.
4. **Correção**: nova versão com `expected_version`, motivo (10–1000) e `request_key` estável por
   abertura do formulário (retry não duplica). 409 mostra mensagem e bloqueia o botão; não reenvia.
5. **Conferência/retirada**: só admin e finance_manager; exige justificativa, declaração de leitura do
   material e, havendo documento, do documento.
6. **Histórico**: versões paginadas (`before_version`) com motivo e recibos de conferência.
7. **Comparação**: a matriz existente recebe as colunas externas do backend e as marca como
   "Fonte externa · transcrita pela empresa · fora da decisão". Nenhum botão de escolher/contratar:
   a aba Decisão continua listando só propostas do portal (`decision_allowed=false`).

Estados honestos: schema incompatível/404 → "não disponível neste ambiente"; 403 → papel sem
permissão; falha genérica → erro com nova tentativa, nunca "nenhuma proposta". No sandbox `/demo`
o recurso é só explicado, sem botão que pareça gravar. A visita pública (`demo/visita.html`, etapa 5)
ganhou uma nota sobre o registro externo e seu limite.

## Evidência

- `docs/demo/evidence-v37-external/external-list-{desktop,mobile}.png`
- `docs/demo/evidence-v37-external/external-review-{desktop,mobile}.png`
- `tests/e2e/finance-external-proposals.spec.js`: 5 cenários × chromium-desktop e Pixel 7.

## Limitações e handoff (Codex/backend)

- Seed da Demo canônica sem cenário externo: precisa entrar via `scripts/demo/seed.mjs` depois da migration.
- `weightsPanel` só aparece com 2+ propostas do portal; com 1 do portal + externas, os pesos não são editáveis na UI.
- Moeda ausente: os blocos de valor usam o formato do cadastro (R$); a tela avisa que nada foi convertido.
  Um formatador sem símbolo para `currency=null` exigiria mudança em `core.js`/`shared.js` compartilhados.
- Recusa de convite pelo portal da instituição, P2 (Central) e P3 (ofertas) não foram alterados nesta PR.
- Os testes `public-tour.spec.js` falham neste container também na `main` limpa (ambiente local); o
  gerador e `scripts/test-public-tour.mjs` passam. CI é a referência.
