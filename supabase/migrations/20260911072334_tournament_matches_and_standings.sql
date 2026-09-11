create table public.tournament_groups (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  code text not null check (code ~ '^[A-Z][A-Z0-9]{0,4}$'),
  name text not null check (char_length(trim(name)) between 2 and 80),
  sort_order integer not null check (sort_order between 1 and 64),
  unique (tournament_id, code),
  unique (tournament_id, sort_order)
);

create table public.tournament_group_teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  group_id uuid not null references public.tournament_groups(id) on delete cascade,
  slot_number integer not null check (slot_number between 1 and 256),
  team_name text not null check (char_length(trim(team_name)) between 2 and 180),
  unique (group_id, slot_number),
  unique (tournament_id, team_name) deferrable initially deferred
);

create table public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  group_id uuid references public.tournament_groups(id) on delete cascade,
  phase text not null check (phase in ('group', 'placement', 'playoff')),
  round_number integer not null check (round_number between 1 and 256),
  match_number integer not null check (match_number between 1 and 4096),
  starts_at time not null,
  field_number integer not null check (field_number between 1 and 32),
  home_team_name text,
  away_team_name text,
  home_source text,
  away_source text,
  home_score integer check (home_score between 0 and 999),
  away_score integer check (away_score between 0 and 999),
  status text not null default 'scheduled' check (status in ('scheduled', 'finished')),
  updated_at timestamptz not null default now(),
  unique (tournament_id, match_number),
  check (home_team_name is not null or home_source is not null),
  check (away_team_name is not null or away_source is not null),
  check ((status = 'scheduled' and home_score is null and away_score is null) or (status = 'finished' and home_score is not null and away_score is not null))
);

create index tournament_groups_tournament_idx on public.tournament_groups (tournament_id, sort_order);
create index tournament_group_teams_group_idx on public.tournament_group_teams (group_id, slot_number);
create index tournament_matches_schedule_idx on public.tournament_matches (tournament_id, starts_at, field_number);
create index tournament_matches_group_idx on public.tournament_matches (group_id) where group_id is not null;

alter table public.tournament_groups enable row level security;
alter table public.tournament_group_teams enable row level security;
alter table public.tournament_matches enable row level security;

revoke all on public.tournament_groups, public.tournament_group_teams, public.tournament_matches from anon, authenticated;
grant select on public.tournament_groups, public.tournament_group_teams, public.tournament_matches to anon, authenticated;

create policy tournament_groups_visible on public.tournament_groups for select to anon, authenticated using (
  exists (select 1 from public.tournaments t where t.id = tournament_id and (
    (t.publication_status = 'published' and t.tournament_type in ('public', 'combined') and t.team_visibility = 'all')
    or (t.organizer_id = (select auth.uid()))
    or coalesce((select private.is_platform_admin((select auth.uid()))), false)
  ))
);
create policy tournament_group_teams_visible on public.tournament_group_teams for select to anon, authenticated using (
  exists (select 1 from public.tournaments t where t.id = tournament_id and (
    (t.publication_status = 'published' and t.tournament_type in ('public', 'combined') and t.team_visibility = 'all')
    or (t.organizer_id = (select auth.uid()))
    or coalesce((select private.is_platform_admin((select auth.uid()))), false)
  ))
);
create policy tournament_matches_visible on public.tournament_matches for select to anon, authenticated using (
  exists (select 1 from public.tournaments t where t.id = tournament_id and (
    (t.publication_status = 'published' and t.tournament_type in ('public', 'combined') and t.team_visibility = 'all')
    or (t.organizer_id = (select auth.uid()))
    or coalesce((select private.is_platform_admin((select auth.uid()))), false)
  ))
);

create or replace function public.create_tournament_with_plan(
  p_name text, p_sport text, p_category text, p_event_date date, p_place text,
  p_capacity integer, p_playing_fields integer, p_match_duration integer, p_fee numeric,
  p_tournament_type text, p_team_visibility text, p_club_ids text[], p_custom_teams text[],
  p_start_time time, p_turnover_minutes integer, p_schedule_slot_minutes integer,
  p_has_lunch_break boolean, p_lunch_break_start time, p_lunch_break_duration integer,
  p_game_system text, p_qualifiers_per_group integer, p_third_place_match boolean,
  p_plan jsonb
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  new_slug text;
  new_id uuid;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if jsonb_typeof(p_plan -> 'groups') <> 'array' or jsonb_typeof(p_plan -> 'matches') <> 'array' then raise exception 'Invalid plan'; end if;

  new_slug := public.create_tournament_with_game_system(
    p_name, p_sport, p_category, p_event_date, p_place, p_capacity, p_playing_fields,
    p_match_duration, p_fee, p_tournament_type, p_team_visibility, p_club_ids, p_custom_teams,
    p_start_time, p_turnover_minutes, p_schedule_slot_minutes, p_has_lunch_break,
    p_lunch_break_start, p_lunch_break_duration, p_game_system, p_qualifiers_per_group,
    p_third_place_match
  );
  select id into new_id from public.tournaments where slug = new_slug and organizer_id = uid;

  insert into public.tournament_groups (tournament_id, code, name, sort_order)
  select new_id, trim(x.code), trim(x.name), x.sort_order
  from jsonb_to_recordset(p_plan -> 'groups') as x(code text, name text, sort_order integer);

  insert into public.tournament_group_teams (tournament_id, group_id, slot_number, team_name)
  select new_id, g.id, x.slot_number, trim(x.team_name)
  from jsonb_to_recordset(p_plan -> 'teams') as x(group_code text, slot_number integer, team_name text)
  join public.tournament_groups g on g.tournament_id = new_id and g.code = x.group_code;

  insert into public.tournament_matches (
    tournament_id, group_id, phase, round_number, match_number, starts_at, field_number,
    home_team_name, away_team_name, home_source, away_source
  )
  select new_id, g.id, x.phase, x.round_number, x.match_number, x.starts_at,
    x.field_number, nullif(trim(x.home_team_name), ''), nullif(trim(x.away_team_name), ''),
    nullif(trim(x.home_source), ''), nullif(trim(x.away_source), '')
  from jsonb_to_recordset(p_plan -> 'matches') as x(
    group_code text, phase text, round_number integer, match_number integer,
    starts_at time, field_number integer, home_team_name text, away_team_name text,
    home_source text, away_source text
  )
  left join public.tournament_groups g on g.tournament_id = new_id and g.code = x.group_code;
  return new_slug;
end; $$;

revoke execute on function public.create_tournament_with_plan(text,text,text,date,text,integer,integer,integer,numeric,text,text,text[],text[],time,integer,integer,boolean,time,integer,text,integer,boolean,jsonb) from public, anon;
grant execute on function public.create_tournament_with_plan(text,text,text,date,text,integer,integer,integer,numeric,text,text,text[],text[],time,integer,integer,boolean,time,integer,text,integer,boolean,jsonb) to authenticated;

create or replace function public.update_tournament_match_score(p_match_id uuid, p_home_score integer, p_away_score integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Not authenticated'; end if;
  if p_home_score not between 0 and 999 or p_away_score not between 0 and 999 then raise exception 'Invalid score'; end if;
  update public.tournament_matches m set home_score = p_home_score, away_score = p_away_score,
    status = 'finished', updated_at = now()
  from public.tournaments t
  where m.id = p_match_id and t.id = m.tournament_id
    and (t.organizer_id = (select auth.uid()) or coalesce((select private.is_platform_admin((select auth.uid()))), false));
  if not found then raise exception 'Not allowed'; end if;
end; $$;
revoke execute on function public.update_tournament_match_score(uuid,integer,integer) from public, anon;
grant execute on function public.update_tournament_match_score(uuid,integer,integer) to authenticated;

create or replace function public.swap_tournament_group_teams(p_first_id uuid, p_second_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare first_name text; second_name text; tid uuid;
begin
  if (select auth.uid()) is null or p_first_id = p_second_id then raise exception 'Invalid request'; end if;
  select gt.tournament_id, gt.team_name into tid, first_name from public.tournament_group_teams gt where gt.id = p_first_id;
  select gt.team_name into second_name from public.tournament_group_teams gt where gt.id = p_second_id and gt.tournament_id = tid;
  if second_name is null or not exists (select 1 from public.tournaments t where t.id = tid and (t.organizer_id = (select auth.uid()) or coalesce((select private.is_platform_admin((select auth.uid()))), false))) then raise exception 'Not allowed'; end if;
  update public.tournament_group_teams set team_name = case id when p_first_id then second_name else first_name end where id in (p_first_id, p_second_id);
  update public.tournament_matches set
    home_team_name = case home_team_name when first_name then second_name when second_name then first_name else home_team_name end,
    away_team_name = case away_team_name when first_name then second_name when second_name then first_name else away_team_name end
  where tournament_id = tid and phase = 'group';
end; $$;
revoke execute on function public.swap_tournament_group_teams(uuid,uuid) from public, anon;
grant execute on function public.swap_tournament_group_teams(uuid,uuid) to authenticated;
