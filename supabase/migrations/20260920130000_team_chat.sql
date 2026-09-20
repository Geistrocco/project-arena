create table public.team_chat_messages (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.club_teams(id) on delete cascade,
  nomination_id uuid references public.team_nominations(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete restrict,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  is_announcement boolean not null default false,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create index team_chat_messages_thread_idx on public.team_chat_messages
  (team_id, nomination_id, created_at desc) where deleted_at is null;
create index team_chat_messages_author_idx on public.team_chat_messages (author_id);

create table public.team_chat_reads (
  team_id uuid not null references public.club_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_key text not null check (thread_key = 'team' or thread_key ~ '^[0-9a-f-]{36}$'),
  read_at timestamptz not null default now(),
  primary key (team_id, user_id, thread_key)
);
create index team_chat_reads_user_idx on public.team_chat_reads (user_id, team_id);

alter table public.team_chat_messages enable row level security;
alter table public.team_chat_reads enable row level security;
revoke all on public.team_chat_messages from anon, authenticated;
revoke all on public.team_chat_reads from anon, authenticated;

-- These helpers do not grant table access. Every exposed RPC verifies the current
-- session and membership afresh, including after a parent or trainer leaves.
create function private.can_read_team_chat(p_team_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user_id is not null and exists (
    select 1 from public.club_teams t where t.id = p_team_id and t.status = 'active'
  ) and (
    exists (select 1 from public.team_memberships m
      where m.team_id = p_team_id and m.user_id = p_user_id
        and m.role in ('coach','manager','club_admin'))
    or exists (select 1 from public.team_players tp
      join public.player_guardians pg on pg.player_id = tp.player_id
      where tp.team_id = p_team_id and tp.status = 'active'
        and pg.guardian_user_id = p_user_id)
    or coalesce(private.is_platform_admin(p_user_id), false)
  );
$$;

create function private.can_manage_team_chat(p_team_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user_id is not null and exists (
    select 1 from public.club_teams t where t.id = p_team_id and t.status = 'active'
  ) and (
    exists (select 1 from public.team_memberships m
      where m.team_id = p_team_id and m.user_id = p_user_id
        and m.role in ('coach','manager','club_admin'))
    or coalesce(private.is_platform_admin(p_user_id), false)
  );
$$;

revoke all on function private.can_read_team_chat(uuid,uuid) from public, anon, authenticated;
revoke all on function private.can_manage_team_chat(uuid,uuid) from public, anon, authenticated;

create function public.get_team_chat_messages(p_team_id uuid, p_nomination_id uuid default null)
returns table (id uuid, body text, author_id uuid, author_name text, is_announcement boolean,
  is_pinned boolean, created_at timestamptz, edited_at timestamptz, deleted_at timestamptz,
  can_edit boolean, can_moderate boolean, read_count bigint, eligible_readers bigint)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); manager boolean;
begin
  if not coalesce(private.can_read_team_chat(p_team_id, uid), false) then raise exception 'Not authorized'; end if;
  if p_nomination_id is not null and not exists (
    select 1 from public.team_nominations n where n.id = p_nomination_id and n.team_id = p_team_id
  ) then raise exception 'Event not found'; end if;
  manager := private.can_manage_team_chat(p_team_id, uid);
  return query
  select m.id, case when m.deleted_at is null then m.body else 'Správa bola odstránená.' end,
    m.author_id, coalesce(nullif(p.full_name,''), 'Člen tímu'), m.is_announcement,
    m.is_pinned, m.created_at, m.edited_at, m.deleted_at,
    m.author_id = uid and m.deleted_at is null, manager,
    case when manager and m.is_announcement then (select count(*) from public.team_chat_reads r
      where r.team_id = p_team_id and r.thread_key = 'team' and r.read_at >= m.created_at
      and r.user_id <> m.author_id and private.can_read_team_chat(p_team_id, r.user_id)) else 0 end,
    case when manager and m.is_announcement then (
      select count(*) from (
        select mm.user_id from public.team_memberships mm where mm.team_id = p_team_id
        union
        select pg.guardian_user_id from public.team_players tp
        join public.player_guardians pg on pg.player_id = tp.player_id
        where tp.team_id = p_team_id and tp.status = 'active'
      ) people where people.user_id <> m.author_id
        and private.can_read_team_chat(p_team_id, people.user_id)
    ) else 0 end
  from public.team_chat_messages m
  left join public.profiles p on p.id = m.author_id
  where m.team_id = p_team_id and m.nomination_id is not distinct from p_nomination_id
  order by m.created_at desc
  limit 200;
end; $$;

create function public.send_team_chat_message(p_team_id uuid, p_body text,
  p_nomination_id uuid default null, p_announcement boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); mid uuid; clean_body text := trim(p_body);
begin
  if not coalesce(private.can_read_team_chat(p_team_id, uid), false) then raise exception 'Not authorized'; end if;
  if clean_body is null or char_length(clean_body) not between 1 and 2000 then raise exception 'Invalid message length'; end if;
  if p_nomination_id is not null and not exists (
    select 1 from public.team_nominations n where n.id = p_nomination_id and n.team_id = p_team_id
  ) then raise exception 'Event not found'; end if;
  if p_announcement and (p_nomination_id is not null or
    not coalesce(private.can_manage_team_chat(p_team_id, uid), false)) then
    raise exception 'Not allowed to post an announcement';
  end if;
  insert into public.team_chat_messages (team_id, nomination_id, author_id, body, is_announcement)
  values (p_team_id, p_nomination_id, uid, clean_body, p_announcement)
  returning id into mid;
  return mid;
end; $$;

create function public.update_team_chat_message(p_message_id uuid, p_body text,
  p_delete boolean default false, p_pinned boolean default null)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); msg public.team_chat_messages%rowtype; manager boolean;
begin
  select * into msg from public.team_chat_messages where id = p_message_id for update;
  if msg.id is null or not coalesce(private.can_read_team_chat(msg.team_id, uid), false) then raise exception 'Not authorized'; end if;
  if msg.deleted_at is not null then raise exception 'Message removed'; end if;
  manager := private.can_manage_team_chat(msg.team_id, uid);
  if p_pinned is not null then
    if not manager or msg.nomination_id is not null or not msg.is_announcement then raise exception 'Not allowed to pin'; end if;
    update public.team_chat_messages set is_pinned = p_pinned where id = msg.id;
  elsif p_delete then
    if uid <> msg.author_id and not manager then raise exception 'Not allowed to remove'; end if;
    update public.team_chat_messages set deleted_at = now(), is_pinned = false where id = msg.id;
  else
    if uid <> msg.author_id or p_body is null or char_length(trim(p_body)) not between 1 and 2000 then raise exception 'Not allowed to edit'; end if;
    update public.team_chat_messages set body = trim(p_body), edited_at = now() where id = msg.id;
  end if;
end; $$;

create function public.mark_team_chat_read(p_team_id uuid, p_nomination_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); key text := coalesce(p_nomination_id::text, 'team');
begin
  if not coalesce(private.can_read_team_chat(p_team_id, uid), false) then raise exception 'Not authorized'; end if;
  if p_nomination_id is not null and not exists (
    select 1 from public.team_nominations n where n.id = p_nomination_id and n.team_id = p_team_id
  ) then raise exception 'Event not found'; end if;
  insert into public.team_chat_reads(team_id,user_id,thread_key,read_at)
  values (p_team_id,uid,key,now())
  on conflict(team_id,user_id,thread_key) do update set read_at = greatest(public.team_chat_reads.read_at, excluded.read_at);
end; $$;

create function public.get_team_chat_unread_count(p_team_id uuid)
returns integer language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); unread integer;
begin
  if not coalesce(private.can_read_team_chat(p_team_id, uid), false) then raise exception 'Not authorized'; end if;
  select count(*)::integer into unread from public.team_chat_messages m
  left join public.team_chat_reads r on r.team_id = m.team_id and r.user_id = uid
    and r.thread_key = coalesce(m.nomination_id::text, 'team')
  where m.team_id = p_team_id and m.deleted_at is null and m.author_id <> uid
    and m.created_at > coalesce(r.read_at, '-infinity'::timestamptz);
  return unread;
end; $$;

-- Only the author of a still-active team announcement can ask for the email list.
create function public.get_chat_announcement_recipients(p_message_id uuid)
returns table (email text) language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); tid uuid;
begin
  select m.team_id into tid from public.team_chat_messages m
  where m.id = p_message_id and m.author_id = uid and m.is_announcement
    and m.nomination_id is null and m.deleted_at is null;
  if tid is null or not coalesce(private.can_manage_team_chat(tid, uid), false) then raise exception 'Not authorized'; end if;
  return query select distinct u.email::text from auth.users u
  join (
    select mm.user_id from public.team_memberships mm where mm.team_id = tid
    union
    select pg.guardian_user_id from public.team_players tp
    join public.player_guardians pg on pg.player_id = tp.player_id
    where tp.team_id = tid and tp.status = 'active'
  ) readers on readers.user_id = u.id
  where u.id <> uid and u.email_confirmed_at is not null and u.email is not null;
end; $$;

revoke execute on function public.get_team_chat_messages(uuid,uuid) from public, anon;
revoke execute on function public.send_team_chat_message(uuid,text,uuid,boolean) from public, anon;
revoke execute on function public.update_team_chat_message(uuid,text,boolean,boolean) from public, anon;
revoke execute on function public.mark_team_chat_read(uuid,uuid) from public, anon;
revoke execute on function public.get_team_chat_unread_count(uuid) from public, anon;
revoke execute on function public.get_chat_announcement_recipients(uuid) from public, anon;
grant execute on function public.get_team_chat_messages(uuid,uuid),
  public.send_team_chat_message(uuid,text,uuid,boolean),
  public.update_team_chat_message(uuid,text,boolean,boolean),
  public.mark_team_chat_read(uuid,uuid),
  public.get_team_chat_unread_count(uuid),
  public.get_chat_announcement_recipients(uuid) to authenticated;

create function public.get_my_chat_unread_count()
returns integer language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); unread integer;
begin
  if uid is null then return 0; end if;
  select count(*)::integer into unread from public.team_chat_messages m
  left join public.team_chat_reads r on r.team_id = m.team_id and r.user_id = uid
    and r.thread_key = coalesce(m.nomination_id::text, 'team')
  where m.deleted_at is null and m.author_id <> uid
    and m.created_at > coalesce(r.read_at, '-infinity'::timestamptz)
    and private.can_read_team_chat(m.team_id, uid);
  return unread;
end; $$;
revoke execute on function public.get_my_chat_unread_count() from public, anon;
grant execute on function public.get_my_chat_unread_count() to authenticated;
