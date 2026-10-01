# Roteiro da demonstração (5–10 minutos)

Antes: `npm run demo:local:reset` (ou `npm run demo:reset` no ambiente
hospedado) para começar do estado inicial. Use duas janelas: uma normal
(Juliana) e uma anônima (Helena ou um provedor). Senha das personas em
`scripts/pilot-local/.state/demo.env` (local) ou com quem rodou o seed.

**Mensagem central:** a Vitta Foods compra, negocia, aprova e acompanha seus
produtos financeiros no Arandu — com o histórico, as decisões e as renovações
num só lugar.

| # | Onde | Faça | Diga |
| --- | --- | --- | --- |
| 1 | `/login.html` | Entre como **juliana.ramos@vittafoods.example** | "Juliana é gerente de tesouraria da Vitta Foods, indústria de alimentos de ~R$ 180 milhões. O selo no topo indica o ambiente de demonstração: o produto é o mesmo da produção." |
| 2 | Painel | Mostre "Precisa de você", o resumo e as concorrências | "O painel começa pelo que exige ação: uma renovação com prazo, tarefas da negociação em curso e um rascunho. Duas concorrências contratadas, uma em avaliação, aguardando a CFO." |
| 3 | Solicitações | Mostre a lista com estados e respostas | "Cada necessidade financeira vira uma solicitação estruturada — crédito ou adquirência — com prazo, responsável e quantos provedores responderam." |
| 4 | Adquirência — revisão de MDR | Visão geral: demanda e convidados | "R$ 12 milhões/mês em cartões. Três instituições convidadas, todas responderam. A demanda é a mesma para todas — ninguém compara laranja com banana." |
| 5 | Aba Propostas | Abra a Lumina Pay (v1 → v2) | "A Lumina revisou a proposta depois de um pedido da tesouraria; o histórico de versões fica registrado." |
| 6 | Aba Comparação | Role a tabela e os pesos | "Comparação factual, campo a campo. Os pesos são da empresa — o Arandu só faz a conta e mostra a cobertura. Aqui estão os pesos usados na decisão." |
| 7 | Atividade / comentários | Mostre a conversa com a Lumina e as notas internas | "A negociação acontece aqui: nota interna, menção ao Controller, pergunta à instituição e a resposta dela, tudo no contexto." |
| 8 | Aba Aprovações → Decisão | Controller → CFO; justificativa | "Duas etapas de aprovação, com comentário de cada aprovador. A decisão aponta a proposta e a versão escolhidas e guarda a justificativa e os critérios." |
| 9 | "Abrir ciclo de vida do contrato" | Contratos | "A decisão vira contrato com vigência, aviso prévio e marcos de 90/60/30 dias. A linha de capital de giro com o Atlas vence em 85 dias: a janela de renovação está aberta e o prazo do aviso prévio está claro." |
| 10 | Contratos → "Iniciar nova concorrência" (só mostre) | Volte à RFQ "Capital de giro — nova linha" | "A renovação já está em curso: nova linha de R$ 12 milhões, Atlas e Orbe responderam, a Meridian não enviou a tempo. A aprovação passou pelo Controller e agora está com a CFO." |
| 10b | Passport (menu) | Mostre a cobertura, o volume em cartões *desatualizado* e o histórico do faturamento; volte à RFQ e abra o cartão "Dados do Financial Passport" | "O perfil financeiro é um ativo da empresa: cada dado tem origem, responsável e data. A nova linha foi criada a partir do Passport e guarda uma fotografia — se o Passport mudar amanhã, o processo continua como foi. Cobertura é contagem de campos, não nota." |
| 11 | Janela anônima: **helena.duarte@vittafoods.example** | Painel → Aprovações | "A CFO foi avisada de que é a vez dela e decide com o contexto completo." (Aprovar é opcional: altera o estado; rode o reset depois.) |
| 12 | Janela anônima: **eduardo.lima@atlasbank.example** | Portal do provedor | "Do lado da instituição: só as próprias oportunidades e propostas. Ele não vê concorrentes, a comparação nem as notas internas da empresa." |

## Perguntas frequentes

- **"O Arandu recomenda a instituição?"** Não. A comparação é factual e a
  ordenação só existe com os pesos da própria empresa.
- **"E a economia?"** Ainda não estimamos economia: só com metodologia
  explícita (próxima fase: Savings Ledger).
- **"Isso é um protótipo?"** Não: é o mesmo código e as mesmas regras da
  produção; só a empresa e as instituições são fictícias.

## Depois da demonstração

Se você aprovou, comentou ou criou algo, volte ao estado inicial com
`npm run demo:local:reset` (local) ou `npm run demo:reset` (hospedado).
