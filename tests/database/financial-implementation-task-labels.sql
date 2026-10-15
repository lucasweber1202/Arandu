\set ON_ERROR_STOP on
do $$
begin
  if (select value from public.fin_settings where key='schema_version') <> 'financial-implementation-task-labels-1' then
    raise exception 'task labels schema marker mismatch';
  end if;
  if not exists (
    select 1 from public.fin_implementation_milestones m
    join public.fin_tasks t on t.id=m.task_id
    where m.kind='pricing_activation' and m.title='Ativação de preços'
      and t.title='Implantação: Ativação de preços'
  ) then raise exception 'generated pricing task label did not localize'; end if;
  if not exists (
    select 1 from public.fin_implementation_milestones m
    join public.fin_tasks t on t.id=m.task_id
    where m.kind='settlement_validation'
      and m.title='Liquidação confirmada pela equipe'
      and t.title='Validação de liquidação confirmada pela equipe'
  ) then raise exception 'human-edited task titles were overwritten'; end if;
  if not exists (
    select 1 from public.fin_implementation_milestones m
    join public.fin_tasks t on t.id=m.task_id
    where m.kind='go_live' and m.title='Entrada em produção'
      and t.title='Implantação: Entrada em produção'
  ) then raise exception 'stable go_live code or generated label missing'; end if;
  if public.fin_implementation_milestone_label('custom_step') <> 'Custom Step' then
    raise exception 'fallback label is unstable';
  end if;
end $$;
