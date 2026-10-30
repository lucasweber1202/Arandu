# Adquirência: comparação de custos declarados v2

Problema: comparar uma condição contratual histórica com uma versão imutável de proposta usando o mesmo volume, mix e mês. Reutiliza `estimateAcquiringMonthlyCost`; não cria ledger, ranking, contrato, decisão ou registro de valor. Hipótese comercial H37-ACQ; testes sintéticos não validam adoção.

## API v1 aditiva

`POST /api/finance/acquiring-economics`. Sessão obrigatória, organização BUYER legível e RLS em cada fonte; admin/finance_manager/analyst/viewer conforme acesso às fontes. JWT do usuário em todas as consultas, rate limit financeiro existente, `Cache-Control: no-store`. Provedor não acessa esta operação. Sem service role. Nenhum dado persistido.

Corpo obrigatório (números JSON; ausência não vira zero):

```json
{
  "organization_id": "00000000-0000-4000-8000-000000000001",
  "contract_id": "00000000-0000-4000-8000-000000000002",
  "proposal_id": "00000000-0000-4000-8000-000000000003",
  "proposal_version": 2,
  "profile": {
    "period_start": "2026-11-01", "period_end": "2026-11-30",
    "currency": "BRL", "monthly_volume": 100000,
    "share_debit": 40, "share_credit_cash": 30,
    "share_credit_installment": 20, "share_pix": 10,
    "terminals": 2, "source_reference": "Relatório sintético novembro"
  }
}
```

Sem campos opcionais de cálculo ou termos enviados pelo cliente. As fontes são contrato e proposta de adquirência da mesma organização/entidade legal. Proposta externa não é convertida em envio autenticado: nesta versão a fonte alternativa é `fin_proposal_versions`; externa permanece na comparação existente até um adapter revisado.

Resposta `200 {ok:true,analysis}`: `methodology=acquiring-processing-cost-v2`, `result_type=estimated_processing_charges`, `persistence=not_persisted`, perfil, `sources.contract` (ID, versão, vigência, origem, aditivo, link), `sources.proposal` (ID, versão, revisão da RFQ, envio, origem, link), `components[]`, `fixed_inputs`, `conditions`, `limitations`, `reasons`, `comparable`, `totals`.

Exemplo de `totals`: `{"currency":"BRL","unit":"period_total","contract_cost":1750,"proposal_cost":1750,"estimated_difference":0}`. Cada componente informa taxa/base/unidade/fórmula, custos, diferença, comparabilidade e motivos. Componente incomparável mantém custos/diferença `null`; total só existe se todos os componentes modelados forem comparáveis. Dados suficientes nos demais componentes continuam disponíveis.

Erros: 400 `invalid_economics_profile`, `unknown_economics_field`, `invalid_version`, `invalid_id`; 401 sessão; 403 organização; 404 `economics_source_unavailable` para fonte ausente/invisível/produto ou entidade incompatíveis; 422 `economics_coverage_limit` acima de 500 versões. A implementação preserva a mesma resposta de fonte indisponível sem revelar identidade alheia. A análise não grava nem altera fontes e pode ser repetida sem efeitos.

## Fórmula, cobertura e proveniência

- MDR/PIX por modalidade = volume mensal × participação/100 × taxa/100. Arredondamento por componente a centavos, soma em centavos, diferença = contratado − proposto; perdas permanecem negativas.
- Fixos contratuais = soma de `fees` explicitamente declaradas `per_month`; proposta = terminais × aluguel mensal + gateway mensal. Declaração de custo zero exige zero explícito. Sem `fees`, não se presume gratuidade; tarifa de unidade não suportada impede o total.
- Um único mês-calendário completo, BRL, mix completo somando 100% (tolerância apenas numérica 1e-8, sem normalização), volume entre 0 e 1e12. `monthly_volume` aqui inclui cartões e PIX, diferentemente do rótulo legado do wizard; esta semântica é explícita no contrato novo.
- Versão contratual vigente no início: maior vigência, desempate por versão. Alteração dentro do mês, ausência de vigência ou contrato fora do período impedem comparação. Versões futuras não reescrevem a referência histórica. Proposta tem versão explícita e validade declarada, sem usar rascunho mutável.
- Fonte dos volumes é declaração identificada pelo comprador; o Arandu não autentica o conteúdo do relatório. Termos vêm das versões persistidas. A proposta autenticada usa BRL do schema v1 se não houver moeda histórica explícita; moeda contratual precisa estar registrada na versão imutável dos termos, sem herdar a moeda de um cabeçalho alterado posteriormente. Nenhum câmbio.

MDR parcelado usa uma taxa declarada única para a modalidade; não infere taxas por número de parcelas. Custos de transição/multa rescisória ficam fora. Antecipação, valor do dinheiro no prazo de liquidação, tributos, tarifas transacionais, faixas, piso/teto e cobranças não registradas ficam fora. Liquidação e antecipação aparecem separadamente nas condições, nunca como MDR. Serviços adicionais declarados sem referência de custo impedem total. Mesmo com `comparable=true`, o número é somente a soma dos componentes modelados; não é custo financeiro integral nem economia negociada/realizada.

## Validação e handoff

`node scripts/test-acquiring-economics.mjs` verifica equivalência, mix, fontes ausentes, taxas desconhecidas, moedas/períodos, versão anterior/nova/intraperíodo, perda, zero, determinismo e API JWT/401/404/entidade. Integrado a `check:finance`. Teste de API usa mocks explicitamente; integração real é registrada separadamente no plano de release.

Claude pode consumir `components`, `conditions`, `sources` e `limitations` no Negotiation Studio após integração na main. Sempre exibir cobertura junto ao total; não transformar `estimated_difference` em registro de valor ou botão de contratação. Rollback de aplicação remove a operação aditiva; não há migration nem dados a reverter. Demais APIs permanecem compatíveis.
