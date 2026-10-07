# Roteiro da demonstração (5–10 minutos)

> Topologia vigente (07/10/2026): Demo e Production permanentes; Pilot é etapa
> de validação. Nomes pilot:*/pilot-local são compatibilidade de ferramentas.
> Conversão dos slots somente após os gates de TWO_ENVIRONMENT_CONSOLIDATION.md;
> não reinterpretar referências históricas como autorização de reset ou terceiro banco.


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


### Depois do contrato (5 minutos extras)

A história continua do contrato à próxima renovação: **identifico → estruturo →
convido → recebo → comparo → aprovo → contrato → implanto → acompanho
obrigações → acompanho performance → acompanho spend → identifico
oportunidades → renovo**.

| # | Onde | Faça | Diga |
| --- | --- | --- | --- |
| 13 | Implantação | Abra "Migração da adquirência para a Lumina Pay" | "Depois da decisão vem a implantação: marcos com evidência, um bloqueio real (terminais atrasados) e o aceite de go-live, que é humano. Atraso vem de datas, não de opinião." |
| 14 | Covenants | Mostre os três períodos e abra a cobertura de juros | "Dívida líquida/EBITDA medida e revisada por outra pessoa: conforme. Entrega das demonstrações: dados ausentes — e ausência não é conformidade. Cobertura de juros abaixo do limiar, com waiver aprovado pela CFO: a exceção fica registrada e o resultado factual é preservado." |
| 15 | Performance | Abra "Primeiro mês da Lumina Pay" | "Metas e método são da Vitta. Liquidação D+1 medida e revisada; chamados sem relatório ficam 'indisponível', não viram nota boa nem ruim. Não existe nota universal de banco." |
| 16 | Spend | Mostre os cartões por moeda e tipo | "Spend separado por moeda e por tipo: observado, contratado. Só entra no total o que foi reconciliado por outra pessoa. Diferença de spend não é economia." |
| 17 | Qualificação | Abra a do Atlas Bank | "Exigências da empresa, evidências com origem. O KYB veio de um serviço externo e está registrado como tal — o Arandu não verifica a instituição. A decisão de qualificar é humana e ainda está pendente." |
| 18 | Documentos | Abra a cédula de crédito lida | "Cada fato extraído aponta a linha do documento. Os campos que a Juliana conferiu estão confirmados; o resto espera revisão. Extrair não é decidir." |
| 19 | Oportunidades | Mostre as oportunidades abertas | "As regras são da Vitta: renovação na janela, covenant com prazo, waiver vencendo, implantação bloqueada. Cada uma traz o fato, a fonte e uma ação possível — quem decide é a equipe." |

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
