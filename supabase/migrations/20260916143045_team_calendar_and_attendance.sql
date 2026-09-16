alter table public.team_nominations
  add column ends_at timestamptz,
  add column series_id uuid,
  add constraint team_nominations_valid_time
    check (ends_at is null or ends_at > starts_at);

alter table public.team_nomination_players
  add column attendance_status text
    check (attendance_status is null or attendance_status in ('present', 'absent')),
  add column attendance_recorded_by uuid references auth.users(id) on delete set null,
  add column attendance_recorded_at timestamptz;

create index team_nominations_team_type_starts_idx
  on public.team_nominations (team_id, event_type, starts_at);

create or replace function public.create_team_training_series(
  p_team_id uuid,
  p_title text,
  p_starts_at timestamp,
  p_ends_at timestamp,
  p_location text,
  p_note text,
  p_repeat_weeks integer default 1
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  clean_title text := trim(p_title);
  clean_location text := nullif(trim(p_location), '');
  clean_note text := nullif(trim(p_note), '');
  series_uuid uuid := gen_random_uuid();
  nomination_id uuid;
  created_ids uuid[] := array[]::uuid[];
  week_offset integer;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.team_memberships m
    where m.team_id = p_team_id
      and m.user_id = uid
      and m.role in ('coach', 'manager', 'club_admin')
  ) and not coalesce((select private.is_platform_admin(uid)), false) then
    raise exception 'Not authorized';
  end if;

  if char_length(clean_title) not between 3 and 120 then
    raise exception 'Invalid title';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'Invalid time';
  end if;
  if p_ends_at - p_starts_at < interval '15 minutes'
    or p_ends_at - p_starts_at > interval '6 hours' then
    raise exception 'Invalid duration';
  end if;
  if p_repeat_weeks not between 1 and 52 then
    raise exception 'Invalid repeat count';
  end if;
  if char_length(coalesce(clean_location, '')) > 160
    or char_length(coalesce(clean_note, '')) > 1000 then
    raise exception 'Text too long';
  end if;
  if not exists (
    select 1
    from public.team_players tp
    join public.player_profiles p on p.id = tp.player_id
    where tp.team_id = p_team_id
      and tp.status = 'active'
      and p.status = 'active'
  ) then
    raise exception 'Team has no active players';
  end if;

  for week_offset in 0..(p_repeat_weeks - 1) loop
    insert into public.team_nominations (
      team_id, created_by, title, event_type, starts_at, ends_at,
      location, note, series_id
    )
    values (
      p_team_id,
      uid,
      clean_title,
      'training',
      (p_starts_at + make_interval(weeks => week_offset)) at time zone 'Europe/Bratislava',
      (p_ends_at + make_interval(weeks => week_offset)) at time zone 'Europe/Bratislava',
      clean_location,
      clean_note,
      series_uuid
    )
    returning id into nomination_id;

    insert into public.team_nomination_players (nomination_id, player_id)
    select nomination_id, tp.player_id
    from public.team_players tp
    join public.player_profiles p on p.id = tp.player_id
    where tp.team_id = p_team_id
      and tp.status = 'active'
      and p.status = 'active';

    created_ids := array_append(created_ids, nomination_id);
  end loop;

  return created_ids;
end;
$$;

create or replace function public.get_team_calendar_events(
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

create or replace function public.get_nomination_roster_v2(p_nomination_id uuid)
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
    np.player_id,
    p.full_name,
    np.response,
    np.responded_at,
    (
      is_manager
      or exists (
        select 1
        from public.player_guardians pg
        where pg.player_id = np.player_id
          and pg.guardian_user_id = uid
      )
    ),
    case
      when is_manager or exists (
        select 1
        from public.player_guardians pg
        where pg.player_id = np.player_id
          and pg.guardian_user_id = uid
      ) then np.decline_reason
      else null
    end,
    np.attendance_status,
    np.attendance_recorded_at,
    is_manager
  from public.team_nominations n
  join public.club_teams t on t.id = n.team_id
  join public.team_nomination_players np on np.nomination_id = n.id
  join public.player_profiles p on p.id = np.player_id
  where n.id = p_nomination_id
  order by p.full_name;
end;
$$;

create or replace function public.record_training_attendance(
  p_nomination_id uuid,
  p_player_id uuid,
  p_attendance_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  target_team_id uuid;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_attendance_status not in ('present', 'absent', 'unmarked') then
    raise exception 'Invalid attendance status';
  end if;

  select n.team_id
  into target_team_id
  from public.team_nominations n
  join public.team_nomination_players np
    on np.nomination_id = n.id
    and np.player_id = p_player_id
  where n.id = p_nomination_id
    and n.event_type = 'training'
    and n.status <> 'cancelled';

  if target_team_id is null then
    raise exception 'Training not found';
  end if;

  if not exists (
    select 1
    from public.team_memberships m
    where m.team_id = target_team_id
      and m.user_id = uid
      and m.role in ('coach', 'manager', 'club_admin')
  ) and not coalesce((select private.is_platform_admin(uid)), false) then
    raise exception 'Not authorized';
  end if;

  update public.team_nomination_players
  set attendance_status = case
        when p_attendance_status = 'unmarked' then null
        else p_attendance_status
      end,
      attendance_recorded_by = case
        when p_attendance_status = 'unmarked' then null
        else uid
      end,
      attendance_recorded_at = case
        when p_attendance_status = 'unmarked' then null
        else now()
      end
  where nomination_id = p_nomination_id
    and player_id = p_player_id;
end;
$$;

create or replace function public.get_team_training_stats(
  p_team_id uuid,
  p_from date,
  p_to date
)
returns table (
  player_id uuid,
  player_name text,
  player_status text,
  training_count bigint,
  present_count bigint,
  absent_count bigint,
  unrecorded_count bigint,
  attendance_rate numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  range_start timestamptz;
  range_end timestamptz;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Invalid date range';
  end if;
  if not exists (
    select 1
    from public.team_memberships m
    where m.team_id = p_team_id
      and m.user_id = uid
      and m.role in ('coach', 'manager', 'club_admin')
  ) and not coalesce((select private.is_platform_admin(uid)), false) then
    raise exception 'Not authorized';
  end if;

  range_start := p_from::timestamp at time zone 'Europe/Bratislava';
  range_end := (p_to + 1)::timestamp at time zone 'Europe/Bratislava';

  return query
  select
    tp.player_id,
    p.full_name,
    tp.status,
    count(distinct np.nomination_id),
    count(*) filter (where np.attendance_status = 'present'),
    count(*) filter (where np.attendance_status = 'absent'),
    count(*) filter (
      where np.nomination_id is not null
        and np.attendance_status is null
    ),
    case
      when count(*) filter (where np.attendance_status in ('present', 'absent')) = 0 then null
      else round(
        100.0 * count(*) filter (where np.attendance_status = 'present')
        / count(*) filter (where np.attendance_status in ('present', 'absent')),
        1
      )
    end
  from public.team_players tp
  join public.player_profiles p on p.id = tp.player_id
  left join public.team_nominations n
    on n.team_id = tp.team_id
    and n.event_type = 'training'
    and n.status <> 'cancelled'
    and n.starts_at >= range_start
    and n.starts_at < range_end
    and n.starts_at <= now()
  left join public.team_nomination_players np
    on np.nomination_id = n.id
    and np.player_id = tp.player_id
  where tp.team_id = p_team_id
    and p.status = 'active'
  group by tp.player_id, p.full_name, tp.status
  order by tp.status, p.full_name;
end;
$$;

revoke execute on function public.create_team_training_series(uuid,text,timestamp,timestamp,text,text,integer) from public, anon;
revoke execute on function public.get_team_calendar_events(uuid,date) from public, anon;
revoke execute on function public.get_nomination_roster_v2(uuid) from public, anon;
revoke execute on function public.record_training_attendance(uuid,uuid,text) from public, anon;
revoke execute on function public.get_team_training_stats(uuid,date,date) from public, anon;

grant execute on function public.create_team_training_series(uuid,text,timestamp,timestamp,text,text,integer) to authenticated;
grant execute on function public.get_team_calendar_events(uuid,date) to authenticated;
grant execute on function public.get_nomination_roster_v2(uuid) to authenticated;
grant execute on function public.record_training_attendance(uuid,uuid,text) to authenticated;
grant execute on function public.get_team_training_stats(uuid,date,date) to authenticated;

comment on function public.create_team_training_series(uuid,text,timestamp,timestamp,text,text,integer) is
  'Creates one or more weekly training events and includes every active player in the team.';
comment on function public.get_team_calendar_events(uuid,date) is
  'Returns privacy-safe monthly team calendar events for verified staff and guardians.';
comment on function public.get_team_training_stats(uuid,date,date) is
  'Returns actual recorded training attendance statistics to verified team staff only.';
