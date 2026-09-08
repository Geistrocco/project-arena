create table public.team_player_invitations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.club_teams(id) on delete cascade,
  invited_email text not null check (invited_email = lower(trim(invited_email)) and char_length(invited_email) between 5 and 254),
  invited_by uuid not null references auth.users(id) on delete cascade,
  player_id uuid references public.player_profiles(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired', 'revoked')),
  expires_at timestamptz not null default (now() + interval '14 days'),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at and expires_at <= created_at + interval '14 days')
);
create unique index team_player_invitations_pending_idx on public.team_player_invitations (team_id, invited_email) where status = 'pending';
create index team_player_invitations_email_idx on public.team_player_invitations (invited_email, status, expires_at);

create table public.team_players (
  team_id uuid not null references public.club_teams(id) on delete cascade,
  player_id uuid not null references public.player_profiles(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (team_id, player_id)
);
create index team_players_player_idx on public.team_players (player_id);

alter table public.team_player_invitations enable row level security;
alter table public.team_players enable row level security;
revoke all on public.team_player_invitations from anon, authenticated;
revoke all on public.team_players from anon, authenticated;
grant select on public.team_player_invitations to authenticated;
grant select on public.team_players to authenticated;

create policy team_player_invitations_visible on public.team_player_invitations for select to authenticated using (
  invited_by = (select auth.uid())
  or invited_email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  or exists (select 1 from public.team_memberships m where m.team_id = team_player_invitations.team_id and m.user_id = (select auth.uid()))
  or (select private.is_platform_admin((select auth.uid())))
);

create policy team_players_visible on public.team_players for select to authenticated using (
  (select private.can_manage_player(player_id))
  or exists (select 1 from public.team_memberships m where m.team_id = team_players.team_id and m.user_id = (select auth.uid()))
);

create or replace function public.invite_parent_to_team(p_team_id uuid, p_invited_email text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  clean_email text := lower(trim(p_invited_email));
  invitation_id uuid;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Invalid email'; end if;
  if not exists (select 1 from public.team_memberships where team_id = p_team_id and user_id = uid and role in ('coach','manager','club_admin'))
     and not (select private.is_platform_admin(uid)) then raise exception 'Not authorized'; end if;
  insert into public.team_player_invitations (team_id, invited_email, invited_by)
  values (p_team_id, clean_email, uid) returning id into invitation_id;
  return invitation_id;
end; $$;

create or replace function public.respond_to_team_player_invitation(p_invitation_id uuid, p_player_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  user_email text;
  invitation public.team_player_invitations;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select lower(email) into user_email from auth.users where id = uid;
  select * into invitation from public.team_player_invitations where id = p_invitation_id and status = 'pending' for update;
  if invitation.id is null then raise exception 'Invitation not found'; end if;
  if invitation.expires_at <= now() then update public.team_player_invitations set status='expired' where id=invitation.id; return; end if;
  if invitation.invited_email <> user_email then raise exception 'Invitation belongs to another email'; end if;
  if p_accept then
    if p_player_id is null or not (select private.can_manage_player(p_player_id)) then raise exception 'Player not authorized'; end if;
    insert into public.team_players (team_id, player_id, added_by) values (invitation.team_id, p_player_id, uid) on conflict do nothing;
    update public.team_player_invitations set status='accepted', player_id=p_player_id, accepted_by=uid, responded_at=now() where id=invitation.id;
  else
    update public.team_player_invitations set status='declined', accepted_by=uid, responded_at=now() where id=invitation.id;
  end if;
end; $$;

revoke execute on function public.invite_parent_to_team(uuid,text) from public, anon;
revoke execute on function public.respond_to_team_player_invitation(uuid,uuid,boolean) from public, anon;
grant execute on function public.invite_parent_to_team(uuid,text) to authenticated;
grant execute on function public.respond_to_team_player_invitation(uuid,uuid,boolean) to authenticated;
