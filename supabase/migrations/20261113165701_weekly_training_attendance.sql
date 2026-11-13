-- No historical responses or coach records are rewritten.
alter table public.team_nomination_players drop constraint team_nomination_players_attendance_status_check;
alter table public.team_nomination_players add constraint team_nomination_players_attendance_status_check
  check (attendance_status is null or attendance_status in ('present','absent','excused','unexcused'));
create function private.training_release_at(p_start timestamptz)
returns timestamptz language sql immutable set search_path = '' as $$
  select (date_trunc('week', p_start at time zone 'Europe/Bratislava') - interval '1 day') at time zone 'Europe/Bratislava';
$$;
create function private.training_attendance(p_response text, p_override text)
returns text language sql immutable set search_path = '' as $$
  select case when p_override = 'present' then 'present'
    when p_override = 'excused' then 'excused'
    when p_override = 'unexcused' then 'unexcused'
    when p_override = 'absent' then case when p_response='declined' then 'excused' else 'unexcused' end
    when p_response = 'accepted' then 'present'
    when p_response = 'declined' then 'excused' else 'unconfirmed' end;
$$;
revoke all on function private.training_release_at(timestamptz) from public, anon, authenticated;
revoke all on function private.training_attendance(text,text) from public, anon, authenticated;
create or replace function public.create_team_nomination(
  p_team_id uuid,
  p_title text,
  p_event_type text,
  p_starts_at timestamp,
  p_location text,
  p_note text,
  p_player_ids uuid[]
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  clean_title text := trim(p_title);
  clean_location text := nullif(trim(p_location), '');
  clean_note text := nullif(trim(p_note), '');
  nomination_id uuid;
  selected_count integer;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if not exists (
    select 1 from public.team_memberships m
    where m.team_id = p_team_id and m.user_id = uid and m.role in ('coach', 'manager', 'club_admin')
  ) and not coalesce((select private.is_platform_admin(uid)), false) then
    raise exception 'Not authorized';
  end if;
  if char_length(clean_title) not between 3 and 120 then raise exception 'Invalid title'; end if;
  if p_event_type not in ('match', 'tournament', 'training', 'other') then raise exception 'Invalid event type'; end if;
  if p_starts_at is null then raise exception 'Missing date'; end if;
  if char_length(coalesce(clean_location, '')) > 160 or char_length(coalesce(clean_note, '')) > 1000 then raise exception 'Text too long'; end if;
  if p_event_type = 'training' then
    select array_agg(tp.player_id) into p_player_ids
    from public.team_players tp join public.player_profiles p on p.id = tp.player_id
    where tp.team_id = p_team_id and tp.status = 'active' and p.status = 'active';
  end if;
  if coalesce(cardinality(p_player_ids), 0) = 0 or cardinality(p_player_ids) > 100 then raise exception 'Select players'; end if;

  select count(distinct selected.player_id) into selected_count
  from unnest(p_player_ids) selected(player_id)
  join public.team_players tp on tp.player_id = selected.player_id
  where tp.team_id = p_team_id and tp.status = 'active';
  if selected_count <> (select count(distinct player_id) from unnest(p_player_ids) chosen(player_id)) then
    raise exception 'Player does not belong to the team';
  end if;

  insert into public.team_nominations (team_id, created_by, title, event_type, starts_at, location, note)
  values (p_team_id, uid, clean_title, p_event_type, p_starts_at at time zone 'Europe/Bratislava', clean_location, clean_note)
  returning id into nomination_id;
  insert into public.team_nomination_players (nomination_id, player_id)
  select nomination_id, player_id from unnest(p_player_ids) chosen(player_id) group by player_id;
  return nomination_id;
end; $$;

create or replace function public.respond_to_team_nomination(
  p_nomination_id uuid,
  p_player_id uuid,
  p_response text,
  p_decline_reason text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  target_team_id uuid;
  training public.team_nominations;
  clean_reason text := nullif(trim(p_decline_reason), '');
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_response not in ('accepted', 'declined') then raise exception 'Invalid response'; end if;
  if p_response = 'declined' and clean_reason is null then raise exception 'Decline reason required'; end if;
  if char_length(coalesce(clean_reason, '')) > 500 then raise exception 'Reason too long'; end if;
  select n.team_id into target_team_id
  from public.team_nominations n
  join public.team_nomination_players np on np.nomination_id = n.id and np.player_id = p_player_id
  where n.id = p_nomination_id and n.status = 'open';
  if target_team_id is null then raise exception 'Open nomination not found'; end if;
  if not exists (select 1 from public.player_guardians pg where pg.player_id = p_player_id and pg.guardian_user_id = uid)
    and not exists (select 1 from public.team_memberships m where m.team_id = target_team_id and m.user_id = uid and m.role in ('coach', 'manager', 'club_admin'))
    and not coalesce((select private.is_platform_admin(uid)), false) then
    raise exception 'Not authorized';
  end if;
  -- Serialize with schedule changes and freeze parental plans when training starts.
  select * into training from public.team_nominations where id = p_nomination_id for update;
  if training.status <> 'open' then raise exception 'Open nomination not found'; end if;
  if training.event_type = 'training' and (training.starts_at <= now()
    or private.training_release_at(training.starts_at) > now()) then
    raise exception 'Training response window closed';
  end if;
  update public.team_nomination_players
  set response = p_response,
      decline_reason = case when p_response = 'declined' then clean_reason else null end,
      responded_by = uid,
      responded_at = now()
  where nomination_id = p_nomination_id and player_id = p_player_id;
end; $$;

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
  if p_attendance_status is null or p_attendance_status not in ('present', 'absent', 'excused', 'unexcused', 'unmarked') then
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
    and n.status <> 'cancelled'
    and coalesce(n.ends_at, n.starts_at) <= now()
  for update of n;

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
    count(*) filter (where private.training_attendance(np.response,np.attendance_status) = 'present'),
    count(*) filter (where private.training_attendance(np.response,np.attendance_status) in ('excused','unexcused')),
    count(*) filter (
      where np.nomination_id is not null
        and private.training_attendance(np.response,np.attendance_status) = 'unconfirmed'
    ),
    case
      when count(*) filter (where np.nomination_id is not null) = 0 then null
      else round(
        100.0 * count(*) filter (where private.training_attendance(np.response,np.attendance_status) = 'present')
        / count(*) filter (where np.nomination_id is not null),
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
    and coalesce(n.ends_at,n.starts_at) <= now()
  left join public.team_nomination_players np
    on np.nomination_id = n.id
    and np.player_id = tp.player_id
  where tp.team_id = p_team_id
    and p.status = 'active'
  group by tp.player_id, p.full_name, tp.status
  order by tp.status, p.full_name;
end;
$$;


create function public.get_team_training_stats_v2(p_team_id uuid, p_from date, p_to date)
returns table (player_id uuid, player_name text, player_status text, training_count bigint,
 present_count bigint, excused_count bigint, unexcused_count bigint, unconfirmed_count bigint, attendance_rate numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  -- Existing RPC validates authentication, team role and range before returning data.
  perform 1 from public.get_team_training_stats(p_team_id,p_from,p_to);
  return query
  with entries as (
    select np.player_id, private.training_attendance(np.response,np.attendance_status) as state
    from public.team_nominations n join public.team_nomination_players np on np.nomination_id = n.id
    where n.team_id = p_team_id and n.event_type = 'training' and n.status <> 'cancelled'
      and n.starts_at >= p_from::timestamp at time zone 'Europe/Bratislava'
      and n.starts_at < (p_to + 1)::timestamp at time zone 'Europe/Bratislava'
      and coalesce(n.ends_at,n.starts_at) <= now()
  )
  select tp.player_id,p.full_name,tp.status,count(e.player_id),
    count(*) filter(where e.state='present'),count(*) filter(where e.state='excused'),
    count(*) filter(where e.state='unexcused'),count(*) filter(where e.state='unconfirmed'),
    case when count(e.player_id)=0 then null else round(100.0 * count(*) filter(where e.state='present') / count(e.player_id),1) end
  from public.team_players tp join public.player_profiles p on p.id=tp.player_id
  left join entries e on e.player_id=tp.player_id
  where tp.team_id=p_team_id
  group by tp.player_id,p.full_name,tp.status order by tp.status,p.full_name;
end;
$$;
revoke all on function public.get_team_training_stats_v2(uuid,date,date) from public, anon;
grant execute on function public.get_team_training_stats_v2(uuid,date,date) to authenticated;
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
      and (n.event_type <> 'training' or (n.starts_at > now() and private.training_release_at(n.starts_at) <= now()))
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

alter table public.training_notifications drop constraint training_notifications_kind_check;
alter table public.training_notifications add constraint training_notifications_kind_check
  check (kind in ('reminder','changed','cancelled','weekly'));

create function public.get_my_training_notifications_v2()
returns table (id uuid, nomination_id uuid, kind text, title text, team_name text,
 starts_at timestamptz, location text, note text, team_id uuid)
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  -- One durable receipt per parent, team and week, shared across devices and children.
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':weekly',0));
  insert into public.training_notifications(user_id,nomination_id,kind,version)
  select uid,(array_agg(n.id order by n.starts_at,n.id))[1],'weekly',
    'weekly:' || n.team_id::text || ':' || (date_trunc('week',n.starts_at at time zone 'Europe/Bratislava')::date)::text
  from public.team_nominations n
  where n.event_type='training' and n.status='open' and n.starts_at > now()
    and private.training_release_at(n.starts_at) <= now()
    and exists(select 1 from public.team_nomination_players np
      join public.player_guardians pg on pg.player_id=np.player_id and pg.guardian_user_id=uid
      join public.team_players tp on tp.player_id=np.player_id and tp.team_id=n.team_id and tp.status='active'
      where np.nomination_id=n.id)
    and not exists(select 1 from public.training_notifications a where a.user_id=uid and a.kind='weekly'
      and a.version='weekly:' || n.team_id::text || ':' || (date_trunc('week',n.starts_at at time zone 'Europe/Bratislava')::date)::text)
  group by n.team_id,date_trunc('week',n.starts_at at time zone 'Europe/Bratislava')
  on conflict do nothing;

  return query select * from (
  select a.id,a.nomination_id,a.kind,a.title,a.team_name,a.starts_at,a.location,a.note,n.team_id
  from public.get_my_training_notifications() a
  join public.team_nominations n on n.id=a.nomination_id
  union all
  select a.id,n.id,'weekly'::text,'Program tréningov na týždeň'::text,t.name,
    min(w.starts_at),null::text,
    string_agg(to_char(w.starts_at at time zone 'Europe/Bratislava','DD.MM. HH24:MI') || ' · ' || w.title || coalesce(' · ' || w.location,''),E'\n' order by w.starts_at,w.id),n.team_id
  from public.training_notifications a
  join public.team_nominations n on n.id=a.nomination_id
  join public.club_teams t on t.id=n.team_id
  join public.team_nominations w on w.team_id=n.team_id and w.event_type='training'
    and w.status='open' and w.starts_at>now() and private.training_release_at(w.starts_at)<=now()
    and date_trunc('week',w.starts_at at time zone 'Europe/Bratislava')=date_trunc('week',n.starts_at at time zone 'Europe/Bratislava')
  where a.user_id=uid and a.kind='weekly' and a.dismissed_at is null
    and a.version='weekly:' || n.team_id::text || ':' || (date_trunc('week',n.starts_at at time zone 'Europe/Bratislava')::date)::text
    and exists(select 1 from public.team_nomination_players np
      join public.player_guardians pg on pg.player_id=np.player_id and pg.guardian_user_id=uid
      join public.team_players tp on tp.player_id=np.player_id and tp.team_id=w.team_id and tp.status='active'
      where np.nomination_id=w.id)
  group by a.id,n.id,t.name
  ) notices order by case notices.kind when 'cancelled' then 0 when 'changed' then 1 when 'reminder' then 2 else 3 end, notices.starts_at;
end;
$$;
revoke all on function public.get_my_training_notifications_v2() from public,anon;
grant execute on function public.get_my_training_notifications_v2() to authenticated;

-- A training added after a published digest was generated needs its own immediate notice.
create function private.notify_added_training()
returns trigger language plpgsql security definer set search_path = '' as $$
declare n public.team_nominations;
begin
  select * into n from public.team_nominations where id=new.nomination_id;
  if n.event_type<>'training' or n.status<>'open' or n.starts_at<=now()
    or private.training_release_at(n.starts_at)>now() then return new; end if;
  insert into public.training_notifications(user_id,nomination_id,kind,version)
  select distinct pg.guardian_user_id,n.id,'changed',private.training_notification_version(n)
  from public.player_guardians pg
  join public.team_players tp on tp.player_id=pg.player_id and tp.team_id=n.team_id and tp.status='active'
  where pg.player_id=new.player_id and exists(select 1 from public.training_notifications a
    where a.user_id=pg.guardian_user_id and a.kind='weekly'
      and a.version='weekly:' || n.team_id::text || ':' || (date_trunc('week',n.starts_at at time zone 'Europe/Bratislava')::date)::text)
  on conflict do nothing;
  return new;
end;
$$;
revoke all on function private.notify_added_training() from public,anon,authenticated;
create trigger added_training_notice after insert on public.team_nomination_players
for each row execute function private.notify_added_training();

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
    count(*) filter (where n.event_type='training' and n.status<>'cancelled' and coalesce(n.ends_at,n.starts_at)<=now() and private.training_attendance(np.response,np.attendance_status)='present'),
    count(*) filter (where n.event_type='training' and n.status<>'cancelled' and coalesce(n.ends_at,n.starts_at)<=now() and private.training_attendance(np.response,np.attendance_status) in ('excused','unexcused')),
    count(*) filter (where n.event_type='training' and n.status<>'cancelled' and coalesce(n.ends_at,n.starts_at)<=now() and private.training_attendance(np.response,np.attendance_status)='unconfirmed'),
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

