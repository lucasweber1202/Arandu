# UX v3.8: Financial Relationship Work OS

Rodada de frontend do 21/10/2026 sobre `main@d321901`. Usa apenas endpoints e
dados já existentes. Não altera `lib/api/**`, `lib/finance/**`, SQL, migrations,
`vercel.json`, workflows ou scripts operacionais, exceto o gerador da visita
pública (`scripts/generate-public-tour.mjs`, só texto).
Maturidade: M1 com E2E local e API simulada por `page.route`. Não é M3.

## Jornadas entregues

### 1. Integridade monetária das propostas externas (bloqueadora)
- Defeitos da auditoria pós-#252: `currency=USD` aparecia como `R$`; registro
  novo vinha com BRL pré-selecionado; rótulo e leitura do formulário afirmavam R$;
  a comparação dizia "Origem: não disponível" para colunas externas.
- Correção: um formatador único, `moneyIn`, em `finance/src/core.js`, com a mesma
  regra de `lib/finance/fee-presenter.mjs` e da comparação. A moeda ISO declarada
  é formatada com `Intl`. Moeda ausente aparece como "(moeda não declarada)". Não
  há conversão nem cotação. `fieldValue`, `definitionList` e `keyTerms` recebem a
  moeda da fonte. Sem essa opção, as propostas do portal continuam na unidade v1 do
  cadastro (BRL), como antes.
- A comparação mostra a origem declarada da transcrição e o "valor anterior" na
  moeda da coluna.
- Testes negativos (`finance-external-proposals.spec.js`: USD/EUR/ausente, registro
  sem BRL presumido, correção preservando USD, comparação mista) **falham na `main`**
  com "R$ 250.000" e `currency=BRL` e passam nesta branch.

### 2. Central de Relacionamentos 2.0 (Instituições)
- A tela Instituições abre com "O que pede ação nos relacionamentos". A fila mostra
  vigência terminada, aviso prévio registrado já passado, janela de renovação,
  renovação e negociação em andamento, tarefas (vencidas e abertas) e término não
  informado.
- Ordem dos itens: vencido → prazo próximo → em andamento → ausente.
- Cada item mostra:
  - a situação;
  - a instituição;
  - o responsável registrado, ou "Responsável não informado no registro";
  - a origem (contrato da carteira existente ou de decisão, versão dos termos,
    revisão da solicitação, convite);
  - o destino: abrir contrato, decidir renovação no contrato, abrir negociação ou
    abrir tarefas.
- Filtros por instituição, entidade (com entidades), condição (2+ categorias) e situação.
- É derivada de `overview` (contratos, solicitações, tarefas), sem novo
  armazenamento, Graph, ranking ou cálculo financeiro. Chunk lazy de 8 KB.

### 3. Contrato → próxima ação → renovação
- "Instituições sem contrato vigente registrado" → "Registrar contrato existente"
  já com a instituição preenchida. Depois do `id` confirmado pelo servidor, abre o
  contrato gravado.
- O aviso prévio deixou de ser presumido: antes, o formulário vinha com 60 e usava
  60 quando o campo ficava vazio. Agora é obrigatório e declarado (do contrato ou
  marco interno). Na fila, o texto é "aviso prévio de N dias registrado no cadastro
  (confira no documento)".
- A renegociação continua pelo botão existente no contrato (`contract-renewal-rfq`),
  com confirmação. Nenhuma solicitação é criada automaticamente.

### 4. Propostas externas 2.0
- Conferência e retirada em painel próprio. A validação acontece no painel, sem
  perder o texto, e o conflito 409 bloqueia o reenvio.
- Gestão (admin/finance_manager) segue da gravação direto para conferir **a versão
  gravada**: duas declarações em dois passos confirmados. Analista só grava.
- O painel de pesos aparece quando a comparação do servidor tem 2+ colunas,
  incluindo as externas conferidas. O cálculo é o do servidor, sem vencedor
  automático. `decision_allowed=false` continua sem ação de escolher ou contratar.

### 5. Portal da instituição
- Cada oportunidade mostra:
  - prazo absoluto;
  - condições obrigatórias em branco na versão enviada;
  - validade da própria proposta: vencida, próxima ou "não informada" (nunca
    "em dia").
- Sem outra pendência, a próxima ação é revisar a validade que vence com a coleta aberta.
- Só dados da própria instituição.

### 6–7. Progressividade e apresentação
- Começo simples: sem instituições, há um estado vazio com "Cadastrar instituição".
  Com instituições, a fila e a chamada "registrar contrato existente".
- Entidade e condição só aparecem quando os dados existem. Detalhes avançados
  (indicadores, mapa, relação por entidade) seguem no relacionamento da instituição.
- Nenhum tier, billing ou entitlement.
- Visita pública (12 etapas mantidas):
  - "O ponto de partida" explica o valor antes de qualquer banco aderir (cadastro +
    contratos existentes + fila por instituição);
  - a tabela de valor para a instituição inclui pendências e validade da própria
    proposta.

## Evidência visual (`docs/demo/evidence-v38/`)
Mesma API simulada nas duas builds (`main@d321901` = antes; branch = depois),
1440 px e Pixel 7:
`instituicoes-*`, `propostas-externas-*` (USD: R$ → US$) e `comparacao-*`.

## Testes
- `npm run check:all`: PASS. `npm run build`: PASS. `check:build-size`: PASS.
  A rota `rfq` tem 245.860 / 250.000 bytes; na `main` são 245.750 e o aviso de 98%
  já existe.
- E2E chromium-desktop + Pixel 7 (`finance-*`, `presentation-journeys`, `demo-*`):
  524 passed, 26 skipped, 50 failed.
- As 50 falhas ficam em `demo-work-os-v3.spec.js` e `demo-workspace-v2.spec.js`. Elas
  se reproduzem **idênticas na `main@d321901` limpa** (50 failed, mesma asserção
  `toHaveAttribute`) e são do sandbox `/demo` (ambiente local). Esta branch não
  toca esses arquivos.
- Testes ajustados:
  - `finance-contracts.spec.js`: dois cenários passam a declarar o aviso prévio
    (antes dependiam do 60 implícito).
  - `finance-external-proposals.spec.js`: o rótulo "Valor ofertado (R$)" virou
    "(na moeda do material)".
  - Nenhuma asserção foi removida.

## Limitações e handoff para Codex/backend
1. **Aviso prévio declarado × default**: `fin_contracts.renewal_notice_days` é
   `NOT NULL DEFAULT 60`. Contratos antigos podem ter 60 por padrão, não por
   declaração. Contrato sugerido: coluna anulável ou `renewal_notice_source`
   (`declared|internal_milestone|unknown`), para a fila dizer "aviso prévio
   desconhecido".
2. **Recusa de convite pelo portal**: não há endpoint. Nenhuma ação foi exibida.
   Contrato esperado: `POST invites/decline {token|invite_id, reason}` auditável,
   idempotente, sem expor a outros provedores.
3. **Responsável interno do relacionamento**: só existe `owner_id` por contrato e
   solicitação. Não há dono por instituição; a ausência é mostrada.
4. A fila usa o recorte de `overview` (200 contratos/solicitações, 100 tarefas
   abertas) e diz isso. Um endpoint agregado por instituição seria necessário para
   carteiras maiores.
5. Seed da Demo canônica: sem cenário de proposta externa nem de contrato em janela
   de renovação para a apresentação. Entrar via `scripts/demo/seed.mjs` após a migration.
