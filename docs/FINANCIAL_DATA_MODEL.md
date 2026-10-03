# Modelo de dados — Financial Procurement

Migrations, nesta ordem:

1. [`supabase-financial-procurement.sql`](supabase-financial-procurement.sql) — schema base;
2. [`supabase-financial-procurement-hardening.sql`](supabase-financial-procurement-hardening.sql) — travas de integridade, idempotência e os caminhos de escrita que faltavam.

Rollback (manual, cobre as duas): [`rollback/supabase-financial-procurement.rollback.sql`](rollback/supabase-financial-procurement.rollback.sql).

Todas as tabelas usam o prefixo `fin_`. Nenhuma tabela da vertical de Arte é
alterada, renomeada ou removida.

## Relacionamentos

```
auth.users
    │
    ├── fin_members ──────── fin_organizations (BUYER | PROVIDER)
    │                              │
    │                              ├── fin_member_invitations   (token de uso único)
    │                              ├── fin_company_profiles     (Financial Passport)
    │                              │      └── fin_company_profile_history (append-only)
    │                              ├── fin_providers            (diretório da empresa)
    │                              ├── fin_documents            (referência https)
    │                              ├── fin_tasks
    │                              └── fin_events               (trilha)
    │
    └── fin_rfqs (organization_id, product: credit | acquiring, status)
             │
             ├── fin_rfq_profile_snapshots (fotografia do Passport, imutável)
             ├── fin_rfq_invites (rfq_id, provider_id, token_hash, expires_at)
             │        │
             │        └── fin_proposals (1:1 com o convite aceito)
             │                 │
             │                 └── fin_proposal_versions (append-only, version 1..n)
             │
             └── fin_decisions (rfq_id, proposal_id, criteria, snapshot)
                       │
                       └── fin_contracts (decision_id, starts_on, ends_on, renewal_notice_days)
```

## Invariantes garantidas por chave composta

Não são validações de aplicação: o Postgres recusa a linha.

| Invariante | Como |
| --- | --- |
| Um convite só pertence à RFQ da própria organização compradora | `fin_rfq_invites (buyer_organization_id, rfq_id) → fin_rfqs (organization_id, id)` |
| Um convite só aponta para provedor cadastrado pela própria empresa | `fin_rfq_invites (buyer_organization_id, provider_id) → fin_providers (organization_id, id)` |
| Uma proposta tem o mesmo produto da RFQ | `fin_proposals (rfq_id, product) → fin_rfqs (id, product)` |
| A proposta pertence à organização provedora que aceitou o convite | `fin_proposals (invite_id, provider_organization_id) → fin_rfq_invites (id, provider_organization_id)` |
| A decisão só escolhe proposta da mesma empresa **e** da mesma RFQ | duas FKs: `(organization_id, proposal_id)` e `(rfq_id, proposal_id)` |
| O contrato deriva da decisão da mesma empresa sobre a mesma proposta | `fin_contracts (organization_id, decision_id, proposal_id) → fin_decisions (organization_id, id, proposal_id)` |
| Comprador e provedor nunca são a mesma organização | `check (buyer_organization_id <> provider_organization_id)` |
| Uma proposta por convite | `fin_proposals.invite_id` é `unique` |
| Uma decisão por proposta | `fin_decisions.proposal_id` é `unique` |
| **Uma decisão por RFQ** | índice único `fin_decisions(rfq_id)` + `for update` na RFQ dentro de `fin_record_decision` |
| **Um contrato por decisão** | índice único `fin_contracts(decision_id)` + `for update` na decisão |

## Tabelas

### `fin_organizations`
`kind` é `BUYER` ou `PROVIDER`. `tax_identifier` aceita apenas 14 dígitos
(CNPJ sem máscara) — a **validação de existência do CNPJ não é feita nesta
fase** e está registrada como limitação. `revenue_band` guarda faixa, não valor
exato: o porte é necessário para o produto, o faturamento exato não.

### `fin_members`
Papéis: `admin`, `finance_manager`, `analyst`, `provider_user`, `viewer`.
`viewer` lê e nunca escreve — verificado em `tests/database/financial-procurement.sql`.

### `fin_company_profiles` (Financial Passport)
Um registro por campo, com a proveniência exigida pelo produto: `source`
(origem), `updated_at` (data), `updated_by` (responsável), `verified_at` /
`verified_by` (última confirmação como atual), `review_after_days` (período de
revisão declarado, 7–1825 dias), `valid_until` (validade da fonte) e
`document_id` (documento privado **do perfil** da mesma organização). Chave
única `(organization_id, field_key)` permite reaproveitar o perfil entre RFQs
sem duplicar. O catálogo de campos e a regra de frescor estão em
`lib/finance/passport.mjs`; a mesma regra existe no banco
(`fin_passport_review_due`, `fin_passport_freshness`).

Escrita só por `fin_passport_set_field` e `fin_passport_confirm_field`
(`docs/supabase-financial-passport.sql`); `authenticated` não tem INSERT/UPDATE
direto. Origens `importacao`, `integracao`, `informado_pelo_provedor`,
`calculado` e `ia_confirmado` existem no banco para caminhos futuros e são
recusadas pela RPC de formulário.

### `fin_company_profile_history`
Append-only, escrito pelo gatilho `fin_company_profiles_history` em toda
criação (`created`), alteração (`updated`, com valor e origem anteriores) e
confirmação (`confirmed`). Imutável (`fin_immutable_row`). Leitura: membros da
compradora.

### `fin_rfq_profile_snapshots`
Fotografia, no momento da criação da RFQ, de cada campo do Passport usado
(`fin_create_rfq_from_passport`): valor, origem, datas, vencimento da revisão,
frescor naquele dia e `used_as_is` (a pessoa manteve ou alterou o valor na
demanda). Chave `(organization_id, rfq_id) → fin_rfqs`. Imutável; só a
compradora lê — o provedor convidado lê a demanda, nunca a fotografia.

### `fin_providers`
Tipos: `bank`, `fintech`, `acquirer`, `subacquirer`, `credit_provider`,
`payment_provider`, `other`. O estado de verificação nasce `NAO_VERIFICADO`. A
constraint `fin_provider_evidence_required` impede `EVIDENCIA_REGISTRADA` sem
autoridade, registro, URL de evidência e data de consulta, e o único caminho de
escrita é `fin_record_provider_evidence`.

Esta tabela é a **relação** entre um comprador e um provedor, não a identidade
canônica do provedor — essa é `fin_organizations` com `kind='PROVIDER'`. O
vínculo entre as duas é preenchido quando o convite é aceito. Ver
[`FINANCIAL_PROVIDER_CANONICALIZATION.md`](FINANCIAL_PROVIDER_CANONICALIZATION.md).

### `fin_rfqs`
`demand` é `jsonb`, mas o conteúdo aceito é a allowlist de
`lib/finance/products.mjs` aplicada na API. Estados:

```
draft → open → collecting → comparing → decided → contracted → closed
   ↘        ↘           ↘           ↘
              cancelled            (comparing pode voltar a collecting)
```

A máquina está em `lib/finance/workflow.mjs` (API) e repetida em
`fin_transition` (banco). Strings livres não transitam nada.

### `fin_rfq_invites`
Guarda apenas o **hash** do token (`sha256`). O token em claro existe uma vez,
na resposta da chamada que o criou. Uso único (`status='invited'` +
`accepted_at is null`), com expiração padrão de 21 dias.

### `fin_proposals` / `fin_proposal_versions`
Termos financeiros nunca são sobrescritos: cada envio cria uma versão nova e
incrementa `current_version`. A versão 1 marca a proposta como `submitted`; as
seguintes, como `revised`. Não existe `UPDATE` de versão para `authenticated`.

O envio é **idempotente**: reenviar termos idênticos aos da versão corrente
devolve a versão atual em vez de criar uma revisão falsa. Duplo clique e retry
de rede não poluem o histórico.

### `fin_decisions`
`snapshot` guarda a proposta escolhida **e todas as demais** com seus termos no
momento da decisão, mais `decided_version` — a versão exata que foi escolhida.
`criteria` guarda os pesos que a empresa usou, quando usou.

O snapshot é um `jsonb` gravado no instante da decisão: uma revisão posterior do
provedor não o alcança. Há teste para isso.

### `fin_contracts`
`renewal_notice_days` define a janela de revisão: `ends_on - renewal_notice_days`.
`document_reference` aceita apenas `https://` — é referência, não upload.

### `fin_documents`
Referência documental apenas. **Upload não está implementado nesta fase** (ver
limitações no runbook). O campo `reference_url` exige `https://`. Exposta em
`GET`/`POST /api/finance/documents`, que responde `upload_supported: false`.

### `fin_tasks`
Tarefas da organização. Registrar um contrato cria automaticamente a tarefa de
revisão de renovação, com vencimento em `ends_on − renewal_notice_days`.

### `fin_events`
Trilha de produto e observabilidade. `metadata` guarda contagens e
identificadores; os testes de banco falham se termos financeiros sensíveis
(`interest_rate`, `mdr`, `offered_amount`) aparecerem ali.

## O que foi deliberadamente não replicado

Não há tabela de produto financeiro em banco: o catálogo de produtos e campos é
código versionado (`lib/finance/products.mjs`), porque mudar um campo é uma
mudança de software que exige revisão, migração de UI e teste — não um registro
editável em runtime.

## Multi-entity (`docs/supabase-financial-multi-entity.sql`)

O **grupo econômico** é a organização compradora (`fin_organizations` BUYER):
continua sendo o tenant e a fronteira entre clientes. Abaixo dela:

| Tabela / coluna | Conteúdo |
| --- | --- |
| `fin_organizations.base_currency` | moeda base do grupo (ISO 4217). Contexto de leitura; nada é convertido. |
| `fin_legal_entities` | entidades legais (`legal_entity`) e unidades de negócio (`business_unit`, um nível abaixo de uma entidade legal), com CNPJ opcional (único por grupo), país, moeda local e estado `active`/`archived` (arquivar não apaga processos nem contratos). |
| `fin_members.entity_scope` | `group` (tesouraria do grupo: tudo, inclusive objetos sem entidade) ou `entities` (só as concedidas). Membros existentes nascem `group`. Administrador é sempre `group` (constraint `fin_members_admin_group_scope`). |
| `fin_member_entity_grants` | concessões de entidade para membros restritos; a concessão de uma entidade legal cobre as unidades abaixo dela. |
| `fin_rfqs.legal_entity_id`, `fin_contracts.legal_entity_id` | entidade do processo/contrato. `NULL` = nível de grupo, visível só para escopo `group`. O contrato herda a entidade da RFQ de origem. |
| `fin_tasks.legal_entity_id` | herdada do objeto relacionado (gatilho); tarefa avulsa de quem a cria segue visível para ela. |
| `fin_events.legal_entity_id` | entidade em que a ação ocorreu, gravada no momento do evento (gatilho) — o escopo fica na trilha. |

Leitura: as policies do lado comprador passam por `fin_entity_visible(org, entity)`
(RFQ, convite, proposta, versão, decisão, contrato, aprovação, etapa, revisão,
fotografia do Passport, marco de renovação, tarefa, evento, comentário,
documento privado e busca). Provedor (diretório do grupo) e Financial Passport
(perfil do grupo) continuam de nível de grupo.

Escrita: gatilhos centrais (`fin_*_entity_guard`) recusam, para membro da
compradora, criação ou alteração em objeto de entidade que ele não alcança —
inclusive quando a escrita vem de uma RPC existente (`fin_transition`,
`fin_record_decision`, `fin_invite_provider`, `fin_add_comment`…). A entidade de
uma RFQ só muda por `fin_set_rfq_entity` (antes da decisão, com evento
`rfq_entity_changed`); contrato anterior à fundação recebe entidade uma única vez
por `fin_assign_contract_entity`. Mudança direta da coluna é recusada
(`legal entity change requires rpc`).

Consolidação: `GET /api/finance/entity-summary` conta processos e contratos a
partir das linhas que o RLS devolveu para quem pergunta — um consolidado nunca
inclui entidade que a pessoa não leria sozinha — e não soma valores entre moedas.

RPCs: `fin_create_legal_entity`, `fin_update_legal_entity`, `fin_set_base_currency`,
`fin_set_member_entity_scope`, `fin_create_rfq_in_entity`, `fin_set_rfq_entity`,
`fin_assign_contract_entity`. Testes: `tests/database/financial-multi-entity.sql`,
`scripts/test-finance-entities.mjs`, `tests/e2e/finance-entities.spec.js`; o canário
(`ops/sql/pilot-isolation-canary.sql`) confere o isolamento de cada membro restrito.
