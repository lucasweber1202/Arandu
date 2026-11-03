# Central Financeira 360° — sinais de Relacionamentos e Tarifas no Painel

Estado: **M1 + testes com API simulada** (Node e Playwright Chromium desktop/mobile). Não validado contra Supabase real nem em ambiente hospedado.

## O que muda para quem usa
"Precisa de você" (Painel) deixa de olhar só negociações, contratos e tarefas. Passa a incluir, na mesma fila priorizada:

| Sinal | Fonte canônica | Regra | Destino do clique |
|---|---|---|---|
| Compromisso/follow-up do CRM | `GET crm-activities?status=planned&sort=due_on.asc.nullslast,id.asc&due_before=hoje+2` (financial-crm-v1) | do leitor, ou sem responsável para quem edita; vencido primeiro | relacionamento da instituição (`providers.html?provider_id=`), resolvida pelo vínculo direto ou pelo contrato; sem instituição, agenda geral |
| Processo comercial | `GET crm-processes?status=active` | ativo, não ganho/perdido; próximo passo vencido ou em até 2 dias; próprio processo sem data | idem |
| Revisão de tarifa | `GET fees/summary` (últimos 12 meses) | `open_review > 0`, uma linha por moeda (moedas nunca somadas); só para quem gerencia | `fees.html?review_status=new&currency=&start=&end=` (lista já filtrada) |

Filtro por origem (Negociações, Contratos, Relacionamentos, Tarifas, Tarefas) aparece quando há mais de uma origem.

## Garantias
- Nada é calculado no navegador além de contagem e prazo; lógica pura em `lib/finance/central-signals.mjs`.
- Diferença de tarifa é descrita como "acima da referência contratada"; nunca erro ou economia.
- Fonte que falha vira aviso explícito; 503 é "ainda não disponível neste ambiente". Nunca "Tudo em dia".
- Sandbox legado `/demo` não recebe a capacidade.
- Sem nova API, tabela ou migration.

## Testes
`scripts/test-finance-central-signals.mjs` (em `check:finance`) e `tests/e2e/finance-central.spec.js` (em `test:e2e`), incluindo jornada: follow-up vencido no Painel → instituição → "Marcar como realizada" (PATCH com `expected_version`) → item sai do Painel.
