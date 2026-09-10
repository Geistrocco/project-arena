alter table public.tournaments
  add column game_system text not null default 'groups_playoff'
    check (game_system in ('groups_playoff', 'round_robin', 'groups_placement')),
  add column qualifiers_per_group integer default 2 check (qualifiers_per_group between 1 and 2),
  add column third_place_match boolean not null default true,
  add constraint tournaments_game_system_valid check (
    (game_system = 'groups_playoff' and qualifiers_per_group is not null)
    or (game_system <> 'groups_playoff' and qualifiers_per_group is null and not third_place_match)
  );

create or replace function public.create_tournament_with_game_system(
  p_name text, p_sport text, p_category text, p_event_date date, p_place text,
  p_capacity integer, p_playing_fields integer, p_match_duration integer, p_fee numeric,
  p_tournament_type text, p_team_visibility text, p_club_ids text[], p_custom_teams text[],
  p_start_time time, p_turnover_minutes integer, p_schedule_slot_minutes integer,
  p_has_lunch_break boolean, p_lunch_break_start time, p_lunch_break_duration integer,
  p_game_system text, p_qualifiers_per_group integer, p_third_place_match boolean
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  new_slug text;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_game_system not in ('groups_playoff', 'round_robin', 'groups_placement') then raise exception 'Invalid game system'; end if;
  if p_game_system = 'groups_playoff' and p_qualifiers_per_group not between 1 and 2 then raise exception 'Invalid qualifiers'; end if;
  if p_game_system <> 'groups_playoff' and (p_qualifiers_per_group is not null or p_third_place_match) then raise exception 'Unexpected playoff settings'; end if;

  new_slug := public.create_tournament_with_schedule(
    p_name, p_sport, p_category, p_event_date, p_place,
    p_capacity, p_playing_fields, p_match_duration, p_fee,
    p_tournament_type, p_team_visibility, p_club_ids, p_custom_teams,
    p_start_time, p_turnover_minutes, p_schedule_slot_minutes,
    p_has_lunch_break, p_lunch_break_start, p_lunch_break_duration
  );

  update public.tournaments
  set game_system = p_game_system,
      qualifiers_per_group = case when p_game_system = 'groups_playoff' then p_qualifiers_per_group else null end,
      third_place_match = case when p_game_system = 'groups_playoff' then p_third_place_match else false end
  where slug = new_slug and organizer_id = uid;
  return new_slug;
end; $$;

revoke execute on function public.create_tournament_with_game_system(text,text,text,date,text,integer,integer,integer,numeric,text,text,text[],text[],time,integer,integer,boolean,time,integer,text,integer,boolean) from public, anon;
grant execute on function public.create_tournament_with_game_system(text,text,text,date,text,integer,integer,integer,numeric,text,text,text[],text[],time,integer,integer,boolean,time,integer,text,integer,boolean) to authenticated;
