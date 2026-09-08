create table public.player_profiles (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  birth_date date,
  created_by uuid references auth.users(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index player_profiles_created_by_idx on public.player_profiles (created_by);

create table public.player_guardians (
  player_id uuid not null references public.player_profiles(id) on delete cascade,
  guardian_user_id uuid not null references auth.users(id) on delete cascade,
  relationship text not null default 'parent' check (relationship in ('parent', 'guardian')),
  is_primary boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (player_id, guardian_user_id)
);

create index player_guardians_user_idx on public.player_guardians (guardian_user_id);

create table public.guardian_invitations (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.player_profiles(id) on delete cascade,
  player_name text not null check (char_length(trim(player_name)) between 2 and 120),
  invited_email text not null check (
    char_length(invited_email) between 5 and 254
    and invited_email = lower(trim(invited_email))
    and invited_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  ),
  relationship text not null default 'parent' check (relationship in ('parent', 'guardian')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'revoked', 'expired')),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at and expires_at <= created_at + interval '14 days')
);

create unique index guardian_invitations_one_pending_idx
  on public.guardian_invitations (player_id, lower(invited_email))
  where status = 'pending';
create index guardian_invitations_email_status_idx
  on public.guardian_invitations (lower(invited_email), status, expires_at);
create index guardian_invitations_invited_by_idx on public.guardian_invitations (invited_by);

alter table public.player_profiles enable row level security;
alter table public.player_guardians enable row level security;
alter table public.guardian_invitations enable row level security;

revoke all on public.player_profiles from anon, authenticated;
revoke all on public.player_guardians from anon, authenticated;
revoke all on public.guardian_invitations from anon, authenticated;
grant select on public.player_profiles to authenticated;
grant select on public.player_guardians to authenticated;
grant select on public.guardian_invitations to authenticated;

create or replace function private.can_manage_player(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.player_guardians guardian
    where guardian.player_id = p_player_id
      and guardian.guardian_user_id = (select auth.uid())
  ) or (select private.is_platform_admin((select auth.uid())));
$$;

revoke all on function private.can_manage_player(uuid) from public, anon, authenticated;
grant execute on function private.can_manage_player(uuid) to authenticated;

create policy player_profiles_guardian_read
on public.player_profiles for select to authenticated
using (
  (select private.can_manage_player(id))
);

create policy player_guardians_family_read
on public.player_guardians for select to authenticated
using (
  (select private.can_manage_player(player_id))
);

create policy guardian_invitations_family_read
on public.guardian_invitations for select to authenticated
using (
  invited_by = (select auth.uid())
  or lower(invited_email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  or (select private.can_manage_player(player_id))
);

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

create or replace function public.invite_player_guardian(
  p_player_id uuid,
  p_invited_email text,
  p_relationship text default 'parent'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_email text;
  clean_email text := lower(trim(p_invited_email));
  clean_player_name text;
  invitation_id uuid;
begin
  if current_user_id is null then raise exception 'Not authenticated'; end if;
  if p_relationship not in ('parent', 'guardian') then raise exception 'Invalid relationship'; end if;
  if char_length(clean_email) not between 5 and 254
     or clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Invalid email';
  end if;
  if not (select private.can_manage_player(p_player_id)) then raise exception 'Not authorized'; end if;

  select lower(email) into current_email from auth.users where id = current_user_id;
  if clean_email = current_email then raise exception 'Already a guardian'; end if;

  select full_name into clean_player_name
  from public.player_profiles
  where id = p_player_id and status = 'active';
  if clean_player_name is null then raise exception 'Player not found'; end if;

  insert into public.guardian_invitations (
    player_id, player_name, invited_email, relationship, invited_by
  ) values (
    p_player_id, clean_player_name, clean_email, p_relationship, current_user_id
  )
  returning id into invitation_id;

  return invitation_id;
end;
$$;

create or replace function public.respond_to_guardian_invitation(
  p_invitation_id uuid,
  p_accept boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_email text;
  invitation public.guardian_invitations;
begin
  if current_user_id is null then raise exception 'Not authenticated'; end if;

  select lower(email) into current_email
  from auth.users
  where id = current_user_id;

  select * into invitation
  from public.guardian_invitations
  where id = p_invitation_id and status = 'pending'
  for update;

  if invitation.id is null then raise exception 'Pending invitation not found'; end if;
  if invitation.expires_at <= now() then
    update public.guardian_invitations set status = 'expired' where id = invitation.id;
    return;
  end if;
  if current_email is null or lower(invitation.invited_email) <> current_email then
    raise exception 'Invitation belongs to another email';
  end if;

  if p_accept then
    insert into public.player_guardians (
      player_id, guardian_user_id, relationship, is_primary, created_by
    ) values (
      invitation.player_id, current_user_id, invitation.relationship, false, invitation.invited_by
    )
    on conflict (player_id, guardian_user_id) do nothing;

    update public.guardian_invitations
    set status = 'accepted', accepted_by = current_user_id, accepted_at = now()
    where id = invitation.id;
  else
    update public.guardian_invitations
    set status = 'declined', accepted_by = current_user_id, accepted_at = now()
    where id = invitation.id;
  end if;
end;
$$;

revoke execute on function public.create_player_for_guardian(text, date) from public, anon;
revoke execute on function public.invite_player_guardian(uuid, text, text) from public, anon;
revoke execute on function public.respond_to_guardian_invitation(uuid, boolean) from public, anon;
grant execute on function public.create_player_for_guardian(text, date) to authenticated;
grant execute on function public.invite_player_guardian(uuid, text, text) to authenticated;
grant execute on function public.respond_to_guardian_invitation(uuid, boolean) to authenticated;

comment on table public.player_profiles is
  'Player identities are separate from login accounts so multiple guardians can manage one child.';
comment on table public.player_guardians is
  'Authorized guardian-to-player links. A player can have multiple guardians and a guardian multiple players.';
comment on table public.guardian_invitations is
  'Email-bound invitations for adding another guardian without allowing self-service claims of arbitrary children.';
