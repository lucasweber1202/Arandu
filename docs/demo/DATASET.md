# Dataset da demonstração — Vitta Foods S.A.

Fonte única: [`scripts/demo/dataset.mjs`](../../scripts/demo/dataset.mjs). Tudo
é fictício; nenhuma marca real (o teste `scripts/test-demo-guard.mjs` recusa
nomes de bancos e credenciadoras reais no dataset). Datas são relativas ao
dia da semeadura (D0 = hoje), então a história é a mesma em qualquer dia.

## Empresa

| Campo | Valor |
| --- | --- |
| Razão social | Vitta Foods S.A. |
| Setor | Alimentos e bebidas |
| Faixa de faturamento | R$ 30–300 milhões (receita de R$ 182 milhões no último exercício) |
| Colaboradores | 612, em 3 fábricas e 2 centros de distribuição |
| Operação | Chapecó (SC), Rio Verde (GO), Feira de Santana (BA) |
| Cartões e PIX | R$ 12,4 milhões/mês |
| Dívida líquida/EBITDA | 1,6x |
| Política de aprovação | decisão exige aprovação (ativa) |

### Financial Passport

Criado por Helena no dia −730 (`COMPANY.profile`) e revisado por Rafael no dia
−23 (`COMPANY.profileRefresh`: faturamento de R$ 158 mi → R$ 182 mi, tempo de
operação, adquirente atual e dívida líquida/EBITDA; `profileConfirm`:
garantias e bancos confirmados como atuais). O volume em cartões fica de fora
da revisão de propósito e aparece **desatualizado**. A RFQ "Capital de giro —
nova linha" é criada a partir do Passport (`RFQ_CREDIT.passport`) e guarda a
fotografia de faturamento, setor, tempo de operação e garantias.

## Pessoas

| E-mail | Nome | Cargo | Papel |
| --- | --- | --- | --- |
| helena.duarte@vittafoods.example | Helena Duarte | CFO | admin |
| juliana.ramos@vittafoods.example | Juliana Ramos | Gerente de Tesouraria | finance_manager |
| rafael.menezes@vittafoods.example | Rafael Menezes | Analista Financeiro Sênior | analyst |
| carlos.tavares@vittafoods.example | Carlos Tavares | Controller | viewer (aprova) |
| eduardo.lima@atlasbank.example | Eduardo Lima | Gerente de Relacionamento Corporate | Atlas Bank (banco) |
| camila.torres@nexopay.example | Camila Torres | Executiva de Contas Enterprise | Nexo Payments (adquirente) |
| bruno.sato@orbecapital.example | Bruno Sato | Diretor de Crédito Corporativo | Orbe Capital (SCD) |
| patricia.alves@meridianfinancial.example | Patrícia Alves | Gerente Corporate Banking | Meridian Financial (banco) |
| diego.freitas@luminapay.example | Diego Freitas | Head Comercial Grandes Contas | Lumina Pay (adquirente) |

Senha: a mesma para todas, definida em `ARANDU_DEMO_PASSWORD` no momento do
seed (gerada aleatoriamente no ambiente local). Nunca versionada.

## Processos

| # | Solicitação | Estado | Provedores | História |
| --- | --- | --- | --- | --- |
| 0 | Capital de giro — linha vigente (R$ 8 mi / 24 meses) | Contratada (há ~22 meses) | Atlas, Meridian, Orbe | 3 propostas; aprovada por Controller e CFO; contrato com Atlas Bank **vence em 85 dias**, aviso prévio de 60 dias em 25 dias, marco D-90 já registrado pelo cron |
| 1 | Adquirência — revisão de MDR e antecipação (R$ 12 mi/mês) | Contratada (há ~1 mês) | Nexo, Lumina, Atlas | Lumina enviou v1 e, após pedido da tesouraria, v2 (MDR parcelado 2,39%, antecipação 1,19% a.m., D+1); comparação com pesos; aprovação Controller → CFO com comentários; decisão justificada; contrato de 24 meses vigente; confirmação D+1 e contrato assinado anexados |
| 2 | Capital de giro — nova linha de R$ 12 mi / 36 meses | Em avaliação, **aprovação na etapa da CFO** | Atlas (v1 e v2), Orbe (v1, sem CET), Meridian (aceitou, rascunho não enviado) | discussão sobre TAC e covenant; Atlas reduziu a TAC na v2; Controller aprovou; CFO avisada de que é a vez dela; demonstrações financeiras (compartilhadas) e parecer interno anexados |
| 3 | Pagamentos da loja on-line — PIX e link de pagamento | Rascunho | — | começo do fluxo: demanda parcial, sem convites |

### Propostas — adquirência (RFQ 1)

| Condição | Nexo Payments | Lumina Pay v2 | Atlas Bank |
| --- | --- | --- | --- |
| MDR débito | 0,89% | 0,89% | 0,99% |
| MDR crédito à vista | 2,19% | **1,99%** | 2,29% |
| MDR parcelado | 2,79% | **2,39%** | 2,89% |
| PIX | 0,49% | 0,40% | 0% |
| Antecipação | 1,39% a.m. | 1,19% a.m. | **1,09% a.m.** |
| Liquidação | D+2 | **D+1** | D+30 |
| Aluguel/terminal | R$ 69 | R$ 49 | R$ 79 |
| Multa rescisória | R$ 60 mil | R$ 80 mil | — |

Pesos registrados: crédito à vista 30, parcelado 25, antecipação 20,
liquidação 15, aluguel 10.

### Propostas — nova linha de crédito (RFQ 2)

| Condição | Atlas Bank v2 | Orbe Capital v1 |
| --- | --- | --- |
| Valor | R$ 12 mi | R$ 10 mi |
| Taxa | 1,24% a.m. (CDI + 3,10% a.a.) | 1,35% a.m. (CDI + 3,90% a.a.) |
| CET | 20,1% a.a. | não informado (pendente) |
| Prazo / carência | 36 / 6 meses, SAC | 36 / 3 meses, PRICE |
| Tarifas | R$ 60 mil (TAC 0,5%) | R$ 45 mil |
| Garantia | cessão de 30% dos recebíveis | aval + 20% das duplicatas |
| Covenant | DL/EBITDA ≤ 2,5x semestral | DL/EBITDA ≤ 2,0x trimestral |

## Tarefas, comentários e avisos

- 7 tarefas abertas (covenant da Orbe, TAC do Atlas, minuta da cédula,
  conciliação da Lumina, volume B2B, e as duas de revisão de renovação que o
  produto cria ao registrar contrato) e 1 concluída.
- 13 comentários internos e com provedores (respostas encadeadas, menções).
- Avisos reais gerados pelo produto: propostas recebidas e revisadas,
  menções, respostas, aprovações e o marco de renovação. Os antigos aparecem
  lidos; os dos últimos dias, não.
- 6 documentos PDF fictícios no Storage privado (com aviso de documento
  fictício no corpo).

## Pós-contrato (dados em `scripts/demo/dataset.mjs` → `LIFECYCLE`)

Registrado pela API real depois da história de sourcing, com segregação de
função (quem registra não revisa). Valores em BRL; nenhuma conversão de moeda.

| Capability | O que existe | Quem |
| --- | --- | --- |
| Implantação pós-award | "Migração da adquirência para a Lumina Pay": 2 marcos concluídos com evidência, 1 bloqueado (terminais), 1 impedimento aberto; go-live previsto em +20 dias, sem aceite | Juliana abre; Rafael e Juliana atualizam |
| Covenants e obrigações (cédula do Atlas) | Dívida líquida/EBITDA ≤ 2,5x trimestral: período medido 2,1x e revisado **conforme**; o período seguinte venceu sem dados (**aguardando dados** — ausência não é conformidade) e o corrente é criado pelo job. Cobertura de juros ≥ 2,0x: 1,8x, **não conforme**, waiver aprovado até +25 dias. Entrega das demonstrações auditadas: prazo em +7 dias, **sem dados** | Rafael mede; Juliana revisa; Helena decide o waiver |
| Performance do provedor | "Primeiro mês da Lumina Pay": liquidação D+1 99,2% (meta ≥ 98%, revisada); resposta a chamados **indisponível** (relatório não entregue), sem revisão | Helena define método; Juliana abre; Rafael mede |
| Financial Spend | MDR observado R$ 212.480,55 (reconciliado); aluguel de terminais contratado R$ 6.860,00 (sem reconciliação); encargos do Atlas observados R$ 118.904,10 (sem reconciliação) | Rafael registra; Juliana reconcilia |
| Qualificação | Atlas Bank, crédito: contrato social (provedor, aceito), KYB (serviço externo fictício, aceito), SOC 2 (provedor, em revisão); estado "aguardando revisão interna" — sem decisão | Helena define exigências; Rafael anexa; Juliana revisa |
| Documento lido | Cédula do Atlas (PDF fictício com rótulos): fatos extraídos pelo leitor determinístico, aviso prévio, moeda e indexador confirmados | Juliana |
| Oportunidades | Regras ativas: covenant com prazo, covenant sem dados, waiver vencendo, implantação bloqueada, renovação (90 dias), revisão de performance; o job diário abre as oportunidades | Helena define as regras |

## Economia (savings)

Não há. O produto não estima economia sem metodologia explícita
(`summarize()` em `lib/api/domains/finance.mjs`); a justificativa da decisão
descreve o raciocínio da empresa sem inventar um número.
