create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references auth.users(id) on delete restrict,
  organizer_name text not null check (char_length(trim(organizer_name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(trim(name)) between 3 and 140),
  sport text not null check (char_length(trim(sport)) between 2 and 40),
  category text not null check (char_length(trim(category)) between 1 and 30),
  event_date date not null,
  place text not null check (char_length(trim(place)) between 2 and 180),
  country text not null default 'Slovensko' check (country in ('Slovensko', 'Česko')),
  capacity integer not null check (capacity between 2 and 256),
  playing_fields integer not null check (playing_fields between 1 and 32),
  match_duration integer not null check (match_duration between 1 and 240),
  fee numeric(10,2) not null default 0 check (fee between 0 and 100000),
  tournament_type text not null check (tournament_type in ('public', 'invitation', 'combined')),
  team_visibility text not null check (team_visibility in ('all', 'accepted', 'hidden')),
  publication_status text not null check (publication_status in ('published', 'private', 'cancelled')),
  registered_count integer not null default 0 check (registered_count >= 0 and registered_count <= capacity),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tournament_invited_teams (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  club_id text references public.clubs(id) on delete set null,
  team_name text not null check (char_length(trim(team_name)) between 2 and 180),
  created_at timestamptz not null default now(),
  primary key (tournament_id, team_name)
);

create index tournaments_catalog_idx on public.tournaments (event_date, sport, category)
  where publication_status = 'published' and tournament_type in ('public', 'combined');
create index tournaments_organizer_idx on public.tournaments (organizer_id, created_at desc);
create index tournament_invited_teams_club_idx on public.tournament_invited_teams (club_id) where club_id is not null;

alter table public.tournaments enable row level security;
alter table public.tournament_invited_teams enable row level security;
revoke all on public.tournaments from anon, authenticated;
revoke all on public.tournament_invited_teams from anon, authenticated;
grant select on public.tournaments to anon, authenticated;
grant select, insert on public.tournaments to authenticated;
grant select on public.tournament_invited_teams to anon;
grant select, insert on public.tournament_invited_teams to authenticated;

create policy tournaments_public_read on public.tournaments for select to anon, authenticated
using (publication_status = 'published' and tournament_type in ('public', 'combined'));

create policy tournaments_owner_or_admin_read on public.tournaments for select to authenticated
using (organizer_id = (select auth.uid()) or coalesce((select private.is_platform_admin((select auth.uid()))), false));

create policy tournaments_owner_insert on public.tournaments for insert to authenticated
with check (organizer_id = (select auth.uid()));

create policy invited_teams_public_visible on public.tournament_invited_teams for select to anon, authenticated
using (exists (
  select 1 from public.tournaments t
  where t.id = tournament_id
    and t.publication_status = 'published' and t.tournament_type in ('public', 'combined') and t.team_visibility = 'all'
));

create policy invited_teams_owner_or_admin_visible on public.tournament_invited_teams for select to authenticated
using (exists (
  select 1 from public.tournaments t
  where t.id = tournament_id and (t.organizer_id = (select auth.uid()) or coalesce((select private.is_platform_admin((select auth.uid()))), false))
));

create policy invited_teams_owner_insert on public.tournament_invited_teams for insert to authenticated
with check (exists (
  select 1 from public.tournaments t where t.id = tournament_id and t.organizer_id = (select auth.uid())
));

create or replace function public.create_tournament(
  p_name text, p_sport text, p_category text, p_event_date date, p_place text,
  p_capacity integer, p_playing_fields integer, p_match_duration integer, p_fee numeric,
  p_tournament_type text, p_team_visibility text, p_club_ids text[], p_custom_teams text[]
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
  if p_tournament_type not in ('public', 'invitation', 'combined') or p_team_visibility not in ('all', 'accepted', 'hidden') then raise exception 'Invalid visibility'; end if;
  if coalesce(cardinality(p_club_ids), 0) + coalesce(cardinality(p_custom_teams), 0) > 256 then raise exception 'Too many teams'; end if;

  new_slug := coalesce(nullif(trim(both '-' from regexp_replace(
    lower(translate(clean_name, 'áäčďéěíľĺňóôŕřšťúůýž', 'aacdeeillnoorrstuuyz')),
    '[^a-z0-9]+', '-', 'g'
  )), ''), 'turnaj') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  insert into public.tournaments (
    organizer_id, organizer_name, slug, name, sport, category, event_date, place,
    capacity, playing_fields, match_duration, fee, tournament_type, team_visibility, publication_status
  ) values (
    uid, organizer, new_slug, clean_name, trim(p_sport), upper(trim(p_category)), p_event_date, trim(p_place),
    p_capacity, p_playing_fields, p_match_duration, p_fee, p_tournament_type, p_team_visibility,
    case when p_tournament_type = 'invitation' then 'private' else 'published' end
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

revoke execute on function public.create_tournament(text,text,text,date,text,integer,integer,integer,numeric,text,text,text[],text[]) from public, anon;
grant execute on function public.create_tournament(text,text,text,date,text,integer,integer,integer,numeric,text,text,text[],text[]) to authenticated;
