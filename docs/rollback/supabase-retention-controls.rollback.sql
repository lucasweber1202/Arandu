-- Arandu — rollback dos controles de retenção e legal hold

drop function if exists public.execute_data_retention(text,boolean,text,text);
drop function if exists public.release_legal_hold(text,text,text,text);
drop function if exists public.create_legal_hold(text,text,text,text);
drop function if exists public.is_under_legal_hold(text,text);
drop table if exists public.data_legal_holds;
drop table if exists public.data_retention_policies;
