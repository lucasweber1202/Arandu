-- Export comment threads and renewal milestones before applying in a real environment.
-- Tasks, events and notifications already generated are preserved.
drop function if exists public.fin_run_renewal_schedule(date);
delete from public.fin_renewal_milestones where milestone = 'notice';
alter table public.fin_renewal_milestones drop constraint if exists fin_renewal_milestones_milestone_check;
alter table public.fin_renewal_milestones add constraint fin_renewal_milestones_milestone_check
  check (milestone in ('d180','d120','d90','d60','d30','d7','expired'));
drop trigger if exists fin_enqueue_notification_email on public.fin_notifications;
drop function if exists public.fin_enqueue_notification_email();
drop function if exists public.fin_reply_comment(uuid, text, uuid[], uuid);
alter table public.fin_comments drop constraint if exists fin_comments_parent_fk;
drop index if exists public.fin_comments_parent;
alter table public.fin_comments drop column if exists parent_id;
