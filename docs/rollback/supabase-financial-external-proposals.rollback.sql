begin;
do $$ begin
 if exists(select 1 from public.fin_external_proposals) then raise exception 'external proposal data exists: use forward fix'; end if;
end $$;
drop trigger if exists fin_decisions_external_context on public.fin_decisions;
drop function if exists public.fin_decision_external_context();
drop trigger if exists external_rfq_scope on public.fin_rfqs;
drop trigger if exists external_document_scope on public.fin_private_documents;
drop function if exists public.fin_external_rfq_scope_guard();
drop function if exists public.fin_external_document_guard();
drop view if exists public.fin_external_proposal_current;
drop function if exists public.fin_external_proposal_review(uuid,integer,text,text,boolean,boolean);
drop function if exists public.fin_external_proposal_save(uuid,uuid,text,integer,uuid,jsonb);
drop function if exists public.fin_external_require_actor(uuid,uuid,text[]);
drop function if exists public.fin_external_terms_valid(text,jsonb);
drop function if exists public.fin_external_proposal_schema();
drop table if exists public.fin_external_proposal_reviews;
drop table if exists public.fin_external_proposal_versions;
drop table if exists public.fin_external_proposals;
drop function if exists public.fin_external_identity_guard();
create or replace function public.fin_governance_export_datasets()
returns table(dataset text, query text) language sql immutable set search_path = '' as $$
  values
    ('organization', 'select * from public.fin_organizations where id = $1'),
    ('legal_entities', 'select * from public.fin_legal_entities where organization_id = $1'),
    ('members', 'select organization_id, user_id, role, entity_scope, display_name, job_title, created_at from public.fin_members where organization_id = $1'),
    ('member_entity_grants', 'select * from public.fin_member_entity_grants where organization_id = $1'),
    ('company_profiles', 'select * from public.fin_company_profiles where organization_id = $1'),
    ('company_profile_history', 'select * from public.fin_company_profile_history where organization_id = $1'),
    ('rfqs', 'select * from public.fin_rfqs where organization_id = $1'),
    ('rfq_revisions', 'select * from public.fin_rfq_revisions where organization_id = $1'),
    ('rfq_profile_snapshots', 'select * from public.fin_rfq_profile_snapshots where organization_id = $1'),
    ('rfq_invites', 'select * from public.fin_rfq_invites where buyer_organization_id = $1'),
    ('proposals', 'select * from public.fin_proposals where buyer_organization_id = $1'),
    ('proposal_versions', 'select v.* from public.fin_proposal_versions v join public.fin_proposals p on p.id = v.proposal_id where p.buyer_organization_id = $1 and p.current_version > 0'),
    ('decisions', 'select * from public.fin_decisions where organization_id = $1'),
    ('contracts', 'select * from public.fin_contracts where organization_id = $1'),
    ('contract_versions', 'select * from public.fin_contract_versions where organization_id = $1'),
    ('contract_amendments', 'select * from public.fin_contract_amendments where organization_id = $1'),
    ('contract_milestones', 'select * from public.fin_contract_milestones where organization_id = $1'),
    ('renewal_milestones', 'select * from public.fin_renewal_milestones where organization_id = $1'),
    ('providers', 'select * from public.fin_providers where organization_id = $1'),
    ('provider_contacts', 'select * from public.fin_provider_contacts where organization_id = $1'),
    ('provider_relationships', 'select * from public.fin_provider_relationships where organization_id = $1'),
    ('provider_issues', 'select * from public.fin_provider_issues where organization_id = $1'),
    ('provider_reviews', 'select * from public.fin_provider_reviews where organization_id = $1'),
    ('scorecard_templates', 'select * from public.fin_scorecard_templates where organization_id = $1'),
    ('facilities', 'select * from public.fin_facilities where organization_id = $1'),
    ('facility_balances', 'select * from public.fin_facility_balances where organization_id = $1'),
    ('facility_repayments', 'select * from public.fin_facility_repayments where organization_id = $1'),
    ('facility_history', 'select * from public.fin_facility_history where organization_id = $1'),
    ('guarantees', 'select * from public.fin_guarantees where organization_id = $1'),
    ('policies', 'select * from public.fin_policies where organization_id = $1'),
    ('policy_versions', 'select * from public.fin_policy_versions where organization_id = $1'),
    ('policy_flags', 'select * from public.fin_policy_flags where organization_id = $1'),
    ('approval_policies', 'select * from public.fin_approval_policies where organization_id = $1'),
    ('approval_requests', 'select * from public.fin_approval_requests where organization_id = $1'),
    ('approval_stages', 'select * from public.fin_approval_stages where organization_id = $1'),
    ('approval_steps', 'select s.* from public.fin_approval_steps s join public.fin_approval_requests a on a.id = s.request_id where a.organization_id = $1'),
    ('policy_exceptions', 'select * from public.fin_policy_exceptions where organization_id = $1'),
    ('approval_delegations', 'select * from public.fin_approval_delegations where organization_id = $1'),
    ('tasks', 'select * from public.fin_tasks where organization_id = $1'),
    ('comments', 'select * from public.fin_comments where organization_id = $1'),
    ('events', 'select * from public.fin_events where organization_id = $1'),
    ('documents', 'select * from public.fin_documents where organization_id = $1'),
    ('private_documents', 'select * from public.fin_private_documents where buyer_organization_id = $1'),
    ('document_versions', 'select v.document_id, v.version, v.mime_type, v.size_bytes, v.sha256, v.status, v.uploaded_by, v.created_at, v.completed_at from public.fin_document_versions v join public.fin_private_documents d on d.id = v.document_id where d.buyer_organization_id = $1'),
    ('service_accounts', 'select * from public.fin_service_accounts where organization_id = $1'),
    ('webhook_endpoints', 'select * from public.fin_webhook_endpoints where organization_id = $1'),
    ('sso_connections', 'select * from public.fin_sso_connections where organization_id = $1'),
    ('sso_domains', 'select * from public.fin_sso_domains where organization_id = $1'),
    ('retention_policies', 'select * from public.fin_retention_policies where organization_id = $1'),
    ('legal_holds', 'select * from public.fin_legal_holds where organization_id = $1'),
    ('value_methodologies', 'select * from public.fin_value_methodologies where organization_id = $1'),
    ('value_records', 'select * from public.fin_value_records where organization_id = $1'),
    ('value_observations', 'select * from public.fin_value_observations where organization_id = $1'),
    ('fee_schedules', 'select * from public.fin_fee_schedules where organization_id = $1'),
    ('fee_schedule_versions', 'select * from public.fin_fee_schedule_versions where organization_id = $1'),
    ('fee_observations', 'select * from public.fin_fee_observations where organization_id = $1'),
    ('fee_variances', 'select * from public.fin_fee_variances where organization_id = $1'),
    ('fee_reviews', 'select * from public.fin_fee_reviews where organization_id = $1'),
    ('opportunity_rules', 'select * from public.fin_opportunity_rules where organization_id = $1'),
    ('opportunities', 'select * from public.fin_opportunities where organization_id = $1'),
    ('opportunity_events', 'select * from public.fin_opportunity_events where organization_id = $1'),
    ('document_extractions', 'select * from public.fin_document_extractions where organization_id = $1'),
    ('extraction_facts', 'select * from public.fin_extraction_facts where organization_id = $1'),
    ('extraction_reviews', 'select * from public.fin_extraction_reviews where organization_id = $1'),
    ('qualification_requirements', 'select * from public.fin_qualification_requirements where organization_id = $1'),
    ('provider_qualifications', 'select * from public.fin_provider_qualifications where organization_id = $1'),
    ('qualification_evidence', 'select * from public.fin_qualification_evidence where organization_id = $1'),
    ('qualification_exceptions', 'select * from public.fin_qualification_exceptions where organization_id = $1'),
    ('qualification_events', 'select * from public.fin_qualification_events where organization_id = $1'),
    ('implementation_plans', 'select * from public.fin_implementation_plans where organization_id = $1'),
    ('implementation_milestones', 'select * from public.fin_implementation_milestones where organization_id = $1'),
    ('implementation_dependencies', 'select * from public.fin_implementation_dependencies where organization_id = $1'),
    ('implementation_issues', 'select * from public.fin_implementation_issues where organization_id = $1'),
    ('implementation_acceptances', 'select * from public.fin_implementation_acceptances where organization_id = $1'),
    ('obligations', 'select * from public.fin_obligations where organization_id = $1'),
    ('covenants', 'select * from public.fin_covenants where organization_id = $1'),
    ('obligation_periods', 'select * from public.fin_obligation_periods where organization_id = $1'),
    ('covenant_measurements', 'select * from public.fin_covenant_measurements where organization_id = $1'),
    ('obligation_evidence', 'select * from public.fin_obligation_evidence where organization_id = $1'),
    ('obligation_reviews', 'select * from public.fin_obligation_reviews where organization_id = $1'),
    ('covenant_waivers', 'select * from public.fin_covenant_waivers where organization_id = $1'),
    ('performance_dimensions', 'select * from public.fin_provider_performance_dimensions where organization_id = $1'),
    ('performance_periods', 'select * from public.fin_provider_performance_periods where organization_id = $1'),
    ('performance_targets', 'select * from public.fin_provider_performance_targets where organization_id = $1'),
    ('performance_observations', 'select * from public.fin_provider_performance_observations where organization_id = $1'),
    ('performance_reviews', 'select * from public.fin_provider_performance_reviews where organization_id = $1'),
    ('spend_records', 'select * from public.fin_spend_records where organization_id = $1'),
    ('spend_reconciliations', 'select * from public.fin_spend_reconciliations where organization_id = $1');
$$;

revoke all on function public.fin_governance_export_datasets() from public,anon,authenticated;
grant execute on function public.fin_governance_export_datasets() to service_role;
update public.fin_settings set value='financial-decision-authorization-1',updated_at=now() where key='schema_version' and value='financial-external-proposals-1';
commit;
