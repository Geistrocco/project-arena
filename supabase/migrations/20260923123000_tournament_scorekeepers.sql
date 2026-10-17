create table public.tournament_scorekeepers (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  invited_email text not null,
  display_name text not null default '',
  granted_by uuid not null references auth.users(id) on delete restrict,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  unique (tournament_id, user_id)
);

create index tournament_scorekeepers_active_tournament_idx
  on public.tournament_scorekeepers (tournament_id, granted_at)
  where revoked_at is null;
create index tournament_scorekeepers_active_user_idx
  on public.tournament_scorekeepers (user_id, tournament_id)
  where revoked_at is null;
create index tournament_scorekeepers_granted_by_idx on public.tournament_scorekeepers (granted_by);
create index tournament_scorekeepers_revoked_by_idx on public.tournament_scorekeepers (revoked_by) where revoked_by is not null;

create table public.tournament_scorekeeper_events (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  scorekeeper_user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('granted', 'revoked')),
  created_at timestamptz not null default now()
);

create index tournament_scorekeeper_events_tournament_created_idx
  on public.tournament_scorekeeper_events (tournament_id, created_at desc);
create index tournament_scorekeeper_events_scorekeeper_idx on public.tournament_scorekeeper_events (scorekeeper_user_id);
create index tournament_scorekeeper_events_actor_idx on public.tournament_scorekeeper_events (actor_user_id) where actor_user_id is not null;

create table public.tournament_score_events (
  id bigint generated always as identity primary key,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  match_id uuid not null references public.tournament_matches(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  previous_home_score integer,
  previous_away_score integer,
  previous_status text,
  new_home_score integer not null,
  new_away_score integer not null,
  created_at timestamptz not null default now()
);

create index tournament_score_events_tournament_created_idx
  on public.tournament_score_events (tournament_id, created_at desc);
create index tournament_score_events_match_created_idx
  on public.tournament_score_events (match_id, created_at desc);
create index tournament_score_events_actor_idx on public.tournament_score_events (actor_user_id) where actor_user_id is not null;

alter table public.tournament_matches
  add column score_updated_by uuid references auth.users(id) on delete set null;
create index tournament_matches_score_updated_by_idx on public.tournament_matches (score_updated_by) where score_updated_by is not null;

alter table public.tournament_scorekeepers enable row level security;
alter table public.tournament_scorekeeper_events enable row level security;
alter table public.tournament_score_events enable row level security;

revoke all on public.tournament_scorekeepers, public.tournament_scorekeeper_events, public.tournament_score_events from anon, authenticated;
grant select on public.tournament_scorekeepers to authenticated;
grant select on public.tournament_scorekeeper_events, public.tournament_score_events to authenticated;

create policy tournament_scorekeepers_read_relevant
on public.tournament_scorekeepers for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.tournaments t
    where t.id = tournament_id and t.organizer_id = (select auth.uid())
  )
  or coalesce((select private.is_platform_admin((select auth.uid()))), false)
);

create policy tournament_scorekeeper_events_read_organizer
on public.tournament_scorekeeper_events for select to authenticated
using (
  exists (
    select 1 from public.tournaments t
    where t.id = tournament_id and t.organizer_id = (select auth.uid())
  )
  or coalesce((select private.is_platform_admin((select auth.uid()))), false)
);

create policy tournament_score_events_read_organizer
on public.tournament_score_events for select to authenticated
using (
  exists (
    select 1 from public.tournaments t
    where t.id = tournament_id and t.organizer_id = (select auth.uid())
  )
  or coalesce((select private.is_platform_admin((select auth.uid()))), false)
);

create or replace function private.can_score_tournament(p_user_id uuid, p_tournament_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and (
    exists (
      select 1 from public.tournaments t
      where t.id = p_tournament_id and t.organizer_id = p_user_id
    )
    or coalesce(private.is_platform_admin(p_user_id), false)
    or exists (
      select 1 from public.tournament_scorekeepers s
      where s.tournament_id = p_tournament_id
        and s.user_id = p_user_id
        and s.revoked_at is null
    )
  );
$$;

revoke all on function private.can_score_tournament(uuid, uuid) from public, anon, authenticated;

create or replace function public.grant_tournament_scorekeeper(p_slug text, p_email text)
returns table (
  assignment_id uuid,
  assigned_user_id uuid,
  assigned_email text,
  assigned_name text,
  tournament_name text,
  change_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  clean_email text := lower(trim(p_email));
  tid uuid;
  owner_id uuid;
  target_id uuid;
  target_name text;
  target_email text;
  assignment uuid;
  event_id uuid;
  event_name text;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'INVALID_EMAIL'; end if;

  select t.id, t.organizer_id, t.name into tid, owner_id, event_name
  from public.tournaments t where t.slug = p_slug;
  if tid is null or not (owner_id = uid or coalesce(private.is_platform_admin(uid), false)) then
    raise exception 'NOT_ALLOWED';
  end if;

  select u.id, lower(u.email), coalesce(nullif(trim(p.full_name), ''), '')
  into target_id, target_email, target_name
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.account_controls c on c.user_id = u.id
  where lower(u.email) = clean_email
    and u.email_confirmed_at is not null
    and coalesce(c.status, 'active') = 'active'
  limit 1;

  if target_id is null then raise exception 'USER_NOT_FOUND'; end if;
  if target_id = owner_id then raise exception 'ALREADY_ORGANIZER'; end if;

  insert into public.tournament_scorekeepers (
    tournament_id, user_id, invited_email, display_name, granted_by, granted_at, revoked_at, revoked_by
  ) values (tid, target_id, target_email, target_name, uid, now(), null, null)
  on conflict (tournament_id, user_id) do update set
    invited_email = excluded.invited_email,
    display_name = excluded.display_name,
    granted_by = excluded.granted_by,
    granted_at = now(),
    revoked_at = null,
    revoked_by = null
  returning id into assignment;

  insert into public.tournament_scorekeeper_events (tournament_id, scorekeeper_user_id, actor_user_id, action)
  values (tid, target_id, uid, 'granted') returning id into event_id;

  return query select assignment, target_id, target_email, target_name, event_name, event_id;
end;
$$;

revoke execute on function public.grant_tournament_scorekeeper(text, text) from public, anon;
grant execute on function public.grant_tournament_scorekeeper(text, text) to authenticated;

create or replace function public.revoke_tournament_scorekeeper(p_assignment_id uuid)
returns table (
  assigned_email text,
  assigned_name text,
  tournament_name text,
  tournament_slug text,
  change_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  target_id uuid;
  target_email text;
  target_name text;
  tid uuid;
  event_id uuid;
  event_name text;
  event_slug text;
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  select s.tournament_id, s.user_id, s.invited_email, s.display_name, t.name, t.slug
  into tid, target_id, target_email, target_name, event_name, event_slug
  from public.tournament_scorekeepers s
  join public.tournaments t on t.id = s.tournament_id
  where s.id = p_assignment_id
    and s.revoked_at is null
    and (t.organizer_id = uid or coalesce(private.is_platform_admin(uid), false))
  for update of s;

  if tid is null then raise exception 'NOT_ALLOWED'; end if;

  update public.tournament_scorekeepers
  set revoked_at = now(), revoked_by = uid
  where id = p_assignment_id;

  insert into public.tournament_scorekeeper_events (tournament_id, scorekeeper_user_id, actor_user_id, action)
  values (tid, target_id, uid, 'revoked') returning id into event_id;

  return query select target_email, target_name, event_name, event_slug, event_id;
end;
$$;

revoke execute on function public.revoke_tournament_scorekeeper(uuid) from public, anon;
grant execute on function public.revoke_tournament_scorekeeper(uuid) to authenticated;

create or replace function public.update_tournament_match_score(p_match_id uuid, p_home_score integer, p_away_score integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  current_match public.tournament_matches%rowtype;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_home_score not between 0 and 999 or p_away_score not between 0 and 999 then raise exception 'Invalid score'; end if;

  select * into current_match
  from public.tournament_matches
  where id = p_match_id
  for update;

  if current_match.id is null or not private.can_score_tournament(uid, current_match.tournament_id) then
    raise exception 'Not allowed';
  end if;
  if p_home_score = p_away_score and current_match.phase = 'playoff' then
    raise exception 'Playoff matches need a winner';
  end if;

  update public.tournament_matches
  set home_score = p_home_score,
      away_score = p_away_score,
      status = 'finished',
      score_updated_by = uid,
      updated_at = now()
  where id = p_match_id;

  insert into public.tournament_score_events (
    tournament_id, match_id, actor_user_id,
    previous_home_score, previous_away_score, previous_status,
    new_home_score, new_away_score
  ) values (
    current_match.tournament_id, current_match.id, uid,
    current_match.home_score, current_match.away_score, current_match.status,
    p_home_score, p_away_score
  );
end;
$$;

revoke execute on function public.update_tournament_match_score(uuid, integer, integer) from public, anon;
grant execute on function public.update_tournament_match_score(uuid, integer, integer) to authenticated;
