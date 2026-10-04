\set ON_ERROR_STOP on
-- Rodada de piloto. Usa a empresa bb01 (ba01 admin, ba04 viewer, ba05
-- finance_manager), a RFQ bb11, o provedor A (bb02, usuário ba07, proposta bb12)
-- e cria um segundo provedor (B) aceito na mesma RFQ.
insert into auth.users(id,email) values
('00000000-0000-4000-8000-0000000000d1','provider-b@example.invalid'),
('00000000-0000-4000-8000-0000000000d2','ops@example.invalid'),
('00000000-0000-4000-8000-0000000000d3','named-member@example.invalid')
on conflict(id) do nothing;
insert into public.fin_organizations(id,legal_name,kind,created_by) values
('00000000-0000-4000-8000-0000000000e1','Provedor B DEMO','PROVIDER','00000000-0000-4000-8000-00000000ba01')
on conflict do nothing;
insert into public.fin_members(organization_id,user_id,role) values
('00000000-0000-4000-8000-0000000000e1','00000000-0000-4000-8000-0000000000d1','provider_user')
on conflict do nothing;
insert into public.fin_providers(id,organization_id,name,kind,created_by) values
('00000000-0000-4000-8000-0000000000e2','00000000-0000-4000-8000-00000000bb01','Provedor B cadastro DEMO','bank','00000000-0000-4000-8000-00000000ba01')
on conflict do nothing;
insert into public.fin_rfq_invites(id,buyer_organization_id,rfq_id,provider_id,provider_organization_id,token_hash,created_by,status,recipient_mode) values
('00000000-0000-4000-8000-0000000000e3','00000000-0000-4000-8000-00000000bb01','00000000-0000-4000-8000-00000000bb11',
 '00000000-0000-4000-8000-0000000000e2','00000000-0000-4000-8000-0000000000e1',repeat('9',64),'00000000-0000-4000-8000-00000000ba01','accepted','organization_open')
on conflict do nothing;
insert into public.fin_proposals(id,invite_id,rfq_id,buyer_organization_id,provider_id,provider_organization_id,product,status,current_version) values
('00000000-0000-4000-8000-0000000000e4','00000000-0000-4000-8000-0000000000e3','00000000-0000-4000-8000-00000000bb11',
 '00000000-0000-4000-8000-00000000bb01','00000000-0000-4000-8000-0000000000e2','00000000-0000-4000-8000-0000000000e1','credit','draft',0)
on conflict do nothing;
create temporary table pg_ids(key text primary key, value uuid, path text);
grant all on pg_ids to authenticated, service_role;

-- ------------------------------------------------ comentários entre provedores
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000d1',false);
do $$
declare v_id uuid;
begin
 v_id := public.fin_add_comment('rfq','00000000-0000-4000-8000-00000000bb11','provider_visible','Pergunta confidencial do provedor B',array[]::uuid[],null);
 insert into pg_ids(key,value) values ('b_question', v_id);
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba01',false);
do $$
declare v_id uuid;
begin
 if not exists(select 1 from public.fin_comments where id=(select value from pg_ids where key='b_question')) then raise exception 'buyer cannot read provider question'; end if;
 v_id := public.fin_add_comment('rfq','00000000-0000-4000-8000-00000000bb11','provider_visible','Esclarecimento a todos os provedores',array[]::uuid[],null);
 insert into pg_ids(key,value) values ('buyer_broadcast', v_id);
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba07',false);
do $$
begin
 if exists(select 1 from public.fin_comments where id=(select value from pg_ids where key='b_question')) then raise exception 'provider A read provider B question'; end if;
 if not exists(select 1 from public.fin_comments where id=(select value from pg_ids where key='buyer_broadcast')) then raise exception 'provider A missed buyer broadcast'; end if;
 if exists(select 1 from public.fin_comment_authors('rfq','00000000-0000-4000-8000-00000000bb11') where author_id='00000000-0000-4000-8000-0000000000d1')
 then raise exception 'provider B identity leaked to provider A'; end if;
 begin
  perform public.fin_reply_comment((select value from pg_ids where key='b_question'),'Tentativa de resposta',array[]::uuid[],null);
  raise exception 'provider A replied to provider B';
 exception when others then if sqlerrm not like '%forbidden%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000d1',false);
do $$
begin
 if not exists(select 1 from public.fin_comments where id=(select value from pg_ids where key='b_question')) then raise exception 'provider B lost own question'; end if;
 if not exists(select 1 from public.fin_comments where id=(select value from pg_ids where key='buyer_broadcast')) then raise exception 'provider B missed buyer broadcast'; end if;
end $$;

-- ------------------------------------------------------------ identidade
reset role;
-- Antes da aposentadoria da arte o nome vinha de public.profiles; depois, dos
-- metadados da conta (docs/supabase-financial-legacy-art-decommission.sql).
do $$ begin
  if to_regclass('public.profiles') is not null then
    execute $q$insert into public.profiles(id,email,full_name) values ('00000000-0000-4000-8000-0000000000d3','named-member@example.invalid','Paula Nogueira')
      on conflict (id) do update set full_name = excluded.full_name$q$;
  else
    update auth.users set raw_user_meta_data = raw_user_meta_data || '{"full_name":"Paula Nogueira"}'::jsonb where id = '00000000-0000-4000-8000-0000000000d3';
  end if;
end $$;
insert into public.fin_members(organization_id,user_id,role) values
('00000000-0000-4000-8000-00000000bb01','00000000-0000-4000-8000-0000000000d3','analyst') on conflict do nothing;
do $$
begin
 if (select display_name from public.fin_members where user_id='00000000-0000-4000-8000-0000000000d3')<>'Paula Nogueira' then raise exception 'display name not defaulted from profile'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000d3',false);
select public.fin_update_my_member_profile('00000000-0000-4000-8000-00000000bb01','Paula Nogueira','Analista de Crédito');
do $$
begin
 if (select job_title from public.fin_members where user_id='00000000-0000-4000-8000-0000000000d3' and organization_id='00000000-0000-4000-8000-00000000bb01')<>'Analista de Crédito'
 then raise exception 'job title not saved'; end if;
 begin
  perform public.fin_update_my_member_profile('00000000-0000-4000-8000-0000000000e1','Invasora','Cargo');
  raise exception 'profile edited in foreign org';
 exception when others then if sqlerrm not like '%forbidden%' then raise; end if; end;
 begin
  perform public.fin_update_my_member_profile('00000000-0000-4000-8000-00000000bb01','<b>x</b>','Cargo');
  raise exception 'markup accepted in display name';
 exception when check_violation then null; end;
 if has_table_privilege('authenticated','public.fin_members','UPDATE') then raise exception 'members directly writable'; end if;
 if exists(select 1 from information_schema.routines r where r.routine_name='fin_comment_authors' and r.data_type ilike '%email%') then raise exception 'author listing exposes email'; end if;
end $$;

-- --------------------------------------- e-mail operacional por tipo de aviso
-- Paula (d3) quer e-mail para aprovação, proposta e renovação, mas não para comentário.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000d3',false);
select public.fin_set_notification_preference('00000000-0000-4000-8000-00000000bb01','approval_requested',true,true);
select public.fin_set_notification_preference('00000000-0000-4000-8000-00000000bb01','proposal_received',true,true);
select public.fin_set_notification_preference('00000000-0000-4000-8000-00000000bb01','renewal_due',true,true);
select public.fin_set_notification_preference('00000000-0000-4000-8000-00000000bb01','comment',true,false);
reset role;
delete from public.transactional_email_outbox where template='finance_notification';
-- Com o envio desligado, nenhum aviso vira e-mail.
update public.fin_settings set value='false' where key='email_enabled';
insert into public.fin_notifications(organization_id,user_id,event_type,object_type,object_id,event_id,title,body) values
('00000000-0000-4000-8000-00000000bb01','00000000-0000-4000-8000-0000000000d3','approval_requested','rfq','00000000-0000-4000-8000-00000000bb11','00000000-0000-4000-8000-0000000000f1','Aprovação aguardando você','Aprovação empresarial DEMO · R$ 100 mil');
do $$ begin
 if exists(select 1 from public.transactional_email_outbox where template='finance_notification') then raise exception 'e-mail queued while disabled'; end if;
end $$;
update public.fin_settings set value='true' where key='email_enabled';
insert into public.fin_notifications(organization_id,user_id,event_type,object_type,object_id,event_id,title,body) values
('00000000-0000-4000-8000-00000000bb01','00000000-0000-4000-8000-0000000000d3','approval_requested','rfq','00000000-0000-4000-8000-00000000bb11','00000000-0000-4000-8000-0000000000f2','Aprovação aguardando você','Aprovação empresarial DEMO · R$ 100 mil'),
('00000000-0000-4000-8000-00000000bb01','00000000-0000-4000-8000-0000000000d3','proposal_received','rfq','00000000-0000-4000-8000-00000000bb11','00000000-0000-4000-8000-0000000000f3','Nova proposta','Provedor B enviou 1,49% a.m.'),
('00000000-0000-4000-8000-00000000bb01','00000000-0000-4000-8000-0000000000d3','renewal_due','contract','00000000-0000-4000-8000-00000000bb11','00000000-0000-4000-8000-0000000000f4','Contrato em renovação','Banco X vence em 30 dias'),
('00000000-0000-4000-8000-00000000bb01','00000000-0000-4000-8000-0000000000d3','comment','rfq','00000000-0000-4000-8000-00000000bb11','00000000-0000-4000-8000-0000000000f5','Comentário','Texto interno');
-- Replay do mesmo aviso não gera segundo e-mail.
insert into public.fin_notifications(organization_id,user_id,event_type,object_type,object_id,event_id,title,body) values
('00000000-0000-4000-8000-00000000bb01','00000000-0000-4000-8000-0000000000d3','approval_requested','rfq','00000000-0000-4000-8000-00000000bb11','00000000-0000-4000-8000-0000000000f2','Aprovação aguardando você','Repetido')
on conflict (user_id,event_type,event_id) do nothing;
do $$
declare v_kinds text[];
begin
 select array_agg(payload->>'kind' order by payload->>'kind') into v_kinds from public.transactional_email_outbox where template='finance_notification';
 if v_kinds is distinct from array['approval','proposal','renewal_due'] then raise exception 'unexpected e-mails %', v_kinds; end if;
 if exists(select 1 from public.transactional_email_outbox where template='finance_notification' and (payload::text ~* 'R\$|1,49|Banco X|Provedor B|DEMO' or payload->>'path' !~ '^/finance/(rfq\.html\?id=|contracts\.html#contract-)[0-9a-f-]{36}$'))
 then raise exception 'e-mail payload leaked content or has unsafe link'; end if;
 if (select count(distinct idempotency_key) from public.transactional_email_outbox where template='finance_notification')<>3 then raise exception 'idempotency keys not unique per notice'; end if;
end $$;
delete from public.transactional_email_outbox where template='finance_notification';
update public.fin_settings set value='false' where key='email_enabled';

-- ------------------------------------------------------------ documentos
reset role;
do $$
begin
 if not exists(select 1 from storage.buckets where id='fin-documents' and public=false and file_size_limit=10485760
   and allowed_mime_types @> array['application/pdf'] and not allowed_mime_types @> array['text/html']) then raise exception 'document bucket not private or unbounded'; end if;
 if has_table_privilege('authenticated','public.fin_private_documents','INSERT') or has_table_privilege('authenticated','public.fin_document_versions','UPDATE')
 then raise exception 'documents directly writable'; end if;
 if has_function_privilege('authenticated','public.fin_document_finalize_upload(uuid,integer,bigint,text)','EXECUTE') then raise exception 'browser can publish a version'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba05',false);
do $$
declare v record;
begin
 select * into v from public.fin_document_begin_upload('00000000-0000-4000-8000-00000000bb01','rfq','00000000-0000-4000-8000-00000000bb11',
   'Balanço 2025','internal','application/pdf',2048,repeat('a',64));
 if v.version<>1 or v.bucket<>'fin-documents' or v.path !~ '^00000000-0000-4000-8000-00000000bb01/' or v.path ~* 'balan' then raise exception 'unexpected upload slot %', v.path; end if;
 insert into pg_ids values ('internal_doc', v.document_id, v.path);
 select * into v from public.fin_document_begin_upload('00000000-0000-4000-8000-00000000bb01','rfq','00000000-0000-4000-8000-00000000bb11',
   'Minuta de garantias','shared','application/vnd.openxmlformats-officedocument.wordprocessingml.document',4096,null);
 insert into pg_ids values ('shared_doc', v.document_id, v.path);
 begin
  perform public.fin_document_begin_upload('00000000-0000-4000-8000-00000000bb01','rfq','00000000-0000-4000-8000-00000000bb11','Script','internal','text/html',10,null);
  raise exception 'html accepted';
 exception when others then if sqlerrm not like '%document type not allowed%' then raise; end if; end;
 begin
  perform public.fin_document_begin_upload('00000000-0000-4000-8000-00000000bb01','rfq','00000000-0000-4000-8000-00000000bb11','Grande','internal','application/pdf',10485761,null);
  raise exception 'oversized accepted';
 exception when others then if sqlerrm not like '%document too large%' then raise; end if; end;
 begin
  perform public.fin_document_begin_upload('00000000-0000-4000-8000-00000000bb01','contract','00000000-0000-4000-8000-00000000bb11','Contrato','shared','application/pdf',10,null);
  raise exception 'contract shared or foreign entity accepted';
 exception when others then if sqlerrm not like '%forbidden%' and sqlerrm not like '%invalid visibility%' then raise; end if; end;
 -- Pendente não aparece para ninguém.
 if exists(select 1 from public.fin_document_versions where document_id=(select value from pg_ids where key='internal_doc')) then raise exception 'pending version visible'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba04',false);
do $$
begin
 begin
  perform public.fin_document_begin_upload('00000000-0000-4000-8000-00000000bb01','rfq','00000000-0000-4000-8000-00000000bb11','Viewer','internal','application/pdf',10,null);
  raise exception 'viewer uploaded';
 exception when others then if sqlerrm not like '%forbidden%' then raise; end if; end;
 if exists(select 1 from public.fin_document_pending_upload((select value from pg_ids where key='internal_doc'),1)) then raise exception 'other user saw pending slot'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba07',false);
do $$
declare v record;
begin
 begin
  perform public.fin_document_begin_upload('00000000-0000-4000-8000-00000000bb01','rfq','00000000-0000-4000-8000-00000000bb11','Provedor na RFQ','internal','application/pdf',10,null);
  raise exception 'provider uploaded to buyer rfq';
 exception when others then if sqlerrm not like '%forbidden%' then raise; end if; end;
 select * into v from public.fin_document_begin_upload('00000000-0000-4000-8000-00000000bb02','proposal','00000000-0000-4000-8000-00000000bb12',
   'Term sheet provedor A','shared','application/pdf',1000,null);
 insert into pg_ids values ('provider_a_doc', v.document_id, v.path);
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000d1',false);
do $$
begin
 begin
  perform public.fin_document_begin_upload('00000000-0000-4000-8000-0000000000e1','proposal','00000000-0000-4000-8000-00000000bb12','Na proposta de A','shared','application/pdf',10,null);
  raise exception 'provider B attached to provider A proposal';
 exception when others then if sqlerrm not like '%forbidden%' then raise; end if; end;
end $$;

-- O servidor confere o objeto e publica; tamanho divergente falha.
reset role;
set role service_role;
do $$
begin
 if public.fin_document_finalize_upload((select value from pg_ids where key='internal_doc'),1,2048,'application/pdf')<>'available' then raise exception 'finalize failed'; end if;
 if public.fin_document_finalize_upload((select value from pg_ids where key='internal_doc'),1,2048,'application/pdf')<>'available' then raise exception 'finalize not idempotent'; end if;
 if public.fin_document_finalize_upload((select value from pg_ids where key='shared_doc'),1,4096,'application/vnd.openxmlformats-officedocument.wordprocessingml.document')<>'available' then raise exception 'shared finalize failed'; end if;
 if public.fin_document_finalize_upload((select value from pg_ids where key='provider_a_doc'),1,999,'application/pdf')<>'failed' then raise exception 'size mismatch accepted'; end if;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba07',false);
do $$
declare v record;
begin
 -- Nova tentativa do provedor A depois da falha vira a versão 2 do mesmo documento.
 select * into v from public.fin_document_begin_upload('00000000-0000-4000-8000-00000000bb02','proposal','00000000-0000-4000-8000-00000000bb12',
   'ignorado','shared','application/pdf',1000,null,(select value from pg_ids where key='provider_a_doc'));
 if v.version<>2 then raise exception 'retry not versioned'; end if;
end $$;
reset role;
set role service_role;
select public.fin_document_finalize_upload((select value from pg_ids where key='provider_a_doc'),2,1000,'application/pdf');
reset role;

-- Versionamento do documento da empresa: v2 não apaga v1.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba05',false);
do $$
declare v record;
begin
 select * into v from public.fin_document_begin_upload('00000000-0000-4000-8000-00000000bb01','rfq','00000000-0000-4000-8000-00000000bb11',
   'x','internal','application/pdf',3000,null,(select value from pg_ids where key='internal_doc'));
 if v.version<>2 then raise exception 'second version not numbered 2'; end if;
end $$;
reset role;
set role service_role;
select public.fin_document_finalize_upload((select value from pg_ids where key='internal_doc'),2,3000,'application/pdf');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba04',false);
do $$
declare v record;
begin
 -- Viewer da empresa lê, baixa a versão atual e a anterior.
 if (select current_version from public.fin_private_documents where id=(select value from pg_ids where key='internal_doc'))<>2 then raise exception 'current version not advanced'; end if;
 if (select count(*) from public.fin_document_versions where document_id=(select value from pg_ids where key='internal_doc'))<>2 then raise exception 'version history lost'; end if;
 select * into v from public.fin_document_authorize_download((select value from pg_ids where key='internal_doc'));
 if v.version<>2 or v.path is null then raise exception 'download of current version failed'; end if;
 select * into v from public.fin_document_authorize_download((select value from pg_ids where key='internal_doc'),1);
 if v.version<>1 then raise exception 'download of previous version failed'; end if;
 -- Documento do provedor A, compartilhado com a empresa.
 select * into v from public.fin_document_authorize_download((select value from pg_ids where key='provider_a_doc'));
 if v.version<>2 then raise exception 'buyer cannot read provider shared doc'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba07',false);
do $$
declare v record;
begin
 begin
  perform public.fin_document_authorize_download((select value from pg_ids where key='internal_doc'));
  raise exception 'provider downloaded internal buyer doc';
 exception when others then if sqlerrm not like '%forbidden%' then raise; end if; end;
 select * into v from public.fin_document_authorize_download((select value from pg_ids where key='shared_doc'));
 if v.version<>1 then raise exception 'provider cannot read shared rfq doc'; end if;
 if exists(select 1 from public.fin_private_documents where id=(select value from pg_ids where key='internal_doc')) then raise exception 'provider listed internal doc'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000d1',false);
do $$
begin
 begin
  perform public.fin_document_authorize_download((select value from pg_ids where key='provider_a_doc'));
  raise exception 'provider B downloaded provider A document';
 exception when others then if sqlerrm not like '%forbidden%' then raise; end if; end;
 if exists(select 1 from public.fin_private_documents where id=(select value from pg_ids where key='provider_a_doc')) then raise exception 'provider B listed provider A document'; end if;
 if exists(select 1 from public.fin_document_versions where document_id=(select value from pg_ids where key='provider_a_doc')) then raise exception 'provider B saw provider A versions'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba06',false);
do $$
begin
 if exists(select 1 from public.fin_private_documents) then raise exception 'outsider listed documents'; end if;
 begin
  perform public.fin_document_authorize_download((select value from pg_ids where key='shared_doc'));
  raise exception 'outsider downloaded shared doc';
 exception when others then if sqlerrm not like '%forbidden%' then raise; end if; end;
end $$;
-- Remoção: provedor não remove documento da empresa; a empresa remove e o histórico fica.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba07',false);
do $$
begin
 begin
  perform public.fin_document_remove((select value from pg_ids where key='shared_doc'));
  raise exception 'provider removed buyer doc';
 exception when others then if sqlerrm not like '%forbidden%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba05',false);
select public.fin_document_remove((select value from pg_ids where key='shared_doc'));
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba07',false);
do $$
begin
 begin
  perform public.fin_document_authorize_download((select value from pg_ids where key='shared_doc'));
  raise exception 'removed doc still downloadable';
 exception when others then if sqlerrm not like '%forbidden%' then raise; end if; end;
end $$;
reset role;
do $$
begin
 if (select count(*) from public.fin_document_versions where document_id=(select value from pg_ids where key='shared_doc'))<>1 then raise exception 'removal destroyed history'; end if;
 if (select count(*) from public.fin_events where event_type='document_uploaded' and metadata->>'document_id'=(select value::text from pg_ids where key='internal_doc'))<>1 then raise exception 'upload not audited once'; end if;
 if (select count(*) from public.fin_events where event_type='document_version_added' and metadata->>'document_id'=(select value::text from pg_ids where key='internal_doc'))<>1 then raise exception 'new version not audited'; end if;
 if (select count(*) from public.fin_events where event_type='document_downloaded')<4 then raise exception 'downloads not audited'; end if;
 if not exists(select 1 from public.fin_events where event_type='document_removed') then raise exception 'removal not audited'; end if;
 if exists(select 1 from public.fin_events where event_type like 'document_%' and (metadata::text ~* 'balan|garantia|term sheet' or metadata ? 'path'))
 then raise exception 'audit trail leaked title or path'; end if;
 -- Upload do provedor compartilhado também aparece na trilha da empresa.
 if not exists(select 1 from public.fin_events where organization_id='00000000-0000-4000-8000-00000000bb01' and event_type='document_version_added'
   and entity_id='00000000-0000-4000-8000-00000000bb11') then raise exception 'provider shared upload not visible to buyer trail'; end if;
end $$;

-- ------------------------------------------------------ console operacional
insert into public.fin_platform_operators(user_id, granted_by) values ('00000000-0000-4000-8000-0000000000d2','teste automatizado') on conflict do nothing;
set role service_role;
select public.fin_record_job_run('renewals','succeeded',2,'req-abc-123',null,now() - interval '1 minute');
select public.fin_record_job_run('renewals','failed',0,'req-def-456','upstream_unavailable',now() - interval '1 minute');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba01',false);
select set_config('request.jwt.claim.aal','aal2',false);
do $$
begin
 begin
  perform public.fin_ops_overview();
  raise exception 'company admin opened ops console';
 exception when others then if sqlerrm not like '%forbidden%' then raise; end if; end;
 if has_table_privilege('authenticated','public.fin_platform_operators','SELECT') or has_table_privilege('authenticated','public.fin_job_runs','SELECT')
 then raise exception 'ops tables readable'; end if;
 if has_function_privilege('authenticated','public.fin_record_job_run(text,text,integer,text,text,timestamptz)','EXECUTE') then raise exception 'browser records job runs'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000d2',false);
-- Operador de plataforma: papel finance_ops no JWT (docs/supabase-financial-final-hardening.sql).
select set_config('request.jwt.claim.app_metadata','{"arandu_role":"finance_ops"}',false);
select set_config('request.jwt.claim.aal','aal1',false);
do $$
begin
 begin
  perform public.fin_ops_overview();
  raise exception 'ops without MFA';
 exception when others then if sqlerrm not like '%mfa required%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.aal','aal2',false);
do $$
declare v jsonb; v_trace jsonb;
begin
 v := public.fin_ops_overview();
 if jsonb_array_length(v->'jobs')<2 or v->>'last_renewal_success' is null then raise exception 'job runs missing'; end if;
 if not (v ? 'outbox' and v ? 'documents' and v ? 'schema_version') then raise exception 'overview incomplete'; end if;
 if (v->'documents'->>'failed_24h')::int<1 then raise exception 'failed upload not counted'; end if;
 if v::text ~* 'example\.invalid|recipient|payload|interest_rate|offered_amount|Balanço|Aprovação empresarial' then raise exception 'overview leaked customer data'; end if;
 v_trace := public.fin_ops_trace('req-def-456', null);
 if v_trace->'jobs'->0->>'error_code'<>'upstream_unavailable' then raise exception 'trace by request id failed'; end if;
 v_trace := public.fin_ops_trace(null, '00000000-0000-4000-8000-00000000bb11');
 if jsonb_array_length(v_trace->'events')=0 or v_trace::text ~ 'metadata|Provedor' then raise exception 'trace by entity failed or leaked metadata'; end if;
 begin
  perform public.fin_ops_trace(null, null);
  raise exception 'blank trace accepted';
 exception when others then if sqlerrm not like '%lookup required%' then raise; end if; end;
end $$;
reset role;
do $$
begin
 if (select count(*) from public.fin_ops_access_log where user_id='00000000-0000-4000-8000-0000000000d2')<3 then raise exception 'ops access not audited'; end if;
end $$;
select set_config('request.jwt.claim.aal','',false);
select set_config('request.jwt.claim.app_metadata','',false);
\echo 'Provider-confidential comments, member identity, private versioned documents with cross-tenant denial and MFA-gated ops console validated.'
