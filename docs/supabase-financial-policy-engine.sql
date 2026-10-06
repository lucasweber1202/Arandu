-- Policy & Approval Engine v2 (guideline §27, §11; addendum v2.1 H.1 item 8;
-- IMPLEMENTATION_MATRIX P0.7-02, P0.7-03 e P0.2-09).
-- Aditivo e idempotente. Rollback: docs/rollback/supabase-financial-policy-engine.rollback.sql
--
-- O que o engine responde, de forma determinística e auditável:
--   "Qual fluxo de aprovação esta operação exige, pela policy vigente desta
--    organização e desta entidade?"
-- Ele NÃO decide se a operação é boa: não há score, ranking nem aprovação
-- automática. Ele deriva QUEM aprova, EM QUE ORDEM, POR QUAL REGRA e SOB QUAL
-- VERSÃO, a partir de regras escritas pelo cliente. Especificação completa e
-- tabela de precedência: docs/FINANCIAL_POLICY_ENGINE.md.
--
-- Modelo:
--   * fin_policies: no máximo uma policy por escopo — grupo (legal_entity_id
--     NULL) ou entidade/unidade. fin_policy_versions guarda as versões; a versão
--     só é editável como rascunho e fica imutável ao ser ativada (o gatilho
--     recusa qualquer mudança de documento depois disso).
--   * Avaliação: policy do grupo + a policy de entidade mais específica
--     (unidade, senão entidade legal mãe). Cada policy é avaliada sozinha; as
--     etapas se SOMAM (entidade não remove exigência do grupo). Sem regra
--     casada, vale o fallback daquela policy. Condição sem fato conhecido
--     (inclusive valor em moeda diferente da regra, sem câmbio) conta como
--     casada: a dúvida acrescenta aprovação, nunca a retira.
--   * Pedido: a avaliação inteira (fatos, regras casadas, plano, SoD) é
--     gravada no pedido e não muda mais. Etapas (fin_approval_stages) com a
--     mesma sequência correm em paralelo; sequências maiores esperam as menores.
--   * Exceção (fin_policy_exceptions) é registro próprio: quem pediu, regra,
--     motivo, evidência, quem decidiu e quando. Exceção aprovada dispensa só o
--     que a regra exigia.
--   * Delegação temporária (fin_approval_delegations) não amplia acesso: o
--     substituto precisa alcançar a entidade e cumprir os papéis da etapa.
--   * Prazos: etapa vencida é escalada (tarefa + aviso) e o pedido inteiro
--     expira na janela da policy. Nada é aprovado por tempo.

-- ------------------------------------------------- 1. catálogo de sinalizadores
-- Sinalizadores de exceção/risco/compliance definidos pelo próprio cliente; quem
-- pede a aprovação os declara e a declaração fica gravada com autor.
create table if not exists public.fin_policy_flags (
  organization_id uuid not null references public.fin_organizations(id),
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  label text not null check (length(trim(label)) between 2 and 120 and label !~ '[<>]'),
  kind text not null check (kind in ('exception','risk','compliance','other')),
  active boolean not null default true,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (organization_id, key)
);

-- ------------------------------------------------- 2. validação do documento
create or replace function public.fin_policy_valid_roles(p jsonb, p_allow_empty boolean default false)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'array'
     and (p_allow_empty or jsonb_array_length(p) > 0)
     and jsonb_array_length(p) <= 4
     and not exists (select 1 from jsonb_array_elements(p) x
                      where jsonb_typeof(x) <> 'string' or x #>> '{}' not in ('admin','finance_manager','analyst','viewer'))
     and (select count(distinct x) from jsonb_array_elements_text(p) x) = jsonb_array_length(p);
$$;

create or replace function public.fin_policy_valid_stage(s jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(s) <> 'object' then return false; end if;
  if exists (select 1 from jsonb_object_keys(s) k where k not in ('key','label','sequence','roles','scope','min_approvals','due_hours','allow_delegation')) then return false; end if;
  if coalesce(s->>'key','') !~ '^[a-z][a-z0-9_]{1,40}$' or jsonb_typeof(s->'label') <> 'string'
     or length(trim(s->>'label')) not between 2 and 120 then return false; end if;
  if jsonb_typeof(s->'sequence') <> 'number' or (s->>'sequence')::numeric not in (1,2,3,4,5,6,7,8,9) then return false; end if;
  if not public.fin_policy_valid_roles(s->'roles') then return false; end if;
  if coalesce(s->>'scope','') not in ('any','group','entity') then return false; end if;
  if jsonb_typeof(s->'min_approvals') <> 'number' or (s->>'min_approvals')::numeric not in (1,2,3,4,5) then return false; end if;
  if s ? 'due_hours' and jsonb_typeof(s->'due_hours') <> 'null'
     and (jsonb_typeof(s->'due_hours') <> 'number' or (s->>'due_hours')::numeric <> trunc((s->>'due_hours')::numeric)
          or (s->>'due_hours')::numeric not between 1 and 720) then return false; end if;
  if s ? 'allow_delegation' and jsonb_typeof(s->'allow_delegation') <> 'boolean' then return false; end if;
  return true;
end $$;

create or replace function public.fin_policy_valid_condition(c jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare v_fact text := c->>'fact'; v_op text := c->>'op'; v jsonb := c->'value';
begin
  if jsonb_typeof(c) <> 'object' then return false; end if;
  if exists (select 1 from jsonb_object_keys(c) k where k not in ('fact','op','value','currency')) then return false; end if;
  if c ? 'currency' and v_fact <> 'amount' then return false; end if;
  case v_fact
    when 'amount' then
      return v_op in ('gte','lt') and jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric between 0 and 1e15
         and coalesce(c->>'currency','') ~ '^[A-Z]{3}$';
    when 'currency' then
      return v_op in ('in','not_in') and jsonb_typeof(v) = 'array' and jsonb_array_length(v) between 1 and 20
         and not exists (select 1 from jsonb_array_elements(v) x where jsonb_typeof(x) <> 'string' or x #>> '{}' !~ '^[A-Z]{3}$');
    when 'product' then
      return v_op in ('in','not_in') and jsonb_typeof(v) = 'array' and jsonb_array_length(v) between 1 and 10
         and not exists (select 1 from jsonb_array_elements(v) x where jsonb_typeof(x) <> 'string' or x #>> '{}' not in ('credit','acquiring'));
    when 'legal_entity' then
      return v_op in ('in','not_in') and jsonb_typeof(v) = 'array' and jsonb_array_length(v) between 1 and 50
         and not exists (select 1 from jsonb_array_elements(v) x where jsonb_typeof(x) <> 'string'
                          or x #>> '{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
    when 'provider_status' then
      return v_op in ('in','not_in') and jsonb_typeof(v) = 'array' and jsonb_array_length(v) between 1 and 2
         and not exists (select 1 from jsonb_array_elements(v) x where jsonb_typeof(x) <> 'string' or x #>> '{}' not in ('NAO_VERIFICADO','EVIDENCIA_REGISTRADA'));
    when 'provider_new', 'guarantee_required', 'covenant_present' then
      return v_op = 'eq' and jsonb_typeof(v) = 'boolean';
    when 'proposals_count' then
      return v_op in ('lt','gte') and jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric in (1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20);
    when 'contract_duration_months' then
      return v_op in ('gt','lte') and jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric = trunc((v #>> '{}')::numeric)
         and (v #>> '{}')::numeric between 0 and 600;
    when 'maturity_date' then
      if not (v_op in ('after','on_or_before') and jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^\d{4}-\d{2}-\d{2}$') then return false; end if;
      begin
        return pg_catalog.to_char((v #>> '{}')::date, 'YYYY-MM-DD') = (v #>> '{}');
      exception when others then return false;
      end;
    when 'flag' then
      return v_op in ('present','absent') and jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^[a-z][a-z0-9_]{1,40}$';
    else return false;
  end case;
end $$;

-- Documento de uma versão de policy. Estrutura (ver docs/FINANCIAL_POLICY_ENGINE.md):
--   { rules: [ { id, label, when: [cond], stages: [stage], requirements: { min_proposals, justification } } ],
--     fallback: null | { stages: [stage], requirements: {...} },
--     sod: { requester_cannot_decide, decider_not_sole_final_approver },
--     exception_approver_roles: [role], escalation_roles: [role], expire_after_hours: null | int }
create or replace function public.fin_policy_valid_document(p jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare r jsonb; s jsonb; c jsonb; v_rule_ids text[] := '{}'; v_sig jsonb := '{}'::jsonb; v_key text; v_this text; v_block jsonb; b record;
begin
  if p is null or jsonb_typeof(p) <> 'object' or length(p::text) > 30000 or p::text ~ '[<>]' then return false; end if;
  if exists (select 1 from jsonb_object_keys(p) k where k not in ('rules','fallback','sod','exception_approver_roles','escalation_roles','expire_after_hours')) then return false; end if;
  if jsonb_typeof(p->'rules') <> 'array' or jsonb_array_length(p->'rules') > 30 then return false; end if;
  if p ? 'sod' then
    if jsonb_typeof(p->'sod') <> 'object'
       or exists (select 1 from jsonb_object_keys(p->'sod') k where k not in ('requester_cannot_decide','decider_not_sole_final_approver'))
       or exists (select 1 from jsonb_each(p->'sod') e where jsonb_typeof(e.value) <> 'boolean') then return false; end if;
  end if;
  if p ? 'exception_approver_roles' and not public.fin_policy_valid_roles(p->'exception_approver_roles') then return false; end if;
  if p ? 'escalation_roles' and not public.fin_policy_valid_roles(p->'escalation_roles') then return false; end if;
  if p ? 'expire_after_hours' and jsonb_typeof(p->'expire_after_hours') <> 'null'
     and (jsonb_typeof(p->'expire_after_hours') <> 'number' or (p->>'expire_after_hours')::numeric <> trunc((p->>'expire_after_hours')::numeric)
          or (p->>'expire_after_hours')::numeric not between 1 and 2160) then return false; end if;
  -- Regras + fallback compartilham a validação de bloco (etapas e requisitos).
  for b in
    select x block, true is_rule from jsonb_array_elements(p->'rules') x
    union all
    select p->'fallback', false where p ? 'fallback' and jsonb_typeof(p->'fallback') <> 'null'
  loop
    v_block := b.block;
    if jsonb_typeof(v_block) <> 'object' then return false; end if;
    if b.is_rule then
      r := v_block;
      if exists (select 1 from jsonb_object_keys(r) k where k not in ('id','label','when','stages','requirements')) then return false; end if;
      if coalesce(r->>'id','') !~ '^[a-z][a-z0-9_]{1,40}$' or (r->>'id') = any(v_rule_ids) then return false; end if;
      v_rule_ids := v_rule_ids || (r->>'id');
      if jsonb_typeof(r->'label') <> 'string' or length(trim(r->>'label')) not between 2 and 160 then return false; end if;
      if jsonb_typeof(coalesce(r->'when','[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(r->'when','[]'::jsonb)) > 10 then return false; end if;
      for c in select * from jsonb_array_elements(coalesce(r->'when','[]'::jsonb)) loop
        if not public.fin_policy_valid_condition(c) then return false; end if;
      end loop;
    else
      if exists (select 1 from jsonb_object_keys(v_block) k where k not in ('stages','requirements')) then return false; end if;
    end if;
    if jsonb_typeof(coalesce(v_block->'stages','[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(v_block->'stages','[]'::jsonb)) > 4 then return false; end if;
    if v_block ? 'requirements' then
      if jsonb_typeof(v_block->'requirements') <> 'object'
         or exists (select 1 from jsonb_object_keys(v_block->'requirements') k where k not in ('min_proposals','justification'))
         or (v_block->'requirements' ? 'min_proposals' and (jsonb_typeof(v_block->'requirements'->'min_proposals') <> 'number'
              or (v_block->'requirements'->>'min_proposals')::numeric not in (2,3,4,5,6,7,8,9,10)))
         or (v_block->'requirements' ? 'justification' and jsonb_typeof(v_block->'requirements'->'justification') <> 'boolean') then return false; end if;
    end if;
    -- Um bloco precisa exigir algo; regra vazia é ruído que confunde a trilha.
    if jsonb_array_length(coalesce(v_block->'stages','[]'::jsonb)) = 0
       and not (coalesce(v_block->'requirements','{}'::jsonb) ? 'min_proposals')
       and coalesce((v_block->'requirements'->>'justification')::boolean, false) is false then return false; end if;
    for s in select * from jsonb_array_elements(coalesce(v_block->'stages','[]'::jsonb)) loop
      if not public.fin_policy_valid_stage(s) then return false; end if;
      -- A mesma chave de etapa dentro de um documento sempre descreve a mesma etapa.
      v_key := s->>'key';
      v_this := (s->>'sequence') || '|' || (select string_agg(x, ',' order by x) from jsonb_array_elements_text(s->'roles') x) || '|' || (s->>'scope');
      if v_sig ? v_key and v_sig->>v_key <> v_this then return false; end if;
      v_sig := v_sig || jsonb_build_object(v_key, v_this);
    end loop;
  end loop;
  return true;
end $$;

-- ------------------------------------------------- 3. policies versionadas
create table if not exists public.fin_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fin_organizations(id),
  legal_entity_id uuid,
  name text not null check (length(trim(name)) between 2 and 160 and name !~ '[<>]'),
  status text not null default 'active' check (status in ('active','retired')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  unique (organization_id, id),
  unique nulls not distinct (organization_id, legal_entity_id),
  foreign key (organization_id, legal_entity_id) references public.fin_legal_entities(organization_id, id),
  check ((status = 'retired') = (retired_at is not null))
);

create table if not exists public.fin_policy_versions (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.fin_policies(id),
  organization_id uuid not null,
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft','active','superseded','retired')),
  document jsonb not null check (public.fin_policy_valid_document(document)),
  change_note text check (change_note is null or (length(trim(change_note)) between 3 and 1000 and change_note !~ '[<>]')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activated_by uuid references auth.users(id),
  activated_at timestamptz,
  ended_at timestamptz,
  unique (policy_id, version),
  unique (organization_id, id),
  foreign key (organization_id, policy_id) references public.fin_policies(organization_id, id),
  check ((status = 'draft') = (activated_at is null)),
  check ((status in ('superseded','retired')) = (ended_at is not null))
);
create unique index if not exists fin_policy_versions_one_active on public.fin_policy_versions(policy_id) where status = 'active';
create unique index if not exists fin_policy_versions_one_draft on public.fin_policy_versions(policy_id) where status = 'draft';
create index if not exists fin_policy_versions_org on public.fin_policy_versions(organization_id, status);

-- Versão ativada é imutável: documento, número e escopo nunca mudam; o estado
-- só avança (active -> superseded/retired). Rascunho pode ser descartado.
create or replace function public.fin_policy_version_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'draft' then return old; end if;
    if current_user = 'service_role' and exists (select 1 from public.fin_settings where key = 'deployment_environment' and value = 'demo') then return old; end if;
    raise exception 'immutable record';
  end if;
  if new.policy_id is distinct from old.policy_id or new.organization_id is distinct from old.organization_id
     or new.version is distinct from old.version or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'immutable record';
  end if;
  if old.status <> 'draft' and (new.document is distinct from old.document or new.change_note is distinct from old.change_note
     or new.activated_by is distinct from old.activated_by or new.activated_at is distinct from old.activated_at) then
    raise exception 'immutable record';
  end if;
  if not ((old.status = new.status) or (old.status = 'draft' and new.status = 'active')
          or (old.status = 'active' and new.status in ('superseded','retired'))) then
    raise exception 'immutable record';
  end if;
  if old.status in ('superseded','retired') and new is distinct from old then raise exception 'immutable record'; end if;
  return new;
end $$;
drop trigger if exists fin_policy_versions_guard on public.fin_policy_versions;
create trigger fin_policy_versions_guard before update or delete on public.fin_policy_versions
  for each row execute function public.fin_policy_version_guard();

-- ------------------------------------------------- 4. pedido, etapas, exceções, delegação
alter table public.fin_approval_requests add column if not exists policy_snapshot jsonb;
alter table public.fin_approval_requests add column if not exists policy_version_ids uuid[];
alter table public.fin_approval_requests add column if not exists evaluated_at timestamptz;
alter table public.fin_approval_requests add column if not exists justification text;
alter table public.fin_approval_requests add column if not exists declared_facts jsonb;
alter table public.fin_approval_requests add column if not exists expires_at timestamptz;
alter table public.fin_approval_requests add column if not exists resolution_note text;
alter table public.fin_approval_requests drop constraint if exists fin_approval_requests_status_check;
alter table public.fin_approval_requests add constraint fin_approval_requests_status_check
  check (status in ('pending','approved','rejected','changes_requested','cancelled','expired','superseded'));
alter table public.fin_approval_requests drop constraint if exists fin_approval_requests_policy_shape;
alter table public.fin_approval_requests add constraint fin_approval_requests_policy_shape check (
  (policy_snapshot is null or jsonb_typeof(policy_snapshot) = 'object')
  and (declared_facts is null or jsonb_typeof(declared_facts) = 'object')
  and (justification is null or (length(trim(justification)) between 10 and 2000 and justification !~ '[<>]'))
  and (resolution_note is null or length(resolution_note) <= 1000)
  and ((policy_snapshot is null) = (evaluated_at is null)));
create index if not exists fin_approval_requests_expiry on public.fin_approval_requests(expires_at) where status = 'pending' and expires_at is not null;

create table if not exists public.fin_approval_stages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.fin_approval_requests(id),
  organization_id uuid not null,
  stage_key text not null check (stage_key ~ '^(group|entity)\.[a-z][a-z0-9_]{1,40}$'),
  label text not null check (length(label) between 2 and 120),
  sequence integer not null check (sequence between 1 and 9),
  roles text[] not null check (cardinality(roles) between 1 and 4 and roles <@ array['admin','finance_manager','analyst','viewer']),
  scope text not null check (scope in ('any','group','entity')),
  min_approvals integer not null check (min_approvals between 1 and 5),
  due_hours integer check (due_hours is null or due_hours between 1 and 720),
  allow_delegation boolean not null default true,
  sources jsonb not null check (jsonb_typeof(sources) = 'array' and jsonb_array_length(sources) between 1 and 60),
  status text not null default 'pending' check (status in ('pending','active','approved','rejected','changes_requested','waived','cancelled','expired','superseded')),
  opened_at timestamptz,
  due_at timestamptz,
  escalated_at timestamptz,
  completed_at timestamptz,
  waived_by uuid,
  unique (request_id, stage_key),
  unique (organization_id, id),
  foreign key (organization_id, request_id) references public.fin_approval_requests(organization_id, id)
);
create index if not exists fin_approval_stages_request on public.fin_approval_stages(request_id, sequence);
create index if not exists fin_approval_stages_due on public.fin_approval_stages(due_at) where status = 'active' and escalated_at is null and due_at is not null;

alter table public.fin_approval_steps add column if not exists stage_id uuid references public.fin_approval_stages(id);
alter table public.fin_approval_steps add column if not exists acted_by uuid references auth.users(id);
alter table public.fin_approval_steps add column if not exists delegation_id uuid;
alter table public.fin_approval_steps add column if not exists reason_code text;
alter table public.fin_approval_steps drop constraint if exists fin_approval_steps_position_check;
alter table public.fin_approval_steps add constraint fin_approval_steps_position_check check (position between 1 and 25);
alter table public.fin_approval_steps drop constraint if exists fin_approval_steps_status_check;
alter table public.fin_approval_steps add constraint fin_approval_steps_status_check
  check (status in ('pending','approved','rejected','changes_requested','not_required','waived','cancelled','expired','superseded'));
alter table public.fin_approval_steps drop constraint if exists fin_approval_steps_reason_code_check;
alter table public.fin_approval_steps add constraint fin_approval_steps_reason_code_check
  check (reason_code is null or reason_code in ('insufficient_competition','terms_outside_policy','missing_documentation','pricing_review','risk_review','compliance_review','budget','other'));
create index if not exists fin_approval_steps_stage on public.fin_approval_steps(stage_id);

create table if not exists public.fin_policy_exceptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  request_id uuid not null,
  policy_version_id uuid not null references public.fin_policy_versions(id),
  rule_id text not null check (rule_id ~ '^([a-z][a-z0-9_]{1,40}|__fallback)$'),
  requested_by uuid not null references auth.users(id),
  reason_code text not null check (reason_code in ('insufficient_competition','urgent_operation','incumbent_continuity','regulatory_requirement','market_constraint','other')),
  reason text not null check (length(trim(reason)) between 10 and 2000 and reason !~ '[<>]'),
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array' and jsonb_array_length(evidence) <= 10 and length(evidence::text) <= 6000 and evidence::text !~ '[<>]'),
  status text not null default 'requested' check (status in ('requested','approved','rejected','cancelled')),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_comment text check (decision_comment is null or (length(trim(decision_comment)) between 3 and 2000 and decision_comment !~ '[<>]')),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, request_id) references public.fin_approval_requests(organization_id, id),
  check ((status in ('approved','rejected')) = (decided_at is not null and decided_by is not null)),
  check (decided_by is null or decided_by <> requested_by)
);
create unique index if not exists fin_policy_exceptions_one_open on public.fin_policy_exceptions(request_id, policy_version_id, rule_id) where status in ('requested','approved');
create index if not exists fin_policy_exceptions_request on public.fin_policy_exceptions(request_id, created_at);

create table if not exists public.fin_approval_delegations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fin_organizations(id),
  delegator_id uuid not null references auth.users(id),
  delegate_id uuid not null references auth.users(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null check (length(trim(reason)) between 3 and 500 and reason !~ '[<>]'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  unique (organization_id, id),
  check (delegator_id <> delegate_id),
  check (ends_at > starts_at and ends_at - starts_at <= interval '90 days'),
  check ((revoked_at is null) = (revoked_by is null))
);
create index if not exists fin_approval_delegations_active on public.fin_approval_delegations(organization_id, delegator_id, delegate_id) where revoked_at is null;

-- Avaliação gravada no pedido é fato histórico: nunca muda depois de escrita.
create or replace function public.fin_approval_snapshot_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.policy_snapshot is null and new.policy_snapshot is not null then raise exception 'immutable record'; end if;
  if old.policy_snapshot is not null and (new.policy_snapshot is distinct from old.policy_snapshot
     or new.policy_version_ids is distinct from old.policy_version_ids or new.evaluated_at is distinct from old.evaluated_at
     or new.declared_facts is distinct from old.declared_facts or new.justification is distinct from old.justification
     or new.expires_at is distinct from old.expires_at) then
    raise exception 'immutable record';
  end if;
  if old.status <> 'pending' and new.status is distinct from old.status then raise exception 'immutable record'; end if;
  return new;
end $$;
drop trigger if exists fin_approval_requests_snapshot_guard on public.fin_approval_requests;
create trigger fin_approval_requests_snapshot_guard before update on public.fin_approval_requests
  for each row execute function public.fin_approval_snapshot_guard();

create or replace function public.fin_approval_stage_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.request_id is distinct from old.request_id or new.organization_id is distinct from old.organization_id
     or new.stage_key is distinct from old.stage_key or new.label is distinct from old.label or new.sequence is distinct from old.sequence
     or new.roles is distinct from old.roles or new.scope is distinct from old.scope or new.min_approvals is distinct from old.min_approvals
     or new.due_hours is distinct from old.due_hours or new.allow_delegation is distinct from old.allow_delegation or new.sources is distinct from old.sources then
    raise exception 'immutable record';
  end if;
  return new;
end $$;
drop trigger if exists fin_approval_stages_guard on public.fin_approval_stages;
create trigger fin_approval_stages_guard before update on public.fin_approval_stages
  for each row execute function public.fin_approval_stage_guard();

-- ------------------------------------------------- 5. RLS
alter table public.fin_policy_flags enable row level security;
alter table public.fin_policy_flags force row level security;
alter table public.fin_policies enable row level security;
alter table public.fin_policies force row level security;
alter table public.fin_policy_versions enable row level security;
alter table public.fin_policy_versions force row level security;
alter table public.fin_approval_stages enable row level security;
alter table public.fin_approval_stages force row level security;
alter table public.fin_policy_exceptions enable row level security;
alter table public.fin_policy_exceptions force row level security;
alter table public.fin_approval_delegations enable row level security;
alter table public.fin_approval_delegations force row level security;
revoke all on public.fin_policy_flags, public.fin_policies, public.fin_policy_versions, public.fin_approval_stages,
  public.fin_policy_exceptions, public.fin_approval_delegations from anon, authenticated;
grant select on public.fin_policy_flags, public.fin_policies, public.fin_policy_versions, public.fin_approval_stages,
  public.fin_policy_exceptions, public.fin_approval_delegations to authenticated;

drop policy if exists fin_policy_flag_read on public.fin_policy_flags;
create policy fin_policy_flag_read on public.fin_policy_flags for select to authenticated
  using (public.fin_group_or_entity_visible(organization_id, null));
drop policy if exists fin_policy_read on public.fin_policies;
create policy fin_policy_read on public.fin_policies for select to authenticated
  using (public.fin_group_or_entity_visible(organization_id, legal_entity_id));
drop policy if exists fin_policy_version_read on public.fin_policy_versions;
create policy fin_policy_version_read on public.fin_policy_versions for select to authenticated
  using (exists (select 1 from public.fin_policies p where p.id = policy_id
                   and public.fin_group_or_entity_visible(p.organization_id, p.legal_entity_id))
         and (status <> 'draft' or public.fin_has_role(organization_id, array['admin'])));
drop policy if exists fin_approval_stage_read on public.fin_approval_stages;
create policy fin_approval_stage_read on public.fin_approval_stages for select to authenticated
  using (exists (select 1 from public.fin_approval_requests r where r.id = request_id
                   and public.fin_has_role(r.organization_id) and public.fin_rfq_visible(r.rfq_id)));
drop policy if exists fin_policy_exception_read on public.fin_policy_exceptions;
create policy fin_policy_exception_read on public.fin_policy_exceptions for select to authenticated
  using (exists (select 1 from public.fin_approval_requests r where r.id = request_id
                   and public.fin_has_role(r.organization_id) and public.fin_rfq_visible(r.rfq_id)));
drop policy if exists fin_approval_delegation_read on public.fin_approval_delegations;
create policy fin_approval_delegation_read on public.fin_approval_delegations for select to authenticated
  using (public.fin_has_role(organization_id)
         and (delegator_id = auth.uid() or delegate_id = auth.uid() or public.fin_has_role(organization_id, array['admin'])));

-- ------------------------------------------------- 6. fatos e avaliação
-- Fatos do processo, sempre lidos do banco; só `covenant_present` e `flags` são
-- declarados por quem pede (e a declaração fica gravada com o pedido).
create or replace function public.fin_policy_facts(p_rfq uuid, p_proposal uuid, p_declared jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r public.fin_rfqs%rowtype; v_terms jsonb; v_provider uuid; v_status text; v_parent uuid; v_currency text;
  v_amount numeric; v_offered numeric; v_duration numeric; v_flags jsonb := '[]'::jsonb; v_cov jsonb := 'null'::jsonb; v_guarantee jsonb := 'null'::jsonb;
begin
  select * into r from public.fin_rfqs where id = p_rfq;
  if not found then return null; end if;
  if p_proposal is not null then
    select v.terms, p.provider_id into v_terms, v_provider
      from public.fin_proposals p join public.fin_proposal_versions v on v.proposal_id = p.id and v.version = p.current_version
     where p.id = p_proposal and p.rfq_id = p_rfq;
    select pr.verification_state into v_status from public.fin_providers pr where pr.id = v_provider;
  end if;
  select e.parent_id, e.currency into v_parent, v_currency from public.fin_legal_entities e where e.id = r.legal_entity_id;
  if r.legal_entity_id is null then select o.base_currency into v_currency from public.fin_organizations o where o.id = r.organization_id; end if;
  -- Valor: o maior entre o pedido e o ofertado (conservador). Adquirência não tem
  -- "valor da operação" comparável; o fato fica desconhecido.
  if r.product = 'credit' then
    v_amount := public.fin_try_numeric(r.demand->>'amount');
    v_offered := public.fin_try_numeric(v_terms->>'offered_amount');
    v_amount := case when v_amount is null then v_offered when v_offered is null then v_amount else greatest(v_amount, v_offered) end;
    v_duration := coalesce(public.fin_try_numeric(v_terms->>'term_months'), public.fin_try_numeric(r.demand->>'term_months'));
    if v_terms is not null then v_guarantee := to_jsonb(length(trim(coalesce(v_terms->>'collateral_required',''))) > 0); end if;
  elsif v_terms is not null then
    v_guarantee := 'false'::jsonb;
  end if;
  if jsonb_typeof(p_declared->'covenant_present') = 'boolean' then v_cov := p_declared->'covenant_present'; end if;
  if jsonb_typeof(p_declared->'flags') = 'array' then
    select coalesce(jsonb_agg(distinct x order by x), '[]'::jsonb) into v_flags
      from jsonb_array_elements_text(p_declared->'flags') x
     where exists (select 1 from public.fin_policy_flags f where f.organization_id = r.organization_id and f.key = x and f.active);
  end if;
  return jsonb_build_object(
    'product', r.product,
    'legal_entity_id', r.legal_entity_id,
    'legal_entity_parent_id', v_parent,
    'currency', v_currency,
    'amount', v_amount,
    'provider_status', v_status,
    'provider_new', case when v_provider is null then null else not exists (
        select 1 from public.fin_contracts c where c.organization_id = r.organization_id and c.provider_id = v_provider) end,
    'proposals_count', (select count(*) from public.fin_proposals p where p.rfq_id = p_rfq and p.current_version > 0 and p.status in ('submitted','revised')),
    'guarantee_required', v_guarantee,
    'covenant_present', v_cov,
    'contract_duration_months', v_duration,
    'maturity_date', case when v_duration is null then null else to_char(current_date + make_interval(months => v_duration::integer), 'YYYY-MM-DD') end,
    'flags', v_flags);
end $$;

-- Resultado de uma condição: match | no | unknown | currency (valor em moeda
-- diferente da regra: sem câmbio, tratado como desconhecido).
create or replace function public.fin_policy_condition(c jsonb, f jsonb)
returns text language plpgsql immutable set search_path = '' as $$
declare v_fact text := c->>'fact'; v_op text := c->>'op'; v jsonb := c->'value'; x jsonb; v_hit boolean;
begin
  if v_fact = 'flag' then
    v_hit := coalesce(f->'flags', '[]'::jsonb) ? (v #>> '{}');
    return case when (v_op = 'present') = v_hit then 'match' else 'no' end;
  end if;
  x := case v_fact when 'legal_entity' then f->'legal_entity_id' else f->v_fact end;
  if x is null or jsonb_typeof(x) = 'null' then
    -- Objeto de nível de grupo não pertence a entidade nenhuma: `in` não casa, `not_in` casa.
    if v_fact = 'legal_entity' then return case when v_op = 'not_in' then 'match' else 'no' end; end if;
    return 'unknown';
  end if;
  case v_fact
    when 'amount' then
      if (c->>'currency') is distinct from (f->>'currency') then return 'currency'; end if;
      v_hit := case v_op when 'gte' then (x #>> '{}')::numeric >= (v #>> '{}')::numeric else (x #>> '{}')::numeric < (v #>> '{}')::numeric end;
    when 'proposals_count' then
      v_hit := case v_op when 'gte' then (x #>> '{}')::numeric >= (v #>> '{}')::numeric else (x #>> '{}')::numeric < (v #>> '{}')::numeric end;
    when 'contract_duration_months' then
      v_hit := case v_op when 'gt' then (x #>> '{}')::numeric > (v #>> '{}')::numeric else (x #>> '{}')::numeric <= (v #>> '{}')::numeric end;
    when 'maturity_date' then
      v_hit := case v_op when 'after' then (x #>> '{}')::date > (v #>> '{}')::date else (x #>> '{}')::date <= (v #>> '{}')::date end;
    when 'provider_new', 'guarantee_required', 'covenant_present' then
      v_hit := x = v;
    when 'legal_entity' then
      v_hit := v ? (x #>> '{}') or (jsonb_typeof(f->'legal_entity_parent_id') = 'string' and v ? (f->>'legal_entity_parent_id'));
      if v_op = 'not_in' then v_hit := not v_hit; end if;
    else
      v_hit := v ? (x #>> '{}');
      if v_op = 'not_in' then v_hit := not v_hit; end if;
  end case;
  return case when v_hit then 'match' else 'no' end;
end $$;

-- Avalia UM documento contra os fatos. Determinístico: mesma entrada, mesmo
-- resultado. Uma condição `no` descarta a regra; desconhecido casa (conservador).
create or replace function public.fin_policy_apply(p_doc jsonb, p_facts jsonb, p_version uuid, p_scope text)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare r jsonb; c jsonb; v_res text; v_no boolean; v_unknown text[]; v_matched jsonb := '[]'::jsonb; v_stages jsonb := '[]'::jsonb;
  v_min integer := 0; v_just boolean := false; v_blockers jsonb := '[]'::jsonb; v_block jsonb; v_rule text; s jsonb; v_any boolean := false;
begin
  for r in select * from jsonb_array_elements(p_doc->'rules') loop
    v_no := false; v_unknown := '{}';
    for c in select * from jsonb_array_elements(coalesce(r->'when','[]'::jsonb)) loop
      v_res := public.fin_policy_condition(c, p_facts);
      if v_res = 'no' then v_no := true; exit; end if;
      if v_res = 'unknown' then v_unknown := array_append(v_unknown, c->>'fact'); end if;
      if v_res = 'currency' then v_unknown := array_append(v_unknown, 'amount_currency'::text); end if;
    end loop;
    continue when v_no;
    v_any := true;
    v_matched := v_matched || jsonb_build_object('policy_version_id', p_version, 'policy_scope', p_scope, 'rule_id', r->>'id',
      'label', r->>'label', 'fallback', false, 'conservative', cardinality(v_unknown) > 0,
      'unknown_facts', to_jsonb((select coalesce(array_agg(distinct u order by u), '{}') from unnest(v_unknown) u)));
  end loop;
  -- Fallback da policy: só quando nenhuma regra dela casou.
  if not v_any and jsonb_typeof(p_doc->'fallback') = 'object' then
    v_matched := jsonb_build_array(jsonb_build_object('policy_version_id', p_version, 'policy_scope', p_scope, 'rule_id', '__fallback',
      'label', 'Fallback da policy', 'fallback', true, 'conservative', false, 'unknown_facts', '[]'::jsonb));
  end if;
  for v_block in select * from jsonb_array_elements(v_matched) loop
    v_rule := v_block->>'rule_id';
    r := case when v_rule = '__fallback' then p_doc->'fallback'
              else (select x from jsonb_array_elements(p_doc->'rules') x where x->>'id' = v_rule) end;
    for s in select * from jsonb_array_elements(coalesce(r->'stages','[]'::jsonb)) loop
      v_stages := v_stages || jsonb_build_object(
        'key', p_scope || '.' || (s->>'key'), 'label', trim(s->>'label'), 'sequence', (s->>'sequence')::integer,
        'roles', (select jsonb_agg(x order by x) from jsonb_array_elements_text(s->'roles') x), 'scope', s->>'scope',
        'min_approvals', (s->>'min_approvals')::integer,
        'due_hours', case when jsonb_typeof(s->'due_hours') = 'number' then (s->>'due_hours')::integer end,
        'allow_delegation', coalesce((s->>'allow_delegation')::boolean, true),
        'source', jsonb_build_object('policy_version_id', p_version, 'rule_id', v_rule),
        'rank', case p_scope when 'entity' then 0 else 1 end);
    end loop;
    if (r->'requirements') ? 'min_proposals' then
      v_min := greatest(v_min, (r->'requirements'->>'min_proposals')::integer);
      if coalesce((p_facts->>'proposals_count')::integer, 0) < (r->'requirements'->>'min_proposals')::integer then
        v_blockers := v_blockers || jsonb_build_object('policy_version_id', p_version, 'rule_id', v_rule, 'kind', 'min_proposals',
          'required', (r->'requirements'->>'min_proposals')::integer, 'actual', coalesce((p_facts->>'proposals_count')::integer, 0));
      end if;
    end if;
    v_just := v_just or coalesce((r->'requirements'->>'justification')::boolean, false);
  end loop;
  return jsonb_build_object('matched', v_matched, 'raw_stages', v_stages, 'min_proposals', v_min, 'justification', v_just, 'blockers', v_blockers);
end $$;

-- Combina policy do grupo + policy da entidade mais específica. Ver tabela de
-- precedência em docs/FINANCIAL_POLICY_ENGINE.md.
create or replace function public.fin_policy_combine(p_facts jsonb, p_versions jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare v jsonb; a jsonb; v_matched jsonb := '[]'::jsonb; v_raw jsonb := '[]'::jsonb; v_blockers jsonb := '[]'::jsonb; v_stages jsonb;
  v_min integer := 0; v_just boolean := false; v_rcd boolean := false; v_dnsfa boolean := false; v_expire integer; v_escalation jsonb := '[]'::jsonb;
  v_policies jsonb := '[]'::jsonb; v_unknown jsonb;
begin
  for v in select * from jsonb_array_elements(p_versions) loop
    a := public.fin_policy_apply(v->'document', p_facts, (v->>'version_id')::uuid, v->>'scope');
    v_policies := v_policies || jsonb_build_object('policy_id', v->'policy_id', 'version_id', v->'version_id', 'version', v->'version',
      'scope', v->'scope', 'legal_entity_id', v->'legal_entity_id', 'name', v->'name',
      'exception_approver_roles', coalesce(v->'document'->'exception_approver_roles', '["admin"]'::jsonb));
    v_matched := v_matched || (a->'matched');
    v_raw := v_raw || (a->'raw_stages');
    v_blockers := v_blockers || (a->'blockers');
    v_min := greatest(v_min, (a->>'min_proposals')::integer);
    v_just := v_just or (a->>'justification')::boolean;
    -- SoD: vale a mais restrita entre as policies aplicáveis.
    v_rcd := v_rcd or coalesce((v->'document'->'sod'->>'requester_cannot_decide')::boolean, false);
    v_dnsfa := v_dnsfa or coalesce((v->'document'->'sod'->>'decider_not_sole_final_approver')::boolean, true);
    if jsonb_typeof(v->'document'->'expire_after_hours') = 'number' then
      v_expire := least(coalesce(v_expire, 100000), (v->'document'->>'expire_after_hours')::integer);
    end if;
    v_escalation := v_escalation || coalesce(v->'document'->'escalation_roles', '["admin"]'::jsonb);
  end loop;
  if jsonb_array_length(p_versions) = 0 then v_dnsfa := true; end if;
  -- Etapas idênticas (mesma sequência, papéis e escopo) viram uma só: maior
  -- mínimo, menor prazo, delegação só se todas permitirem; todas as origens ficam.
  with raw as (
    select s, ord from jsonb_array_elements(v_raw) with ordinality t(s, ord)
  ), grouped as (
    select (s->>'sequence')::integer seq, (s->'roles')::text roles_sig, s->>'scope' scope,
           (array_agg(s->>'key' order by (s->>'rank')::integer, ord))[1] key,
           (array_agg(s->>'label' order by (s->>'rank')::integer, ord))[1] label,
           (array_agg(s->'roles' order by ord))[1] roles,
           max((s->>'min_approvals')::integer) min_approvals,
           min((s->>'due_hours')::integer) due_hours,
           bool_and((s->>'allow_delegation')::boolean) allow_delegation,
           jsonb_agg(s->'source' order by (s->>'rank')::integer, ord) sources,
           min((s->>'rank')::integer) rank
      from raw group by 1, 2, 3
  )
  select coalesce(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'sequence', seq, 'roles', roles, 'scope', scope,
           'min_approvals', min_approvals, 'due_hours', due_hours, 'allow_delegation', allow_delegation, 'sources', sources)
           order by seq, rank, key), '[]'::jsonb)
    into v_stages from grouped;
  select coalesce(jsonb_agg(distinct u order by u), '[]'::jsonb) into v_unknown
    from jsonb_array_elements(v_matched) m, jsonb_array_elements_text(m->'unknown_facts') u;
  return jsonb_build_object(
    'facts', p_facts, 'policies', v_policies, 'matched', v_matched, 'stages', v_stages, 'unknown_facts', v_unknown,
    'requirements', jsonb_build_object('min_proposals', v_min, 'justification', v_just),
    'blockers', v_blockers,
    'sod', jsonb_build_object('requester_cannot_approve', true, 'one_stage_per_person', true, 'buyer_members_only', true,
      'requester_cannot_decide', v_rcd, 'decider_not_sole_final_approver', v_dnsfa),
    'expire_after_hours', v_expire,
    'escalation_roles', (select coalesce(jsonb_agg(distinct x order by x), '["admin"]'::jsonb) from jsonb_array_elements_text(v_escalation) x));
end $$;

-- Avaliação completa de uma RFQ (+ proposta escolhida, + fatos declarados).
create or replace function public.fin_policy_evaluate(p_rfq uuid, p_proposal uuid default null, p_declared jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_entity uuid; v_parent uuid; v_facts jsonb; v_versions jsonb; v_result jsonb; v_legacy boolean; v_entity_policy uuid;
begin
  select organization_id, legal_entity_id into v_org, v_entity from public.fin_rfqs where id = p_rfq;
  if v_org is null then return null; end if;
  select parent_id into v_parent from public.fin_legal_entities where id = v_entity;
  v_facts := public.fin_policy_facts(p_rfq, p_proposal, coalesce(p_declared, '{}'::jsonb));
  -- Policy do grupo + a mais específica entre unidade e entidade legal mãe.
  select q.id into v_entity_policy from public.fin_policies q
   where q.organization_id = v_org and q.status = 'active' and q.legal_entity_id in (v_entity, v_parent)
     and exists (select 1 from public.fin_policy_versions qv where qv.policy_id = q.id and qv.status = 'active')
   order by (q.legal_entity_id = v_entity) desc limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('policy_id', p.id, 'version_id', v.id, 'version', v.version,
           'scope', case when p.legal_entity_id is null then 'group' else 'entity' end, 'legal_entity_id', p.legal_entity_id,
           'name', p.name, 'document', v.document) order by (p.legal_entity_id is null), p.id), '[]'::jsonb)
    into v_versions
    from public.fin_policies p join public.fin_policy_versions v on v.policy_id = p.id and v.status = 'active'
   where p.organization_id = v_org and p.status = 'active'
     and (p.legal_entity_id is null or p.id = v_entity_policy);
  v_result := public.fin_policy_combine(v_facts, v_versions);
  v_legacy := exists (select 1 from public.fin_approval_policies where organization_id = v_org and required_for_decision);
  return v_result || jsonb_build_object(
    'engine', case when jsonb_array_length(v_versions) > 0 then 'policy' else 'legacy' end,
    'engine_version', 1, 'evaluated_at', now(), 'rfq_id', p_rfq, 'proposal_id', p_proposal,
    'legacy_required', v_legacy,
    'approval_required', v_legacy or jsonb_array_length(v_result->'stages') > 0 or jsonb_array_length(v_result->'blockers') > 0);
end $$;

-- Membro elegível para uma etapa: compradora, papel exigido, alcança a entidade
-- do processo, e escopo da etapa (grupo = tesouraria do grupo; entidade =
-- aprovador local com concessão explícita). Ser aprovador NUNCA amplia acesso.
create or replace function public.fin_approval_member_eligible(p_org uuid, p_entity uuid, p_user uuid, p_roles text[], p_scope text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.fin_members m join public.fin_organizations o on o.id = m.organization_id and o.kind = 'BUYER'
     where m.organization_id = p_org and m.user_id = p_user and m.role = any(p_roles)
       and m.role in ('admin','finance_manager','analyst','viewer')
       and (m.entity_scope = 'group' or (p_entity is not null and exists (
             select 1 from public.fin_legal_entities e join public.fin_member_entity_grants g
               on g.organization_id = e.organization_id and g.user_id = m.user_id and (g.entity_id = e.id or g.entity_id = e.parent_id)
              where e.organization_id = p_org and e.id = p_entity)))
       and case p_scope when 'group' then m.entity_scope = 'group'
                        when 'entity' then m.entity_scope = 'entities' and p_entity is not null
                        else true end);
$$;

-- ------------------------------------------------- 7. administração de policies
create or replace function public.fin_save_policy_draft(p_org uuid, p_entity uuid, p_name text, p_document jsonb, p_change_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_policy uuid; v_version uuid; v_next integer; v_bad text;
begin
  if not public.fin_has_role(p_org, array['admin']) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.fin_organizations o where o.id = p_org and o.kind = 'BUYER') then raise exception 'forbidden'; end if;
  if p_entity is not null and not exists (select 1 from public.fin_legal_entities e where e.organization_id = p_org and e.id = p_entity and e.status = 'active') then
    raise exception 'invalid legal entity';
  end if;
  if length(trim(coalesce(p_name,''))) not between 2 and 160 or p_name ~ '[<>]' then raise exception 'invalid policy'; end if;
  if p_document is null or not public.fin_policy_valid_document(p_document) then raise exception 'invalid policy'; end if;
  -- Entidades citadas nas condições precisam ser do próprio grupo.
  select x #>> '{}' into v_bad from jsonb_array_elements(p_document->'rules') r, jsonb_array_elements(coalesce(r->'when','[]'::jsonb)) c,
         jsonb_array_elements(case when c->>'fact' = 'legal_entity' then c->'value' else '[]'::jsonb end) x
   where not exists (select 1 from public.fin_legal_entities e where e.organization_id = p_org and e.id::text = x #>> '{}')
   limit 1;
  if v_bad is not null then raise exception 'invalid policy'; end if;
  select id into v_policy from public.fin_policies where organization_id = p_org and legal_entity_id is not distinct from p_entity for update;
  if v_policy is null then
    insert into public.fin_policies(organization_id, legal_entity_id, name, created_by) values (p_org, p_entity, trim(p_name), auth.uid())
      returning id into v_policy;
  else
    update public.fin_policies set name = trim(p_name) where id = v_policy and name is distinct from trim(p_name);
  end if;
  select id into v_version from public.fin_policy_versions where policy_id = v_policy and status = 'draft' for update;
  if v_version is null then
    select coalesce(max(version), 0) + 1 into v_next from public.fin_policy_versions where policy_id = v_policy;
    insert into public.fin_policy_versions(policy_id, organization_id, version, document, change_note, created_by)
      values (v_policy, p_org, v_next, p_document, nullif(trim(coalesce(p_change_note,'')),''), auth.uid()) returning id into v_version;
  else
    update public.fin_policy_versions set document = p_document, change_note = nullif(trim(coalesce(p_change_note,'')),''), updated_at = now()
     where id = v_version;
  end if;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata, legal_entity_id)
    values (p_org, 'organization', p_org, 'policy_draft_saved', auth.uid(),
            jsonb_build_object('policy_id', v_policy, 'version_id', v_version, 'rules', jsonb_array_length(p_document->'rules')), p_entity);
  return v_version;
exception when check_violation then raise exception 'invalid policy';
end $$;

create or replace function public.fin_activate_policy_version(p_version uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.fin_policy_versions%rowtype; p public.fin_policies%rowtype; v_previous uuid;
begin
  select * into v from public.fin_policy_versions where id = p_version;
  if not found or not public.fin_has_role(v.organization_id, array['admin']) then raise exception 'forbidden'; end if;
  select * into p from public.fin_policies where id = v.policy_id for update;
  select * into v from public.fin_policy_versions where id = p_version for update;
  if v.status <> 'draft' then raise exception 'policy version not draft'; end if;
  if p.legal_entity_id is not null and not exists (select 1 from public.fin_legal_entities e where e.id = p.legal_entity_id and e.status = 'active') then
    raise exception 'invalid legal entity';
  end if;
  update public.fin_policy_versions set status = 'superseded', ended_at = now() where policy_id = v.policy_id and status = 'active'
    returning id into v_previous;
  update public.fin_policy_versions set status = 'active', activated_by = auth.uid(), activated_at = now() where id = p_version;
  update public.fin_policies set status = 'active', retired_at = null where id = v.policy_id and status = 'retired';
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata, legal_entity_id)
    values (v.organization_id, 'organization', v.organization_id, 'policy_activated', auth.uid(),
            jsonb_build_object('policy_id', v.policy_id, 'version_id', v.id, 'version', v.version, 'superseded_version_id', v_previous), p.legal_entity_id);
end $$;

create or replace function public.fin_discard_policy_draft(p_version uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.fin_policy_versions%rowtype; v_entity uuid;
begin
  select * into v from public.fin_policy_versions where id = p_version for update;
  if not found or not public.fin_has_role(v.organization_id, array['admin']) then raise exception 'forbidden'; end if;
  if v.status <> 'draft' then raise exception 'policy version not draft'; end if;
  select legal_entity_id into v_entity from public.fin_policies where id = v.policy_id;
  delete from public.fin_policy_versions where id = p_version;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata, legal_entity_id)
    values (v.organization_id, 'organization', v.organization_id, 'policy_draft_discarded', auth.uid(),
            jsonb_build_object('policy_id', v.policy_id, 'version', v.version), v_entity);
end $$;

-- Aposentar: a policy deixa de valer para pedidos NOVOS; pedidos em andamento
-- seguem a versão gravada neles.
create or replace function public.fin_retire_policy(p_policy uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.fin_policies%rowtype; v_version uuid;
begin
  select * into p from public.fin_policies where id = p_policy for update;
  if not found or not public.fin_has_role(p.organization_id, array['admin']) then raise exception 'forbidden'; end if;
  if p.status = 'retired' then return; end if;
  update public.fin_policy_versions set status = 'retired', ended_at = now() where policy_id = p_policy and status = 'active' returning id into v_version;
  update public.fin_policies set status = 'retired', retired_at = now() where id = p_policy;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata, legal_entity_id)
    values (p.organization_id, 'organization', p.organization_id, 'policy_retired', auth.uid(),
            jsonb_build_object('policy_id', p.id, 'version_id', v_version), p.legal_entity_id);
end $$;

create or replace function public.fin_set_policy_flag(p_org uuid, p_key text, p_label text, p_kind text, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.fin_has_role(p_org, array['admin']) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.fin_organizations o where o.id = p_org and o.kind = 'BUYER') then raise exception 'forbidden'; end if;
  if coalesce(p_key,'') !~ '^[a-z][a-z0-9_]{1,40}$' or length(trim(coalesce(p_label,''))) not between 2 and 120 or p_label ~ '[<>]'
     or coalesce(p_kind,'') not in ('exception','risk','compliance','other') or p_active is null then
    raise exception 'invalid policy';
  end if;
  insert into public.fin_policy_flags(organization_id, key, label, kind, active, updated_by)
    values (p_org, p_key, trim(p_label), p_kind, p_active, auth.uid())
  on conflict (organization_id, key) do update set label = excluded.label, kind = excluded.kind, active = excluded.active,
    updated_by = auth.uid(), updated_at = now();
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (p_org, 'organization', p_org, 'policy_flag_updated', auth.uid(), jsonb_build_object('key', p_key, 'kind', p_kind, 'active', p_active));
end $$;

-- Prévia para a interface: mesma avaliação que o pedido usará, para quem lê a RFQ.
create or replace function public.fin_preview_approval_policy(p_rfq uuid, p_proposal uuid default null, p_declared jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.fin_rfqs where id = p_rfq;
  if v_org is null or not public.fin_has_role(v_org) or not public.fin_rfq_visible(p_rfq) then raise exception 'rfq not found'; end if;
  if p_proposal is not null and not exists (select 1 from public.fin_proposals p where p.id = p_proposal and p.rfq_id = p_rfq) then raise exception 'proposal not eligible'; end if;
  if jsonb_typeof(coalesce(p_declared, '{}'::jsonb)) <> 'object' then raise exception 'invalid policy'; end if;
  return public.fin_policy_evaluate(p_rfq, p_proposal, coalesce(p_declared, '{}'::jsonb));
end $$;

-- Simulação de uma versão (inclusive rascunho) contra fatos informados pelo
-- administrador: nada é lido de processo real, nada é gravado.
create or replace function public.fin_simulate_policy_version(p_version uuid, p_facts jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v public.fin_policy_versions%rowtype; p public.fin_policies%rowtype; v_facts jsonb;
begin
  select * into v from public.fin_policy_versions where id = p_version;
  if not found or not public.fin_has_role(v.organization_id, array['admin']) then raise exception 'forbidden'; end if;
  select * into p from public.fin_policies where id = v.policy_id;
  if jsonb_typeof(coalesce(p_facts, 'null'::jsonb)) <> 'object' or length(p_facts::text) > 4000 then raise exception 'invalid policy'; end if;
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_facts from jsonb_each(p_facts)
   where key in ('product','legal_entity_id','legal_entity_parent_id','currency','amount','provider_status','provider_new','proposals_count',
                 'guarantee_required','covenant_present','contract_duration_months','maturity_date','flags');
  return public.fin_policy_combine(v_facts, jsonb_build_array(jsonb_build_object('policy_id', p.id, 'version_id', v.id, 'version', v.version,
    'scope', case when p.legal_entity_id is null then 'group' else 'entity' end, 'legal_entity_id', p.legal_entity_id, 'name', p.name, 'document', v.document)))
    || jsonb_build_object('simulation', true);
end $$;

-- ------------------------------------------------- 8. pedido com policy
-- p_assignments: { "<stage_key>": ["<user uuid>", ...] } — quem a pessoa indica
-- para cada etapa do plano. O banco confere elegibilidade, mínimo e SoD.
create or replace function public.fin_request_policy_approval(
  p_rfq uuid, p_proposal uuid, p_assignments jsonb, p_rationale text, p_justification text default null, p_declared jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_rfq public.fin_rfqs%rowtype; v_version integer; v_terms jsonb; v_eval jsonb; s jsonb; v_people uuid[] := '{}'; v_user uuid; v_nominees jsonb;
  v_id uuid; v_stage uuid; v_position integer := 0; v_first integer; v_count integer; v_declared jsonb;
begin
  select * into v_rfq from public.fin_rfqs where id = p_rfq for update;
  if not found then raise exception 'rfq not found'; end if;
  if not public.fin_has_role(v_rfq.organization_id, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if v_rfq.status not in ('collecting','comparing') then raise exception 'invalid state'; end if;
  if length(trim(coalesce(p_rationale,''))) not between 1 and 4000 then raise exception 'invalid approval request'; end if;
  if jsonb_typeof(coalesce(p_assignments, 'null'::jsonb)) <> 'object' or jsonb_typeof(coalesce(p_declared, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid approval request';
  end if;
  if exists (select 1 from public.fin_approval_requests where rfq_id = p_rfq and status = 'pending') then raise exception 'approval pending'; end if;
  select p.current_version, v.terms into v_version, v_terms
    from public.fin_proposals p join public.fin_proposal_versions v on v.proposal_id = p.id and v.version = p.current_version
   where p.id = p_proposal and p.rfq_id = p_rfq and p.buyer_organization_id = v_rfq.organization_id and p.status in ('submitted','revised');
  if v_version is null then raise exception 'proposal not eligible'; end if;
  -- Só o que o engine lê fica gravado como declarado.
  v_declared := jsonb_strip_nulls(jsonb_build_object(
    'covenant_present', case when jsonb_typeof(p_declared->'covenant_present') = 'boolean' then p_declared->'covenant_present' end,
    'flags', case when jsonb_typeof(p_declared->'flags') = 'array' then p_declared->'flags' end));
  v_eval := public.fin_policy_evaluate(p_rfq, p_proposal, v_declared);
  -- Plano só com bloqueio (ex.: mínimo de propostas) também abre pedido: é nele
  -- que a exceção é pedida e decidida.
  if v_eval->>'engine' <> 'policy' or (jsonb_array_length(v_eval->'stages') = 0 and jsonb_array_length(v_eval->'blockers') = 0) then
    raise exception 'policy approval not applicable';
  end if;
  if jsonb_array_length(v_eval->'stages') > 8 then raise exception 'policy plan too large'; end if;
  if (v_eval->'requirements'->>'justification')::boolean and length(trim(coalesce(p_justification,''))) < 10 then
    raise exception 'policy justification required';
  end if;
  if exists (select 1 from jsonb_object_keys(p_assignments) k where not exists (select 1 from jsonb_array_elements(v_eval->'stages') x where x->>'key' = k)) then
    raise exception 'invalid approval request';
  end if;
  for s in select * from jsonb_array_elements(v_eval->'stages') loop
    v_nominees := p_assignments->(s->>'key');
    if jsonb_typeof(coalesce(v_nominees, 'null'::jsonb)) <> 'array' or jsonb_array_length(v_nominees) < (s->>'min_approvals')::integer
       or jsonb_array_length(v_nominees) > 5 then
      raise exception 'policy approvers required';
    end if;
    for v_user in select (x #>> '{}')::uuid from jsonb_array_elements(v_nominees) x loop
      -- SoD padrão: quem pede não aprova; ninguém ocupa duas etapas.
      if v_user = auth.uid() then raise exception 'invalid approver'; end if;
      if v_user = any(v_people) then raise exception 'duplicate approver'; end if;
      if not public.fin_approval_member_eligible(v_rfq.organization_id, v_rfq.legal_entity_id, v_user,
               array(select jsonb_array_elements_text(s->'roles')), s->>'scope') then
        raise exception 'policy approver ineligible';
      end if;
      v_people := v_people || v_user;
    end loop;
  end loop;
  insert into public.fin_approval_requests(organization_id, rfq_id, proposal_id, proposal_version, rfq_updated_at, requested_by, rationale, snapshot,
      policy_snapshot, policy_version_ids, evaluated_at, justification, declared_facts, expires_at)
    values (v_rfq.organization_id, p_rfq, p_proposal, v_version, v_rfq.updated_at, auth.uid(), trim(p_rationale),
      jsonb_build_object('proposal_version', v_version, 'terms', v_terms, 'rfq_demand', v_rfq.demand, 'rfq_title', v_rfq.title, 'deadline', v_rfq.response_deadline),
      v_eval, array(select (x->>'version_id')::uuid from jsonb_array_elements(v_eval->'policies') x),
      (v_eval->>'evaluated_at')::timestamptz, nullif(trim(coalesce(p_justification,'')),''), v_declared,
      case when jsonb_typeof(v_eval->'expire_after_hours') = 'number' then now() + make_interval(hours => (v_eval->>'expire_after_hours')::integer) end)
    returning id into v_id;
  v_first := (select min((x->>'sequence')::integer) from jsonb_array_elements(v_eval->'stages') x);
  for s in select * from jsonb_array_elements(v_eval->'stages') loop
    insert into public.fin_approval_stages(request_id, organization_id, stage_key, label, sequence, roles, scope, min_approvals, due_hours,
        allow_delegation, sources, status, opened_at, due_at)
      values (v_id, v_rfq.organization_id, s->>'key', s->>'label', (s->>'sequence')::integer, array(select jsonb_array_elements_text(s->'roles')),
        s->>'scope', (s->>'min_approvals')::integer, (s->>'due_hours')::integer, (s->>'allow_delegation')::boolean, s->'sources',
        case when (s->>'sequence')::integer = v_first then 'active' else 'pending' end,
        case when (s->>'sequence')::integer = v_first then now() end,
        case when (s->>'sequence')::integer = v_first and jsonb_typeof(s->'due_hours') = 'number' then now() + make_interval(hours => (s->>'due_hours')::integer) end)
      returning id into v_stage;
    for v_user in select (x #>> '{}')::uuid from jsonb_array_elements(p_assignments->(s->>'key')) x loop
      v_position := v_position + 1;
      insert into public.fin_approval_steps(request_id, position, approver_id, stage_id) values (v_id, v_position, v_user, v_stage);
    end loop;
  end loop;
  v_count := v_position;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (v_rfq.organization_id, 'rfq', p_rfq, 'approval_requested', auth.uid(), jsonb_build_object('request_id', v_id, 'steps', v_count, 'version', v_version,
      'engine', 'policy', 'stages', jsonb_array_length(v_eval->'stages'), 'policy_versions', jsonb_array_length(v_eval->'policies'),
      'rules', jsonb_array_length(v_eval->'matched'), 'blockers', jsonb_array_length(v_eval->'blockers')));
  return v_id;
end $$;

-- Pedido v1 (aprovadores escolhidos à mão) continua existindo, mas não pula a
-- policy: com plano derivado, o caminho é o pedido com policy.
create or replace function public.fin_request_approval(
  p_rfq uuid, p_proposal uuid, p_approvers uuid[], p_rationale text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_rfq public.fin_rfqs%rowtype; v_version integer; v_id uuid; v_actor uuid; v_position integer := 0; v_terms jsonb; v_eval jsonb;
begin
  select * into v_rfq from public.fin_rfqs where id = p_rfq for update;
  if not found then raise exception 'rfq not found'; end if;
  if not public.fin_has_role(v_rfq.organization_id,array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if v_rfq.status not in ('collecting','comparing') then raise exception 'invalid state'; end if;
  if coalesce(array_length(p_approvers,1),0) not between 1 and 5 or length(trim(coalesce(p_rationale,''))) not between 1 and 4000 then
    raise exception 'invalid approval request';
  end if;
  if exists(select 1 from public.fin_approval_requests where rfq_id = p_rfq and status = 'pending') then raise exception 'approval pending'; end if;
  select p.current_version,v.terms into v_version,v_terms
    from public.fin_proposals p join public.fin_proposal_versions v on v.proposal_id=p.id and v.version=p.current_version
    where p.id=p_proposal and p.rfq_id=p_rfq and p.buyer_organization_id=v_rfq.organization_id and p.status in ('submitted','revised');
  if v_version is null then raise exception 'proposal not eligible'; end if;
  v_eval := public.fin_policy_evaluate(p_rfq, p_proposal, '{}'::jsonb);
  if v_eval->>'engine' = 'policy' and (jsonb_array_length(v_eval->'stages') > 0 or jsonb_array_length(v_eval->'blockers') > 0) then
    raise exception 'policy assignment required';
  end if;
  foreach v_actor in array p_approvers loop
    if v_actor = auth.uid() or not exists(select 1 from public.fin_members m where m.organization_id=v_rfq.organization_id and m.user_id=v_actor and m.role in ('admin','finance_manager','analyst','viewer')) then
      raise exception 'invalid approver';
    end if;
    if p_approvers[1:v_position] @> array[v_actor] then raise exception 'duplicate approver'; end if;
    v_position := v_position+1;
  end loop;
  insert into public.fin_approval_requests(organization_id,rfq_id,proposal_id,proposal_version,rfq_updated_at,requested_by,rationale,snapshot)
    values(v_rfq.organization_id,p_rfq,p_proposal,v_version,v_rfq.updated_at,auth.uid(),trim(p_rationale),
      jsonb_build_object('proposal_version',v_version,'terms',v_terms,'rfq_demand',v_rfq.demand,'rfq_title',v_rfq.title,'deadline',v_rfq.response_deadline))
    returning id into v_id;
  for v_position in 1..array_length(p_approvers,1) loop
    insert into public.fin_approval_steps(request_id,position,approver_id) values(v_id,v_position,p_approvers[v_position]);
  end loop;
  insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
    values(v_rfq.organization_id,'rfq',p_rfq,'approval_requested',auth.uid(),jsonb_build_object('request_id',v_id,'steps',array_length(p_approvers,1),'version',v_version));
  return v_id;
end $$;

-- ------------------------------------------------- 9. ciclo de vida
-- Exceções aprovadas que dispensam uma etapa/bloqueio: uma etapa só é
-- dispensada quando TODAS as regras que a exigiam tiveram exceção aprovada.
create or replace function public.fin_policy_rule_excepted(p_request uuid, p_version uuid, p_rule text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fin_policy_exceptions e where e.request_id = p_request and e.policy_version_id = p_version
                   and e.rule_id = p_rule and e.status = 'approved');
$$;

-- Recalcula o andamento: dispensa etapas cobertas por exceção, abre a próxima
-- sequência e conclui o pedido quando nada mais falta. Nunca aprova por conta
-- própria uma etapa que dependa de pessoa.
create or replace function public.fin_approval_refresh(p_request uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_request public.fin_approval_requests%rowtype; v_seq integer; v_blocked boolean;
begin
  select * into v_request from public.fin_approval_requests where id = p_request;
  if v_request.status <> 'pending' or v_request.policy_snapshot is null then return v_request.status; end if;
  update public.fin_approval_stages st set status = 'waived', completed_at = now(),
         waived_by = (select e.id from public.fin_policy_exceptions e, jsonb_array_elements(st.sources) src
                       where e.request_id = p_request and e.status = 'approved' and e.policy_version_id = (src->>'policy_version_id')::uuid
                         and e.rule_id = src->>'rule_id' order by e.decided_at, e.id limit 1)
   where st.request_id = p_request and st.status in ('pending','active')
     and not exists (select 1 from jsonb_array_elements(st.sources) src
                      where not public.fin_policy_rule_excepted(p_request, (src->>'policy_version_id')::uuid, src->>'rule_id'));
  update public.fin_approval_steps s set status = 'waived' from public.fin_approval_stages st
   where st.id = s.stage_id and st.request_id = p_request and st.status = 'waived' and s.status = 'pending';
  select min(sequence) into v_seq from public.fin_approval_stages where request_id = p_request and status in ('pending','active');
  if v_seq is not null then
    update public.fin_approval_stages set status = 'active', opened_at = now(),
           due_at = case when due_hours is not null then now() + make_interval(hours => due_hours) end
     where request_id = p_request and sequence = v_seq and status = 'pending';
    return 'pending';
  end if;
  select exists (select 1 from jsonb_array_elements(v_request.policy_snapshot->'blockers') b
                  where not public.fin_policy_rule_excepted(p_request, (b->>'policy_version_id')::uuid, b->>'rule_id')) into v_blocked;
  if v_blocked then return 'pending'; end if;
  update public.fin_approval_requests set status = 'approved', resolved_at = now() where id = p_request;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (v_request.organization_id, 'rfq', v_request.rfq_id, 'approval_completed', auth.uid(), jsonb_build_object('request_id', p_request));
  return 'approved';
end $$;

-- Encerra etapas e votos ainda abertos de um pedido que terminou.
create or replace function public.fin_approval_close_open(p_request uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.fin_approval_stages set status = p_status, completed_at = now() where request_id = p_request and status in ('pending','active');
  update public.fin_approval_steps set status = case when p_status in ('expired','superseded') then p_status else 'cancelled' end
   where request_id = p_request and status = 'pending';
end $$;

create or replace function public.fin_act_on_approval_v2(
  p_request uuid, p_action text, p_comment text default null, p_reason_code text default null
) returns text language plpgsql security definer set search_path = '' as $$
declare v_request public.fin_approval_requests%rowtype; v_step public.fin_approval_steps%rowtype; v_stage public.fin_approval_stages%rowtype;
  v_version integer; v_updated timestamptz; v_status text; v_entity uuid; v_delegation uuid; v_done integer; v_step_id uuid;
begin
  -- Mesma ordem de travas da decisão e do pedido: votos concorrentes serializam.
  select * into v_request from public.fin_approval_requests where id = p_request;
  if not found then raise exception 'approval not found'; end if;
  perform 1 from public.fin_rfqs where id = v_request.rfq_id for update;
  select * into v_request from public.fin_approval_requests where id = p_request for update;
  if not public.fin_has_role(v_request.organization_id) then raise exception 'forbidden'; end if;
  if v_request.status <> 'pending' then raise exception 'approval not pending'; end if;
  if v_request.expires_at is not null and v_request.expires_at < now() then raise exception 'approval expired'; end if;
  if p_action not in ('approved','rejected','changes_requested') then raise exception 'invalid approval action'; end if;
  if p_action <> 'approved' and length(trim(coalesce(p_comment,''))) < 3 then raise exception 'approval comment required'; end if;
  if p_reason_code is not null and p_reason_code not in ('insufficient_competition','terms_outside_policy','missing_documentation','pricing_review','risk_review','compliance_review','budget','other') then
    raise exception 'invalid approval action';
  end if;
  select updated_at, legal_entity_id into v_updated, v_entity from public.fin_rfqs where id = v_request.rfq_id;
  select current_version into v_version from public.fin_proposals where id = v_request.proposal_id and status in ('submitted','revised');
  if v_updated is distinct from v_request.rfq_updated_at or v_version is distinct from v_request.proposal_version then raise exception 'approval stale'; end if;
  if v_request.requested_by = auth.uid() then raise exception 'forbidden'; end if;

  if v_request.policy_snapshot is null then
    -- Pedido v1: fila estritamente sequencial, só o aprovador da vez.
    select * into v_step from public.fin_approval_steps where request_id = p_request and status = 'pending' order by position limit 1 for update;
    if not found or v_step.approver_id <> auth.uid() then raise exception 'forbidden'; end if;
    update public.fin_approval_steps set status = p_action, comment = nullif(trim(coalesce(p_comment,'')),''), acted_at = now(), acted_by = auth.uid(), reason_code = p_reason_code
     where id = v_step.id;
    v_status := case when p_action = 'approved' and exists (select 1 from public.fin_approval_steps where request_id = p_request and status = 'pending') then 'pending' else p_action end;
    if v_status <> 'pending' then update public.fin_approval_requests set status = v_status, resolved_at = now() where id = p_request; end if;
    insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
      values (v_request.organization_id, 'rfq', v_request.rfq_id, 'approval_' || p_action, auth.uid(), jsonb_build_object('request_id', p_request, 'step', v_step.position));
    return v_status;
  end if;

  -- Pedido com policy: voto próprio numa etapa ativa...
  select s.* into v_step from public.fin_approval_steps s join public.fin_approval_stages st on st.id = s.stage_id and st.status = 'active'
   where s.request_id = p_request and s.status = 'pending' and s.approver_id = auth.uid() order by s.position limit 1 for update of s;
  if found then
    select * into v_stage from public.fin_approval_stages where id = v_step.stage_id;
    -- Aprovador revogado (papel ou entidade) não vota mais, mesmo indicado.
    if not public.fin_approval_member_eligible(v_request.organization_id, v_entity, auth.uid(), v_stage.roles, v_stage.scope) then
      raise exception 'approver no longer eligible';
    end if;
  else
    -- ...ou como substituto: delegação ativa, etapa que admite delegação,
    -- substituto elegível por si mesmo e fora das demais etapas do pedido.
    select s.id, d.id into v_step_id, v_delegation
      from public.fin_approval_steps s
      join public.fin_approval_stages st on st.id = s.stage_id and st.status = 'active' and st.allow_delegation
      join public.fin_approval_delegations d on d.organization_id = v_request.organization_id and d.delegator_id = s.approver_id
           and d.delegate_id = auth.uid() and d.revoked_at is null and now() >= d.starts_at and now() < d.ends_at
     where s.request_id = p_request and s.status = 'pending'
     order by s.position, d.created_at limit 1;
    if v_step_id is null then raise exception 'forbidden'; end if;
    select * into v_step from public.fin_approval_steps where id = v_step_id for update;
    select * into v_stage from public.fin_approval_stages where id = v_step.stage_id;
    if exists (select 1 from public.fin_approval_steps x where x.request_id = p_request and (x.approver_id = auth.uid() or x.acted_by = auth.uid())) then
      raise exception 'segregation of duties';
    end if;
    if not public.fin_approval_member_eligible(v_request.organization_id, v_entity, auth.uid(), v_stage.roles, v_stage.scope) then
      raise exception 'approver no longer eligible';
    end if;
  end if;

  update public.fin_approval_steps set status = p_action, comment = nullif(trim(coalesce(p_comment,'')),''), acted_at = now(),
         acted_by = auth.uid(), delegation_id = v_delegation, reason_code = p_reason_code
   where id = v_step.id;
  if p_action = 'approved' then
    select count(*) into v_done from public.fin_approval_steps where stage_id = v_stage.id and status = 'approved';
    if v_done >= v_stage.min_approvals then
      update public.fin_approval_stages set status = 'approved', completed_at = now() where id = v_stage.id;
      update public.fin_approval_steps set status = 'not_required' where stage_id = v_stage.id and status = 'pending';
    end if;
    -- Andamento antes do evento: o aviso já encontra a próxima sequência aberta.
    v_status := public.fin_approval_refresh(p_request);
    insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
      values (v_request.organization_id, 'rfq', v_request.rfq_id, 'approval_approved', auth.uid(),
              jsonb_build_object('request_id', p_request, 'step', v_step.position, 'stage', v_stage.stage_key, 'on_behalf_of', case when v_delegation is not null then v_step.approver_id end));
  else
    update public.fin_approval_stages set status = p_action, completed_at = now() where id = v_stage.id;
    update public.fin_approval_requests set status = p_action, resolved_at = now() where id = p_request;
    perform public.fin_approval_close_open(p_request, 'cancelled');
    insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
      values (v_request.organization_id, 'rfq', v_request.rfq_id, 'approval_' || p_action, auth.uid(),
              jsonb_build_object('request_id', p_request, 'step', v_step.position, 'stage', v_stage.stage_key, 'reason_code', p_reason_code,
                                 'on_behalf_of', case when v_delegation is not null then v_step.approver_id end));
    v_status := p_action;
  end if;
  return v_status;
end $$;

create or replace function public.fin_act_on_approval(p_request uuid, p_action text, p_comment text default null)
returns text language sql security definer set search_path = '' as $$
  select public.fin_act_on_approval_v2(p_request, p_action, p_comment, null);
$$;

create or replace function public.fin_cancel_approval(p_request uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_request public.fin_approval_requests%rowtype;
begin
  select * into v_request from public.fin_approval_requests where id = p_request;
  if not found then raise exception 'approval not found'; end if;
  perform 1 from public.fin_rfqs where id = v_request.rfq_id for update;
  select * into v_request from public.fin_approval_requests where id = p_request for update;
  if not public.fin_has_role(v_request.organization_id, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if v_request.status <> 'pending' then raise exception 'approval not pending'; end if;
  update public.fin_approval_requests set status = 'cancelled', resolved_at = now() where id = p_request;
  perform public.fin_approval_close_open(p_request, 'cancelled');
  update public.fin_policy_exceptions set status = 'cancelled' where request_id = p_request and status = 'requested';
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (v_request.organization_id, 'rfq', v_request.rfq_id, 'approval_cancelled', auth.uid(), jsonb_build_object('request_id', p_request));
end $$;

-- Substituição explícita: o pedido em andamento é encerrado como `superseded`
-- (por exemplo, para reavaliar sob uma nova versão de policy). Nunca acontece
-- sozinho: a nova versão não troca o plano de um pedido aberto.
create or replace function public.fin_supersede_approval(p_request uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_request public.fin_approval_requests%rowtype;
begin
  select * into v_request from public.fin_approval_requests where id = p_request;
  if not found then raise exception 'approval not found'; end if;
  perform 1 from public.fin_rfqs where id = v_request.rfq_id for update;
  select * into v_request from public.fin_approval_requests where id = p_request for update;
  if not public.fin_has_role(v_request.organization_id, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if v_request.status <> 'pending' then raise exception 'approval not pending'; end if;
  if length(trim(coalesce(p_reason,''))) not between 3 and 1000 or p_reason ~ '[<>]' then raise exception 'approval comment required'; end if;
  update public.fin_approval_requests set status = 'superseded', resolved_at = now(), resolution_note = trim(p_reason) where id = p_request;
  perform public.fin_approval_close_open(p_request, 'superseded');
  update public.fin_policy_exceptions set status = 'cancelled' where request_id = p_request and status = 'requested';
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (v_request.organization_id, 'rfq', v_request.rfq_id, 'approval_superseded', auth.uid(), jsonb_build_object('request_id', p_request));
end $$;

-- ------------------------------------------------- 10. exceções
create or replace function public.fin_request_policy_exception(
  p_request uuid, p_policy_version uuid, p_rule text, p_reason_code text, p_reason text, p_evidence jsonb default '[]'::jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_request public.fin_approval_requests%rowtype; v_id uuid; x jsonb;
begin
  select * into v_request from public.fin_approval_requests where id = p_request;
  if not found then raise exception 'approval not found'; end if;
  perform 1 from public.fin_rfqs where id = v_request.rfq_id for update;
  select * into v_request from public.fin_approval_requests where id = p_request for update;
  if not public.fin_has_role(v_request.organization_id, array['admin','finance_manager']) or not public.fin_rfq_visible(v_request.rfq_id) then raise exception 'forbidden'; end if;
  if v_request.status <> 'pending' or v_request.policy_snapshot is null then raise exception 'approval not pending'; end if;
  if not exists (select 1 from jsonb_array_elements(v_request.policy_snapshot->'matched') m
                  where m->>'policy_version_id' = p_policy_version::text and m->>'rule_id' = p_rule) then
    raise exception 'invalid policy exception';
  end if;
  if jsonb_typeof(coalesce(p_evidence, '[]'::jsonb)) <> 'array' then raise exception 'invalid policy exception'; end if;
  for x in select * from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb)) loop
    if jsonb_typeof(x) <> 'object' or exists (select 1 from jsonb_object_keys(x) k where k not in ('label','document_id','reference'))
       or length(trim(coalesce(x->>'label',''))) not between 2 and 160
       or (x ? 'reference' and length(coalesce(x->>'reference','')) not between 3 and 300)
       or (x ? 'document_id' and not exists (select 1 from public.fin_documents d where d.id::text = x->>'document_id'
                                               and d.organization_id = v_request.organization_id and public.fin_can_read_document(d.id))) then
      raise exception 'invalid policy exception';
    end if;
  end loop;
  insert into public.fin_policy_exceptions(organization_id, request_id, policy_version_id, rule_id, requested_by, reason_code, reason, evidence)
    values (v_request.organization_id, p_request, p_policy_version, p_rule, auth.uid(), p_reason_code, trim(p_reason), coalesce(p_evidence, '[]'::jsonb))
    returning id into v_id;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (v_request.organization_id, 'rfq', v_request.rfq_id, 'policy_exception_requested', auth.uid(),
            jsonb_build_object('request_id', p_request, 'exception_id', v_id, 'rule_id', p_rule, 'reason_code', p_reason_code));
  return v_id;
exception
  when unique_violation then raise exception 'policy exception already open';
  when check_violation then raise exception 'invalid policy exception';
end $$;

-- Quem decide: papel definido pela policy dona da regra (padrão admin), com
-- acesso à entidade, e nunca quem pediu a exceção nem quem pediu a aprovação.
create or replace function public.fin_decide_policy_exception(p_exception uuid, p_decision text, p_comment text)
returns text language plpgsql security definer set search_path = '' as $$
declare e public.fin_policy_exceptions%rowtype; v_request public.fin_approval_requests%rowtype; v_roles text[]; v_entity uuid; v_status text;
begin
  select * into e from public.fin_policy_exceptions where id = p_exception;
  if not found then raise exception 'policy exception not found'; end if;
  select * into v_request from public.fin_approval_requests where id = e.request_id;
  perform 1 from public.fin_rfqs where id = v_request.rfq_id for update;
  select * into v_request from public.fin_approval_requests where id = e.request_id for update;
  select * into e from public.fin_policy_exceptions where id = p_exception for update;
  if not public.fin_has_role(e.organization_id) then raise exception 'forbidden'; end if;
  if e.status <> 'requested' or v_request.status <> 'pending' then raise exception 'policy exception closed'; end if;
  if p_decision not in ('approved','rejected') or length(trim(coalesce(p_comment,''))) < 3 then raise exception 'invalid policy exception'; end if;
  if auth.uid() in (e.requested_by, v_request.requested_by) then raise exception 'segregation of duties'; end if;
  select array(select jsonb_array_elements_text(coalesce(v.document->'exception_approver_roles', '["admin"]'::jsonb))) into v_roles
    from public.fin_policy_versions v where v.id = e.policy_version_id;
  select legal_entity_id into v_entity from public.fin_rfqs where id = v_request.rfq_id;
  if not public.fin_approval_member_eligible(e.organization_id, v_entity, auth.uid(), v_roles, 'any') then raise exception 'forbidden'; end if;
  update public.fin_policy_exceptions set status = p_decision, decided_by = auth.uid(), decided_at = now(), decision_comment = trim(p_comment) where id = p_exception;
  v_status := public.fin_approval_refresh(e.request_id);
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (e.organization_id, 'rfq', v_request.rfq_id, 'policy_exception_' || p_decision, auth.uid(),
            jsonb_build_object('request_id', e.request_id, 'exception_id', e.id, 'rule_id', e.rule_id));
  return v_status;
end $$;

create or replace function public.fin_cancel_policy_exception(p_exception uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.fin_policy_exceptions%rowtype; v_rfq uuid;
begin
  select * into e from public.fin_policy_exceptions where id = p_exception for update;
  if not found then raise exception 'policy exception not found'; end if;
  if not (e.requested_by = auth.uid() or public.fin_has_role(e.organization_id, array['admin'])) then raise exception 'forbidden'; end if;
  if e.status <> 'requested' then raise exception 'policy exception closed'; end if;
  update public.fin_policy_exceptions set status = 'cancelled' where id = p_exception;
  select rfq_id into v_rfq from public.fin_approval_requests where id = e.request_id;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (e.organization_id, 'rfq', v_rfq, 'policy_exception_cancelled', auth.uid(), jsonb_build_object('request_id', e.request_id, 'exception_id', e.id));
end $$;

-- ------------------------------------------------- 11. delegação
create or replace function public.fin_set_approval_delegation(p_org uuid, p_delegate uuid, p_starts timestamptz, p_ends timestamptz, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.fin_has_role(p_org, array['admin','finance_manager','analyst','viewer']) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.fin_organizations o where o.id = p_org and o.kind = 'BUYER') then raise exception 'forbidden'; end if;
  if p_delegate is null or p_delegate = auth.uid() or not exists (select 1 from public.fin_members m where m.organization_id = p_org and m.user_id = p_delegate
       and m.role in ('admin','finance_manager','analyst','viewer')) then
    raise exception 'invalid delegation';
  end if;
  if p_starts is null or p_ends is null or p_ends <= p_starts or p_ends <= now() or p_ends - p_starts > interval '90 days'
     or length(trim(coalesce(p_reason,''))) not between 3 and 500 or p_reason ~ '[<>]' then
    raise exception 'invalid delegation';
  end if;
  insert into public.fin_approval_delegations(organization_id, delegator_id, delegate_id, starts_at, ends_at, reason, created_by)
    values (p_org, auth.uid(), p_delegate, p_starts, p_ends, trim(p_reason), auth.uid()) returning id into v_id;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (p_org, 'organization', p_org, 'approval_delegation_created', auth.uid(), jsonb_build_object('delegation_id', v_id, 'delegate_id', p_delegate,
            'starts_at', p_starts, 'ends_at', p_ends));
  return v_id;
end $$;

create or replace function public.fin_revoke_approval_delegation(p_delegation uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.fin_approval_delegations%rowtype;
begin
  select * into d from public.fin_approval_delegations where id = p_delegation for update;
  if not found or not (d.delegator_id = auth.uid() or public.fin_has_role(d.organization_id, array['admin'])) or not public.fin_has_role(d.organization_id) then
    raise exception 'forbidden';
  end if;
  if d.revoked_at is not null then return; end if;
  update public.fin_approval_delegations set revoked_at = now(), revoked_by = auth.uid() where id = p_delegation;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (d.organization_id, 'organization', d.organization_id, 'approval_delegation_revoked', auth.uid(), jsonb_build_object('delegation_id', d.id));
end $$;

-- ------------------------------------------------- 12. decisão
-- Mesma decisão de antes + policy. Com pedido de policy, valem o snapshot e a
-- SoD gravados nele. Sem pedido, a avaliação corrente diz se a aprovação era exigida.
create or replace function public.fin_record_decision(
  p_rfq uuid, p_proposal uuid, p_criteria jsonb default '{}'::jsonb, p_rationale text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_status text; v_snapshot jsonb; v_id uuid; v_version integer; v_approval public.fin_approval_requests%rowtype; v_updated timestamptz;
  v_eval jsonb; v_final integer; v_actors uuid[];
begin
  select organization_id,status,updated_at into v_org,v_status,v_updated from public.fin_rfqs where id=p_rfq for update;
  if v_org is null then raise exception 'rfq not found'; end if;
  if not public.fin_has_role(v_org,array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if v_status not in ('collecting','comparing') then raise exception 'invalid state'; end if;
  if jsonb_typeof(coalesce(p_criteria,'null'::jsonb)) is distinct from 'object' then raise exception 'invalid criteria'; end if;
  if exists(select 1 from public.fin_decisions where rfq_id=p_rfq) then raise exception 'decision already recorded'; end if;
  select current_version into v_version from public.fin_proposals
    where id=p_proposal and rfq_id=p_rfq and buyer_organization_id=v_org and status in ('submitted','revised');
  if v_version is null then raise exception 'proposal not eligible'; end if;
  select * into v_approval from public.fin_approval_requests where rfq_id=p_rfq order by requested_at desc,id desc limit 1;
  if v_approval.id is null then
    -- Sem pedido: a exigência é a da policy vigente agora (inclui a política v1).
    v_eval := public.fin_policy_evaluate(p_rfq, p_proposal, '{}'::jsonb);
    if coalesce((v_eval->>'approval_required')::boolean, false) then raise exception 'approval required or stale'; end if;
    if coalesce((v_eval->'requirements'->>'justification')::boolean, false) and length(trim(coalesce(p_rationale,''))) < 10 then
      raise exception 'policy justification required';
    end if;
  elsif v_approval.status <> 'approved' or v_approval.proposal_id <> p_proposal
    or v_approval.proposal_version <> v_version or v_approval.rfq_updated_at is distinct from v_updated then
    raise exception 'approval required or stale';
  elsif v_approval.policy_snapshot is not null then
    v_eval := v_approval.policy_snapshot;
    if coalesce((v_eval->'sod'->>'requester_cannot_decide')::boolean, false) and v_approval.requested_by = auth.uid() then
      raise exception 'segregation of duties';
    end if;
    if coalesce((v_eval->'sod'->>'decider_not_sole_final_approver')::boolean, true) then
      select max(st.sequence) into v_final from public.fin_approval_stages st where st.request_id = v_approval.id and st.status = 'approved';
      select array_agg(distinct s.acted_by) into v_actors from public.fin_approval_steps s join public.fin_approval_stages st on st.id = s.stage_id
       where st.request_id = v_approval.id and st.sequence = v_final and st.status = 'approved' and s.status = 'approved';
      if v_actors = array[auth.uid()] then raise exception 'segregation of duties'; end if;
    end if;
  end if;
  select jsonb_build_object('decided_proposal_id',p_proposal,'decided_version',v_version,'captured_at',now(),
    'approval_request_id',v_approval.id,
    'policy', case when v_eval is null then null else jsonb_build_object('engine', v_eval->'engine', 'policies', v_eval->'policies',
       'matched', v_eval->'matched', 'evaluated_at', v_eval->'evaluated_at', 'from_request', v_approval.policy_snapshot is not null) end,
    'proposals',coalesce(jsonb_agg(jsonb_build_object(
      'proposal_id',p.id,'provider_id',p.provider_id,'status',p.status,'version',p.current_version,
      'terms',v.terms,'submitted_at',v.submitted_at) order by p.created_at),'[]'::jsonb)) into v_snapshot
    from public.fin_proposals p left join public.fin_proposal_versions v on v.proposal_id=p.id and v.version=p.current_version
    where p.rfq_id=p_rfq and p.buyer_organization_id=v_org and p.current_version>0;
  insert into public.fin_decisions(organization_id,rfq_id,proposal_id,decided_by,criteria,rationale,snapshot)
    values(v_org,p_rfq,p_proposal,auth.uid(),coalesce(p_criteria,'{}'::jsonb),p_rationale,v_snapshot) returning id into v_id;
  update public.fin_rfqs set status='decided',updated_at=now() where id=p_rfq;
  insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
    values(v_org,'rfq',p_rfq,'decision_recorded',auth.uid(),jsonb_build_object('decided_version',v_version,'approval_request_id',v_approval.id,
      'policy_rules', jsonb_array_length(coalesce(v_eval->'matched','[]'::jsonb))));
  return v_id;
end $$;

-- ------------------------------------------------- 13. prazos, escalação e expiração
-- Idempotente: etapa vencida é escalada uma vez (tarefa + aviso a quem a policy
-- indica, com acesso à entidade); pedido além da janela expira. Nada é aprovado.
create or replace function public.fin_process_approval_deadlines(p_org uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare s record; r record; v_task uuid; v_count integer := 0; v_target uuid;
begin
  if auth.uid() is not null and (p_org is null or not public.fin_has_role(p_org, array['admin','finance_manager'])) then raise exception 'forbidden'; end if;
  for r in select a.id, a.organization_id, a.rfq_id from public.fin_approval_requests a join public.fin_rfqs f on f.id = a.rfq_id
            where a.status = 'pending' and a.expires_at is not null and a.expires_at < now()
              and (p_org is null or a.organization_id = p_org)
              and (auth.uid() is null or public.fin_entity_visible(a.organization_id, f.legal_entity_id))
            order by a.expires_at for update of a skip locked
  loop
    update public.fin_approval_requests set status = 'expired', resolved_at = now() where id = r.id;
    perform public.fin_approval_close_open(r.id, 'expired');
    update public.fin_policy_exceptions set status = 'cancelled' where request_id = r.id and status = 'requested';
    insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
      values (r.organization_id, 'rfq', r.rfq_id, 'approval_expired', auth.uid(), jsonb_build_object('request_id', r.id));
    v_count := v_count + 1;
  end loop;
  for s in select st.id, st.request_id, st.stage_key, a.organization_id, a.rfq_id, a.requested_by, a.policy_snapshot, f.legal_entity_id
             from public.fin_approval_stages st
             join public.fin_approval_requests a on a.id = st.request_id and a.status = 'pending'
             join public.fin_rfqs f on f.id = a.rfq_id
            where st.status = 'active' and st.escalated_at is null and st.due_at is not null and st.due_at < now()
              and (p_org is null or a.organization_id = p_org)
              and (auth.uid() is null or public.fin_entity_visible(a.organization_id, f.legal_entity_id))
            order by st.due_at for update of st skip locked
  loop
    insert into public.fin_tasks(organization_id, title, due_on, status, related_type, related_id, created_by)
      values (s.organization_id, 'Aprovação em atraso: acompanhar a etapa pendente', current_date, 'open', 'rfq', s.rfq_id, coalesce(auth.uid(), s.requested_by))
      returning id into v_task;
    update public.fin_approval_stages set escalated_at = now() where id = s.id;
    for v_target in select m.user_id from public.fin_members m
                     where m.organization_id = s.organization_id and m.user_id <> s.requested_by
                       and m.role in (select jsonb_array_elements_text(coalesce(s.policy_snapshot->'escalation_roles', '["admin"]'::jsonb)))
                       and public.fin_approval_member_eligible(s.organization_id, s.legal_entity_id, m.user_id, array[m.role], 'any')
                     order by m.created_at, m.user_id limit 5
    loop
      insert into public.fin_notifications(organization_id, user_id, event_type, object_type, object_id, event_id, title, body)
        values (s.organization_id, v_target, 'approval_requested', 'rfq', s.rfq_id, v_task, 'Aprovação em atraso',
                'Uma etapa de aprovação passou do prazo definido pela policy da empresa.')
        on conflict (user_id, event_type, event_id) do nothing;
    end loop;
    insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
      values (s.organization_id, 'rfq', s.rfq_id, 'approval_stage_escalated', auth.uid(), jsonb_build_object('request_id', s.request_id, 'stage', s.stage_key, 'task_id', v_task));
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

create or replace function public.fin_run_approval_deadlines()
returns integer language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then raise exception 'forbidden'; end if;
  return public.fin_process_approval_deadlines(null);
end $$;

alter table public.fin_job_runs drop constraint if exists fin_job_runs_job_check;
alter table public.fin_job_runs add constraint fin_job_runs_job_check check (job in ('renewals','contract_milestones','approval_deadlines'));

-- ------------------------------------------------- 14. avisos
-- Mesmo gatilho do handoff + etapas paralelas: quando um pedido de policy abre
-- (ou avança) uma sequência, TODOS os aprovadores das etapas ativas são avisados.
create or replace function public.fin_notify_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_user uuid;v_type text;v_object text;v_target uuid;v_next uuid;v_policy boolean;
begin
 if new.event_type in ('proposal_submitted','proposal_revised') then
  select r.owner_id,r.id into v_user,v_target from public.fin_proposals p join public.fin_rfqs r on r.id=p.rfq_id where p.id=new.entity_id;
  v_type:=case when new.event_type='proposal_submitted' then 'proposal_received' else 'proposal_revised' end;
  v_object:='rfq';
 elsif new.event_type in ('approval_requested','approval_approved','policy_exception_approved')
   and exists (select 1 from public.fin_approval_requests r where r.id=(new.metadata->>'request_id')::uuid and r.policy_snapshot is not null) then
  select rfq_id,requested_by into v_target,v_user from public.fin_approval_requests where id=(new.metadata->>'request_id')::uuid;
  for v_next in select s.approver_id from public.fin_approval_steps s join public.fin_approval_stages st on st.id=s.stage_id and st.status='active'
                 join public.fin_approval_requests r on r.id=s.request_id and r.status='pending'
                 where s.request_id=(new.metadata->>'request_id')::uuid and s.status='pending' and s.approver_id is distinct from new.actor_id loop
   insert into public.fin_notifications(organization_id,user_id,event_type,object_type,object_id,event_id,title,body)
   values(new.organization_id,v_next,'approval_requested','rfq',v_target,new.id,'Aprovação solicitada',
    'Uma etapa de aprovação aguarda você. Abra o processo para ver a policy e os detalhes.')
   on conflict(user_id,event_type,event_id) do nothing;
  end loop;
  if new.event_type in ('approval_requested','policy_exception_approved') then return new; end if;
  v_type:='approval_approved';v_object:='rfq';
 elsif new.event_type='approval_requested' then
  select s.approver_id,r.rfq_id into v_user,v_target from public.fin_approval_steps s join public.fin_approval_requests r on r.id=s.request_id where s.request_id=(new.metadata->>'request_id')::uuid order by s.position limit 1;
  v_type:='approval_requested';v_object:='rfq';
 elsif new.event_type in ('approval_approved','approval_rejected','approval_changes_requested') then
  select requested_by,rfq_id into v_user,v_target from public.fin_approval_requests where id=(new.metadata->>'request_id')::uuid;
  v_type:=new.event_type;v_object:='rfq';
  -- Etapa aprovada e pedido ainda pendente: a vez passou para o próximo aprovador.
  if new.event_type='approval_approved' then
   select s.approver_id into v_next from public.fin_approval_steps s join public.fin_approval_requests r on r.id=s.request_id
    where s.request_id=(new.metadata->>'request_id')::uuid and s.status='pending' and r.status='pending'
    order by s.position limit 1;
   if v_next is not null and v_next is distinct from new.actor_id then
    insert into public.fin_notifications(organization_id,user_id,event_type,object_type,object_id,event_id,title,body)
    values(new.organization_id,v_next,'approval_requested','rfq',v_target,new.id,'Aprovação solicitada',
     'Chegou a sua vez de aprovar. Abra o processo para ver os detalhes.')
    on conflict(user_id,event_type,event_id) do nothing;
   end if;
  end if;
 else return new;
 end if;
 if v_user is not null and v_user is distinct from new.actor_id then
  insert into public.fin_notifications(organization_id,user_id,event_type,object_type,object_id,event_id,title,body)
  values(new.organization_id,v_user,v_type,v_object,v_target,new.id,
   case v_type when 'proposal_received' then 'Proposta recebida' when 'proposal_revised' then 'Proposta revisada'
    when 'approval_requested' then 'Aprovação solicitada' when 'approval_approved' then 'Aprovação registrada'
    when 'approval_rejected' then 'Aprovação rejeitada' else 'Alterações solicitadas' end,
   'Abra o processo para ver os detalhes.')
  on conflict(user_id,event_type,event_id) do nothing;
 end if;
 return new;
end $$;

-- ------------------------------------------------- 15. grants
-- Auxiliares internas: nunca chamáveis pelo cliente.
revoke all on function public.fin_policy_valid_roles(jsonb, boolean), public.fin_policy_valid_stage(jsonb), public.fin_policy_valid_condition(jsonb),
  public.fin_policy_valid_document(jsonb), public.fin_policy_version_guard(), public.fin_approval_snapshot_guard(), public.fin_approval_stage_guard(),
  public.fin_policy_facts(uuid, uuid, jsonb), public.fin_policy_condition(jsonb, jsonb), public.fin_policy_apply(jsonb, jsonb, uuid, text),
  public.fin_policy_combine(jsonb, jsonb), public.fin_policy_evaluate(uuid, uuid, jsonb), public.fin_approval_member_eligible(uuid, uuid, uuid, text[], text),
  public.fin_policy_rule_excepted(uuid, uuid, text), public.fin_approval_refresh(uuid), public.fin_approval_close_open(uuid, text),
  public.fin_run_approval_deadlines(), public.fin_notify_event() from public, anon, authenticated;
grant execute on function public.fin_run_approval_deadlines() to service_role;
revoke all on function public.fin_save_policy_draft(uuid, uuid, text, jsonb, text), public.fin_activate_policy_version(uuid), public.fin_discard_policy_draft(uuid),
  public.fin_retire_policy(uuid), public.fin_set_policy_flag(uuid, text, text, text, boolean), public.fin_preview_approval_policy(uuid, uuid, jsonb),
  public.fin_simulate_policy_version(uuid, jsonb), public.fin_request_policy_approval(uuid, uuid, jsonb, text, text, jsonb),
  public.fin_request_approval(uuid, uuid, uuid[], text), public.fin_act_on_approval_v2(uuid, text, text, text), public.fin_act_on_approval(uuid, text, text),
  public.fin_cancel_approval(uuid), public.fin_supersede_approval(uuid, text), public.fin_request_policy_exception(uuid, uuid, text, text, text, jsonb),
  public.fin_decide_policy_exception(uuid, text, text), public.fin_cancel_policy_exception(uuid),
  public.fin_set_approval_delegation(uuid, uuid, timestamptz, timestamptz, text), public.fin_revoke_approval_delegation(uuid),
  public.fin_record_decision(uuid, uuid, jsonb, text), public.fin_process_approval_deadlines(uuid) from public, anon;
grant execute on function public.fin_save_policy_draft(uuid, uuid, text, jsonb, text), public.fin_activate_policy_version(uuid), public.fin_discard_policy_draft(uuid),
  public.fin_retire_policy(uuid), public.fin_set_policy_flag(uuid, text, text, text, boolean), public.fin_preview_approval_policy(uuid, uuid, jsonb),
  public.fin_simulate_policy_version(uuid, jsonb), public.fin_request_policy_approval(uuid, uuid, jsonb, text, text, jsonb),
  public.fin_request_approval(uuid, uuid, uuid[], text), public.fin_act_on_approval_v2(uuid, text, text, text), public.fin_act_on_approval(uuid, text, text),
  public.fin_cancel_approval(uuid), public.fin_supersede_approval(uuid, text), public.fin_request_policy_exception(uuid, uuid, text, text, text, jsonb),
  public.fin_decide_policy_exception(uuid, text, text), public.fin_cancel_policy_exception(uuid),
  public.fin_set_approval_delegation(uuid, uuid, timestamptz, timestamptz, text), public.fin_revoke_approval_delegation(uuid),
  public.fin_record_decision(uuid, uuid, jsonb, text), public.fin_process_approval_deadlines(uuid) to authenticated, service_role;

insert into public.fin_settings (key, value) values ('schema_version', 'financial-policy-engine-1')
on conflict (key) do update set value = excluded.value, updated_at = now();
