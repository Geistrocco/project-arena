drop function if exists public.get_team_calendar_events(uuid, date);

create function public.get_team_calendar_events(
  p_team_id uuid,
  p_month date
)
returns table (
  nomination_id uuid,
  title text,
  event_type text,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  note text,
  status text,
  nominated_count bigint,
  accepted_count bigint,
  declined_count bigint,
  pending_count bigint,
  present_count bigint,
  absent_count bigint,
  attendance_unmarked_count bigint,
  can_manage boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  is_manager boolean;
  month_start timestamptz;
  month_end timestamptz;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_month is null then
    raise exception 'Missing month';
  end if;

  is_manager := exists (
    select 1
    from public.team_memberships m
    where m.team_id = p_team_id
      and m.user_id = uid
      and m.role in ('coach', 'manager', 'club_admin')
  ) or coalesce((select private.is_platform_admin(uid)), false);

  if not is_manager and not exists (
    select 1
    from public.team_players tp
    join public.player_guardians pg on pg.player_id = tp.player_id
    where tp.team_id = p_team_id
      and tp.status = 'active'
      and pg.guardian_user_id = uid
  ) then
    raise exception 'Not authorized';
  end if;

  month_start := date_trunc('month', p_month::timestamp) at time zone 'Europe/Bratislava';
  month_end := (date_trunc('month', p_month::timestamp) + interval '1 month') at time zone 'Europe/Bratislava';

  return query
  select
    n.id,
    n.title,
    n.event_type,
    n.starts_at,
    n.ends_at,
    n.location,
    case when is_manager then n.note else null end,
    n.status,
    count(np.player_id),
    count(*) filter (where np.response = 'accepted'),
    count(*) filter (where np.response = 'declined'),
    count(*) filter (where np.response = 'pending'),
    count(*) filter (where np.attendance_status = 'present'),
    count(*) filter (where np.attendance_status = 'absent'),
    count(*) filter (where np.attendance_status is null),
    is_manager
  from public.team_nominations n
  join public.team_nomination_players np on np.nomination_id = n.id
  where n.team_id = p_team_id
    and n.starts_at >= month_start
    and n.starts_at < month_end
  group by n.id
  order by n.starts_at;
end;
$$;

revoke execute on function public.get_team_calendar_events(uuid, date) from public, anon;
grant execute on function public.get_team_calendar_events(uuid, date) to authenticated;

comment on function public.get_team_calendar_events(uuid, date) is
  'Returns privacy-safe monthly team calendar events. Training notes are included only for verified staff so they can copy an event.';
