create or replace function public.get_nomination_roster_v3(p_nomination_id uuid)
returns table (
  nomination_id uuid,
  team_id uuid,
  team_name text,
  title text,
  event_type text,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  note text,
  nomination_status text,
  player_id uuid,
  player_name text,
  is_nominated boolean,
  response text,
  responded_at timestamptz,
  can_respond boolean,
  decline_reason text,
  attendance_status text,
  attendance_recorded_at timestamptz,
  can_manage boolean
)
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
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select n.team_id
  into target_team_id
  from public.team_nominations n
  where n.id = p_nomination_id;

  if target_team_id is null then
    raise exception 'Nomination not found';
  end if;

  is_manager := exists (
    select 1
    from public.team_memberships m
    where m.team_id = target_team_id
      and m.user_id = uid
      and m.role in ('coach', 'manager', 'club_admin')
  ) or coalesce((select private.is_platform_admin(uid)), false);

  if not is_manager and not exists (
    select 1
    from public.team_players tp
    join public.player_guardians pg on pg.player_id = tp.player_id
    where tp.team_id = target_team_id
      and tp.status = 'active'
      and pg.guardian_user_id = uid
  ) then
    raise exception 'Not authorized';
  end if;

  return query
  with visible_players as (
    select tp.player_id
    from public.team_players tp
    join public.player_profiles profile on profile.id = tp.player_id
    where tp.team_id = target_team_id
      and tp.status = 'active'
      and profile.status = 'active'

    union

    select nominated.player_id
    from public.team_nomination_players nominated
    where nominated.nomination_id = p_nomination_id
  )
  select
    n.id,
    n.team_id,
    t.name,
    n.title,
    n.event_type,
    n.starts_at,
    n.ends_at,
    n.location,
    n.note,
    n.status,
    players.player_id,
    profile.full_name,
    (np.player_id is not null),
    np.response,
    np.responded_at,
    (
      np.player_id is not null
      and (
        is_manager
        or exists (
          select 1
          from public.player_guardians pg
          where pg.player_id = players.player_id
            and pg.guardian_user_id = uid
        )
      )
    ),
    case
      when np.player_id is not null
        and (
          is_manager
          or exists (
            select 1
            from public.player_guardians pg
            where pg.player_id = players.player_id
              and pg.guardian_user_id = uid
          )
        ) then np.decline_reason
      else null
    end,
    np.attendance_status,
    np.attendance_recorded_at,
    is_manager
  from public.team_nominations n
  join public.club_teams t on t.id = n.team_id
  cross join visible_players players
  join public.player_profiles profile on profile.id = players.player_id
  left join public.team_nomination_players np
    on np.nomination_id = n.id
    and np.player_id = players.player_id
  where n.id = p_nomination_id
  order by (np.player_id is not null) desc, profile.full_name;
end;
$$;

revoke execute on function public.get_nomination_roster_v3(uuid) from public, anon;
grant execute on function public.get_nomination_roster_v3(uuid) to authenticated;

comment on function public.get_nomination_roster_v3(uuid) is
  'Shows the full team nomination status to verified team staff and guardians while limiting responses and decline reasons to authorized users.';
