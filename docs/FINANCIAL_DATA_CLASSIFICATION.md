# Classificação de dados — Financial Procurement

> **Fonte canônica a partir de P0.11:** `lib/finance/data-governance.mjs` (registro por
> tabela, verificado contra as migrations) e `docs/FINANCIAL_DATA_GOVERNANCE.md`
> (taxonomia `PUBLIC`…`AUDIT_EVIDENCE`, retenção, exclusão, export, legal hold,
> offboarding). A tabela abaixo é o inventário narrativo original; em divergência,
> vale o registro.

Princípio: guardar o mínimo que o procurement exige. Um dado que não muda uma
decisão de cotação não deve existir no schema.

## Inventário

| Dado | Onde | Finalidade | Sensibilidade | Acesso | Retenção |
| --- | --- | --- | --- | --- | --- |
| Razão social, nome fantasia | `fin_organizations` | identificar a empresa na RFQ | baixa | membros da organização | enquanto a organização existir |
| CNPJ | `fin_organizations.tax_identifier` | identificar a empresa perante provedores | baixa (dado público) | membros | idem |
| Setor, faixa de faturamento | `fin_organizations` | contexto que provedores pedem para cotar | média | membros | idem |
| Vínculo usuário–organização e papel | `fin_members` | autorização | média | membros | enquanto o vínculo existir |
| E-mail de convite de membro | `fin_member_invitations` | entregar o convite | média (PII) | ninguém pelo cliente; só funções | expira em 7 dias |
| Perfil financeiro (faturamento, garantias, bancos, perfil de recebimento) | `fin_company_profiles` | reaproveitar entre RFQs | **alta** | membros da organização | revisável; campo tem `valid_until` |
| Demanda da RFQ | `fin_rfqs.demand` | obter propostas comparáveis | **alta** | membros + provedor convidado que aceitou | ver retenção do contrato |
| Condições da proposta | `fin_proposal_versions.terms` | comparar e decidir | **alta** | comprador; provedor só a própria | histórico é append-only |
| Snapshot da decisão | `fin_decisions.snapshot` | audit trail da escolha humana | **alta** | membros da organização | vinculado ao contrato |
| Contrato (vigência, custo, condições) | `fin_contracts` | acompanhar renovação | **alta** | membros | prazo contratual + retenção legal |
| Contato do provedor (nome, e-mail, telefone) | `fin_providers` | operar a cotação | média (PII de terceiro) | só o comprador que cadastrou | enquanto a relação existir |
| Notas internas sobre o provedor | `fin_providers.notes` | memória do comprador | média | só o comprador | idem |
| Referência documental (URL) | `fin_documents.reference_url` | apontar o documento | média | membros | idem |
| Trilha de eventos | `fin_events` | auditoria e métricas | baixa | membros (por entidade) | ver retenção geral |
| Termos estruturados de contrato, aditivos | `fin_contract_versions`, `fin_contract_amendments` | operar contrato e renovação | **alta** | membros que alcançam a entidade | vida do contrato + retenção legal; append-only |
| Facilities, saldos, cronogramas, garantias | `fin_facilities`, `fin_facility_balances`, `fin_facility_repayments`, `fin_guarantees` | visão de dívida/limites para sourcing | **alta** | membros que alcançam a entidade | enquanto a relação existir; histórico append-only |
| Contatos de provedor (nome, cargo, e-mail, telefone corporativos) | `fin_provider_contacts` | operar o relacionamento | média (PII de terceiro) | membros da compradora (contato de entidade: só quem alcança) | arquivamento lógico; não coletar CPF nem dado pessoal além do corporativo |
| Issues e avaliações de provedor | `fin_provider_issues`, `fin_provider_reviews` | memória institucional e performance definida pelo cliente | média | membros da compradora; nunca o provedor | avaliações imutáveis |
| Entidades do grupo (razão social, CNPJ, país, moeda) | `fin_legal_entities` | separar processos, contratos e acesso por entidade | baixa (dado cadastral público) | membros que alcançam a entidade | enquanto o grupo existir; arquivar preserva histórico |
| Escopo de acesso por entidade | `fin_members.entity_scope`, `fin_member_entity_grants` | autorização | média | admin do grupo; cada membro vê o próprio | enquanto o vínculo existir (cai com o membro) |

| Leases e execuções de jobs | `fin_job_leases`, `fin_job_runs` | fencing, correlação e diagnóstico de plataforma | **alta** (token de fencing exclusivo do servidor; console recebe apenas estados/contagens) | service role; console finance_ops com MFA recebe somente contagens/estados | histórico preservado; retenção por política de plataforma (`PLATFORM_TELEMETRY`), ver `FINANCIAL_DATA_GOVERNANCE.md` |

## O que deliberadamente NÃO é coletado

O schema **não tem campo** para nada abaixo, e não deve ganhar sem revisão:

* CPF de sócio, administrador ou funcionário;
* dados bancários pessoais;
* número de cartão, token de cartão ou qualquer dado de instrumento de pagamento;
* extrato bancário, arquivo de conciliação ou transação individual;
* credencial de acesso a banco, adquirente ou ERP;
* faturamento exato da empresa como campo obrigatório — o porte é **faixa**;
* score de crédito, restrição, protesto ou consulta a bureau.

## Minimização aplicada nesta rodada

* `fin_organizations.revenue_band` guarda faixa, não valor. O valor exato só
  existe quando a própria empresa o declara numa RFQ, porque ali ele muda a
  cotação.
* `fin_events.metadata` guarda contagens e identificadores. Há teste de banco
  que **falha** se termos financeiros (`interest_rate`, `mdr`,
  `offered_amount`) aparecerem na trilha.
* Documento é referência `https://`, não arquivo: sem upload, não há cópia de
  documento sensível no nosso storage.
* O perfil financeiro tem `valid_until` e indicador de frescor na interface,
  para que dado velho seja revisado ou removido em vez de acumular.

## Logs

O domínio financeiro reporta erro por `reportError` com `service`,
`requestId`, `route`, `status`, `code` e método. **Não** vão para o log: corpo
da requisição, termos financeiros, token de convite, e-mail ou mensagem crua do
Postgres. As mensagens devolvidas ao cliente são de uma tabela fixa em
`lib/api/domains/finance.mjs`.

## Pendências de privacidade

> **LEGAL_REVIEW_REQUIRED** — base legal para o perfil financeiro, prazo de
> retenção de RFQ/proposta/decisão/contrato, comportamento sob legal hold, e o
> que é compartilhado com o provedor convidado quando ele aceita (ele passa a
> ver a demanda declarada). Detalhes em `FINANCIAL_LEGAL_REVIEW_REQUIRED.md`.
