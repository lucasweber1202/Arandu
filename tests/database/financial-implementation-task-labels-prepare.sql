\set ON_ERROR_STOP on
insert into auth.users(id,email) values
('00000000-0000-4000-8000-0000000b1001','task-label-admin@example.invalid')
on conflict(id) do nothing;
insert into public.fin_organizations(id,legal_name,kind,created_by) values
('00000000-0000-4000-8000-0000000b2001','Task label buyer','BUYER','00000000-0000-4000-8000-0000000b1001');
insert into public.fin_members(organization_id,user_id,role) values
('00000000-0000-4000-8000-0000000b2001','00000000-0000-4000-8000-0000000b1001','admin');
insert into public.fin_providers(id,organization_id,name,kind,created_by) values
('00000000-0000-4000-8000-0000000b3001','00000000-0000-4000-8000-0000000b2001','Task label provider','acquirer','00000000-0000-4000-8000-0000000b1001');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000b1001',false);
select public.fin_open_implementation(
  public.fin_import_contract('00000000-0000-4000-8000-0000000b2001',null,
    '00000000-0000-4000-8000-0000000b3001','acquiring','Task label implementation',
    current_date-10,current_date+300,30,false,'BRL','{}'::jsonb,null),
  jsonb_build_object('title','Acquiring task labels','starts_on',current_date,
    'target_go_live',current_date+90,'source_reference','SYNTHETIC-TASK-LABELS'));
reset role;

-- Baseline control: restore two exact old generated labels and one human edit.
update public.fin_implementation_milestones m
set title=replace(m.kind,'_',' ')
where m.kind='pricing_activation';
update public.fin_tasks t set title='Implantação: '||replace(m.kind,'_',' ')
from public.fin_implementation_milestones m
where m.task_id=t.id and m.kind='pricing_activation';
update public.fin_implementation_milestones m
set title='Liquidação confirmada pela equipe'
where m.kind='settlement_validation';
update public.fin_tasks t set title='Validação de liquidação confirmada pela equipe'
from public.fin_implementation_milestones m
where m.task_id=t.id and m.kind='settlement_validation';
select set_config('request.jwt.claim.sub','',false);
