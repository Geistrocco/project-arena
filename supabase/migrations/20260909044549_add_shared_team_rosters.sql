create or replace function public.get_visible_team_roster(p_team_id uuid)
returns table (player_id uuid, full_name text, joined_at timestamptz, status text)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  allowed boolean;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  allowed := (select private.is_platform_admin(uid))
    or exists (select 1 from public.team_memberships m where m.team_id = p_team_id and m.user_id = uid)
    or exists (
      select 1 from public.team_players tp
      join public.player_guardians pg on pg.player_id = tp.player_id
      where tp.team_id = p_team_id and tp.status = 'active' and pg.guardian_user_id = uid
    );
  if not allowed then raise exception 'Not authorized'; end if;

  return query
  select tp.player_id, p.full_name, tp.joined_at, tp.status
  from public.team_players tp
  join public.player_profiles p on p.id = tp.player_id
  where tp.team_id = p_team_id and p.status = 'active'
  order by tp.status, p.full_name;
end;
$$;

create or replace function public.get_admin_team_overview()
returns table (
  team_id uuid, team_name text, category text, season text, city text,
  team_status text, active_players bigint, staff_members bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null or not coalesce((select private.is_platform_admin(uid)), false) then
    raise exception 'Not authorized';
  end if;
  return query
  select t.id, t.name, t.category, t.season, c.city, t.status,
    (select count(*) from public.team_players tp where tp.team_id = t.id and tp.status = 'active'),
    (select count(*) from public.team_memberships tm where tm.team_id = t.id)
  from public.club_teams t
  join public.clubs c on c.id = t.club_id
  order by t.status, t.name;
end;
$$;

revoke execute on function public.get_visible_team_roster(uuid) from public, anon;
revoke execute on function public.get_admin_team_overview() from public, anon;
grant execute on function public.get_visible_team_roster(uuid) to authenticated;
grant execute on function public.get_admin_team_overview() to authenticated;

comment on function public.get_visible_team_roster(uuid) is
  'Privacy-safe team roster; available to platform admins, verified team staff, and guardians of an active player in the team.';
