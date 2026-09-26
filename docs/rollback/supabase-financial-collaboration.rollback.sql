-- Isolated rollback after exporting operational evidence. Apply before enterprise approvals.
drop trigger if exists fin_apply_notification_preference on public.fin_notifications;
drop trigger if exists fin_notify_event on public.fin_events;
drop table if exists public.fin_notification_preferences;
drop table if exists public.fin_notifications;
drop table if exists public.fin_comments;
drop function if exists public.fin_apply_notification_preference();
drop function if exists public.fin_notify_event();
drop function if exists public.fin_set_notification_preference(uuid,text,boolean,boolean);
drop function if exists public.fin_mark_notifications(uuid,uuid[]);
drop function if exists public.fin_add_comment(text,uuid,text,text,uuid[],uuid);
drop function if exists public.fin_provider_can_comment(text,uuid);
drop function if exists public.fin_comment_object_org(text,uuid);
