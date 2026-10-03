# Policy & Approval Engine v2

Guideline §27 (Policy & Approval Engine v2) e §11 (aprovações cruzadas / group
treasury); addendum v2.1 H.1 item 8. Fecha `P0.7-02`, `P0.7-03` e `P0.2-09` da
[`IMPLEMENTATION_MATRIX.md`](IMPLEMENTATION_MATRIX.md) no nível de código (CI e
banco local), **sem rollout hospedado**.

| Peça | Onde |
| --- | --- |
| Migration | [`supabase-financial-policy-engine.sql`](supabase-financial-policy-engine.sql) (`schema_version = financial-policy-engine-1`) |
| Rollback | [`rollback/supabase-financial-policy-engine.rollback.sql`](rollback/supabase-financial-policy-engine.rollback.sql) |
| Domínio (validação espelho, leitura humana) | `lib/finance/policy.mjs` |
| API | `lib/api/domains/finance-policy.mjs` + rotas `approvals/*` em `lib/api/domains/finance.mjs` |
| Interface | `finance/src/views/policy.js` (Configurações → Governança, aba Aprovações da RFQ, caixa de aprovações) |
| Testes | `tests/database/financial-policy-engine.sql`, `tests/database/financial-policy-engine-rollback.sql`, `scripts/test-finance-policy.mjs`, `scripts/test-finance-jobs.mjs`, E2E `tests/e2e/finance-policy.spec.js` |

## O que o engine responde — e o que não responde

> "Qual fluxo de aprovação esta operação exige, considerando a policy vigente
> desta organização e desta entidade?"

A resposta vem **só** de regras escritas pelo cliente. O engine determina **quem
precisa aprovar, em que ordem, por qual regra e sob qual versão de policy**.
Ele **não** decide se a operação é boa, não pontua provedor, não recomenda
instituição e não aprova nada sozinho: toda etapa depende de pessoa. Não existe
fato proprietário do Arandu (score, rating) — o validador recusa qualquer fato
fora do catálogo abaixo.

## Modelo

* `fin_policies` — no máximo **uma policy por escopo**: grupo (`legal_entity_id`
  nulo) ou entidade/unidade. `fin_policy_versions` guarda as versões
  (`draft → active → superseded/retired`). Rascunho é editável e descartável;
  **versão ativada é imutável** (gatilho `fin_policy_version_guard` recusa mudar
  documento, número, escopo ou autoria — inclusive para o dono do banco).
* `fin_policy_flags` — sinalizadores de exceção, risco e compliance definidos
  pelo cliente; quem pede a aprovação os declara.
* `fin_approval_requests` ganha `policy_snapshot` (avaliação completa),
  `policy_version_ids`, `evaluated_at`, `justification`, `declared_facts`,
  `expires_at`, `resolution_note`. Snapshot **nunca muda** depois de escrito
  (`fin_approval_snapshot_guard`).
* `fin_approval_stages` — etapas derivadas do plano (sequência, papéis, escopo,
  mínimo, prazo, delegação, regras de origem). Definição imutável; só o estado
  avança.
* `fin_approval_steps` — indicações por etapa, com `acted_by` (quem votou, inclusive
  substituto), `delegation_id` e `reason_code`.
* `fin_policy_exceptions` — exceção como registro próprio.
* `fin_approval_delegations` — substituto temporário (até 90 dias).

## Documento da policy

```json
{
  "rules": [
    { "id": "above_1m", "label": "Acima de R$ 1 milhão exige tesouraria do grupo",
      "when": [{ "fact": "amount", "op": "gte", "value": 1000000, "currency": "BRL" }],
      "stages": [{ "key": "group_treasury", "label": "Tesouraria do grupo", "sequence": 2,
                   "roles": ["admin", "finance_manager"], "scope": "group", "min_approvals": 1,
                   "due_hours": 24, "allow_delegation": true }],
      "requirements": { "min_proposals": 2, "justification": true } }
  ],
  "fallback": { "stages": [ ... ] },
  "sod": { "requester_cannot_decide": true, "decider_not_sole_final_approver": true },
  "exception_approver_roles": ["admin"],
  "escalation_roles": ["admin"],
  "expire_after_hours": 336
}
```

Limites: 30 regras, 10 condições e 4 etapas por regra, 30 mil caracteres, sem
HTML. A mesma chave de etapa dentro de um documento sempre descreve a mesma etapa
(sequência, papéis e escopo). Uma regra precisa exigir algo (etapa, mínimo de
propostas ou justificativa).

### Fatos e operadores

| Fato | Origem | Operadores |
| --- | --- | --- |
| `amount` + `currency` | crédito: maior entre valor pedido e valor ofertado na proposta escolhida (conservador); adquirência: desconhecido | `gte` (inclusivo), `lt` (exclusivo) |
| `currency` | moeda da entidade da RFQ; sem entidade, moeda base do grupo | `in`, `not_in` |
| `product` | RFQ | `in`, `not_in` |
| `legal_entity` | entidade da RFQ (unidade casa também pela entidade-mãe); objeto de grupo não pertence a entidade | `in`, `not_in` |
| `provider_status` | `fin_providers.verification_state` da proposta escolhida (evidência registrada, nunca "aprovado pelo Arandu") | `in`, `not_in` |
| `provider_new` | sem contrato anterior com o provedor no grupo | `eq` |
| `proposals_count` | propostas enviadas/revisadas na RFQ | `lt`, `gte` |
| `guarantee_required` | proposta de crédito com "garantias exigidas" preenchido | `eq` |
| `covenant_present` | **declarado** por quem pede (gravado no pedido) | `eq` |
| `contract_duration_months` | prazo da proposta, senão da demanda | `gt`, `lte` |
| `maturity_date` | data do pedido + prazo (estimativa) | `after`, `on_or_before` |
| `flag` | **declarado**; só chaves ativas do catálogo do cliente | `present`, `absent` |

## Precedência (determinística)

1. **Policies aplicáveis**: a policy ativa do **grupo** + a policy ativa de
   entidade **mais específica** — a da unidade, senão a da entidade legal mãe.
   No máximo duas.
2. Cada policy é avaliada **sozinha**: dentro de uma regra todas as condições
   precisam valer (E lógico). Condição falsa descarta a regra.
3. **Fato desconhecido casa** (conservador): a dúvida acrescenta aprovação, nunca
   a retira. O motivo fica registrado (`conservative: true`, `unknown_facts`).
   Valor em moeda diferente da regra conta como desconhecido
   (`amount_currency`) — **não há conversão cambial**. Para operar em outra
   moeda, escreva a regra naquela moeda.
4. **Fallback**: se nenhuma regra de uma policy casou, valem as etapas/requisitos
   do `fallback` daquela policy (regra `__fallback`). Sem fallback, aquela policy
   não exige nada.
5. **Combinação grupo + entidade**: etapas se **somam**. Entidade **não remove**
   exigência do grupo.
6. **Etapas idênticas** (mesma sequência, papéis e escopo), de regras ou policies
   diferentes, viram uma: maior mínimo, menor prazo, delegação só se todas
   permitirem, todas as regras de origem preservadas.
7. **Ordem**: sequência crescente; a mesma sequência corre **em paralelo**; dentro
   da sequência, etapas da entidade antes das do grupo, depois chave.
8. **Requisitos**: maior `min_proposals`; justificativa se qualquer regra exigir.
9. **SoD**: vale a mais restrita (`requester_cannot_decide` se qualquer policy
   pedir; `decider_not_sole_final_approver` verdadeiro por padrão).
10. **Validade**: menor `expire_after_hours`; escalação para a união dos papéis.
11. Sem nenhuma policy ativa: engine `legacy` — vale a regra geral v1
    (`required_for_decision`) e o pedido com aprovadores escolhidos em ordem.

Exemplo do gap `P0.2-09` (testado em `financial-policy-engine.sql`, seção 4):
policy da Entidade A exige "aprovação local" (sequência 1, escopo entidade); a do
grupo exige "tesouraria do grupo" acima de R$ 1 mi (sequência 2, escopo grupo).
RFQ de R$ 2 mi na Entidade A → **local → tesouraria do grupo**.

## Elegibilidade e segregação de funções

Indicado/aprovador precisa, **no pedido e no voto**: ser membro da compradora com
um dos papéis da etapa; alcançar a entidade da RFQ (escopo de grupo ou concessão
explícita); e cumprir o escopo da etapa (`group` = tesouraria do grupo;
`entity` = aprovador local com concessão; `any`). **Ser aprovador nunca amplia
acesso**: o RLS de leitura continua o da entidade.

SoD sempre ativa (não configurável): quem pede não aprova; ninguém ocupa duas
etapas do mesmo pedido (indicação única e substituto fora das demais etapas);
provedor/outro tenant não aprovam. Configurável na policy:
`requester_cannot_decide` (padrão falso) e `decider_not_sole_final_approver`
(padrão verdadeiro: quem registra a decisão não pode ter sido o único a votar
na etapa final). Aprovador **revogado** (papel ou escopo mudou) recebe
`approver no longer eligible` ao votar.

## Ciclo de vida

| Pedido | Significado |
| --- | --- |
| `pending` | em andamento |
| `approved` | todas as etapas aprovadas/dispensadas e bloqueios resolvidos |
| `rejected` | uma etapa rejeitou |
| `changes_requested` | **devolvido** para ajustes (exibido como "Devolvida") |
| `cancelled` | cancelado por quem gerencia |
| `expired` | passou de `expires_at` (job); nada é aprovado por tempo |
| `superseded` | substituído explicitamente (`fin_supersede_approval`, com motivo) |

Etapas: `pending` (fila) → `active` → `approved` / `rejected` /
`changes_requested` / `waived` (exceção) / `expired` / `cancelled` /
`superseded`. Votos: idem + `not_required` (mínimo já atingido por outros).
Devolução/rejeição exigem comentário; `reason_code` opcional de uma lista fechada.

**Versão nova no meio do processo**: o pedido continua na versão gravada; a
prévia de processos novos já usa a versão nova. Para reavaliar um pedido aberto,
alguém o **substitui** explicitamente e pede de novo — nada muda sozinho.

## Exceções

Registro próprio: pedido, versão e regra, quem pediu, motivo (`reason_code` +
texto ≥ 10), evidências (rótulo + documento visível ou referência), estado,
quem decidiu, quando e por quê. Só se pede exceção para regra **casada** no
snapshot; uma aberta/aprovada por regra. Decide quem tem o papel de
`exception_approver_roles` **da policy dona da regra** (padrão `admin`), com
acesso à entidade, e nunca quem pediu a exceção nem quem pediu a aprovação.
Exceção aprovada dispensa os bloqueios da regra e as etapas cujas **todas** as
regras de origem foram excetuadas; se nada mais falta, o pedido é concluído.

## Delegação

O titular registra substituto e período (≤ 90 dias, fim no futuro, motivo);
revoga quando quiser (admin também). O substituto vota numa etapa ativa que
**admite delegação** se ele mesmo for elegível para a etapa e não estiver em
outra etapa do pedido. A trilha guarda `acted_by` e `delegation_id`.

## Prazos, escalação e avisos

* Etapa com `due_hours` recebe `due_at` ao abrir. Vencida: o job cria tarefa,
  avisa até 5 pessoas dos `escalation_roles` com acesso à entidade (exceto quem
  pediu) e marca `escalated_at` — **uma vez**.
* Pedido além de `expires_at` expira (etapas/votos `expired`, exceções abertas
  canceladas).
* Execução: `GET /api/jobs/renewals` (cron diário do Vercel) chama
  `fin_run_approval_deadlines()` e registra `fin_job_runs.job = approval_deadlines`.
  Gestores podem processar a própria organização na hora
  (`POST /api/finance/approval-policies/process-deadlines`). **Limite**: com o
  cron diário, a escalação acontece na cadência do cron, não na hora exata.
* Avisos: ao abrir/avançar sequência, todos os indicados das etapas ativas
  recebem "Aprovação solicitada".

## API (`/api/finance/...`, JWT do usuário, escrita só por RPC)

| Rota | Faz |
| --- | --- |
| `GET approval-policies?organization_id=` | policies, versões (rascunho só para admin), sinalizadores |
| `POST approval-policies` | salva rascunho (admin) — validação espelho antes do banco |
| `POST approval-policies/activate` · `discard` · `retire` · `simulate` · `flags` | ciclo de versão, simulação com fatos de exemplo, catálogo |
| `POST approval-policies/preview` | avaliação da RFQ (+ proposta, + fatos declarados) sob o RLS da RFQ |
| `POST approval-policies/process-deadlines` | prazos da própria organização (gestor) |
| `GET approvals` | pedidos + `stages`, `exceptions`, `policy_snapshot`, `viewer_can_act` |
| `POST approvals/request` | com `assignments` → pedido com policy; sem → pedido v1 (recusado se a policy tem plano) |
| `POST approvals/act` | voto (com `reason_code` opcional) via `fin_act_on_approval_v2` |
| `POST approvals/cancel` · `supersede` | encerramento |
| `POST approval-exceptions` · `/decide` · `/cancel` | exceções |
| `GET/POST approval-delegations` · `POST approval-delegations/revoke` | delegação |

Erros do banco viram códigos estáveis (`policy_approver_ineligible`,
`segregation_of_duties`, `approver_ineligible`, `policy_assignment_required`,
`invalid_policy_exception`, ...) sem mensagem crua.

## Operação

* **Migration**: aditiva e idempotente; aplicada depois do Graph
  (`check-migrations` exige a ordem). Testada em instalação limpa, upgrade sobre
  base com aprovações v1, reaplicação e rollback (`npm run test:database`). O
  canário de isolamento cobre as tabelas novas a partir de
  `financial-policy-engine-1`.
* **Doctor**: `EXPECTED_SCHEMA_VERSION = financial-policy-engine-1`; RPCs
  `fin_request_policy_approval`, `fin_act_on_approval_v2`,
  `fin_preview_approval_policy`, `fin_run_approval_deadlines` exigidas.
* **Rollout hospedado**: **pendente** e bloqueado pelos mesmos gates do piloto
  (backup + restore drill em destino descartável + doctor + canário + jornada
  autenticada). Hash de bundle anterior não vale mais.
* **Métricas/observabilidade**: `fin_job_runs` (job `approval_deadlines`,
  sucesso/falha com código curto) no console operacional; eventos
  `policy_*`, `approval_completed`, `approval_stage_escalated`,
  `approval_expired`, `approval_superseded` em `fin_events`, com entidade.
* **Degradação**: sem policy ativa, o produto opera como antes (engine `legacy`).
  Num transporte sem o engine (demonstração), a interface cai no pedido manual.

## Rollback e forward-fix

O rollback **aborta** se existir qualquer trilha do engine (versões, etapas,
exceções, delegações, sinalizadores, pedido com snapshot ou encerrado como
expirado/substituído) — apagar trilha de decisão em silêncio não é aceitável.
Em ambiente com uso real, prefira **forward-fix**: aposentar a policy
(`fin_retire_policy`) devolve o comportamento anterior para pedidos novos sem
apagar histórico; correção de regra = nova versão. Rollback completo só em
validação isolada, depois de exportar a trilha e com backup verificado.

## Limites declarados

* Sem conversão cambial; sem fatos de covenant estruturados (covenant é
  declarado); `maturity_date` é estimativa (data do pedido + prazo).
* Delegação é por pessoa (todas as etapas delegáveis do titular), não por etapa.
* Avisos de exceção pedida/decidida aparecem no processo, sem notificação própria.
* Cadência de escalação = cadência do cron (diária no plano atual) + acionamento manual.
* Nenhuma afirmação de conformidade regulatória: SoD e alçadas aqui são
  mecanismos de software configurados pelo cliente.
