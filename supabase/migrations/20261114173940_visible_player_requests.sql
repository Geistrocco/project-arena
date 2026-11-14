-- Use the same verified team staff/platform-admin permission as training management.
-- This is independent of account mode
-- and independently of whether the coach is also a child's guardian.
create function public.get_my_team_join_summary()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=private.join_verified_user();begin
 return jsonb_build_object('total',(select count(*) from public.team_join_requests r where r.status='pending' and private.join_team_staff(r.team_id,uid)),
 'teams',(select coalesce(jsonb_agg(x order by x.name,x.category,x.season),'[]'::jsonb) from (
 select t.id as team_id,t.name,t.category,t.season,count(*) as pending_count
 from public.team_join_requests r join public.club_teams t on t.id=r.team_id
 where r.status='pending' and private.join_team_staff(r.team_id,uid)
 group by t.id,t.name,t.category,t.season) x));
end $$;

create function public.get_staff_join_requests(p_team uuid default null,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=private.join_verified_user();begin
 if p_offset is null or p_offset<0 or p_offset>1000000 then raise exception 'INVALID_PAGE';end if;
 if p_team is not null and not private.join_team_staff(p_team,uid) then raise exception 'NOT_AUTHORIZED';end if;
 return jsonb_build_object('total',(select count(*) from public.team_join_requests r where r.status='pending' and (p_team is null or r.team_id=p_team) and private.join_team_staff(r.team_id,uid)),
 'requests',(select coalesce(jsonb_agg(x order by x.created_at,x.id),'[]'::jsonb) from (
 select r.id,r.team_id,t.name as team_name,t.category,t.season,r.player_id,p.full_name as player_name,extract(year from p.birth_date)::integer as birth_year,u.email as parent_email,r.message,r.created_at
 from public.team_join_requests r join public.club_teams t on t.id=r.team_id join public.player_profiles p on p.id=r.player_id join auth.users u on u.id=r.requested_by
 where r.status='pending' and (p_team is null or r.team_id=p_team) and private.join_team_staff(r.team_id,uid)
 order by r.created_at,r.id limit 50 offset p_offset) x));
end $$;
revoke all on function public.get_my_team_join_summary() from public,anon,authenticated;
revoke all on function public.get_staff_join_requests(uuid,integer) from public,anon,authenticated;
grant execute on function public.get_my_team_join_summary() to authenticated;
grant execute on function public.get_staff_join_requests(uuid,integer) to authenticated;

-- Existing account/family views use the same permission rule.
create or replace function public.get_family_join_context()
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
 where r.status='pending' and private.join_team_staff(r.team_id,uid) order by r.created_at limit 100) x));
end $$;

