# v3.7 — workspace da instituição, solicitação e portal (evidência de UX)

**Base:** `main` com #247 e #248 (guideline v3.7) integradas. Escopo exclusivo da
camada de experiência: nenhuma mudança em `lib/api/**`, `lib/finance/**`, SQL,
workflows, `package*.json`, `vercel.json`, guideline ou Implementation Matrix.

## 1. Inventário antes da mudança (falhas observáveis)

| Fluxo | O que acontecia |
| --- | --- |
| Instituição (`provider-relationship.js`) | Drawer com 9 seções do mesmo peso. As primeiras eram indicadores e a nota de neutralidade; não havia responsável, próximo prazo nem "o que fazer agora". Contrato vencendo, questão aberta e contrato sem data de término só apareciam lendo listas. |
| Detalhe da solicitação (`rfq.js`) | O cartão "Próximo passo" ficava na coluna lateral da aba Visão geral: sumia nas outras abas e, no celular, aparecia abaixo da demanda. Não dizia quem pode agir. |
| Comparação | Já agrupada por significado econômico pelo motor canônico (`data.groups`), com cobertura por coluna e visão de duas propostas no celular. Faltava um resumo antes da tabela. |
| Começar (`intake.js`) | "Contratar" vinha primeiro mesmo para empresa sem nada registrado; "Comparar propostas" e "Renovar" levavam a listas vazias. |
| Cadastrar instituição | Toast "Provedor cadastrado." e volta à lista, sem próximo passo. |
| Portal da instituição (`provider.js`) | Rascunhos misturados com "Para responder"; a fronteira de visibilidade não era dita na entrada. |

## 2. O que mudou

### P1 — Instituição como workspace
- **Resumo:** relação (registrada; ou "Com contrato vigente"; ou "Estado não
  registrado"), contato principal, produtos e próximo prazo. Ausência aparece
  como ausência ("Não registrado", "Nenhum prazo futuro registrado").
- **O que pede atenção:** derivado só dos registros carregados
  (`relationshipAttention` em `relationship-context.js`). Classes explícitas:
  **Vencido** (contrato vigente com término passado; questão com prazo vencido),
  **Próximo** (término em até 90 dias), **Em andamento** (questão aberta;
  negociação em coleta ou avaliação) e **Não informado** (contrato sem término;
  nenhum contato). Cada item leva à tela canônica (contrato, negociação) ou à
  ação permitida ao papel (Resolver, Adicionar contato). O leitor não recebe
  ação de escrita.
- **Registros:** contratos, limites e negociações (componente existente), depois
  contatos e questões.
- **Sob demanda:** "Indicadores, mapa e avaliações" (neutralidade, métricas,
  mapa, relação por entidade, scorecards, performance, spend e tarifas) e
  "Histórico".
- "Issue" virou "questão" na interface. Mesma API e mesmos campos.

### P2 — Solicitação e comparação
- "Próximo passo" acima das abas, presente em todas elas, com atalho para a aba
  certa (convites, propostas, comparação, aprovação, decisão) e a frase de quem
  pode agir. O cartão duplicado da lateral saiu. Máquina de estados, transições,
  menu "Mais" e bloqueio de governança não mudaram.
- Resumo factual antes da matriz: propostas na versão atual, condições
  comparáveis que diferem, condições com informação pendente e ressalvas de
  comparabilidade. Contagem, não juízo. Nenhum CET, score ou savings novo.
  O componente é compartilhado, então o resumo também aparece no sandbox
  histórico: é apresentação do mesmo dado, não uma capacidade nova.

### P3 — Primeiro valor sem banco
- Com empresa sem solicitações nem contratos, "Começar" abre por "Registrar o
  que já existe", com a explicação de que nenhuma instituição precisa ter conta.
- Atalhos que levariam a listas vazias ("Comparar propostas", "Renovar") ficam
  ocultos enquanto não há o que mostrar. As permissões continuam vindo de
  `lib/finance/intents.mjs`.
- Cadastrar instituição abre direto o workspace dela, com mensagem do próximo
  passo (contato ou contrato existente). Em erro, o formulário continua aberto
  com a mensagem, como antes.

### P4 — Portal da instituição
- Caixa por estado: Para responder, Rascunhos, Enviadas e Encerradas, com
  contagem e uma linha do que falta em cada grupo.
- Nota fixa: a instituição vê só as solicitações para as quais foi convidada e
  só as próprias propostas.

## 3. Três ofertas (Essencial, Gestão, Enterprise)
Nada foi feito por plano, porte ou faturamento. A mesma tela serve às três
ofertas por divulgação progressiva: resumo e pendências primeiro; indicadores,
scorecards, mapa por entidade e performance a um clique.

## 4. Testes
- Novos: workspace (ordem e classes das pendências, ação por papel, lacunas),
  primeiro valor (ordem do Começar, atalhos vazios ocultos, cadastro abre o
  workspace), solicitação (próximo passo em qualquer aba, atalho, leitor),
  resumo da comparação, caixa da instituição (rascunhos e fronteira).
- Ajustados: o teste de scorecard abre "Indicadores, mapa e avaliações" antes
  de ler as métricas, que agora ficam sob demanda. As asserções foram mantidas.
- Resultados locais (Chromium desktop + Pixel 7): `test:e2e` 490 passed /
  10 skipped; suíte de apresentação 136 passed / 20 skipped; `check:all`,
  `check:design` e `build` passaram. Firefox e WebKit ficam com o CI.
- Capturas antes/depois: `docs/demo/captures-v37/`.

## 5. Lacunas e contratos para o Codex (sem implementação aqui)
1. **Responsável interno pela instituição:** a API devolve contatos da
   instituição, mas não um dono do relacionamento do lado da empresa. Hoje o
   resumo mostra o contato principal. Contrato sugerido: `owner_member_id` em
   `provider-relationship`.
2. **Aviso prévio no workspace:** `provider-relationship.contracts` não traz
   `renewal_notice_days`; por isso "Próximo" usa o término e manda revisar o
   aviso prévio no contrato.
3. **Recusa rápida pelo portal:** não existe endpoint de recusa de convite pela
   instituição. Nenhum botão foi exposto. Contrato sugerido: `POST
   invites/decline` com motivo opcional, RLS do provedor e evento de auditoria.
4. **Comparação por grupos personalizados:** os grupos vêm de
   `lib/finance/comparison`; qualquer regrupamento (por exemplo, "Garantias e
   obrigações" separado) é mudança de catálogo, coordenada com o Codex.
