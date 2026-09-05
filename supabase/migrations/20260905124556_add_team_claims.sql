create table public.club_teams (
  id uuid primary key default gen_random_uuid(),
  club_id text not null references public.clubs(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 180),
  category text not null check (char_length(category) between 1 and 30),
  season text not null check (char_length(season) between 4 and 20),
  source text not null default 'manual',
  source_id text,
  source_url text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, category, season),
  unique (source, source_id)
);

create table public.team_claim_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.club_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_role text not null check (requested_role in ('coach', 'manager', 'club_admin')),
  message text check (message is null or char_length(message) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index team_claim_requests_one_pending_idx
  on public.team_claim_requests (team_id, user_id)
  where status = 'pending';
create index team_claim_requests_status_created_idx
  on public.team_claim_requests (status, created_at desc);
create index team_claim_requests_user_idx on public.team_claim_requests (user_id);
create index team_claim_requests_reviewed_by_idx on public.team_claim_requests (reviewed_by);

create table public.team_memberships (
  team_id uuid not null references public.club_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('coach', 'manager', 'club_admin')),
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index team_memberships_user_idx on public.team_memberships (user_id);
create index team_memberships_verified_by_idx on public.team_memberships (verified_by);

alter table public.club_teams enable row level security;
alter table public.team_claim_requests enable row level security;
alter table public.team_memberships enable row level security;

revoke all on public.club_teams from anon, authenticated;
revoke all on public.team_claim_requests from anon, authenticated;
revoke all on public.team_memberships from anon, authenticated;
grant select on public.club_teams to anon, authenticated;
grant select, insert, update on public.team_claim_requests to authenticated;
grant select, insert on public.team_memberships to authenticated;
grant insert on public.admin_audit_log to authenticated;
grant usage, select on sequence public.admin_audit_log_id_seq to authenticated;

create policy club_teams_public_read
on public.club_teams for select to anon, authenticated
using (status = 'active');

create policy team_claims_read_own_or_admin
on public.team_claim_requests for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'admin')
);

create policy team_claims_create_own
on public.team_claim_requests for insert to authenticated
with check (user_id = (select auth.uid()) and status = 'pending' and reviewed_by is null and reviewed_at is null);

create policy team_claims_admin_update
on public.team_claim_requests for update to authenticated
using (exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'admin'))
with check (exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'admin'));

create policy team_memberships_read_own_or_admin
on public.team_memberships for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'admin')
);

create policy team_memberships_admin_insert
on public.team_memberships for insert to authenticated
with check (exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'admin'));

create policy admin_audit_log_admin_insert
on public.admin_audit_log for insert to authenticated
with check (
  actor_user_id = (select auth.uid())
  and exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'admin')
);

create or replace function public.review_team_claim(p_claim_id uuid, p_decision text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  claim public.team_claim_requests;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Invalid decision';
  end if;
  if not exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role = 'admin'
  ) then
    raise exception 'Not authorized';
  end if;

  update public.team_claim_requests
  set status = p_decision, reviewed_by = (select auth.uid()), reviewed_at = now()
  where id = p_claim_id and status = 'pending'
  returning * into claim;

  if claim.id is null then raise exception 'Pending request not found'; end if;

  if p_decision = 'approved' then
    insert into public.team_memberships (team_id, user_id, role, verified_by)
    values (claim.team_id, claim.user_id, claim.requested_role, (select auth.uid()))
    on conflict (team_id, user_id) do update
      set role = excluded.role, verified_by = excluded.verified_by, verified_at = now();
  end if;

  insert into public.admin_audit_log (actor_user_id, target_user_id, action, details)
  values ((select auth.uid()), claim.user_id, 'team_claim_' || p_decision, jsonb_build_object('claim_id', claim.id, 'team_id', claim.team_id));
end;
$$;

revoke execute on function public.review_team_claim(uuid, text) from public, anon;
grant execute on function public.review_team_claim(uuid, text) to authenticated;

insert into public.club_teams (club_id, name, category, season, source, source_url)
select id, name || ' U12', 'U12', '2026/27', 'sportnet',
  'https://sportnet.sme.sk/futbalnet/k/msk-senec/tim/u12-m-a/tabulky/'
from public.clubs
where status = 'active'
on conflict (club_id, category, season) do nothing;
