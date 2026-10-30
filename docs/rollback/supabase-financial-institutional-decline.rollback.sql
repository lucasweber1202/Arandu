begin;
do $$ begin
 if (select value from public.fin_settings where key='schema_version') is distinct from 'financial-institutional-decline-1' then raise exception 'rollback order: institutional decline must be latest'; end if;
end $$;
drop function if exists public.fin_decline_provider_invite(text,uuid,text,boolean,text);
-- Existing declined invites and historical evidence remain untouched.
update public.fin_settings set value='financial-negotiation-continuity-1',updated_at=now() where key='schema_version';
notify pgrst,'reload schema';
commit;
