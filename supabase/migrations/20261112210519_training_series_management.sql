alter table public.team_nominations add column cancellation_reason text
  check (cancellation_reason is null or char_length(cancellation_reason) between 2 and 500);
create index team_nominations_series_idx on public.team_nominations(team_id, series_id)
  where series_id is not null;

create function public.get_training_cancellation_reason(p_id uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare result text;
begin
  if (select auth.uid()) is null then raise exception 'Not authenticated'; end if;
  -- Reuse the same team/guardian authorization as the event detail.
  perform 1 from public.get_nomination_roster_v3(p_id) limit 1;
  select cancellation_reason into result from public.team_nominations
    where id = p_id and event_type = 'training' and status = 'cancelled';
  return result;
end;
$$;

create function public.get_training_management(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  target public.team_nominations;
  result jsonb;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select * into target from public.team_nominations where id = p_id and event_type = 'training';
  if target.id is null then raise exception 'Training not found'; end if;
  if not exists (select 1 from public.team_memberships m where m.team_id = target.team_id
    and m.user_id = uid and m.role in ('coach','manager','club_admin'))
    and not coalesce((select private.is_platform_admin(uid)), false) then raise exception 'Not authorized'; end if;
  select jsonb_build_object(
    'version', md5(string_agg(n.id::text || private.training_notification_version(n), ',' order by n.id)),
    'series', target.series_id is not null,
    'editable', target.status = 'open' and target.starts_at > now(),
    'all_count', count(*) filter (where n.status = 'open' and n.starts_at > now()),
    'following_count', count(*) filter (where n.status = 'open' and n.starts_at > now() and n.starts_at >= target.starts_at)
  ) into result
  from public.team_nominations n where n.team_id = target.team_id and n.event_type = 'training'
    and (n.id = target.id or (target.series_id is not null and n.series_id = target.series_id));
  return result;
end;
$$;

create function public.manage_team_training(
  p_id uuid, p_scope text, p_operation text, p_version text,
  p_title text default null, p_starts_at timestamp default null, p_ends_at timestamp default null,
  p_location text default null, p_note text default null, p_reason text default null
)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  target public.team_nominations;
  item public.team_nominations;
  target_ids uuid[];
  delta interval;
  next_start timestamptz;
  next_end timestamptz;
  changed_count integer := 0;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_scope is null or p_scope not in ('one','following','all') or p_operation is null
    or p_operation not in ('edit','cancel') then raise exception 'Invalid operation'; end if;
  select * into target from public.team_nominations where id = p_id and event_type = 'training';
  if target.id is null then raise exception 'Training not found'; end if;
  if not exists (select 1 from public.team_memberships m where m.team_id = target.team_id
    and m.user_id = uid and m.role in ('coach','manager','club_admin'))
    and not coalesce((select private.is_platform_admin(uid)), false) then raise exception 'Not authorized'; end if;
  perform pg_advisory_xact_lock(hashtextextended(coalesce(target.series_id, target.id)::text, 0));
  select * into target from public.team_nominations where id = p_id for update;
  if target.starts_at <= now() or target.status <> 'open' then raise exception 'Training is not editable'; end if;
  if p_version is null or p_version <> public.get_training_management(p_id)->>'version' then
    raise exception 'Training changed; reload';
  end if;
  if p_scope <> 'one' and target.series_id is null then raise exception 'Not a series'; end if;
  if p_operation = 'edit' then
    if p_title is null or char_length(trim(p_title)) not between 3 and 120
      or char_length(coalesce(p_location,'')) > 160 or char_length(coalesce(p_note,'')) > 1000
      then raise exception 'Invalid text'; end if;
    if p_starts_at is null or p_ends_at is null or p_ends_at - p_starts_at < interval '15 minutes'
      or p_ends_at - p_starts_at > interval '6 hours' then raise exception 'Invalid duration'; end if;
    delta := p_starts_at - (target.starts_at at time zone 'Europe/Bratislava');
  elsif p_reason is null or char_length(trim(p_reason)) not between 2 and 500 then
    raise exception 'Cancellation reason required';
  end if;

  select array_agg(n.id) into target_ids from public.team_nominations n
  where n.team_id = target.team_id and n.event_type = 'training' and n.status = 'open' and n.starts_at > now()
    and (n.id = target.id or (p_scope <> 'one' and n.series_id = target.series_id
      and (p_scope = 'all' or n.starts_at >= target.starts_at)));
  -- Lock both events and their attendance rows; never erase recorded attendance.
  perform 1 from public.team_nominations n where n.id = any(target_ids) order by n.id for update;
  perform 1 from public.team_nomination_players np where np.nomination_id = any(target_ids)
    order by np.nomination_id, np.player_id for update;
  if exists (select 1 from public.team_nomination_players np where np.nomination_id = any(target_ids)
    and np.attendance_status is not null) then raise exception 'Attendance already recorded'; end if;

  for item in select * from public.team_nominations where id = any(target_ids) order by id loop
    if p_operation = 'cancel' then
      update public.team_nominations set status = 'cancelled',
        cancellation_reason = trim(p_reason), updated_at = now()
        where id = item.id;
    else
      next_start := ((item.starts_at at time zone 'Europe/Bratislava') + delta) at time zone 'Europe/Bratislava';
      next_end := ((item.starts_at at time zone 'Europe/Bratislava') + delta + (p_ends_at - p_starts_at)) at time zone 'Europe/Bratislava';
      if next_start at time zone 'Europe/Bratislava' <> (item.starts_at at time zone 'Europe/Bratislava') + delta
        or next_end at time zone 'Europe/Bratislava' <> (item.starts_at at time zone 'Europe/Bratislava') + delta + (p_ends_at - p_starts_at)
        then raise exception 'Invalid local time'; end if;
      if next_start <= now() or next_end <= next_start then raise exception 'Cannot move training into past'; end if;
      -- A summer/winter-time transition must not silently shorten/extend training.
      if next_end - next_start < interval '15 minutes' or next_end - next_start > interval '6 hours'
        then raise exception 'Invalid duration'; end if;
      if item.starts_at is distinct from next_start or item.ends_at is distinct from next_end
        or coalesce(item.location,'') <> coalesce(trim(p_location),'') then
        update public.team_nomination_players set response = 'pending', decline_reason = null,
          responded_by = null, responded_at = null where nomination_id = item.id;
      end if;
      update public.team_nominations set title = trim(p_title), starts_at = next_start, ends_at = next_end,
        location = nullif(trim(p_location),''), note = nullif(trim(p_note),''), updated_at = now() where id = item.id;
    end if;
    changed_count := changed_count + 1;
  end loop;
  return changed_count;
end;
$$;

revoke execute on function public.get_training_management(uuid) from public, anon;
revoke execute on function public.get_training_cancellation_reason(uuid) from public, anon;
revoke execute on function public.manage_team_training(uuid,text,text,text,text,timestamp,timestamp,text,text,text) from public, anon;
grant execute on function public.get_training_management(uuid) to authenticated;
grant execute on function public.get_training_cancellation_reason(uuid) to authenticated;
grant execute on function public.manage_team_training(uuid,text,text,text,text,timestamp,timestamp,text,text,text) to authenticated;
