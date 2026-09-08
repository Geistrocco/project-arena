alter table public.team_players
  add column status text not null default 'active' check (status in ('active', 'inactive')),
  add column inactive_at timestamptz;

create index team_players_team_status_idx on public.team_players (team_id, status);

create or replace function public.get_managed_team_roster()
returns table (
  team_id uuid,
  player_id uuid,
  full_name text,
  joined_at timestamptz,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select tp.team_id, tp.player_id, p.full_name, tp.joined_at, tp.status
  from public.team_players tp
  join public.player_profiles p on p.id = tp.player_id
  where p.status = 'active'
    and exists (
      select 1
      from public.team_memberships membership
      where membership.team_id = tp.team_id
        and membership.user_id = (select auth.uid())
        and membership.role in ('coach', 'manager', 'club_admin')
    )
  order by p.full_name;
$$;

revoke execute on function public.get_managed_team_roster() from public, anon;
grant execute on function public.get_managed_team_roster() to authenticated;

comment on function public.get_managed_team_roster() is
  'Returns only roster-safe player fields for teams managed by the current verified user.';
