create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.profiles
  add column if not exists email text;

update public.profiles as profile
set email = auth_user.email
from auth.users as auth_user
where auth_user.id = profile.id
  and profile.email is null;

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.account_controls (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'suspended')),
  suspension_reason text,
  suspended_at timestamptz,
  discount_percent smallint not null default 0 check (discount_percent between 0 and 100),
  discount_note text,
  discount_expires_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.account_controls (user_id)
select id from auth.users
on conflict (user_id) do nothing;

create table if not exists public.marketing_consent_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  granted boolean not null,
  purpose text not null default 'email_marketing' check (purpose = 'email_marketing'),
  source text not null,
  policy_version text not null,
  recorded_at timestamptz not null default now()
);

create index if not exists marketing_consent_events_user_recorded_idx
  on public.marketing_consent_events (user_id, recorded_at desc);

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log (created_at desc);

alter table public.user_roles enable row level security;
alter table public.account_controls enable row level security;
alter table public.marketing_consent_events enable row level security;
alter table public.admin_audit_log enable row level security;

revoke all on public.user_roles from anon, authenticated;
revoke all on public.account_controls from anon, authenticated;
revoke all on public.marketing_consent_events from anon, authenticated;
revoke all on public.admin_audit_log from anon, authenticated;
revoke update on public.profiles from authenticated;

grant select on public.user_roles to authenticated;
grant select, update on public.account_controls to authenticated;
grant select, insert on public.marketing_consent_events to authenticated;
grant select on public.admin_audit_log to authenticated;
grant update (full_name, updated_at) on public.profiles to authenticated;
grant usage, select on sequence public.marketing_consent_events_id_seq to authenticated;

drop policy if exists user_roles_read_own on public.user_roles;
create policy user_roles_read_own
on public.user_roles for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists account_controls_read_own_or_admin on public.account_controls;
create policy account_controls_read_own_or_admin
on public.account_controls for select
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role = 'admin'
  )
);

drop policy if exists account_controls_admin_update on public.account_controls;
create policy account_controls_admin_update
on public.account_controls for update
to authenticated
using (
  exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role = 'admin'
  )
);

drop policy if exists profiles_admin_read_all on public.profiles;
create policy profiles_admin_read_all
on public.profiles for select
to authenticated
using (
  exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role = 'admin'
  )
);

drop policy if exists marketing_consent_read_own_or_admin on public.marketing_consent_events;
create policy marketing_consent_read_own_or_admin
on public.marketing_consent_events for select
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role = 'admin'
  )
);

drop policy if exists marketing_consent_insert_own on public.marketing_consent_events;
create policy marketing_consent_insert_own
on public.marketing_consent_events for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists admin_audit_log_admin_read on public.admin_audit_log;
create policy admin_audit_log_admin_read
on public.admin_audit_log for select
to authenticated
using (
  exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role = 'admin'
  )
);

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = case
        when public.profiles.full_name = '' then excluded.full_name
        else public.profiles.full_name
      end;

  insert into public.account_controls (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  if coalesce((new.raw_user_meta_data ->> 'marketing_consent')::boolean, false) then
    insert into public.marketing_consent_events (
      user_id, granted, source, policy_version
    ) values (
      new.id, true, 'registration',
      coalesce(new.raw_user_meta_data ->> 'privacy_version', '2026-09-04')
    );
  end if;

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

drop function if exists public.handle_new_user();

create or replace function private.audit_account_control_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if row(old.status, old.suspension_reason, old.discount_percent, old.discount_note, old.discount_expires_at)
     is distinct from
     row(new.status, new.suspension_reason, new.discount_percent, new.discount_note, new.discount_expires_at) then
    insert into public.admin_audit_log (actor_user_id, target_user_id, action, details)
    values (
      auth.uid(),
      new.user_id,
      'account_control_updated',
      jsonb_build_object(
        'old_status', old.status,
        'new_status', new.status,
        'suspension_reason', new.suspension_reason,
        'discount_percent', new.discount_percent,
        'discount_expires_at', new.discount_expires_at
      )
    );
  end if;

  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

revoke all on function private.audit_account_control_change() from public, anon, authenticated;

drop trigger if exists audit_account_control_change on public.account_controls;
create trigger audit_account_control_change
  before update on public.account_controls
  for each row execute function private.audit_account_control_change();

