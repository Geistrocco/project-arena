-- Delivery and acknowledgement are per parent, not per browser or child.
create table public.training_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nomination_id uuid not null references public.team_nominations(id) on delete cascade,
  kind text not null check (kind in ('reminder', 'changed', 'cancelled')),
  version text not null,
  created_at timestamptz not null default now(),
  dismissed_at timestamptz,
  unique (user_id, nomination_id, kind, version)
);
alter table public.training_notifications enable row level security;
revoke all on public.training_notifications from anon, authenticated;
create index training_notifications_user_pending_idx
  on public.training_notifications(user_id) where dismissed_at is null;

create function private.training_notification_version(n public.team_nominations)
returns text language sql immutable set search_path = '' as $$
  select md5(jsonb_build_array(n.title, extract(epoch from n.starts_at), extract(epoch from n.ends_at), n.location, n.note, n.status)::text);
$$;

create function private.notify_training_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.event_type <> 'training' or new.starts_at < now()
    or private.training_notification_version(new) = private.training_notification_version(old) then
    return new;
  end if;
  insert into public.training_notifications(user_id, nomination_id, kind, version)
  select distinct pg.guardian_user_id, new.id,
    case when new.status = 'cancelled' then 'cancelled' else 'changed' end,
    private.training_notification_version(new)
  from public.team_nomination_players np
  join public.player_guardians pg on pg.player_id = np.player_id
  join public.team_players tp on tp.player_id = np.player_id and tp.team_id = new.team_id and tp.status = 'active'
  where np.nomination_id = new.id
  on conflict do nothing;
  return new;
end;
$$;
create trigger team_training_change_notification
after update of title, starts_at, ends_at, location, note, status on public.team_nominations
for each row execute function private.notify_training_change();

create function public.get_my_training_notifications()
returns table (id uuid, nomination_id uuid, kind text, title text, team_name text,
  starts_at timestamptz, location text, note text)
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  insert into public.training_notifications(user_id, nomination_id, kind, version)
  select distinct uid, n.id, 'reminder', private.training_notification_version(n)
  from public.team_nominations n
  join public.team_nomination_players np on np.nomination_id = n.id
  join public.player_guardians pg on pg.player_id = np.player_id and pg.guardian_user_id = uid
  join public.team_players tp on tp.player_id = np.player_id and tp.team_id = n.team_id and tp.status = 'active'
  where n.event_type = 'training' and n.status <> 'cancelled'
    and n.starts_at > now() and n.starts_at <= now() + interval '1 hour'
    and np.response <> 'declined'
  on conflict do nothing;

  return query
  select a.id, n.id, a.kind, n.title, t.name, n.starts_at, n.location, n.note
  from public.training_notifications a
  join public.team_nominations n on n.id = a.nomination_id
  join public.club_teams t on t.id = n.team_id
  where a.user_id = uid and a.dismissed_at is null
    and n.starts_at > now()
    and a.version = private.training_notification_version(n)
    and (a.kind <> 'reminder' or (n.status <> 'cancelled' and n.starts_at <= now() + interval '1 hour'))
    and (a.kind <> 'reminder' or not exists (
      select 1 from public.training_notifications change_notice
      where change_notice.user_id = uid and change_notice.nomination_id = n.id
        and change_notice.version = a.version and change_notice.kind in ('changed', 'cancelled')
        and change_notice.created_at >= n.starts_at - interval '1 hour'
    ))
    and exists (
      select 1 from public.team_nomination_players np
      join public.player_guardians pg on pg.player_id = np.player_id and pg.guardian_user_id = uid
      join public.team_players tp on tp.player_id = np.player_id and tp.team_id = n.team_id and tp.status = 'active'
      where np.nomination_id = n.id and (a.kind <> 'reminder' or np.response <> 'declined')
    )
  order by case when a.kind = 'cancelled' then 0 when a.kind = 'changed' then 1 else 2 end, n.starts_at
  limit 30;
end;
$$;

create function public.dismiss_training_notification(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  update public.training_notifications set dismissed_at = now()
  where id = p_id and user_id = uid and dismissed_at is null;
end;
$$;

revoke execute on function private.training_notification_version(public.team_nominations) from public, anon, authenticated;
revoke execute on function private.notify_training_change() from public, anon, authenticated;
revoke execute on function public.get_my_training_notifications() from public, anon;
revoke execute on function public.dismiss_training_notification(uuid) from public, anon;
grant execute on function public.get_my_training_notifications() to authenticated;
grant execute on function public.dismiss_training_notification(uuid) to authenticated;
