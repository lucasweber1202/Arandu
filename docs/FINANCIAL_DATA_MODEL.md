# Modelo de dados — Financial Procurement

Migration: [`supabase-financial-procurement.sql`](supabase-financial-procurement.sql).
Rollback: [`rollback/supabase-financial-procurement.rollback.sql`](rollback/supabase-financial-procurement.rollback.sql).

Todas as tabelas usam o prefixo `fin_`. Nenhuma tabela da vertical de Arte é
alterada, renomeada ou removida.

## Relacionamentos

```
auth.users
    │
    ├── fin_members ──────── fin_organizations (BUYER | PROVIDER)
    │                              │
    │                              ├── fin_member_invitations   (token de uso único)
    │                              ├── fin_company_profiles     (perfil reutilizável)
    │                              ├── fin_providers            (diretório da empresa)
    │                              ├── fin_documents            (referência https)
    │                              ├── fin_tasks
    │                              └── fin_events               (trilha)
    │
    └── fin_rfqs (organization_id, product: credit | acquiring, status)
             │
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

## Tabelas

### `fin_organizations`
`kind` é `BUYER` ou `PROVIDER`. `tax_identifier` aceita apenas 14 dígitos
(CNPJ sem máscara) — a **validação de existência do CNPJ não é feita nesta
fase** e está registrada como limitação. `revenue_band` guarda faixa, não valor
exato: o porte é necessário para o produto, o faturamento exato não.

### `fin_members`
Papéis: `admin`, `finance_manager`, `analyst`, `provider_user`, `viewer`.
`viewer` lê e nunca escreve — verificado em `tests/database/financial-procurement.sql`.

### `fin_company_profiles`
Um registro por campo, com a proveniência exigida pelo produto: `source`
(origem), `updated_at` (data), `updated_by` (responsável), `status` e
`valid_until` (validade). Chave única `(organization_id, field_key)` permite
reaproveitar o perfil entre RFQs sem duplicar.

### `fin_providers`
Tipos: `bank`, `fintech`, `acquirer`, `subacquirer`, `credit_provider`,
`payment_provider`, `other`. O estado de verificação nasce `NAO_VERIFICADO`. A
constraint `fin_provider_evidence_required` impede `EVIDENCIA_REGISTRADA` sem
autoridade, registro, URL de evidência e data de consulta.

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

### `fin_decisions`
`snapshot` guarda a proposta escolhida **e todas as demais** com seus termos no
momento da decisão. `criteria` guarda os pesos que a empresa usou, quando usou.

### `fin_contracts`
`renewal_notice_days` define a janela de revisão: `ends_on - renewal_notice_days`.
`document_reference` aceita apenas `https://` — é referência, não upload.

### `fin_documents`
Referência documental apenas. **Upload não está implementado nesta fase** (ver
limitações no runbook). O campo `reference_url` exige `https://`.

### `fin_events`
Trilha de produto e observabilidade. `metadata` guarda contagens e
identificadores; os testes de banco falham se termos financeiros sensíveis
(`interest_rate`, `mdr`, `offered_amount`) aparecerem ali.

## O que foi deliberadamente não replicado

Não há tabela de produto financeiro em banco: o catálogo de produtos e campos é
código versionado (`lib/finance/products.mjs`), porque mudar um campo é uma
mudança de software que exige revisão, migração de UI e teste — não um registro
editável em runtime.
