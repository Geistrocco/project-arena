-- Format choices and the organizer's preferred end time survive edits and repeats.
alter table public.tournaments
  add column format_settings jsonb not null default '{}'::jsonb,
  add column preferred_finish time;

create or replace function public.create_tournament_with_location(
  p_name text, p_sport text, p_category text, p_event_date date, p_place text,
  p_capacity integer, p_playing_fields integer, p_match_duration integer, p_fee numeric,
  p_tournament_type text, p_team_visibility text, p_club_ids text[], p_custom_teams text[],
  p_start_time time, p_turnover_minutes integer, p_schedule_slot_minutes integer,
  p_has_lunch_break boolean, p_lunch_break_start time, p_lunch_break_duration integer,
  p_game_system text, p_qualifiers_per_group integer, p_third_place_match boolean,
  p_plan jsonb, p_country text, p_region text, p_surface text
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  created_slug text;
  desired jsonb := coalesce(p_plan -> 'format_settings', '{}'::jsonb);
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_country not in ('Slovensko', 'Česko') or p_region is null or p_surface is null then
    raise exception 'Invalid tournament location';
  end if;
  if jsonb_typeof(desired) <> 'object' or length(desired::text) > 1000
    or not coalesce((p_plan ->> 'preferred_end') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$', false) then raise exception 'Invalid format settings'; end if;
  created_slug := public.create_tournament_with_plan(
    p_name, p_sport, p_category, p_event_date, p_place, p_capacity,
    p_playing_fields, p_match_duration, p_fee, p_tournament_type,
    p_team_visibility, p_club_ids, p_custom_teams, p_start_time,
    p_turnover_minutes, p_schedule_slot_minutes, p_has_lunch_break,
    p_lunch_break_start, p_lunch_break_duration, p_game_system,
    p_qualifiers_per_group, p_third_place_match, p_plan
  );
  update public.tournaments
  set country = p_country, region = p_region, surface = p_surface,
      format_settings = desired, preferred_finish = (p_plan ->> 'preferred_end')::time
  where slug = created_slug and organizer_id = uid;
  if not found then raise exception 'Tournament location could not be saved'; end if;
  return created_slug;
end; $$;


create or replace function public.update_tournament_with_location(
  p_slug text, p_name text, p_sport text, p_category text, p_event_date date, p_place text,
  p_capacity integer, p_playing_fields integer, p_match_duration integer, p_fee numeric,
  p_tournament_type text, p_team_visibility text, p_club_ids text[], p_custom_teams text[],
  p_start_time time, p_turnover_minutes integer, p_schedule_slot_minutes integer,
  p_has_lunch_break boolean, p_lunch_break_start time, p_lunch_break_duration integer,
  p_game_system text, p_qualifiers_per_group integer, p_third_place_match boolean,
  p_plan jsonb, p_confirm_reset boolean, p_country text, p_region text, p_surface text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  tid uuid;
  previous jsonb;
  desired jsonb := coalesce(p_plan -> 'format_settings', '{}'::jsonb);
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_country not in ('Slovensko', 'Česko') or p_region is null or p_surface is null then
    raise exception 'Invalid tournament location';
  end if;
  if jsonb_typeof(desired) <> 'object' or length(desired::text) > 1000
    or not coalesce((p_plan ->> 'preferred_end') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$', false) then raise exception 'Invalid format settings'; end if;
  select id, format_settings into tid, previous from public.tournaments
    where slug = p_slug and organizer_id = uid for update;
  if tid is null then raise exception 'Not allowed'; end if;
  if previous is distinct from desired and not p_confirm_reset and exists (
    select 1 from public.tournament_matches where tournament_id = tid and status = 'finished'
  ) then raise exception 'RESET_CONFIRMATION_REQUIRED'; end if;
  perform public.update_tournament_with_plan(
    p_slug, p_name, p_sport, p_category, p_event_date, p_place, p_capacity,
    p_playing_fields, p_match_duration, p_fee, p_tournament_type,
    p_team_visibility, p_club_ids, p_custom_teams, p_start_time,
    p_turnover_minutes, p_schedule_slot_minutes, p_has_lunch_break,
    p_lunch_break_start, p_lunch_break_duration, p_game_system,
    p_qualifiers_per_group, p_third_place_match, p_plan, p_confirm_reset
  );
  update public.tournaments
  set country = p_country, region = p_region, surface = p_surface,
      format_settings = desired, preferred_finish = (p_plan ->> 'preferred_end')::time, updated_at = now()
  where slug = p_slug and organizer_id = uid;
  if not found then raise exception 'Not allowed'; end if;
  -- The underlying editor regenerates when its preset fields change. A custom
  -- grouping may change without changing those fields, so regenerate here too.
  if previous is distinct from desired then
    delete from public.tournament_matches where tournament_id = tid;
    delete from public.tournament_groups where tournament_id = tid;
    insert into public.tournament_groups (tournament_id, code, name, sort_order)
      select tid, trim(x.code), trim(x.name), x.sort_order
      from jsonb_to_recordset(p_plan -> 'groups') x(code text, name text, sort_order integer);
    insert into public.tournament_group_teams (tournament_id, group_id, slot_number, team_name)
      select tid, g.id, x.slot_number, trim(x.team_name)
      from jsonb_to_recordset(p_plan -> 'teams') x(group_code text, slot_number integer, team_name text)
      join public.tournament_groups g on g.tournament_id = tid and g.code = x.group_code;
    insert into public.tournament_matches (tournament_id, group_id, phase, round_number, match_number, starts_at, field_number, home_team_name, away_team_name, home_source, away_source)
      select tid, g.id, x.phase, x.round_number, x.match_number, x.starts_at, x.field_number,
        nullif(trim(x.home_team_name), ''), nullif(trim(x.away_team_name), ''), nullif(trim(x.home_source), ''), nullif(trim(x.away_source), '')
      from jsonb_to_recordset(p_plan -> 'matches') x(group_code text, phase text, round_number integer, match_number integer, starts_at time, field_number integer, home_team_name text, away_team_name text, home_source text, away_source text)
      left join public.tournament_groups g on g.tournament_id = tid and g.code = x.group_code;
  end if;
end; $$;


-- Knockout matches require a winner so the next fixture can resolve its teams.
create or replace function public.update_tournament_match_score(p_match_id uuid, p_home_score integer, p_away_score integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Not authenticated'; end if;
  if p_home_score not between 0 and 999 or p_away_score not between 0 and 999 then raise exception 'Invalid score'; end if;
  if p_home_score = p_away_score and exists (
    select 1 from public.tournament_matches where id = p_match_id and phase = 'playoff'
  ) then raise exception 'Playoff matches need a winner'; end if;
  update public.tournament_matches m set home_score = p_home_score, away_score = p_away_score,
    status = 'finished', updated_at = now()
  from public.tournaments t
  where m.id = p_match_id and t.id = m.tournament_id
    and (t.organizer_id = (select auth.uid()) or coalesce((select private.is_platform_admin((select auth.uid()))), false));
  if not found then raise exception 'Not allowed'; end if;
end; $$;
