# Aprovação comercial — decisões obrigatórias

Este documento transforma a política comercial em uma decisão explícita. Ele não
autoriza vendas enquanto `data/commercial-policy.json` continuar como `draft`.

## Decisões que o fundador precisa fechar

| Decisão | Registrar em | O que precisa estar definido |
| --- | --- | --- |
| Comissão | `commissionPercent` | Percentual único ou regra documentada por categoria. |
| Reserva | `reservationHours` | Prazo, expiração e possibilidade de renovação. |
| Pagamento | `paymentMode` | Meios aceitos, conciliação e confirmação antes do envio. |
| Frete | `shippingModel` | Quem cota, contrata, embala, despacha e acompanha. |
| Seguro | `insuranceModel` | Quem contrata, cobertura mínima e tratamento de sinistro. |
| Cancelamento | `cancellationPolicyVersion` | Versão publicada, prazos e exceções. |
| Certificado | `certificatePolicyVersion` | Emissor, dados obrigatórios e momento de emissão. |
| Fiscal | `invoiceModel` | Quem emite cada documento fiscal e para quem. |
| Operação | `operationalOwner` | Papel responsável por responder e resolver cada venda. |

## Sequência de aprovação

1. Preencher todos os campos materiais em `data/commercial-policy.json`.
2. Revisar as páginas de política comercial, entrega, devolução, privacidade e termos.
3. Registrar a versão jurídica/comercial em `ops/release-evidence.json`.
4. Preencher `approvedBy` com um papel responsável, sem dados pessoais desnecessários.
5. Preencher `approvedAt` com data ISO e alterar `status` para `approved`.
6. Definir `approved: true` e, somente depois, `ARANDU_COMMERCIAL_READY=true` no ambiente.
7. Rodar `npm run check:commercial:release` e testar reserva e proposta ponta a ponta.

## Regra do primeiro lançamento

O fluxo inicial permanece acompanhado: seleção, reserva e proposta. Checkout
automático só deve ser ativado em uma mudança posterior, depois que pagamento,
frete, seguro, cancelamento e suporte tiverem evidência no piloto fechado.
