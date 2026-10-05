// Registro canônico de governança de dados do Arandu Financial Procurement
// (P0.11, docs/FINANCIAL_DATA_GOVERNANCE.md).
//
// Para cada tabela do produto financeiro: system of record, classificação,
// presença de dado pessoal/financeiro/credencial, classe de retenção, semântica
// de exclusão, se entra no export portável, se legal hold se aplica e o papel
// dono. O banco implementa o que é executável (docs/supabase-financial-data-
// governance.sql); este módulo é a fonte verificada por
// scripts/test-finance-data-governance.mjs: toda tabela `fin_*` criada por
// migration precisa estar aqui, e todo conjunto exportado precisa bater com a
// função SQL de export.
//
// Nada aqui é parecer jurídico. Prazos não são inventados: classes
// automatizáveis só têm piso/teto técnico e exigem política ativada por
// decisão humana registrada (LEGAL_REVIEW_REQUIRED).

/** Taxonomia única (substitui baixa/média/alta de FINANCIAL_DATA_CLASSIFICATION.md). */
export const CLASSIFICATIONS = Object.freeze({
  PUBLIC: 'Pode ser publicado (catálogos e textos públicos).',
  INTERNAL: 'Operação do produto; sem dado de cliente sensível.',
  CONFIDENTIAL: 'Dado corporativo do cliente; acesso por membro/entidade.',
  FINANCIAL_SENSITIVE: 'Condições, valores, contratos, dívida e decisões financeiras do cliente.',
  PERSONAL_DATA: 'Dado pessoal (nome, e-mail, telefone corporativos ou identificador de pessoa).',
  SECURITY_SENSITIVE: 'Trilha e configuração de segurança; leitura restrita a admin/operador.',
  CREDENTIAL_MATERIAL: 'Hash de token, segredo cifrado ou lease; nunca exportado, nunca logado.',
  AUDIT_EVIDENCE: 'Registro imutável de quem fez o quê; não some por ação cotidiana.'
});

/**
 * Classes de retenção. `automatable` = alcançada pelo executor SQL, sempre
 * com política ativa (exceto as de sistema, cujo prazo é técnico e
 * documentado). Limites em dias espelham fin_retention_class_catalog().
 */
export const RETENTION_CLASSES = Object.freeze({
  TEMPORARY_OPERATIONAL: { automatable: true, scope: 'tenant', min_days: 30, max_days: 3650, action: 'delete', summary: 'Avisos in-app.' },
  WEBHOOK_DELIVERY: { automatable: true, scope: 'tenant', min_days: 30, max_days: 3650, action: 'delete', summary: 'Entregas de webhook encerradas (sucesso, dead, cancelada).' },
  SECURITY_EVENT: { automatable: true, scope: 'tenant', min_days: 365, max_days: 3650, action: 'delete', summary: 'Tentativas de login SSO.' },
  CONTACT_PII: { automatable: true, scope: 'tenant', min_days: 30, max_days: 3650, action: 'anonymize', summary: 'E-mail de convites já encerrados.' },
  PLATFORM_TELEMETRY: { automatable: true, scope: 'platform', min_days: 30, max_days: 3650, action: 'delete', summary: 'Execuções de job encerradas.' },
  PLATFORM_SECURITY_TRAIL: { automatable: true, scope: 'platform', min_days: 365, max_days: 3650, action: 'delete', summary: 'Acesso do console operacional e recusas de convite.' },
  EXPORT_FILE: { automatable: true, scope: 'system', fixed: '7 dias após ficar pronto', action: 'delete', summary: 'Cópia do export portável.' },
  IDEMPOTENCY: { automatable: true, scope: 'system', fixed: '24 horas (expires_at)', action: 'delete', summary: 'Chaves de idempotência da API v1.' },
  BUSINESS_RECORD: { automatable: false, summary: 'Processos, tarefas, comentários e configuração de negócio: retenção pelo ciclo de vida do tenant.' },
  FINANCIAL_RECORD: { automatable: false, summary: 'Propostas, decisões, contratos, facilities e garantias: prazo legal/fiscal pendente de decisão jurídica.' },
  AUDIT_EVIDENCE: { automatable: false, summary: 'Trilhas imutáveis: só saem com o tenant, sem hold, após a janela pós-contrato.' },
  DOCUMENT: { automatable: false, summary: 'Metadados de documentos e referências: seguem o objeto ao qual pertencem.' },
  CREDENTIAL_METADATA: { automatable: false, summary: 'Contas de serviço, credenciais e conexões: revogadas, nunca reutilizadas.' },
  GOVERNANCE_RECORD: { automatable: false, summary: 'Políticas, holds, exports e offboarding: evidência do próprio processo de governança.' },
  DRAFT: { automatable: false, summary: 'Rascunhos de edição: substituídos ou limpos pelo próprio fluxo.' },
  CONFIGURATION: { automatable: false, summary: 'Configuração da plataforma.' }
});

export const DELETION_SEMANTICS = Object.freeze({
  immutable: 'Não é apagado nem editado por ação cotidiana; só sai com o tenant, sem hold, após a janela de retenção.',
  archive: 'Arquivamento lógico (status/archived_at/removed_at); a linha continua.',
  revoke: 'Revogação (revoked_at/status); a linha continua como evidência.',
  anonymize: 'Campos pessoais substituídos; a linha e a trilha continuam.',
  retention_expiry: 'Apagado em lote pelo executor de retenção após política ativa (ou prazo técnico de sistema).',
  replace: 'Sobrescrito pelo próprio fluxo (rascunho, configuração).',
  tenant_offboarding: 'Só sai pelo offboarding controlado do tenant.'
});

const T = (domain, system_of_record, classification, opts) => Object.freeze({
  domain, system_of_record, classification,
  contains_personal_data: Boolean(opts.pii), contains_financial_data: Boolean(opts.fin), contains_credentials: Boolean(opts.cred),
  retention_class: opts.rc, deletion_semantics: opts.del, exportable: Boolean(opts.export), export_dataset: opts.export || null, legal_hold_applicable: opts.hold ?? true,
  owner: opts.owner || 'buyer_admin'
});

/**
 * Tabelas `fin_*` (e views derivadas). `system_of_record: 'derived'` = projeção,
 * nunca fonte. `export` = nome do conjunto em data/<nome>.json.
 */
export const DATA_REGISTRY = Object.freeze({
  fin_implementation_plans: T('implementation', 'fin_implementation_plans', 'CONFIDENTIAL', { pii: true, rc: 'BUSINESS_RECORD', del: 'immutable', export: 'implementation_plans' }),
  fin_implementation_milestones: T('implementation', 'fin_implementation_milestones', 'CONFIDENTIAL', { pii: true, rc: 'BUSINESS_RECORD', del: 'immutable', export: 'implementation_milestones' }),
  fin_implementation_dependencies: T('implementation', 'fin_implementation_dependencies', 'CONFIDENTIAL', { pii: true, rc: 'BUSINESS_RECORD', del: 'immutable', export: 'implementation_dependencies' }),
  fin_implementation_issues: T('implementation', 'fin_implementation_issues', 'CONFIDENTIAL', { pii: true, rc: 'BUSINESS_RECORD', del: 'immutable', export: 'implementation_issues' }),
  fin_implementation_acceptances: T('implementation', 'fin_implementation_acceptances', 'CONFIDENTIAL', { pii: true, rc: 'AUDIT_EVIDENCE', del: 'immutable', export: 'implementation_acceptances' }),
  // Organização, pessoas e acesso.
  fin_organizations: T('organization', 'fin_organizations', 'CONFIDENTIAL', { rc: 'BUSINESS_RECORD', del: 'tenant_offboarding', export: 'organization' }),
  fin_legal_entities: T('multi_entity', 'fin_legal_entities', 'CONFIDENTIAL', { rc: 'BUSINESS_RECORD', del: 'archive', export: 'legal_entities' }),
  fin_members: T('access', 'fin_members', 'PERSONAL_DATA', { pii: true, rc: 'BUSINESS_RECORD', del: 'revoke', export: 'members' }),
  fin_member_entity_grants: T('access', 'fin_member_entity_grants', 'SECURITY_SENSITIVE', { rc: 'BUSINESS_RECORD', del: 'revoke', export: 'member_entity_grants' }),
  fin_member_invitations: T('access', 'fin_member_invitations', 'PERSONAL_DATA', { pii: true, cred: true, rc: 'CONTACT_PII', del: 'anonymize' }),
  fin_terms_acceptances: T('access', 'fin_terms_acceptances', 'AUDIT_EVIDENCE', { rc: 'AUDIT_EVIDENCE', del: 'immutable' }),
  fin_notification_preferences: T('collaboration', 'fin_notification_preferences', 'INTERNAL', { rc: 'DRAFT', del: 'replace' }),
  fin_offboarding_member_archive: T('governance', 'fin_offboarding_member_archive', 'SECURITY_SENSITIVE', { rc: 'GOVERNANCE_RECORD', del: 'immutable', owner: 'platform_ops' }),
  // Financial Passport.
  fin_company_profiles: T('passport', 'fin_company_profiles', 'FINANCIAL_SENSITIVE', { fin: true, rc: 'FINANCIAL_RECORD', del: 'replace', export: 'company_profiles' }),
  fin_company_profile_history: T('passport', 'fin_company_profile_history', 'AUDIT_EVIDENCE', { fin: true, rc: 'AUDIT_EVIDENCE', del: 'immutable', export: 'company_profile_history' }),
  fin_rfq_profile_snapshots: T('passport', 'fin_rfq_profile_snapshots', 'FINANCIAL_SENSITIVE', { fin: true, rc: 'AUDIT_EVIDENCE', del: 'immutable', export: 'rfq_profile_snapshots' }),
  // Financial Graph: projeção, nunca system of record.
  fin_financial_graph: T('graph', 'derived', 'FINANCIAL_SENSITIVE', { fin: true, rc: 'BUSINESS_RECORD', del: 'replace', hold: false }),
  fin_graph_objects: T('graph', 'derived', 'FINANCIAL_SENSITIVE', { fin: true, rc: 'BUSINESS_RECORD', del: 'replace', hold: false }),
  // RFQ, propostas e decisão.
  fin_rfqs: T('rfq', 'fin_rfqs + fin_rfq_revisions', 'FINANCIAL_SENSITIVE', { fin: true, rc: 'BUSINESS_RECORD', del: 'archive', export: 'rfqs' }),
  fin_rfq_revisions: T('rfq', 'fin_rfq_revisions', 'AUDIT_EVIDENCE', { fin: true, rc: 'AUDIT_EVIDENCE', del: 'immutable', export: 'rfq_revisions' }),
  fin_rfq_editor_drafts: T('rfq', 'fin_rfqs (rascunho de edição)', 'FINANCIAL_SENSITIVE', { fin: true, rc: 'DRAFT', del: 'replace' }),
  fin_rfq_invites: T('rfq', 'fin_rfq_invites', 'PERSONAL_DATA', { pii: true, cred: true, rc: 'CONTACT_PII', del: 'anonymize', export: 'rfq_invites' }),
  fin_invite_acceptance_denials: T('rfq', 'fin_invite_acceptance_denials', 'SECURITY_SENSITIVE', { rc: 'PLATFORM_SECURITY_TRAIL', del: 'retention_expiry', owner: 'platform_ops', hold: false }),
  fin_proposals: T('proposal', 'fin_proposal_versions', 'FINANCIAL_SENSITIVE', { fin: true, rc: 'FINANCIAL_RECORD', del: 'archive', export: 'proposals' }),
  fin_proposal_versions: T('proposal', 'fin_proposal_versions', 'FINANCIAL_SENSITIVE', { fin: true, rc: 'FINANCIAL_RECORD', del: 'immutable', export: 'proposal_versions' }),
  fin_proposal_drafts: T('proposal', 'fin_proposal_versions (rascunho do provedor)', 'FINANCIAL_SENSITIVE', { fin: true, rc: 'DRAFT', del: 'replace', owner: 'provider_admin' }),
  fin_decisions: T('decision', 'fin_decisions.snapshot', 'FINANCIAL_SENSITIVE', { fin: true, rc: 'AUDIT_EVIDENCE', del: 'immutable', export: 'decisions' }),
  // Contratos e renovação.
  fin_contracts: T('contract', 'fin_contract_versions', 'FINANCIAL_SENSITIVE', { fin: true, rc: 'FINANCIAL_RECORD', del: 'archive', export: 'contracts' }),
  fin_contract_versions: T('contract', 'fin_contract_versions', 'FINANCIAL_SENSITIVE', { fin: true, rc: 'FINANCIAL_RECORD', del: 'immutable', export: 'contract_versions' }),
  fin_contract_amendments: T('contract', 'fin_contract_amendments', 'FINANCIAL_SENSITIVE', { fin: true, rc: 'FINANCIAL_RECORD', del: 'immutable', export: 'contract_amendments' }),
  fin_contract_milestones: T('contract', 'fin_contract_milestones', 'CONFIDENTIAL', { rc: 'BUSINESS_RECORD', del: 'archive', export: 'contract_milestones' }),
  fin_contract_milestone_runs: T('contract', 'fin_contract_milestone_runs', 'INTERNAL', { rc: 'AUDIT_EVIDENCE', del: 'immutable' }),
  fin_renewal_milestones: T('contract', 'fin_renewal_milestones', 'INTERNAL', { rc: 'AUDIT_EVIDENCE', del: 'immutable', export: 'renewal_milestones' }),
  // Provedores e relacionamento.
  fin_providers: T('provider', 'fin_providers', 'PERSONAL_DATA', { pii: true, rc: 'BUSINESS_RECORD', del: 'archive', export: 'providers' }),
  fin_provider_contacts: T('provider_rm', 'fin_provider_contacts', 'PERSONAL_DATA', { pii: true, rc: 'BUSINESS_RECORD', del: 'archive', export: 'provider_contacts' }),
  fin_provider_relationships: T('provider_rm', 'fin_provider_relationships', 'CONFIDENTIAL', { rc: 'BUSINESS_RECORD', del: 'replace', export: 'provider_relationships' }),
  fin_provider_issues: T('provider_rm', 'fin_provider_issues', 'CONFIDENTIAL', { rc: 'BUSINESS_RECORD', del: 'archive', export: 'provider_issues' }),
  fin_provider_reviews: T('provider_rm', 'fin_provider_reviews', 'CONFIDENTIAL', { rc: 'AUDIT_EVIDENCE', del: 'immutable', export: 'provider_reviews' }),
  fin_scorecard_templates: T('provider_rm', 'fin_scorecard_templates', 'INTERNAL', { rc: 'BUSINESS_RECORD', del: 'archive', export: 'scorecard_templates' }),
  // Facilities, limites e garantias.
  fin_facilities: T('facilities', 'fin_facilities', 'FINANCIAL_SENSITIVE', { fin: true, rc: 'FINANCIAL_RECORD', del: 'archive', export: 'facilities' }),
  fin_facility_balances: T('facilities', 'fin_facility_balances', 'FINANCIAL_SENSITIVE', { fin: true, rc: 'FINANCIAL_RECORD', del: 'immutable', export: 'facility_balances' }),
  fin_facility_repayments: T('facilities', 'fin_facility_repayments (versão do cronograma)', 'FINANCIAL_SENSITIVE', { fin: true, rc: 'FINANCIAL_RECORD', del: 'immutable', export: 'facility_repayments' }),
  fin_facility_history: T('facilities', 'fin_facility_history', 'AUDIT_EVIDENCE', { fin: true, rc: 'AUDIT_EVIDENCE', del: 'immutable', export: 'facility_history' }),
  fin_guarantees: T('facilities', 'fin_guarantees', 'FINANCIAL_SENSITIVE', { fin: true, rc: 'FINANCIAL_RECORD', del: 'archive', export: 'guarantees' }),
  // Policy & Approval Engine.
  fin_policies: T('policy', 'fin_policy_versions', 'CONFIDENTIAL', { rc: 'BUSINESS_RECORD', del: 'archive', export: 'policies' }),
  fin_policy_versions: T('policy', 'fin_policy_versions', 'CONFIDENTIAL', { rc: 'AUDIT_EVIDENCE', del: 'immutable', export: 'policy_versions' }),
  fin_policy_flags: T('policy', 'fin_policy_flags', 'INTERNAL', { rc: 'BUSINESS_RECORD', del: 'replace', export: 'policy_flags' }),
  fin_approval_policies: T('policy', 'fin_approval_policies', 'INTERNAL', { rc: 'BUSINESS_RECORD', del: 'replace', export: 'approval_policies' }),
  fin_approval_requests: T('approval', 'fin_approval_requests.snapshot', 'FINANCIAL_SENSITIVE', { fin: true, rc: 'AUDIT_EVIDENCE', del: 'immutable', export: 'approval_requests' }),
  fin_approval_stages: T('approval', 'fin_approval_stages', 'AUDIT_EVIDENCE', { rc: 'AUDIT_EVIDENCE', del: 'immutable', export: 'approval_stages' }),
  fin_approval_steps: T('approval', 'fin_approval_steps', 'AUDIT_EVIDENCE', { rc: 'AUDIT_EVIDENCE', del: 'immutable', export: 'approval_steps' }),
  fin_policy_exceptions: T('approval', 'fin_policy_exceptions', 'AUDIT_EVIDENCE', { rc: 'AUDIT_EVIDENCE', del: 'immutable', export: 'policy_exceptions' }),
  fin_approval_delegations: T('approval', 'fin_approval_delegations', 'AUDIT_EVIDENCE', { rc: 'AUDIT_EVIDENCE', del: 'revoke', export: 'approval_delegations' }),
  // Trabalho e colaboração.
  fin_tasks: T('work', 'fin_tasks', 'CONFIDENTIAL', { rc: 'BUSINESS_RECORD', del: 'archive', export: 'tasks' }),
  fin_comments: T('work', 'fin_comments', 'CONFIDENTIAL', { pii: true, rc: 'BUSINESS_RECORD', del: 'immutable', export: 'comments' }),
  fin_notifications: T('work', 'derived', 'INTERNAL', { rc: 'TEMPORARY_OPERATIONAL', del: 'retention_expiry', hold: true }),
  fin_events: T('audit', 'fin_events', 'AUDIT_EVIDENCE', { rc: 'AUDIT_EVIDENCE', del: 'immutable', export: 'events' }),
  // Documentos.
  fin_documents: T('documents', 'fin_documents (referência https)', 'CONFIDENTIAL', { rc: 'DOCUMENT', del: 'immutable', export: 'documents' }),
  fin_private_documents: T('documents', 'fin_private_documents + Storage fin-documents', 'FINANCIAL_SENSITIVE', { fin: true, rc: 'DOCUMENT', del: 'archive', export: 'private_documents' }),
  fin_document_versions: T('documents', 'fin_document_versions', 'FINANCIAL_SENSITIVE', { fin: true, rc: 'DOCUMENT', del: 'immutable', export: 'document_versions' }),
  // Provider Qualification & Due Diligence: exigências do cliente, evidências, exceções com SoD e decisão humana.
  fin_qualification_requirements: T('provider_qualification', 'fin_qualification_requirements', 'CONFIDENTIAL', { rc: 'BUSINESS_RECORD', del: 'immutable', export: 'qualification_requirements' }),
  fin_provider_qualifications: T('provider_qualification', 'fin_provider_qualifications', 'CONFIDENTIAL', { rc: 'BUSINESS_RECORD', del: 'tenant_offboarding', export: 'provider_qualifications' }),
  fin_qualification_evidence: T('provider_qualification', 'fin_qualification_evidence', 'CONFIDENTIAL', { rc: 'DOCUMENT', del: 'immutable', export: 'qualification_evidence' }),
  fin_qualification_exceptions: T('provider_qualification', 'fin_qualification_exceptions', 'AUDIT_EVIDENCE', { rc: 'AUDIT_EVIDENCE', del: 'immutable', export: 'qualification_exceptions' }),
  fin_qualification_events: T('provider_qualification', 'fin_qualification_events', 'AUDIT_EVIDENCE', { rc: 'AUDIT_EVIDENCE', del: 'immutable', export: 'qualification_events' }),
  // P1.4 Document Intelligence: leitura assistida com proveniência; o fato confirmado é dado do cliente, o documento continua a fonte.
  fin_document_extractions: T('document_intelligence', 'fin_document_extractions', 'CONFIDENTIAL', { rc: 'DOCUMENT', del: 'immutable', export: 'document_extractions' }),
  fin_extraction_facts: T('document_intelligence', 'fin_extraction_facts', 'FINANCIAL_SENSITIVE', { fin: true, rc: 'DOCUMENT', del: 'immutable', export: 'extraction_facts' }),
  fin_extraction_reviews: T('document_intelligence', 'fin_extraction_reviews', 'AUDIT_EVIDENCE', { fin: true, rc: 'AUDIT_EVIDENCE', del: 'immutable', export: 'extraction_reviews' }),
  // Public API, webhooks e SSO.
  fin_service_accounts: T('api', 'fin_service_accounts', 'SECURITY_SENSITIVE', { rc: 'CREDENTIAL_METADATA', del: 'revoke', export: 'service_accounts' }),
  fin_service_account_entities: T('api', 'fin_service_account_entities', 'SECURITY_SENSITIVE', { rc: 'CREDENTIAL_METADATA', del: 'replace' }),
  fin_api_credentials: T('api', 'fin_api_credentials', 'CREDENTIAL_MATERIAL', { cred: true, rc: 'CREDENTIAL_METADATA', del: 'revoke' }),
  fin_api_idempotency: T('api', 'fin_api_idempotency', 'FINANCIAL_SENSITIVE', { fin: true, rc: 'IDEMPOTENCY', del: 'retention_expiry', hold: false }),
  fin_webhook_endpoints: T('webhooks', 'fin_webhook_endpoints', 'CREDENTIAL_MATERIAL', { cred: true, rc: 'CREDENTIAL_METADATA', del: 'revoke', export: 'webhook_endpoints' }),
  fin_webhook_events: T('webhooks', 'derived (fin_events)', 'INTERNAL', { rc: 'WEBHOOK_DELIVERY', del: 'immutable' }),
  fin_webhook_deliveries: T('webhooks', 'fin_webhook_deliveries', 'INTERNAL', { rc: 'WEBHOOK_DELIVERY', del: 'retention_expiry' }),
  fin_sso_connections: T('sso', 'fin_sso_connections', 'SECURITY_SENSITIVE', { rc: 'CREDENTIAL_METADATA', del: 'revoke', export: 'sso_connections' }),
  fin_sso_domains: T('sso', 'fin_sso_domains', 'SECURITY_SENSITIVE', { cred: true, rc: 'CREDENTIAL_METADATA', del: 'revoke', export: 'sso_domains' }),
  fin_sso_events: T('sso', 'fin_sso_events', 'SECURITY_SENSITIVE', { pii: true, rc: 'SECURITY_EVENT', del: 'retention_expiry' }),
  // Operação da plataforma (P0.10).
  fin_job_runs: T('operations', 'fin_job_runs', 'INTERNAL', { rc: 'PLATFORM_TELEMETRY', del: 'retention_expiry', owner: 'platform_ops', hold: false }),
  fin_job_leases: T('operations', 'fin_job_leases', 'CREDENTIAL_MATERIAL', { cred: true, rc: 'CONFIGURATION', del: 'replace', owner: 'platform_ops', hold: false }),
  fin_ops_access_log: T('operations', 'fin_ops_access_log', 'SECURITY_SENSITIVE', { rc: 'PLATFORM_SECURITY_TRAIL', del: 'retention_expiry', owner: 'platform_ops', hold: false }),
  fin_platform_operators: T('operations', 'fin_platform_operators', 'SECURITY_SENSITIVE', { rc: 'CONFIGURATION', del: 'revoke', owner: 'platform_ops', hold: false }),
  fin_pilot_allowlist: T('operations', 'fin_pilot_allowlist', 'SECURITY_SENSITIVE', { rc: 'CONFIGURATION', del: 'replace', owner: 'platform_ops', hold: false }),
  fin_settings: T('operations', 'fin_settings', 'INTERNAL', { rc: 'CONFIGURATION', del: 'replace', owner: 'platform_ops', hold: false }),
  // Procurement value: immutable declared facts and human verification.
  fin_value_methodologies: T('value_realization', 'fin_value_methodologies', 'AUDIT_EVIDENCE', { fin: true, rc: 'AUDIT_EVIDENCE', del: 'immutable', export: 'value_methodologies' }),
  fin_value_records: T('value_realization', 'fin_value_records', 'FINANCIAL_SENSITIVE', { fin: true, rc: 'FINANCIAL_RECORD', del: 'immutable', export: 'value_records' }),
  fin_value_observations: T('value_realization', 'fin_value_observations', 'AUDIT_EVIDENCE', { fin: true, rc: 'AUDIT_EVIDENCE', del: 'immutable', export: 'value_observations' }),
  // Bank Fee Intelligence: contracted reference, observed charge, frozen comparison, human review.
  fin_fee_schedules: T('fee_intelligence', 'fin_fee_schedules', 'FINANCIAL_SENSITIVE', { fin: true, rc: 'FINANCIAL_RECORD', del: 'immutable', export: 'fee_schedules' }),
  fin_fee_schedule_versions: T('fee_intelligence', 'fin_fee_schedule_versions', 'FINANCIAL_SENSITIVE', { fin: true, rc: 'FINANCIAL_RECORD', del: 'immutable', export: 'fee_schedule_versions' }),
  fin_fee_observations: T('fee_intelligence', 'fin_fee_observations', 'FINANCIAL_SENSITIVE', { fin: true, rc: 'FINANCIAL_RECORD', del: 'immutable', export: 'fee_observations' }),
  fin_fee_variances: T('fee_intelligence', 'fin_fee_variances', 'FINANCIAL_SENSITIVE', { fin: true, rc: 'FINANCIAL_RECORD', del: 'immutable', export: 'fee_variances' }),
  fin_fee_reviews: T('fee_intelligence', 'fin_fee_reviews', 'AUDIT_EVIDENCE', { fin: true, rc: 'AUDIT_EVIDENCE', del: 'immutable', export: 'fee_reviews' }),
  // Opportunity Engine: customer rules, derived work items with frozen facts, history.
  fin_opportunity_rules: T('opportunity_engine', 'fin_opportunity_rules', 'CONFIDENTIAL', { rc: 'BUSINESS_RECORD', del: 'immutable', export: 'opportunity_rules' }),
  fin_opportunities: T('opportunity_engine', 'fin_opportunities', 'FINANCIAL_SENSITIVE', { fin: true, rc: 'BUSINESS_RECORD', del: 'tenant_offboarding', export: 'opportunities' }),
  fin_opportunity_events: T('opportunity_engine', 'fin_opportunity_events', 'AUDIT_EVIDENCE', { fin: true, rc: 'AUDIT_EVIDENCE', del: 'immutable', export: 'opportunity_events' }),
  fin_opportunity_scans: T('operations', 'fin_opportunity_scans', 'INTERNAL', { rc: 'CONFIGURATION', del: 'tenant_offboarding', owner: 'platform_ops', hold: false }),
  // Governança (P0.11).
  fin_retention_policies: T('governance', 'fin_retention_policies', 'AUDIT_EVIDENCE', { rc: 'GOVERNANCE_RECORD', del: 'immutable', export: 'retention_policies' }),
  fin_legal_holds: T('governance', 'fin_legal_holds', 'AUDIT_EVIDENCE', { rc: 'GOVERNANCE_RECORD', del: 'immutable', export: 'legal_holds' }),
  fin_data_exports: T('governance', 'fin_data_exports', 'AUDIT_EVIDENCE', { rc: 'GOVERNANCE_RECORD', del: 'immutable' }),
  fin_data_export_parts: T('governance', 'copy of the systems of record above', 'FINANCIAL_SENSITIVE', { pii: true, fin: true, rc: 'EXPORT_FILE', del: 'retention_expiry', hold: false }),
  fin_offboarding_requests: T('governance', 'fin_offboarding_requests', 'AUDIT_EVIDENCE', { rc: 'GOVERNANCE_RECORD', del: 'immutable', owner: 'buyer_admin' }),
  fin_governance_log: T('governance', 'fin_governance_log', 'AUDIT_EVIDENCE', { rc: 'GOVERNANCE_RECORD', del: 'immutable', owner: 'platform_ops' })
});

/** Infraestrutura compartilhada usada pelo financeiro (fora do prefixo fin_). */
export const SHARED_REGISTRY = Object.freeze({
  transactional_email_outbox: T('notifications', 'transactional_email_outbox', 'PERSONAL_DATA', { pii: true, rc: 'TEMPORARY_OPERATIONAL', del: 'anonymize', owner: 'platform_ops', hold: false }),
  api_rate_limits: T('security', 'api_rate_limits', 'SECURITY_SENSITIVE', { rc: 'PLATFORM_TELEMETRY', del: 'retention_expiry', owner: 'platform_ops', hold: false })
});

/** Conjuntos do export: mesmos de fin_governance_export_datasets() (verificado em teste). */
export const EXPORT_DATASETS = Object.freeze(Object.values(DATA_REGISTRY).filter((entry) => entry.exportable).map((entry) => entry.export_dataset));

/** Systems of record por capacidade (o Graph, a busca e o painel nunca são fonte). */
export const SOURCE_OF_TRUTH = Object.freeze({
  implementation: 'fin_implementation_plans + fin_implementation_milestones (progresso com evidência) + fin_implementation_dependencies + fin_implementation_issues + fin_implementation_acceptances (aceite humano imutável; não calcula savings)',
  financial_passport: 'fin_company_profiles (+ fin_company_profile_history; RFQ congela em fin_rfq_profile_snapshots)',
  rfq_demand: 'fin_rfqs.demand por revisão em fin_rfq_revisions',
  proposal: 'fin_proposal_versions (versão corrente apontada por fin_proposals.current_version)',
  decision: 'fin_decisions.snapshot',
  contract_terms: 'fin_contract_versions (+ fin_contract_amendments)',
  facility_balance: 'fin_facility_balances (fotografias datadas)',
  approval_policy: 'fin_policy_versions',
  approval_execution: 'fin_approval_requests.policy_snapshot + fin_approval_stages/steps',
  provider_relationship: 'fin_provider_relationships, fin_provider_contacts, fin_provider_issues, fin_provider_reviews',
  api_credentials: 'fin_service_accounts + fin_api_credentials (só hash)',
  sso: 'fin_sso_connections + fin_sso_domains',
  audit_trail: 'fin_events',
  value_realization: 'fin_value_records + fin_value_methodologies + fin_value_observations (immutable provenance)',
  opportunity_engine: 'fin_opportunity_rules (customer policy) + fin_opportunities/fin_opportunity_events (work items with frozen facts; facts stay in their own SoR)',
  provider_qualification: 'fin_qualification_requirements (política do cliente) + fin_provider_qualifications (estado e decisão humana) + fin_qualification_evidence (fato com origem/validade; serviço externo = evidência, não verificação do Arandu) + fin_qualification_exceptions (SoD) + fin_qualification_events (trilha)',
  document_intelligence: 'fin_private_documents/fin_document_versions (fonte) + fin_document_extractions (execução) + fin_extraction_facts (fato com proveniência e estado de revisão) + fin_extraction_reviews (decisão humana)',
  fee_intelligence: 'fin_fee_schedules + fin_fee_schedule_versions (contracted reference) + fin_fee_observations (observed charge) + fin_fee_variances (frozen comparison) + fin_fee_reviews (human review)',
  financial_graph: 'derived — projeção sobre as tabelas acima, nunca fonte',
  search: 'derived — consulta sob RLS, nunca fonte',
  dashboard: 'derived — agregação sob RLS, nunca fonte'
});

/** Máquina de estados do offboarding (espelha fin_governance_offboarding_action/advance). */
export const OFFBOARDING_STATES = Object.freeze(['requested', 'export_pending', 'export_ready', 'access_revocation', 'retention_window', 'scheduled_for_deletion', 'closed', 'cancelled']);
export const OFFBOARDING_TRANSITIONS = Object.freeze({
  requested: { request_export: 'export_pending', confirm_revocation: 'retention_window', cancel: 'cancelled' },
  export_pending: { request_export: 'export_pending', export_ready: 'export_ready', cancel: 'cancelled' },
  export_ready: { confirm_revocation: 'retention_window', cancel: 'cancelled' },
  access_revocation: { revocation_completed: 'retention_window' },
  retention_window: { retention_elapsed: 'scheduled_for_deletion', operator_cancel: 'cancelled' },
  scheduled_for_deletion: { operator_close: 'closed', operator_cancel: 'cancelled' },
  closed: {},
  cancelled: {}
});
export const OFFBOARDING_ADMIN_ACTIONS = Object.freeze(['request_export', 'confirm_revocation', 'cancel']);

export function nextOffboardingState(state, action) {
  return OFFBOARDING_TRANSITIONS[state]?.[action] ?? null;
}

export const LEGAL_HOLD_SCOPES = Object.freeze(['organization', 'legal_entity', 'rfq', 'contract', 'provider', 'retention_class']);

/** Classes que o admin da compradora pode configurar. */
export function tenantRetentionClasses() {
  return Object.entries(RETENTION_CLASSES).filter(([, value]) => value.automatable && value.scope === 'tenant').map(([key, value]) => ({ key, ...value }));
}

/** Validação do lado do servidor antes de chegar ao banco (o banco repete). */
export function validateRetentionPolicy({ retention_class: retentionClass, retention_days: days, reason, decision_reference: reference }) {
  const definition = RETENTION_CLASSES[retentionClass];
  if (!definition || !definition.automatable || definition.scope !== 'tenant') return { ok: false, error: 'Esta classe de dado não aceita retenção automática configurável.' };
  if (!Number.isInteger(days) || days < definition.min_days || days > definition.max_days) return { ok: false, error: `Prazo entre ${definition.min_days} e ${definition.max_days} dias para esta classe.` };
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (text.length < 10 || text.length > 500 || /[<>]/.test(text)) return { ok: false, error: 'Explique a decisão (10 a 500 caracteres).' };
  if (reference && !/^[A-Za-z0-9._:/#-]{3,120}$/.test(reference)) return { ok: false, error: 'Referência da decisão: use o código do ticket ou documento (sem espaços).' };
  return { ok: true, values: { retention_class: retentionClass, retention_days: days, reason: text, decision_reference: reference || null } };
}

/** Resumo legível, sem dado do cliente: alimenta a superfície de Configurações. */
export function governanceCatalog() {
  const tables = Object.entries(DATA_REGISTRY);
  const byClassification = {};
  for (const [, entry] of tables) byClassification[entry.classification] = (byClassification[entry.classification] || 0) + 1;
  return {
    classifications: Object.entries(CLASSIFICATIONS).map(([key, summary]) => ({ key, summary, tables: byClassification[key] || 0 })),
    retention_classes: Object.entries(RETENTION_CLASSES).map(([key, value]) => ({ key, ...value })),
    deletion_semantics: Object.entries(DELETION_SEMANTICS).map(([key, summary]) => ({ key, summary })),
    source_of_truth: Object.entries(SOURCE_OF_TRUTH).map(([key, value]) => ({ key, value })),
    export_datasets: EXPORT_DATASETS,
    tables: tables.length,
    personal_data_tables: tables.filter(([, entry]) => entry.contains_personal_data).length,
    credential_tables: tables.filter(([, entry]) => entry.contains_credentials).length
  };
}
