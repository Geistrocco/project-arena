-- Unknown legacy locations remain NULL until the organizer edits the tournament.
alter table public.tournaments
  add column region text,
  add column surface text;

alter table public.tournaments
  add constraint tournaments_region_country_check check (
    region is null or
    (country = 'Slovensko' and region = any(array[
      'Bratislavský kraj','Trnavský kraj','Trenčiansky kraj','Nitriansky kraj',
      'Žilinský kraj','Banskobystrický kraj','Prešovský kraj','Košický kraj'
    ])) or
    (country = 'Česko' and region = any(array[
      'Praha','Stredočeský kraj','Juhočeský kraj','Plzenský kraj','Karlovarský kraj',
      'Ústecký kraj','Liberecký kraj','Královohradecký kraj','Pardubický kraj',
      'Vysočina','Juhomoravský kraj','Olomoucký kraj','Zlínsky kraj','Moravskosliezsky kraj'
    ]))
  ),
  add constraint tournaments_surface_check check (
    surface is null or surface = any(array[
      'Prírodný trávnik','Umelá tráva','Hala','Ľadová plocha','Antuka','Tvrdý povrch','Iný povrch'
    ])
  );

create index tournaments_catalog_location_idx on public.tournaments (country, region, surface)
  where publication_status = 'published' and tournament_type in ('public', 'combined');

-- The existing planning functions retain their signatures. Wrappers perform the extra
-- location update in the same transaction, preserving their ownership and reset checks.
create function public.create_tournament_with_location(
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
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_country not in ('Slovensko', 'Česko') or p_region is null or p_surface is null then
    raise exception 'Invalid tournament location';
  end if;
  created_slug := public.create_tournament_with_plan(
    p_name, p_sport, p_category, p_event_date, p_place, p_capacity,
    p_playing_fields, p_match_duration, p_fee, p_tournament_type,
    p_team_visibility, p_club_ids, p_custom_teams, p_start_time,
    p_turnover_minutes, p_schedule_slot_minutes, p_has_lunch_break,
    p_lunch_break_start, p_lunch_break_duration, p_game_system,
    p_qualifiers_per_group, p_third_place_match, p_plan
  );
  update public.tournaments
  set country = p_country, region = p_region, surface = p_surface
  where slug = created_slug and organizer_id = uid;
  if not found then raise exception 'Tournament location could not be saved'; end if;
  return created_slug;
end; $$;

create function public.update_tournament_with_location(
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
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_country not in ('Slovensko', 'Česko') or p_region is null or p_surface is null then
    raise exception 'Invalid tournament location';
  end if;
  perform public.update_tournament_with_plan(
    p_slug, p_name, p_sport, p_category, p_event_date, p_place, p_capacity,
    p_playing_fields, p_match_duration, p_fee, p_tournament_type,
    p_team_visibility, p_club_ids, p_custom_teams, p_start_time,
    p_turnover_minutes, p_schedule_slot_minutes, p_has_lunch_break,
    p_lunch_break_start, p_lunch_break_duration, p_game_system,
    p_qualifiers_per_group, p_third_place_match, p_plan, p_confirm_reset
  );
  update public.tournaments
  set country = p_country, region = p_region, surface = p_surface, updated_at = now()
  where slug = p_slug and organizer_id = uid;
  if not found then raise exception 'Not allowed'; end if;
end; $$;

revoke execute on function public.create_tournament_with_location(text,text,text,date,text,integer,integer,integer,numeric,text,text,text[],text[],time,integer,integer,boolean,time,integer,text,integer,boolean,jsonb,text,text,text) from public, anon;
grant execute on function public.create_tournament_with_location(text,text,text,date,text,integer,integer,integer,numeric,text,text,text[],text[],time,integer,integer,boolean,time,integer,text,integer,boolean,jsonb,text,text,text) to authenticated;
revoke execute on function public.update_tournament_with_location(text,text,text,text,date,text,integer,integer,integer,numeric,text,text,text[],text[],time,integer,integer,boolean,time,integer,text,integer,boolean,jsonb,boolean,text,text,text) from public, anon;
grant execute on function public.update_tournament_with_location(text,text,text,text,date,text,integer,integer,integer,numeric,text,text,text[],text[],time,integer,integer,boolean,time,integer,text,integer,boolean,jsonb,boolean,text,text,text) to authenticated;
