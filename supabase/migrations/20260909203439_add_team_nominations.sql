create table public.team_nominations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.club_teams(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 3 and 120),
  event_type text not null check (event_type in ('match', 'tournament', 'training', 'other')),
  starts_at timestamptz not null,
  location text check (location is null or char_length(location) <= 160),
  note text check (note is null or char_length(note) <= 1000),
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.team_nomination_players (
  nomination_id uuid not null references public.team_nominations(id) on delete cascade,
  player_id uuid not null references public.player_profiles(id) on delete cascade,
  response text not null default 'pending' check (response in ('pending', 'accepted', 'declined')),
  decline_reason text check (decline_reason is null or char_length(decline_reason) <= 500),
  responded_by uuid references auth.users(id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (nomination_id, player_id),
  check ((response = 'declined') or decline_reason is null)
);

create index team_nominations_team_starts_idx on public.team_nominations (team_id, starts_at desc);
create index team_nomination_players_player_idx on public.team_nomination_players (player_id);

alter table public.team_nominations enable row level security;
alter table public.team_nomination_players enable row level security;
revoke all on public.team_nominations from anon, authenticated;
revoke all on public.team_nomination_players from anon, authenticated;

create or replace function public.create_team_nomination(
  p_team_id uuid,
  p_title text,
  p_event_type text,
  p_starts_at timestamp,
  p_location text,
  p_note text,
  p_player_ids uuid[]
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  clean_title text := trim(p_title);
  clean_location text := nullif(trim(p_location), '');
  clean_note text := nullif(trim(p_note), '');
  nomination_id uuid;
  selected_count integer;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if not exists (
    select 1 from public.team_memberships m
    where m.team_id = p_team_id and m.user_id = uid and m.role in ('coach', 'manager', 'club_admin')
  ) and not coalesce((select private.is_platform_admin(uid)), false) then
    raise exception 'Not authorized';
  end if;
  if char_length(clean_title) not between 3 and 120 then raise exception 'Invalid title'; end if;
  if p_event_type not in ('match', 'tournament', 'training', 'other') then raise exception 'Invalid event type'; end if;
  if p_starts_at is null then raise exception 'Missing date'; end if;
  if char_length(coalesce(clean_location, '')) > 160 or char_length(coalesce(clean_note, '')) > 1000 then raise exception 'Text too long'; end if;
  if coalesce(cardinality(p_player_ids), 0) = 0 or cardinality(p_player_ids) > 100 then raise exception 'Select players'; end if;

  select count(distinct selected.player_id) into selected_count
  from unnest(p_player_ids) selected(player_id)
  join public.team_players tp on tp.player_id = selected.player_id
  where tp.team_id = p_team_id and tp.status = 'active';
  if selected_count <> (select count(distinct player_id) from unnest(p_player_ids) chosen(player_id)) then
    raise exception 'Player does not belong to the team';
  end if;

  insert into public.team_nominations (team_id, created_by, title, event_type, starts_at, location, note)
  values (p_team_id, uid, clean_title, p_event_type, p_starts_at at time zone 'Europe/Bratislava', clean_location, clean_note)
  returning id into nomination_id;
  insert into public.team_nomination_players (nomination_id, player_id)
  select nomination_id, player_id from unnest(p_player_ids) chosen(player_id) group by player_id;
  return nomination_id;
end; $$;

create or replace function public.get_team_nominations(p_team_id uuid)
returns table (
  nomination_id uuid, title text, event_type text, starts_at timestamptz, location text,
  status text, nominated_count bigint, accepted_count bigint, declined_count bigint,
  pending_count bigint, can_manage boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  is_manager boolean;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  is_manager := exists (
    select 1 from public.team_memberships m
    where m.team_id = p_team_id and m.user_id = uid and m.role in ('coach', 'manager', 'club_admin')
  ) or coalesce((select private.is_platform_admin(uid)), false);
  if not is_manager and not exists (
    select 1 from public.team_players tp
    join public.player_guardians pg on pg.player_id = tp.player_id
    where tp.team_id = p_team_id and tp.status = 'active' and pg.guardian_user_id = uid
  ) then raise exception 'Not authorized'; end if;

  return query
  select n.id, n.title, n.event_type, n.starts_at, n.location, n.status,
    count(np.player_id), count(*) filter (where np.response = 'accepted'),
    count(*) filter (where np.response = 'declined'), count(*) filter (where np.response = 'pending'),
    is_manager
  from public.team_nominations n
  join public.team_nomination_players np on np.nomination_id = n.id
  where n.team_id = p_team_id
  group by n.id
  order by n.starts_at desc;
end; $$;

create or replace function public.get_nomination_roster(p_nomination_id uuid)
returns table (
  nomination_id uuid, team_id uuid, team_name text, title text, event_type text,
  starts_at timestamptz, location text, note text, nomination_status text,
  player_id uuid, player_name text, response text, responded_at timestamptz,
  can_respond boolean, decline_reason text, can_manage boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  target_team_id uuid;
  is_manager boolean;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select n.team_id into target_team_id from public.team_nominations n where n.id = p_nomination_id;
  if target_team_id is null then raise exception 'Nomination not found'; end if;
  is_manager := exists (
    select 1 from public.team_memberships m
    where m.team_id = target_team_id and m.user_id = uid and m.role in ('coach', 'manager', 'club_admin')
  ) or coalesce((select private.is_platform_admin(uid)), false);
  if not is_manager and not exists (
    select 1 from public.team_players tp
    join public.player_guardians pg on pg.player_id = tp.player_id
    where tp.team_id = target_team_id and tp.status = 'active' and pg.guardian_user_id = uid
  ) then raise exception 'Not authorized'; end if;

  return query
  select n.id, n.team_id, t.name, n.title, n.event_type, n.starts_at, n.location, n.note, n.status,
    np.player_id, p.full_name, np.response, np.responded_at,
    (is_manager or exists (select 1 from public.player_guardians pg where pg.player_id = np.player_id and pg.guardian_user_id = uid)),
    case when is_manager or exists (select 1 from public.player_guardians pg where pg.player_id = np.player_id and pg.guardian_user_id = uid)
      then np.decline_reason else null end,
    is_manager
  from public.team_nominations n
  join public.club_teams t on t.id = n.team_id
  join public.team_nomination_players np on np.nomination_id = n.id
  join public.player_profiles p on p.id = np.player_id
  where n.id = p_nomination_id
  order by p.full_name;
end; $$;

create or replace function public.respond_to_team_nomination(
  p_nomination_id uuid,
  p_player_id uuid,
  p_response text,
  p_decline_reason text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  target_team_id uuid;
  clean_reason text := nullif(trim(p_decline_reason), '');
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_response not in ('accepted', 'declined') then raise exception 'Invalid response'; end if;
  if p_response = 'declined' and clean_reason is null then raise exception 'Decline reason required'; end if;
  if char_length(coalesce(clean_reason, '')) > 500 then raise exception 'Reason too long'; end if;
  select n.team_id into target_team_id
  from public.team_nominations n
  join public.team_nomination_players np on np.nomination_id = n.id and np.player_id = p_player_id
  where n.id = p_nomination_id and n.status = 'open';
  if target_team_id is null then raise exception 'Open nomination not found'; end if;
  if not exists (select 1 from public.player_guardians pg where pg.player_id = p_player_id and pg.guardian_user_id = uid)
    and not exists (select 1 from public.team_memberships m where m.team_id = target_team_id and m.user_id = uid and m.role in ('coach', 'manager', 'club_admin'))
    and not coalesce((select private.is_platform_admin(uid)), false) then
    raise exception 'Not authorized';
  end if;
  update public.team_nomination_players
  set response = p_response,
      decline_reason = case when p_response = 'declined' then clean_reason else null end,
      responded_by = uid,
      responded_at = now()
  where nomination_id = p_nomination_id and player_id = p_player_id;
end; $$;

revoke execute on function public.create_team_nomination(uuid,text,text,timestamp,text,text,uuid[]) from public, anon;
revoke execute on function public.get_team_nominations(uuid) from public, anon;
revoke execute on function public.get_nomination_roster(uuid) from public, anon;
revoke execute on function public.respond_to_team_nomination(uuid,uuid,text,text) from public, anon;
grant execute on function public.create_team_nomination(uuid,text,text,timestamp,text,text,uuid[]) to authenticated;
grant execute on function public.get_team_nominations(uuid) to authenticated;
grant execute on function public.get_nomination_roster(uuid) to authenticated;
grant execute on function public.respond_to_team_nomination(uuid,uuid,text,text) to authenticated;
