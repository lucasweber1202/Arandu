\set ON_ERROR_STOP on
-- DW-01: workspaces isolados da Demo. Fixtures sintéticas; tudo em transação revertida.
begin;
insert into auth.users(id,email) values
('00000000-0000-4000-8000-0000000d7101','juliana.ramos+ws-aaaaaaaaaa@vittafoods.example'),
('00000000-0000-4000-8000-0000000d7102','juliana.ramos+ws-bbbbbbbbbb@vittafoods.example'),
('00000000-0000-4000-8000-0000000d7103','outsider@example.invalid');
insert into public.fin_organizations(id,legal_name,kind,created_by) values
('00000000-0000-4000-8000-0000000d7201','Vitta A','BUYER','00000000-0000-4000-8000-0000000d7101'),
('00000000-0000-4000-8000-0000000d7202','Vitta B','BUYER','00000000-0000-4000-8000-0000000d7102');

-- 1. Fora de um banco marcado como demonstração, nada funciona.
delete from public.fin_settings where key = 'deployment_environment';
do $$ begin
  begin
    perform public.fin_demo_workspace_claim(repeat('a',64), 240, 1440, 10);
    raise exception 'DW-01: claim rodou sem marcador demo';
  exception when others then
    if sqlerrm not like '%demo workspaces unavailable outside demo%' then raise; end if;
  end;
  begin
    perform public.fin_demo_workspace_active('aaaaaaaaaa');
    raise exception 'DW-01: active rodou sem marcador demo';
  exception when others then
    if sqlerrm not like '%demo workspaces unavailable outside demo%' then raise; end if;
  end;
end $$;
insert into public.fin_settings(key,value) values ('deployment_environment','demo')
  on conflict (key) do update set value = excluded.value;

-- 2. Privilégios: só a service role executa e lê.
do $$ begin
  if has_function_privilege('anon','public.fin_demo_workspace_claim(text,integer,integer,integer)','EXECUTE')
     or has_function_privilege('authenticated','public.fin_demo_workspace_claim(text,integer,integer,integer)','EXECUTE')
     or has_function_privilege('authenticated','public.fin_demo_workspace_resume(uuid,text,integer)','EXECUTE')
     or has_function_privilege('authenticated','public.fin_demo_workspace_active(text)','EXECUTE') then
    raise exception 'DW-01: função de workspace executável por anon/authenticated';
  end if;
  if not has_function_privilege('service_role','public.fin_demo_workspace_claim(text,integer,integer,integer)','EXECUTE') then
    raise exception 'DW-01: service_role sem execute no claim';
  end if;
  if has_table_privilege('authenticated','public.fin_demo_workspaces','SELECT') or has_table_privilege('anon','public.fin_demo_workspaces','SELECT') then
    raise exception 'DW-01: tabela de workspaces legível por anon/authenticated';
  end if;
end $$;

-- 3. Pool: dois prontos; reivindicações independentes, sem dupla entrega.
insert into public.fin_demo_workspaces(id,slug,baseline_version,status,buyer_organization_id,user_ids,ready_at,personas) values
('00000000-0000-4000-8000-0000000d7301','aaaaaaaaaa','vitta-1','ready','00000000-0000-4000-8000-0000000d7201','{00000000-0000-4000-8000-0000000d7101}',now() - interval '2 minutes','{"juliana":"juliana.ramos+ws-aaaaaaaaaa@vittafoods.example"}'),
('00000000-0000-4000-8000-0000000d7302','bbbbbbbbbb','vitta-1','ready','00000000-0000-4000-8000-0000000d7202','{00000000-0000-4000-8000-0000000d7102}',now() - interval '1 minute','{"juliana":"juliana.ramos+ws-bbbbbbbbbb@vittafoods.example"}');
do $$ declare a public.fin_demo_workspaces; b public.fin_demo_workspaces; c public.fin_demo_workspaces; begin
  select * into a from public.fin_demo_workspace_claim(repeat('a',64), 240, 1440, 10);
  select * into b from public.fin_demo_workspace_claim(repeat('b',64), 240, 1440, 10);
  select * into c from public.fin_demo_workspace_claim(repeat('c',64), 240, 1440, 10);
  if a.id is distinct from '00000000-0000-4000-8000-0000000d7301' or b.id is distinct from '00000000-0000-4000-8000-0000000d7302' then raise exception 'DW-01: ordem/entrega do pool incorreta'; end if;
  if c.id is not null then raise exception 'DW-01: pool vazio entregou workspace'; end if;
  if a.status <> 'claimed' or a.expires_at <= now() or a.idle_expires_at > a.expires_at then raise exception 'DW-01: validade incoerente'; end if;
end $$;

-- 4. Retomada exige o token certo; ID manipulado não serve.
do $$ declare r public.fin_demo_workspaces; begin
  select * into r from public.fin_demo_workspace_resume('00000000-0000-4000-8000-0000000d7301', repeat('b',64), 240);
  if r.id is not null then raise exception 'DW-01: retomada com token de outro workspace'; end if;
  select * into r from public.fin_demo_workspace_resume('00000000-0000-4000-8000-0000000d7301', repeat('a',64), 240);
  if r.id is null then raise exception 'DW-01: retomada legítima recusada'; end if;
  if not public.fin_demo_workspace_active('aaaaaaaaaa') then raise exception 'DW-01: workspace ativo não reconhecido'; end if;
  if public.fin_demo_workspace_active('cccccccccc') then raise exception 'DW-01: slug inexistente ativo'; end if;
  begin
    perform public.fin_demo_workspace_resume('00000000-0000-4000-8000-0000000d7301', 'curto', 240);
    raise exception 'DW-01: token malformado aceito';
  exception when others then if sqlerrm not like '%invalid demo workspace resume%' then raise; end if; end;
end $$;

-- 4b. Em montagem opera (o seed); pronto no pool não (ninguém deveria estar logado nele).
insert into public.fin_demo_workspaces(slug,baseline_version,status) values ('dddddddddd','vitta-1','provisioning');
do $$ begin
  if not public.fin_demo_workspace_active('dddddddddd') then raise exception 'DW-01: workspace em montagem bloqueou o seed'; end if;
  update public.fin_demo_workspaces set status = 'ready', ready_at = now() - interval '1 day' where slug = 'dddddddddd';
  if public.fin_demo_workspace_active('dddddddddd') then raise exception 'DW-01: workspace pronto (não reivindicado) ativo'; end if;
  update public.fin_demo_workspaces set status = 'cleaning' where slug = 'dddddddddd';
  if public.fin_demo_workspace_active('dddddddddd') then raise exception 'DW-01: workspace em limpeza ativo'; end if;
end $$;

-- 5. Teto de ativos: com 2 ativos e teto 2, um novo pronto não é entregue.
insert into public.fin_demo_workspaces(slug,baseline_version,status,ready_at) values ('cccccccccc','vitta-1','ready',now());
do $$ declare r public.fin_demo_workspaces; begin
  select * into r from public.fin_demo_workspace_claim(repeat('d',64), 240, 1440, 2);
  if r.id is not null then raise exception 'DW-01: teto de workspaces ativos ignorado'; end if;
end $$;

-- 6. Quotas no banco: organização extra além da quota é recusada.
update public.fin_demo_workspaces set quotas = '{"rfqs":0,"documents":0,"invites":0,"organizations":0}' where slug = 'aaaaaaaaaa';
do $$ begin
  begin
    insert into public.fin_organizations(legal_name,kind,created_by) values ('Extra','BUYER','00000000-0000-4000-8000-0000000d7101');
    raise exception 'DW-01: quota de organizações ignorada';
  exception when others then if sqlerrm not like '%demo workspace quota exceeded%' then raise; end if; end;
  begin
    insert into public.fin_rfqs(organization_id,product,title,owner_id,status,demand) values
      ('00000000-0000-4000-8000-0000000d7201','credit','Quota','00000000-0000-4000-8000-0000000d7101','draft','{}');
    raise exception 'DW-01: quota de RFQs ignorada';
  exception when others then if sqlerrm not like '%demo workspace quota exceeded%' then raise; end if; end;
end $$;
-- Quem não pertence a workspace (cliente real, baseline) não é afetado.
insert into public.fin_organizations(legal_name,kind,created_by) values ('Cliente real fictício','BUYER','00000000-0000-4000-8000-0000000d7103');

-- 7. Expiração: vencido deixa de ser ativo, não retoma e sai do teto na próxima reivindicação.
update public.fin_demo_workspaces set expires_at = now() - interval '1 second', idle_expires_at = now() - interval '1 second' where slug = 'bbbbbbbbbb';
do $$ declare r public.fin_demo_workspaces; begin
  if public.fin_demo_workspace_active('bbbbbbbbbb') then raise exception 'DW-01: workspace vencido ativo'; end if;
  select * into r from public.fin_demo_workspace_resume('00000000-0000-4000-8000-0000000d7302', repeat('b',64), 240);
  if r.id is not null then raise exception 'DW-01: workspace vencido retomado'; end if;
  select * into r from public.fin_demo_workspace_claim(repeat('e',64), 240, 1440, 2);
  if r.slug is distinct from 'cccccccccc' then raise exception 'DW-01: vencido continuou ocupando o teto'; end if;
  if (select status from public.fin_demo_workspaces where slug = 'bbbbbbbbbb') <> 'expired' then raise exception 'DW-01: vencido não marcado'; end if;
end $$;

-- 8. Entradas inválidas.
do $$ begin
  begin
    perform public.fin_demo_workspace_claim(repeat('f',64), 240, 10, 10);
    raise exception 'DW-01: validade absoluta menor que a ociosa aceita';
  exception when others then if sqlerrm not like '%invalid demo workspace claim%' then raise; end if; end;
end $$;
rollback;
