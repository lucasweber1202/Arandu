#!/usr/bin/env node
// Compare old hosted metadata with a canonical LOCAL schema. No rows, function
// bodies, users or secrets are exported; lexical signals are not security proof.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { loopbackTarget } from '../lib/recovery-reconciliation.mjs';

const source=JSON.parse(fs.readFileSync('ops/consolidation/definer-checks-2026-11-04.json','utf8'));
const connection=loopbackTarget(process.env.ARANDU_DATABASE_TEST_URL||'postgresql://postgres:postgres@localhost:5432/postgres');
const result=execFileSync('psql',['-XqAt','-v','ON_ERROR_STOP=1'],{
  env:{PATH:process.env.PATH,HOME:process.env.HOME,...connection},encoding:'utf8',maxBuffer:4*1024*1024,
  input:`begin read only;
    select jsonb_build_object('marker',(select value from public.fin_settings where key='schema_version'),
      'routines',jsonb_agg(jsonb_build_object('name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),
      'body_md5',md5(p.prosrc),'authenticated_execute',has_function_privilege('authenticated',p.oid,'execute'),
      'anon_execute',has_function_privilege('anon',p.oid,'execute'),'config',p.proconfig) order by p.proname,p.oid))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';
    rollback;`
}).trim();
const parsed=JSON.parse(result);
const manifest=JSON.parse(fs.readFileSync('docs/supabase-migrations.json','utf8'));
const last=fs.readFileSync(manifest.cleanInstall.at(-1),'utf8');
const expectedMarker=[...last.matchAll(/\(\s*'schema_version'\s*,\s*'([^']+)'\s*\)/g)].at(-1)?.[1];
assert.equal(parsed.marker,expectedMarker,'Canonical reference marker differs from current code');
const canonical=parsed.routines;
assert(Array.isArray(canonical)&&canonical.some(r=>r.name==='fin_current_session_alive'),'Canonical current schema required');
const matrix=JSON.parse(fs.readFileSync('ops/consolidation/dependency-matrix-2026-11-04.json','utf8'));
const observations=new Map(matrix.security_definers.map(x=>[x.name,x]));
const purposes={
  fin_accept_member_invitation:'Aceitar convite por token único, email Auth confirmado e destinatário persistido; não recebe papel do cliente.',
  fin_accept_provider_invite:'Aceitar convite de RFQ dentro da organização do provedor autenticado.',
  fin_accept_terms:'Registrar aceite próprio de termos da organização autorizada.',
  fin_act_on_approval:'Executar ação humana na etapa atribuída, com estado e alçada autorizados.',
  fin_add_comment:'Criar comentário apenas no objeto/tenant compartilhado autorizado.',
  fin_can_read_document:'Helper booleano de acesso ao documento, via organização ou compartilhamento explícito com provedor.',
  fin_cancel_approval:'Cancelar solicitação de aprovação sob papel e estado permitidos.',
  fin_clear_rfq_editor:'Remover rascunho do editor no escopo autorizado da RFQ.',
  fin_comment_authors:'Projetar autores somente de comentários que o chamador pode ler.',
  fin_create_organization:'Criar nova organização com o próprio ator como membro; gate de acesso e bloqueio de conta.',
  fin_create_rfq:'Criar RFQ sob papel da organização e escopo da entidade.',
  fin_document_authorize_download:'Autorizar URL de download somente após acesso ao documento e registrar evento.',
  fin_document_begin_upload:'Reservar versão de upload sob papel, entidade, MIME, tamanho e objeto autorizados.',
  fin_document_pending_upload:'Consultar upload próprio pendente e recente; versão canônica acrescenta lock/revalidação da autorização.',
  fin_document_remove:'Retirar documento sob papel e escopo autorizados, preservando referência histórica.',
  fin_has_role:'Helper de membership em fin_members, ator Auth e papéis persistidos; não usa papel informado pelo cliente.',
  fin_invite_member:'Convidar membro com papel permitido por administrador da organização.',
  fin_invite_provider:'Convidar provedor para RFQ autorizada e enfileirar email transacional.',
  fin_is_operator:'Helper de papel de plataforma atribuído em tabela protegida; separado de papel empresarial.',
  fin_mark_notifications:'Marcar notificações do próprio usuário na organização autorizada.',
  fin_ops_overview:'Visão operacional minimizada, restrita ao operador de plataforma.',
  fin_ops_trace:'Trace operacional restrito ao operador, com trilha de acesso.',
  fin_process_renewals:'Materializar marcos/tarefas idempotentes dos contratos autorizados, com janela de data limitada.',
  fin_provider_can_comment:'Helper de participação explícita de provedor no objeto, sem acesso ao tenant inteiro.',
  fin_provider_reads_comment:'Helper de leitura de comentário do provedor segundo compartilhamento.',
  fin_record_client_event:'Evento da lista fechada, com organization_id autorizado e actor_id da sessão.',
  fin_record_decision:'Decisão humana/snapshot financeiro; entrada antiga é fechada no contrato canônico mais recente.',
  fin_record_provider_evidence:'Registrar evidência declarada do provedor no tenant autorizado, sem alegar verificação externa.',
  fin_register_contract:'Registrar contrato decorrente de decisão autorizada, sem assinatura ou movimento de recursos.',
  fin_reply_comment:'Responder comentário autorizado e notificar apenas participantes autorizados.',
  fin_request_approval:'Abrir workflow de aprovação da RFQ autorizada, com política/estado atuais.',
  fin_revise_rfq:'Revisar solicitação sob papel, entidade e estado permitidos.',
  fin_save_proposal_draft:'Salvar rascunho institucional sob membership de provedor e convite da RFQ.',
  fin_save_rfq_editor:'Salvar editor da solicitação sob papel e escopo de entidade.',
  fin_search:'Buscar projeções financeiras restritas ao tenant/papel/entidade, sem SQL arbitrário.',
  fin_set_approval_policy:'Alterar política da organização sob papel administrativo autorizado.',
  fin_set_notification_preference:'Preferência de notificação do próprio usuário na organização.',
  fin_start_contract_rfq:'Iniciar RFQ de renovação a partir de contrato autorizado, sem award automático.',
  fin_submit_proposal:'Submeter versão de proposta do provedor convidado, com autoria e estado.',
  fin_transition:'Transição de RFQ por papel e estado financeiro válidos.',
  fin_update_my_member_profile:'Atualizar somente display_name/job_title da própria membership, nunca role.',
  fin_update_organization:'Alterar organização sob papel administrativo persistido.',
  fin_withdraw_proposal:'Retirar proposta somente do provedor autorizado e no estado permitido.'
};
const rows=source.routines.map(r=>{
  assert(purposes[r.name],`Purpose review missing: ${r.name}`);
  const expected=canonical.find(c=>c.name===r.name&&c.arguments===r.arguments);
  const functions=new Set(canonical.map(c=>c.name));
  const helpers=(r.helper_calls||[]).filter(n=>functions.has(n));
  const o=observations.get(r.name);
  return {...r,helper_calls:undefined,purpose:purposes[r.name],authorization_helpers:helpers,
    organization_user_validation:r.role_reference?'Membership/role helper plus object scope; inspect exact body and adversarial tests':
      r.name==='fin_accept_member_invitation'?'Confirmed Auth email + single-use token bound to persisted invitation':
      r.name==='fin_update_my_member_profile'?'UPDATE constrained by organization_id and user_id=auth.uid()':
      r.name==='fin_document_pending_upload'?'uploaded_by=auth.uid(), pending status and ten-minute TTL; canonical authorization recheck differs':
      r.name==='fin_create_organization'?'Self-created organization, persisted actor and pilot access gate':'Delegated authorization helper, not a missing-guard verdict',
    definer_need:'Intentional access to RLS/protected membership, workflow or audit data; SECURITY DEFINER must remain constrained by internal guards and grants.',
    privilege_escalation_risk:'Bypasses table RLS as owner; signature alone is not authorization. Reject forged org/actor/role, stale state and other-tenant objects.',
    canonical:expected||null,hosted_body_matches_canonical:expected?expected.body_md5===r.body_md5:false,
    action:!expected?'UPGRADE_REVIEW_SIGNATURE_CHANGED':!expected.authenticated_execute?'UPGRADE_CLOSE_OLD_ENTRYPOINT':expected.body_md5!==r.body_md5?'UPGRADE_BODY_DRIFT':'RETAIN_REVIEWED_BOUNDARY',
    source_locations:o?.source_evidence||[],negative_test_locations:o?.negative_test_locations||[],
    test_status:'Current canonical SQL suites PASS_LOCAL; hosted negative mutations NOT_RUN. A name occurrence is a location, not proof by itself.'};
});
const report={ref:source.ref,observed_at:source.observed_at,classification:'read_only_hosted_vs_canonical_definer_review',
  canonical_marker:parsed.marker,hosted_changes:'NONE',summary:{routines:rows.length,by_action:rows.reduce((a,r)=>(a[r.action]=(a[r.action]||0)+1,a),{})},routines:rows};
fs.writeFileSync('ops/consolidation/definer-review-2026-11-04.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.summary));
