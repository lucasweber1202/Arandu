# Itens que exigem revisão jurídica humana

Este arquivo existe para que nenhuma decisão jurídica seja tomada por inércia de
engenharia. Cada item abaixo está marcado `LEGAL_REVIEW_REQUIRED` e **não deve
ser tratado como resolvido** por nenhuma pessoa ou ferramenta sem parecer humano.

Nada neste repositório afirma que a atividade descrita seja regulada ou não
regulada. Essa é exatamente a pergunta que precisa de resposta jurídica.

## 1. Enquadramento da atividade — `LEGAL_REVIEW_REQUIRED`
Organizar processo competitivo de contratação de produtos financeiros B2B,
intermediando informação entre empresa e provedores. Precisa de análise sobre
enquadramento, eventual necessidade de registro e limites de comunicação.

## 2. Comunicação e material comercial — `LEGAL_REVIEW_REQUIRED`
Toda peça que descreva o produto precisa ser revista para não sugerir concessão
de crédito, promessa de aprovação, recomendação financeira ou consultoria.

## 3. Comparação e neutralidade — `LEGAL_REVIEW_REQUIRED`
O produto apresenta diferenças factuais e aplica pesos do usuário. Confirmar que
a apresentação, inclusive os rótulos de destaque, não configura recomendação
individualizada.

## 4. Estimativas de custo — `LEGAL_REVIEW_REQUIRED`
O Arandu exibe estimativa própria de custo total quando há insumos completos,
com fórmula e premissas. Confirmar se e como essa estimativa pode ser exibida
sem conflitar com regras de divulgação de custo efetivo.

## 5. Modelo de remuneração — `LEGAL_REVIEW_REQUIRED`
Qualquer receita ligada à contratação efetivada (taxa de sucesso, lead pago por
provedor) precisa de análise sobre conflito de interesse, transparência
obrigatória e enquadramento.

## 6. Tratamento de dados da empresa — `LEGAL_REVIEW_REQUIRED`
Perfil financeiro, faturamento, garantias e perfil transacional. Revisar base
legal, minimização, retenção, compartilhamento com provedores convidados e
direitos do titular, articulando com a política de privacidade existente.

## 7. Benchmarking anonimizado — `LEGAL_REVIEW_REQUIRED`
Uso de dados de propostas de várias empresas para produzir agregados. Não
implementado. Exige política de anonimização validada, consentimento e limiar de
amostra antes de qualquer exibição.

## 8. Afirmações sobre provedores — `LEGAL_REVIEW_REQUIRED`
Mesmo com evidência registrada, revisar a redação usada na interface para que
não configure atestação de regularidade de terceiro.

## 9. Registro de decisão e responsabilidade — `LEGAL_REVIEW_REQUIRED`
O sistema guarda quem decidiu, quando, com quais critérios e uma fotografia das
propostas. Revisar o valor probatório pretendido e o que a empresa e o Arandu
assumem ou não assumem com esse registro.

## 10. Contratos com empresas e com provedores — `LEGAL_REVIEW_REQUIRED`
Termos de uso, contrato de prestação de serviço, limitação de responsabilidade e
o que acontece quando uma proposta registrada no Arandu diverge do contrato
assinado fora dele.

## 11. Retenção e legal hold — `LEGAL_REVIEW_REQUIRED`
Definir prazo de retenção de RFQs, propostas, decisões e contratos, e o
comportamento sob legal hold, alinhado aos controles de retenção já existentes.

## 12. Conteúdo desta documentação — `LEGAL_REVIEW_REQUIRED`
`FINANCIAL_PRODUCT_BOUNDARIES.md` e a página `/finance/boundaries.html`
descrevem comportamento de software. Antes de servirem como comunicação ao
cliente, precisam de revisão jurídica.
