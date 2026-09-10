alter table public.tournaments
  add column start_time time not null default '09:00',
  add column turnover_minutes integer not null default 3 check (turnover_minutes between 3 and 30),
  add column schedule_slot_minutes integer not null default 15 check (schedule_slot_minutes between 5 and 300),
  add column has_lunch_break boolean not null default false,
  add column lunch_break_start time,
  add column lunch_break_duration integer check (lunch_break_duration between 15 and 180),
  add constraint tournaments_lunch_break_valid check (
    (not has_lunch_break and lunch_break_start is null and lunch_break_duration is null)
    or (has_lunch_break and lunch_break_start is not null and lunch_break_duration is not null)
  );

update public.tournaments
set schedule_slot_minutes = ceil((match_duration + turnover_minutes)::numeric / 5)::integer * 5;

alter table public.tournaments
  add constraint tournaments_schedule_slot_valid check (schedule_slot_minutes >= match_duration + turnover_minutes);

create or replace function public.create_tournament_with_schedule(
  p_name text, p_sport text, p_category text, p_event_date date, p_place text,
  p_capacity integer, p_playing_fields integer, p_match_duration integer, p_fee numeric,
  p_tournament_type text, p_team_visibility text, p_club_ids text[], p_custom_teams text[],
  p_start_time time, p_turnover_minutes integer, p_schedule_slot_minutes integer,
  p_has_lunch_break boolean, p_lunch_break_start time, p_lunch_break_duration integer
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  new_id uuid;
  new_slug text;
  organizer text;
  clean_name text := trim(p_name);
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select nullif(trim(p.full_name), '') into organizer from public.profiles p where p.id = uid;
  organizer := coalesce(organizer, 'Organizátor turnaja');
  if char_length(clean_name) not between 3 and 140 or char_length(trim(p_place)) not between 2 and 180 then raise exception 'Invalid text'; end if;
  if char_length(trim(p_sport)) not between 2 and 40 or char_length(trim(p_category)) not between 1 and 30 then raise exception 'Invalid category'; end if;
  if p_event_date is null or p_event_date < current_date then raise exception 'Invalid date'; end if;
  if p_capacity not between 2 and 256 or p_playing_fields not between 1 and 32 or p_match_duration not between 1 and 240 then raise exception 'Invalid format'; end if;
  if p_fee not between 0 and 100000 then raise exception 'Invalid fee'; end if;
  if p_start_time is null or p_turnover_minutes <> 3 or p_schedule_slot_minutes <> ceil((p_match_duration + p_turnover_minutes)::numeric / 5)::integer * 5 then raise exception 'Invalid schedule'; end if;
  if p_has_lunch_break and (p_lunch_break_start is null or p_lunch_break_duration not between 15 and 180) then raise exception 'Invalid lunch break'; end if;
  if not p_has_lunch_break and (p_lunch_break_start is not null or p_lunch_break_duration is not null) then raise exception 'Unexpected lunch break'; end if;
  if p_tournament_type not in ('public', 'invitation', 'combined') or p_team_visibility not in ('all', 'accepted', 'hidden') then raise exception 'Invalid visibility'; end if;
  if coalesce(cardinality(p_club_ids), 0) + coalesce(cardinality(p_custom_teams), 0) > 256 then raise exception 'Too many teams'; end if;

  new_slug := coalesce(nullif(trim(both '-' from regexp_replace(
    lower(translate(clean_name, 'áäčďéěíľĺňóôŕřšťúůýž', 'aacdeeillnoorrstuuyz')),
    '[^a-z0-9]+', '-', 'g'
  )), ''), 'turnaj') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  insert into public.tournaments (
    organizer_id, organizer_name, slug, name, sport, category, event_date, place,
    capacity, playing_fields, match_duration, fee, tournament_type, team_visibility, publication_status,
    start_time, turnover_minutes, schedule_slot_minutes, has_lunch_break, lunch_break_start, lunch_break_duration
  ) values (
    uid, organizer, new_slug, clean_name, trim(p_sport), upper(trim(p_category)), p_event_date, trim(p_place),
    p_capacity, p_playing_fields, p_match_duration, p_fee, p_tournament_type, p_team_visibility,
    case when p_tournament_type = 'invitation' then 'private' else 'published' end,
    p_start_time, p_turnover_minutes, p_schedule_slot_minutes, p_has_lunch_break, p_lunch_break_start, p_lunch_break_duration
  ) returning id into new_id;

  insert into public.tournament_invited_teams (tournament_id, club_id, team_name)
  select new_id, c.id, c.name from public.clubs c
  join (select distinct unnest(coalesce(p_club_ids, array[]::text[])) id) selected on selected.id = c.id
  on conflict do nothing;
  insert into public.tournament_invited_teams (tournament_id, team_name)
  select new_id, trim(name) from (select distinct unnest(coalesce(p_custom_teams, array[]::text[])) name) custom
  where char_length(trim(name)) between 2 and 180
  on conflict do nothing;
  return new_slug;
end; $$;

revoke execute on function public.create_tournament_with_schedule(text,text,text,date,text,integer,integer,integer,numeric,text,text,text[],text[],time,integer,integer,boolean,time,integer) from public, anon;
grant execute on function public.create_tournament_with_schedule(text,text,text,date,text,integer,integer,integer,numeric,text,text,text[],text[],time,integer,integer,boolean,time,integer) to authenticated;
