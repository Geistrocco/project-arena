create or replace function public.review_team_creation_request(p_request_id uuid, p_decision text)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  request_row public.team_creation_requests;
  matched_club public.clubs;
  v_team_id uuid;
  placeholder text;
begin
  if p_decision not in ('approved', 'rejected') then raise exception 'Invalid decision'; end if;
  if not (select private.is_platform_admin((select auth.uid()))) then raise exception 'Not authorized'; end if;

  select * into request_row from public.team_creation_requests
  where id = p_request_id and status = 'pending' for update;
  if request_row.id is null then raise exception 'Pending request not found'; end if;

  if p_decision = 'approved' then
    select * into matched_club from public.clubs
    where lower(name) = lower(request_row.club_name) and lower(city) = lower(request_row.city)
    order by created_at limit 1;

    if matched_club.id is null then
      placeholder := upper(left(regexp_replace(request_row.club_name, '[^[:alnum:]]', '', 'g'), 3));
      insert into public.clubs (id, name, short_name, sport, country, city, logo_placeholder, source, source_id, source_url, status)
      values (gen_random_uuid()::text, request_row.club_name, left(request_row.club_name, 80), 'football', 'Slovensko', request_row.city,
        coalesce(nullif(placeholder, ''), 'KLUB'), 'user_request', request_row.id::text, request_row.source_url, 'active')
      returning * into matched_club;
    end if;

    insert into public.club_teams (club_id, name, category, season, source, source_id, source_url)
    values (matched_club.id, matched_club.name || ' ' || request_row.category, request_row.category, request_row.season,
      'user_request', request_row.id::text, request_row.source_url)
    on conflict (club_id, category, season) do nothing
    returning id into v_team_id;

    if v_team_id is null then
      select ct.id into v_team_id from public.club_teams ct
      where ct.club_id = matched_club.id and ct.category = request_row.category and ct.season = request_row.season;
    end if;

    insert into public.team_memberships (team_id, user_id, role, verified_by)
    values (v_team_id, request_row.user_id, request_row.requested_role, (select auth.uid()))
    on conflict (team_id, user_id) do nothing;
  end if;

  update public.team_creation_requests
  set status = p_decision, reviewed_by = (select auth.uid()), reviewed_at = now(), created_team_id = v_team_id
  where id = request_row.id;

  insert into public.admin_audit_log (actor_user_id, target_user_id, action, details)
  values ((select auth.uid()), request_row.user_id, 'team_creation_' || p_decision,
    jsonb_build_object('request_id', request_row.id, 'team_id', v_team_id, 'club_name', request_row.club_name));
end;
$$;

revoke execute on function public.review_team_creation_request(uuid, text) from public, anon;
grant execute on function public.review_team_creation_request(uuid, text) to authenticated;
