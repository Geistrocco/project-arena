alter table public.team_nominations
  add column live_stream_url text,
  add column live_stream_status text,
  add column live_stream_updated_at timestamptz,
  add column live_stream_updated_by uuid references auth.users(id) on delete set null,
  add constraint team_nominations_live_stream_valid check (
    (live_stream_url is null and live_stream_status is null)
    or (
      live_stream_url ~ '^https://[^[:space:]]+$'
      and char_length(live_stream_url) <= 500
      and live_stream_status in ('scheduled', 'live', 'ended')
    )
  );

alter table public.tournament_matches
  add column live_stream_url text,
  add column live_stream_status text,
  add column live_stream_updated_at timestamptz,
  add column live_stream_updated_by uuid references auth.users(id) on delete set null,
  add constraint tournament_matches_live_stream_valid check (
    (live_stream_url is null and live_stream_status is null)
    or (
      live_stream_url ~ '^https://[^[:space:]]+$'
      and char_length(live_stream_url) <= 500
      and live_stream_status in ('scheduled', 'live', 'ended')
    )
  );

create index team_nominations_live_stream_idx
  on public.team_nominations (team_id, live_stream_status)
  where live_stream_url is not null;

create index tournament_matches_live_stream_idx
  on public.tournament_matches (tournament_id, live_stream_status)
  where live_stream_url is not null;

create index team_nominations_live_stream_updated_by_idx
  on public.team_nominations (live_stream_updated_by)
  where live_stream_updated_by is not null;

create index tournament_matches_live_stream_updated_by_idx
  on public.tournament_matches (live_stream_updated_by)
  where live_stream_updated_by is not null;

create or replace function public.get_team_nomination_stream(p_nomination_id uuid)
returns table (stream_url text, stream_status text, can_manage boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  target_team_id uuid;
  is_manager boolean;
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  select nomination.team_id
  into target_team_id
  from public.team_nominations nomination
  where nomination.id = p_nomination_id;

  if target_team_id is null then raise exception 'Nomination not found'; end if;

  is_manager := exists (
    select 1
    from public.team_memberships membership
    where membership.team_id = target_team_id
      and membership.user_id = uid
      and membership.role in ('coach', 'manager', 'club_admin')
  ) or coalesce((select private.is_platform_admin(uid)), false);

  if not is_manager and not exists (
    select 1
    from public.team_players team_player
    join public.player_guardians guardian on guardian.player_id = team_player.player_id
    where team_player.team_id = target_team_id
      and team_player.status = 'active'
      and guardian.guardian_user_id = uid
  ) then
    raise exception 'Not authorized';
  end if;

  return query
  select nomination.live_stream_url, nomination.live_stream_status, is_manager
  from public.team_nominations nomination
  where nomination.id = p_nomination_id;
end;
$$;

create or replace function public.set_team_nomination_stream(
  p_nomination_id uuid,
  p_stream_url text,
  p_stream_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  clean_url text := nullif(trim(p_stream_url), '');
  target_team_id uuid;
  target_event_type text;
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  select nomination.team_id, nomination.event_type
  into target_team_id, target_event_type
  from public.team_nominations nomination
  where nomination.id = p_nomination_id;

  if target_team_id is null then raise exception 'Nomination not found'; end if;
  if target_event_type not in ('match', 'tournament') then raise exception 'Stream is only available for matches and tournaments'; end if;
  if not exists (
    select 1
    from public.team_memberships membership
    where membership.team_id = target_team_id
      and membership.user_id = uid
      and membership.role in ('coach', 'manager', 'club_admin')
  ) and not coalesce((select private.is_platform_admin(uid)), false) then
    raise exception 'Not authorized';
  end if;

  if clean_url is not null then
    if char_length(clean_url) > 500 or clean_url !~ '^https://[^[:space:]]+$' then raise exception 'Invalid stream URL'; end if;
    if p_stream_status not in ('scheduled', 'live', 'ended') then raise exception 'Invalid stream status'; end if;
  end if;

  update public.team_nominations
  set live_stream_url = clean_url,
      live_stream_status = case when clean_url is null then null else p_stream_status end,
      live_stream_updated_at = case when clean_url is null then null else now() end,
      live_stream_updated_by = case when clean_url is null then null else uid end,
      updated_at = now()
  where id = p_nomination_id;
end;
$$;

create or replace function public.set_tournament_match_stream(
  p_match_id uuid,
  p_stream_url text,
  p_stream_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  clean_url text := nullif(trim(p_stream_url), '');
  target_tournament_id uuid;
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  select match.tournament_id
  into target_tournament_id
  from public.tournament_matches match
  where match.id = p_match_id;

  if target_tournament_id is null then raise exception 'Match not found'; end if;
  if not exists (
    select 1
    from public.tournaments tournament
    where tournament.id = target_tournament_id
      and (
        tournament.organizer_id = uid
        or coalesce((select private.is_platform_admin(uid)), false)
      )
  ) then raise exception 'Not authorized'; end if;

  if clean_url is not null then
    if char_length(clean_url) > 500 or clean_url !~ '^https://[^[:space:]]+$' then raise exception 'Invalid stream URL'; end if;
    if p_stream_status not in ('scheduled', 'live', 'ended') then raise exception 'Invalid stream status'; end if;
  end if;

  update public.tournament_matches
  set live_stream_url = clean_url,
      live_stream_status = case when clean_url is null then null else p_stream_status end,
      live_stream_updated_at = case when clean_url is null then null else now() end,
      live_stream_updated_by = case when clean_url is null then null else uid end,
      updated_at = now()
  where id = p_match_id;
end;
$$;

revoke execute on function public.get_team_nomination_stream(uuid) from public, anon;
revoke execute on function public.set_team_nomination_stream(uuid, text, text) from public, anon;
revoke execute on function public.set_tournament_match_stream(uuid, text, text) from public, anon;
grant execute on function public.get_team_nomination_stream(uuid) to authenticated;
grant execute on function public.set_team_nomination_stream(uuid, text, text) to authenticated;
grant execute on function public.set_tournament_match_stream(uuid, text, text) to authenticated;

comment on function public.get_team_nomination_stream(uuid) is
  'Returns a team event stream only to verified staff, platform admins, or guardians of an active player in the team.';
comment on function public.set_team_nomination_stream(uuid, text, text) is
  'Lets verified team staff and platform admins manage an HTTPS stream link for a match or tournament event.';
comment on function public.set_tournament_match_stream(uuid, text, text) is
  'Lets a tournament organizer or platform admin manage an HTTPS stream link for one scheduled tournament match.';
