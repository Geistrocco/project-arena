create or replace function public.update_tournament_with_plan(
  p_slug text, p_name text, p_sport text, p_category text, p_event_date date, p_place text,
  p_capacity integer, p_playing_fields integer, p_match_duration integer, p_fee numeric,
  p_tournament_type text, p_team_visibility text, p_club_ids text[], p_custom_teams text[],
  p_start_time time, p_turnover_minutes integer, p_schedule_slot_minutes integer,
  p_has_lunch_break boolean, p_lunch_break_start time, p_lunch_break_duration integer,
  p_game_system text, p_qualifiers_per_group integer, p_third_place_match boolean,
  p_plan jsonb, p_confirm_reset boolean
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  tid uuid;
  existing public.tournaments%rowtype;
  desired_names text[];
  current_names text[];
  regenerate boolean;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select * into existing from public.tournaments t where t.slug = p_slug and t.organizer_id = uid for update;
  if existing.id is null then raise exception 'Not allowed'; end if;
  tid := existing.id;

  if char_length(trim(p_name)) not between 3 and 140 or char_length(trim(p_sport)) not between 2 and 40
    or char_length(trim(p_category)) not between 1 and 30 or char_length(trim(p_place)) not between 2 and 180 then raise exception 'Invalid text'; end if;
  if p_event_date is null or p_event_date < current_date or p_capacity not between 2 and 256
    or p_playing_fields not between 1 and 32 or p_match_duration not between 1 and 240
    or p_fee not between 0 and 100000 then raise exception 'Invalid format'; end if;
  if p_tournament_type not in ('public', 'invitation', 'combined') or p_team_visibility not in ('all', 'accepted', 'hidden') then raise exception 'Invalid visibility'; end if;
  if p_turnover_minutes < 3 or p_schedule_slot_minutes < p_match_duration + p_turnover_minutes then raise exception 'Invalid schedule'; end if;
  if p_has_lunch_break and (p_lunch_break_start is null or p_lunch_break_duration not between 15 and 180) then raise exception 'Invalid lunch break'; end if;
  if p_game_system not in ('groups_playoff', 'round_robin', 'groups_placement') then raise exception 'Invalid game system'; end if;
  if p_game_system = 'groups_playoff' and p_qualifiers_per_group not between 1 and 2 then raise exception 'Invalid qualifiers'; end if;
  if p_game_system <> 'groups_playoff' and (p_qualifiers_per_group is not null or p_third_place_match) then raise exception 'Unexpected playoff settings'; end if;
  if jsonb_typeof(p_plan -> 'groups') <> 'array' or jsonb_typeof(p_plan -> 'teams') <> 'array' or jsonb_typeof(p_plan -> 'matches') <> 'array' then raise exception 'Invalid plan'; end if;

  select coalesce(array_agg(name order by name), array[]::text[]) into desired_names from (
    select distinct trim(c.name) name from public.clubs c where c.id = any(coalesce(p_club_ids, array[]::text[]))
    union select distinct trim(x) from unnest(coalesce(p_custom_teams, array[]::text[])) x where char_length(trim(x)) between 2 and 180
  ) wanted;
  select coalesce(array_agg(team_name order by team_name), array[]::text[]) into current_names from public.tournament_invited_teams where tournament_id = tid;
  if p_capacity < existing.registered_count or p_capacity < cardinality(desired_names) then raise exception 'Capacity below participating teams'; end if;

  regenerate := existing.capacity <> p_capacity or existing.playing_fields <> p_playing_fields
    or existing.match_duration <> p_match_duration or existing.start_time <> p_start_time
    or existing.schedule_slot_minutes <> p_schedule_slot_minutes or existing.has_lunch_break <> p_has_lunch_break
    or existing.lunch_break_start is distinct from p_lunch_break_start or existing.lunch_break_duration is distinct from p_lunch_break_duration
    or existing.game_system <> p_game_system or existing.qualifiers_per_group is distinct from p_qualifiers_per_group
    or existing.third_place_match <> p_third_place_match or current_names <> desired_names;

  if regenerate and not p_confirm_reset and exists (select 1 from public.tournament_matches where tournament_id = tid and status = 'finished') then
    raise exception 'RESET_CONFIRMATION_REQUIRED';
  end if;

  update public.tournaments set name = trim(p_name), sport = trim(p_sport), category = upper(trim(p_category)),
    event_date = p_event_date, place = trim(p_place), capacity = p_capacity, playing_fields = p_playing_fields,
    match_duration = p_match_duration, fee = p_fee, tournament_type = p_tournament_type,
    team_visibility = p_team_visibility, publication_status = case when p_tournament_type = 'invitation' then 'private' else 'published' end,
    start_time = p_start_time, turnover_minutes = p_turnover_minutes, schedule_slot_minutes = p_schedule_slot_minutes,
    has_lunch_break = p_has_lunch_break, lunch_break_start = case when p_has_lunch_break then p_lunch_break_start else null end,
    lunch_break_duration = case when p_has_lunch_break then p_lunch_break_duration else null end,
    game_system = p_game_system, qualifiers_per_group = case when p_game_system = 'groups_playoff' then p_qualifiers_per_group else null end,
    third_place_match = case when p_game_system = 'groups_playoff' then p_third_place_match else false end, updated_at = now()
  where id = tid;

  if regenerate then
    delete from public.tournament_invited_teams where tournament_id = tid;
    insert into public.tournament_invited_teams (tournament_id, club_id, team_name)
      select tid, c.id, c.name from public.clubs c where c.id = any(coalesce(p_club_ids, array[]::text[])) on conflict do nothing;
    insert into public.tournament_invited_teams (tournament_id, team_name)
      select tid, trim(x) from (select distinct unnest(coalesce(p_custom_teams, array[]::text[])) x) q where char_length(trim(x)) between 2 and 180 on conflict do nothing;
    delete from public.tournament_groups where tournament_id = tid;
    insert into public.tournament_groups (tournament_id, code, name, sort_order)
      select tid, trim(x.code), trim(x.name), x.sort_order from jsonb_to_recordset(p_plan -> 'groups') x(code text, name text, sort_order integer);
    insert into public.tournament_group_teams (tournament_id, group_id, slot_number, team_name)
      select tid, g.id, x.slot_number, trim(x.team_name) from jsonb_to_recordset(p_plan -> 'teams') x(group_code text, slot_number integer, team_name text)
      join public.tournament_groups g on g.tournament_id = tid and g.code = x.group_code;
    insert into public.tournament_matches (tournament_id, group_id, phase, round_number, match_number, starts_at, field_number, home_team_name, away_team_name, home_source, away_source)
      select tid, g.id, x.phase, x.round_number, x.match_number, x.starts_at, x.field_number,
        nullif(trim(x.home_team_name), ''), nullif(trim(x.away_team_name), ''), nullif(trim(x.home_source), ''), nullif(trim(x.away_source), '')
      from jsonb_to_recordset(p_plan -> 'matches') x(group_code text, phase text, round_number integer, match_number integer, starts_at time, field_number integer, home_team_name text, away_team_name text, home_source text, away_source text)
      left join public.tournament_groups g on g.tournament_id = tid and g.code = x.group_code;
  end if;
end; $$;

revoke execute on function public.update_tournament_with_plan(text,text,text,text,date,text,integer,integer,integer,numeric,text,text,text[],text[],time,integer,integer,boolean,time,integer,text,integer,boolean,jsonb,boolean) from public, anon;
grant execute on function public.update_tournament_with_plan(text,text,text,text,date,text,integer,integer,integer,numeric,text,text,text[],text[],time,integer,integer,boolean,time,integer,text,integer,boolean,jsonb,boolean) to authenticated;
