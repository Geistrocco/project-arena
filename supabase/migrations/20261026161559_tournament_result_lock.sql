-- State is separate from tournaments: no client or existing edit RPC can write it.
create table public.tournament_result_locks (
  tournament_id uuid primary key references public.tournaments(id) on delete cascade,
  locked_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.tournament_result_locks enable row level security;
revoke all on public.tournament_result_locks from public, anon, authenticated;
grant select on public.tournament_result_locks to anon, authenticated;
create policy tournament_lock_visible on public.tournament_result_locks for select to anon, authenticated
using (exists (select 1 from public.tournaments t where t.id = tournament_id));

create table public.tournament_result_lock_events (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('locked','unlocked')),
  reason text,
  created_at timestamptz not null default now(),
  check (action <> 'unlocked' or char_length(trim(reason)) between 5 and 1000)
);
create index tournament_lock_events_created_idx on public.tournament_result_lock_events(tournament_id,created_at desc);
create index tournament_lock_events_actor_idx on public.tournament_result_lock_events(actor_user_id);
alter table public.tournament_result_lock_events enable row level security;
revoke all on public.tournament_result_lock_events from public, anon, authenticated;
grant select on public.tournament_result_lock_events to authenticated;
create policy tournament_lock_events_owner on public.tournament_result_lock_events for select to authenticated
using (exists (select 1 from public.tournaments t where t.id = tournament_id and t.organizer_id = (select auth.uid())));

create function private.set_tournament_result_lock(p_slug text, p_locked boolean, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  tid uuid;
  was_locked boolean;
begin
  if uid is null or p_locked is null then raise exception 'NOT_ALLOWED'; end if;
  -- Parent row serializes finalization, score writes and plan regeneration.
  select id into tid from public.tournaments where slug = p_slug and organizer_id = uid for update;
  if tid is null then raise exception 'NOT_ALLOWED'; end if;
  select locked_at is not null into was_locked from public.tournament_result_locks where tournament_id = tid;
  if coalesce(was_locked,false) = p_locked then raise exception 'LOCK_STATE_CHANGED'; end if;
  if p_locked then
    if not exists (select 1 from public.tournament_matches where tournament_id = tid)
      or exists (select 1 from public.tournament_matches where tournament_id = tid and
        (status <> 'finished' or home_score is null or away_score is null or (phase = 'playoff' and home_score = away_score))) then
      raise exception 'UNFINISHED_MATCHES';
    end if;
  elsif p_reason is null or char_length(trim(p_reason)) not between 5 and 1000 then
    raise exception 'REASON_REQUIRED';
  end if;
  insert into public.tournament_result_locks(tournament_id,locked_at,updated_at)
  values (tid,case when p_locked then now() else null end,now())
  on conflict (tournament_id) do update set locked_at = excluded.locked_at, updated_at = excluded.updated_at;
  insert into public.tournament_result_lock_events(tournament_id,actor_user_id,action,reason)
  values (tid,uid,case when p_locked then 'locked' else 'unlocked' end,case when not p_locked then trim(p_reason) else null end);
end; $$;
revoke all on function private.set_tournament_result_lock(text,boolean,text) from public, anon, authenticated;
grant execute on function private.set_tournament_result_lock(text,boolean,text) to authenticated;
create function public.set_tournament_result_lock(p_slug text, p_locked boolean, p_reason text default null)
returns void language sql security invoker set search_path = '' as $$
  select private.set_tournament_result_lock(p_slug,p_locked,p_reason);
$$;
revoke all on function public.set_tournament_result_lock(text,boolean,text) from public, anon, authenticated;
grant execute on function public.set_tournament_result_lock(text,boolean,text) to authenticated;

create function private.guard_tournament_result_lock()
returns trigger language plpgsql security definer set search_path = '' as $$
declare tid uuid; locked boolean;
begin
  -- Streams may be updated after a tournament; scores and identity may not.
  if tg_table_name = 'tournament_matches' and tg_op = 'UPDATE' then
    if (to_jsonb(new) - array['live_stream_url','live_stream_status','live_stream_updated_at','live_stream_updated_by','updated_at'])
      = (to_jsonb(old) - array['live_stream_url','live_stream_status','live_stream_updated_at','live_stream_updated_by','updated_at']) then return new; end if;
  end if;
  if tg_table_name = 'tournaments' then
    tid := old.id;
  else
    if tg_op <> 'INSERT' then tid := old.tournament_id; else tid := new.tournament_id; end if;
    -- Every write participates in the same parent lock as finalization.
    perform 1 from public.tournaments where id = tid for share;
  end if;
  select locked_at is not null into locked from public.tournament_result_locks where tournament_id = tid;
  if coalesce(locked,false) then raise exception 'RESULTS_LOCKED'; end if;
  if tg_op = 'UPDATE' and tg_table_name <> 'tournaments' and new.tournament_id is distinct from old.tournament_id then
    perform 1 from public.tournaments where id = new.tournament_id for share;
    if exists (select 1 from public.tournament_result_locks where tournament_id = new.tournament_id and locked_at is not null) then raise exception 'RESULTS_LOCKED'; end if;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end; $$;
revoke all on function private.guard_tournament_result_lock() from public, anon, authenticated;
create trigger tournament_result_guard before update or delete on public.tournaments for each row execute function private.guard_tournament_result_lock();
create trigger tournament_match_result_guard before insert or update or delete on public.tournament_matches for each row execute function private.guard_tournament_result_lock();
create trigger tournament_group_result_guard before insert or update or delete on public.tournament_groups for each row execute function private.guard_tournament_result_lock();
create trigger tournament_team_result_guard before insert or update or delete on public.tournament_group_teams for each row execute function private.guard_tournament_result_lock();
create trigger tournament_invited_result_guard before insert or update or delete on public.tournament_invited_teams for each row execute function private.guard_tournament_result_lock();
