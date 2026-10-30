# Financial Workspace — Negotiation Studio 3.0 e Radar-to-Action (Claude, 30/10/2026)

Base: `main@b108f8b` (#284–#288 integradas). Escopo: `finance/src/**`, `finance/style.css` e E2E. Nenhum arquivo do Codex foi alterado. #289 (recusa institucional) não está na `main`, então a recusa não foi integrada.

## APIs consumidas (contratos da documentação do Codex)
| API | Onde | Uso |
|---|---|---|
| `GET contract-negotiations?contract_id&rfq_id` | Cartão "Renegociação de contrato existente" (`rfq.html`) | versão de referência do contrato e propostas por autoria |
| `POST acquiring-economics` | Painel "Comparar custo de processamento" (renegociação de adquirência) | estimativa por componente, totais só se comparável, condições e limitações |
| `GET opportunities/outcome?id` | Detalhe do sinal (`opportunities.html?id=`) | processo, decisões, contrato resultante e etapas ausentes |
| `POST opportunities/complete-negotiation` | Mesmo detalhe | conclusão com confirmação humana vinculada à decisão registrada |

## Economics Experience
- Formulário com proposta e versão, mês-calendário, moeda (sem padrão; só BRL nesta versão), volume, mix nas 4 modalidades, terminais e fonte declarada.
- Vazio não vira zero. Mix diferente de 100% é recusado com a soma mostrada e não é normalizado. Nenhuma requisição sai com perfil inválido.
- Resultado:
  - custo estimado do contrato vigente e da proposta, diferença estimada e frase explicando o sinal;
  - tabela por componente (base, taxas, custos, diferença ou motivo);
  - liquidação e antecipação mostradas à parte, fora do custo;
  - lista do que não está no cálculo, período, fonte, versões e fórmula, e a frase "Nada foi gravado".
- Não comparável: sem total e sem "diferença estimada"; os componentes com dado suficiente continuam visíveis.
- Erro: o formulário é preservado e repetir é seguro (operação sem efeito colateral).
- Proposta externa: a API v2 não a usa. A tela diz isso e não calcula.

## Radar-to-Action
- O detalhe do sinal mostra a solicitação ligada, as propostas pelo portal e as externas, a decisão humana com data e motivo, o contrato resultante e as etapas ausentes.
- "Concluir sinal com a decisão registrada" só aparece para admin ou gestão financeira, com o sinal Ciente ou Em revisão, decisão existente e nenhuma conclusão anterior. A confirmação mostra a decisão vinculada e exige descrição.
- Resposta incerta: consulta o resultado antes de qualquer nova tentativa.
- Sinal sem negociação: explica que nenhuma solicitação é criada automaticamente.

## Testes (API simulada por mocks; não é backend real)
- `finance-relationship-center`: +4 economics (válido, mix inválido sem requisição, não comparável, erro e só externa). Cobre também a jornada com versão de origem.
- `finance-opportunities`: +3 outcome (conclusão confirmada, resposta incerta → reconsulta, ausência e leitor).
- Conjunto relationship-center, opportunities, procurement, external-proposals, contracts, fees e value em chromium-desktop e mobile-chrome: 399 passaram e 2 falharam. As 2 falhas eram a expectativa antiga de campos ausentes, corrigida em seguida (relationship-center: 54/54). O conjunto completo não foi reexecutado.
- `check:all` passou.
- Firefox/WebKit indisponíveis localmente, ficam no CI. Sem ensaio contra backend real e sem capturas (exigem a Demo local).

## Dependências restantes
- **Codex:** integrar #289 na `main` para a recusa de convite; adapter de proposta externa na análise econômica; importação estruturada.
