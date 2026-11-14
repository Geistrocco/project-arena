-- Family requests never grant team access until a current team staff member approves.
create table public.team_join_requests(
 id uuid primary key default gen_random_uuid(),team_id uuid not null references public.club_teams(id) on delete cascade,
 player_id uuid not null references public.player_profiles(id) on delete cascade,requested_by uuid not null references auth.users(id) on delete cascade,
 message text not null default '' check(char_length(message)<=500),status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled')),
 review_reason text check(char_length(review_reason)<=500),reviewed_by uuid references auth.users(id) on delete set null,reviewed_at timestamptz,created_at timestamptz not null default clock_timestamp()
);
create unique index team_join_one_pending_idx on public.team_join_requests(team_id,player_id) where status='pending';
create index team_join_team_status_idx on public.team_join_requests(team_id,status,created_at);
create index team_join_player_idx on public.team_join_requests(player_id);
create index team_join_requester_idx on public.team_join_requests(requested_by);
create index team_join_reviewer_idx on public.team_join_requests(reviewed_by);
alter table public.team_join_requests enable row level security;
revoke all on public.team_join_requests from public,anon,authenticated;

create table public.team_join_links(
 id uuid primary key default gen_random_uuid(),team_id uuid not null references public.club_teams(id) on delete cascade,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),created_by uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),expires_at timestamptz not null default(now()+interval '14 days'),
 used_by uuid references auth.users(id) on delete set null,player_id uuid references public.player_profiles(id) on delete set null,
 used_at timestamptz,revoked_at timestamptz,check(expires_at>created_at and expires_at<=created_at+interval '14 days')
);
create index team_join_link_team_idx on public.team_join_links(team_id,created_at desc);
create index team_join_link_creator_idx on public.team_join_links(created_by);
create index team_join_link_user_idx on public.team_join_links(used_by);
create index team_join_link_player_idx on public.team_join_links(player_id);
alter table public.team_join_links enable row level security;
revoke all on public.team_join_links from public,anon,authenticated;

create function private.join_team_staff(p_team uuid,p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select p_user is not null and (exists(select 1 from public.team_memberships where team_id=p_team and user_id=p_user and role in ('coach','manager','club_admin')) or coalesce(private.is_platform_admin(p_user),false));
$$;
create function private.join_verified_user()
returns uuid language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid();begin
 if uid is null then raise exception 'NOT_AUTHENTICATED';end if;
 if not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null) then raise exception 'EMAIL_NOT_VERIFIED';end if;
 return uid;
end $$;
create function private.join_own_player(p_player uuid,p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.player_guardians g join public.player_profiles p on p.id=g.player_id where g.player_id=p_player and g.guardian_user_id=p_user and p.status='active');
$$;
create function private.join_active_team(p_team uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.club_teams t join public.clubs c on c.id=t.club_id where t.id=p_team and t.status='active' and c.status='active');
$$;

create function public.search_joinable_teams(p_query text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.join_verified_user();
 if p_query is null or char_length(trim(p_query))<2 or char_length(p_query)>100 then return '[]'::jsonb;end if;
 return (select coalesce(jsonb_agg(x),'[]'::jsonb) from (
 select t.id,t.name,t.category,t.season,c.city,exists(select 1 from public.team_memberships m where m.team_id=t.id and m.role in ('coach','manager','club_admin')) as has_staff
 from public.club_teams t join public.clubs c on c.id=t.club_id where t.status='active' and c.status='active'
 and position(lower(trim(p_query)) in lower(t.name||' '||t.category||' '||c.city))>0 order by t.season desc,t.name,t.category limit 40) x);
end $$;

create function public.get_family_join_context()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=private.join_verified_user();begin
 return jsonb_build_object('players',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'birth_date',p.birth_date) order by p.full_name,p.birth_date),'[]'::jsonb)
 from public.player_profiles p where private.join_own_player(p.id,uid)),
 'requests',(select coalesce(jsonb_agg(x order by created_at desc),'[]'::jsonb) from (
 select r.id,r.team_id,t.name as team_name,t.category,t.season,r.player_id,p.full_name as player_name,r.status,r.message,r.review_reason,r.created_at,r.requested_by=uid as can_cancel
 from public.team_join_requests r join public.club_teams t on t.id=r.team_id join public.player_profiles p on p.id=r.player_id
 where exists(select 1 from public.player_guardians g where g.player_id=r.player_id and g.guardian_user_id=uid) order by r.created_at desc limit 100) x),
 'staff_requests',(select coalesce(jsonb_agg(x order by created_at),'[]'::jsonb) from (
 select r.id,r.team_id,t.name as team_name,t.category,t.season,r.player_id,p.full_name as player_name,extract(year from p.birth_date)::integer as birth_year,u.email as parent_email,r.message,r.created_at
 from public.team_join_requests r join public.club_teams t on t.id=r.team_id join public.player_profiles p on p.id=r.player_id join auth.users u on u.id=r.requested_by
 where r.status='pending' and exists(select 1 from public.team_memberships m where m.team_id=r.team_id and m.user_id=uid and m.role in ('coach','manager','club_admin')) order by r.created_at limit 100) x));
end $$;

create function public.request_player_team_join(p_team uuid,p_player uuid,p_message text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.join_verified_user();rid uuid;begin
 perform 1 from public.player_profiles where id=p_player for update;
 if not private.join_own_player(p_player,uid) then raise exception 'PLAYER_NOT_AUTHORIZED';end if;
 if not private.join_active_team(p_team) then raise exception 'TEAM_UNAVAILABLE';end if;
 if p_message is null or char_length(p_message)>500 then raise exception 'INVALID_MESSAGE';end if;
 if exists(select 1 from public.team_players where team_id=p_team and player_id=p_player and status='active') then raise exception 'ALREADY_MEMBER';end if;
 if exists(select 1 from public.team_join_requests where team_id=p_team and player_id=p_player and status='pending') then raise exception 'REQUEST_PENDING';end if;
 insert into public.team_join_requests(team_id,player_id,requested_by,message) values(p_team,p_player,uid,trim(p_message)) returning id into rid;
 return rid;
end $$;

create function public.decide_player_team_join(p_request uuid,p_accept boolean,p_reason text,p_confirm boolean)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.join_verified_user();r public.team_join_requests;begin
 select * into r from public.team_join_requests where id=p_request;
 if r.id is null or not private.join_team_staff(r.team_id,uid) then raise exception 'NOT_AUTHORIZED';end if;
 perform 1 from public.player_profiles where id=r.player_id for update;
 select * into r from public.team_join_requests where id=p_request for update;
 if r.status<>'pending' then raise exception 'REQUEST_CHANGED';end if;
 if p_accept is null or p_confirm is distinct from true then raise exception 'CONFIRMATION_REQUIRED';end if;
 if char_length(coalesce(p_reason,''))>500 or (not p_accept and char_length(trim(coalesce(p_reason,'')))<5) then raise exception 'REASON_REQUIRED';end if;
 if p_accept then
  if not private.join_active_team(r.team_id) then raise exception 'TEAM_UNAVAILABLE';end if;
  if not private.join_own_player(r.player_id,r.requested_by) then raise exception 'PLAYER_NOT_AUTHORIZED';end if;
  insert into public.team_players(team_id,player_id,added_by) values(r.team_id,r.player_id,uid)
  on conflict(team_id,player_id) do update set status='active',inactive_at=null;
 end if;
 update public.team_join_requests set status=case when p_accept then 'approved' else 'rejected' end,review_reason=nullif(trim(p_reason),''),reviewed_by=uid,reviewed_at=clock_timestamp() where id=r.id;
end $$;

create function public.cancel_player_team_join(p_request uuid)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.join_verified_user();r public.team_join_requests;begin
 select * into r from public.team_join_requests where id=p_request;
 if r.id is null or r.requested_by<>uid then raise exception 'NOT_AUTHORIZED';end if;
 perform 1 from public.player_profiles where id=r.player_id for update;
 select * into r from public.team_join_requests where id=p_request for update;
 if r.status<>'pending' then raise exception 'REQUEST_CHANGED';end if;
 update public.team_join_requests set status='cancelled',reviewed_by=uid,reviewed_at=clock_timestamp() where id=r.id;
end $$;

create function public.create_team_join_link(p_team uuid,p_token text)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.join_verified_user();lid uuid;begin
 if not private.join_team_staff(p_team,uid) then raise exception 'NOT_AUTHORIZED';end if;
 if not private.join_active_team(p_team) then raise exception 'TEAM_UNAVAILABLE';end if;
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_TOKEN';end if;
 insert into public.team_join_links(team_id,created_by,token_hash) values(p_team,uid,encode(sha256(convert_to(p_token,'UTF8')),'hex')) returning id into lid;
 return lid;
end $$;
create function public.get_team_join_link(p_token text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return null;end if;
 if exists(select 1 from public.team_join_links l where l.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and l.used_at is not null and l.used_by=auth.uid() and private.join_own_player(l.player_id,auth.uid())) then
  return (select jsonb_build_object('accepted',true,'team_id',t.id,'name',t.name,'category',t.category,'season',t.season,'player_name',p.full_name,'active',private.join_active_team(t.id) and exists(select 1 from public.team_players tp where tp.team_id=t.id and tp.player_id=l.player_id and tp.status='active')) from public.team_join_links l join public.club_teams t on t.id=l.team_id join public.player_profiles p on p.id=l.player_id where l.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and l.used_by=auth.uid());
 end if;
 return (select jsonb_build_object('team_id',t.id,'name',t.name,'category',t.category,'season',t.season,'expires_at',l.expires_at)
 from public.team_join_links l join public.club_teams t on t.id=l.team_id where l.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')
 and l.used_at is null and l.revoked_at is null and l.expires_at>now() and private.join_active_team(t.id) and private.join_team_staff(t.id,l.created_by));
end $$;
create function public.get_staff_team_join_links(p_team uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=private.join_verified_user();begin
 if not private.join_team_staff(p_team,uid) then raise exception 'NOT_AUTHORIZED';end if;
 return (select coalesce(jsonb_agg(x order by created_at desc),'[]'::jsonb) from (
 select l.id,l.created_at,l.expires_at,l.used_at,l.revoked_at,p.full_name as player_name from public.team_join_links l left join public.player_profiles p on p.id=l.player_id where l.team_id=p_team order by created_at desc limit 50) x);
end $$;
create function public.revoke_team_join_link(p_link uuid)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.join_verified_user();l public.team_join_links;begin
 select * into l from public.team_join_links where id=p_link for update;
 if l.id is null or not private.join_team_staff(l.team_id,uid) then raise exception 'NOT_AUTHORIZED';end if;
 if l.used_at is not null or l.revoked_at is not null then raise exception 'LINK_UNAVAILABLE';end if;
 update public.team_join_links set revoked_at=clock_timestamp() where id=l.id;
end $$;

create function public.accept_team_join_link(p_token text,p_player uuid,p_confirm boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.join_verified_user();l public.team_join_links;begin
 if p_confirm is distinct from true then raise exception 'CONFIRMATION_REQUIRED';end if;
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'LINK_UNAVAILABLE';end if;
 perform 1 from public.player_profiles where id=p_player for update;
 if not private.join_own_player(p_player,uid) then raise exception 'PLAYER_NOT_AUTHORIZED';end if;
 select * into l from public.team_join_links where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if l.id is null or l.used_at is not null or l.revoked_at is not null or l.expires_at<=now() or not private.join_active_team(l.team_id) or not private.join_team_staff(l.team_id,l.created_by) then raise exception 'LINK_UNAVAILABLE';end if;
 if exists(select 1 from public.team_players where team_id=l.team_id and player_id=p_player and status='active') then raise exception 'ALREADY_MEMBER';end if;
 insert into public.team_players(team_id,player_id,added_by) values(l.team_id,p_player,l.created_by)
 on conflict(team_id,player_id) do update set status='active',inactive_at=null;
 update public.team_join_links set used_at=clock_timestamp(),used_by=uid,player_id=p_player where id=l.id;
 update public.team_join_requests set status='approved',reviewed_by=l.created_by,reviewed_at=clock_timestamp(),review_reason='Prijaté na pozvanie trénera.' where team_id=l.team_id and player_id=p_player and status='pending';
 return l.team_id;
end $$;

-- Existing e-mail invitations also use a specific existing child and recheck the coach's authority.
create or replace function public.respond_to_team_player_invitation(p_invitation_id uuid,p_player_id uuid,p_accept boolean)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.join_verified_user();i public.team_player_invitations;user_email text;begin
 if p_accept is null then raise exception 'CONFIRMATION_REQUIRED';end if;
 select lower(email) into user_email from auth.users where id=uid;
 if p_accept then
  perform 1 from public.player_profiles where id=p_player_id for update;
  if not private.join_own_player(p_player_id,uid) then raise exception 'PLAYER_NOT_AUTHORIZED';end if;
 end if;
 select * into i from public.team_player_invitations where id=p_invitation_id for update;
 if i.id is null or i.status<>'pending' or i.expires_at<=now() or i.invited_email<>user_email then raise exception 'INVITATION_UNAVAILABLE';end if;
 if p_accept then
  if not private.join_active_team(i.team_id) or not private.join_team_staff(i.team_id,i.invited_by) then raise exception 'INVITATION_UNAVAILABLE';end if;
  insert into public.team_players(team_id,player_id,added_by) values(i.team_id,p_player_id,i.invited_by) on conflict(team_id,player_id) do update set status='active',inactive_at=null;
  update public.team_join_requests set status='approved',reviewed_by=i.invited_by,reviewed_at=clock_timestamp(),review_reason='Prijaté na e-mailové pozvanie trénera.' where team_id=i.team_id and player_id=p_player_id and status='pending';
 end if;
 update public.team_player_invitations set status=case when p_accept then 'accepted' else 'declined' end,player_id=case when p_accept then p_player_id else null end,accepted_by=uid,responded_at=clock_timestamp() where id=i.id;
end $$;
create or replace function public.invite_parent_to_team(p_team_id uuid,p_invited_email text)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.join_verified_user();mail text:=lower(trim(p_invited_email));iid uuid;begin
 if not private.join_team_staff(p_team_id,uid) then raise exception 'NOT_AUTHORIZED';end if;
 if not private.join_active_team(p_team_id) then raise exception 'TEAM_UNAVAILABLE';end if;
 if mail is null or mail !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or char_length(mail)>254 then raise exception 'INVALID_EMAIL';end if;
 update public.team_player_invitations set status='expired' where team_id=p_team_id and invited_email=mail and status='pending' and expires_at<=now();
 insert into public.team_player_invitations(team_id,invited_email,invited_by) values(p_team_id,mail,uid) returning id into iid;return iid;
end $$;

-- New objects are reachable only through the checked RPCs; bearer token hashes are never returned.
do $$ declare f record;begin
 for f in select p.oid::regprocedure as signature,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
 (n.nspname='private' and p.proname in ('join_team_staff','join_verified_user','join_own_player','join_active_team')) or
 (n.nspname='public' and p.proname in ('search_joinable_teams','get_family_join_context','request_player_team_join','decide_player_team_join','cancel_player_team_join','create_team_join_link','get_team_join_link','get_staff_team_join_links','revoke_team_join_link','accept_team_join_link'))
 loop execute 'revoke all on function '||f.signature||' from public,anon,authenticated';if f.nspname='public' then execute 'grant execute on function '||f.signature||' to authenticated';end if;end loop;
end $$;
grant execute on function public.get_team_join_link(text) to anon;

create or replace function public.create_player_for_guardian(
  p_full_name text,
  p_birth_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  clean_name text := trim(p_full_name);
  new_player_id uuid;
begin
  if current_user_id is null then raise exception 'Not authenticated'; end if;
  if char_length(clean_name) not between 2 and 120 then raise exception 'Invalid player name'; end if;
  if p_birth_date is not null and p_birth_date > current_date then raise exception 'Invalid birth date'; end if;

  perform 1 from auth.users where id=current_user_id for update;
  if exists(select 1 from public.player_profiles p join public.player_guardians g on g.player_id=p.id where g.guardian_user_id=current_user_id and p.status='active' and lower(regexp_replace(trim(p.full_name),'[[:space:]]+',' ','g'))=lower(regexp_replace(clean_name,'[[:space:]]+',' ','g')) and (p.birth_date is null or p_birth_date is null or p.birth_date=p_birth_date)) then raise exception 'PLAYER_ALREADY_EXISTS';end if;
  insert into public.player_profiles (full_name, birth_date, created_by)
  values (clean_name, p_birth_date, current_user_id)
  returning id into new_player_id;

  insert into public.player_guardians (
    player_id, guardian_user_id, relationship, is_primary, created_by
  ) values (
    new_player_id, current_user_id, 'parent', true, current_user_id
  );

  return new_player_id;
end;
$$;
