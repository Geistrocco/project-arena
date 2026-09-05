create table public.team_creation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  club_name text not null check (char_length(club_name) between 2 and 160),
  city text not null check (char_length(city) between 2 and 100),
  category text not null check (char_length(category) between 1 and 30),
  season text not null check (char_length(season) between 4 and 20),
  requested_role text not null check (requested_role in ('coach', 'manager', 'club_admin')),
  source_url text check (source_url is null or (char_length(source_url) <= 500 and source_url ~* '^https?://')),
  message text check (message is null or char_length(message) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_team_id uuid references public.club_teams(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index team_creation_requests_one_pending_idx
  on public.team_creation_requests (user_id, lower(club_name), lower(city), category, season)
  where status = 'pending';
create index team_creation_requests_status_created_idx on public.team_creation_requests (status, created_at);
create index team_creation_requests_user_idx on public.team_creation_requests (user_id);
create index team_creation_requests_reviewed_by_idx on public.team_creation_requests (reviewed_by);
create index team_creation_requests_created_team_idx on public.team_creation_requests (created_team_id);

alter table public.team_creation_requests enable row level security;
revoke all on public.team_creation_requests from anon, authenticated;
grant select, insert on public.team_creation_requests to authenticated;
grant update (status, reviewed_by, reviewed_at, created_team_id) on public.team_creation_requests to authenticated;

create policy team_creation_requests_read_own_or_admin
on public.team_creation_requests for select to authenticated
using (user_id = (select auth.uid()) or (select private.is_platform_admin((select auth.uid()))));

create policy team_creation_requests_insert_own
on public.team_creation_requests for insert to authenticated
with check (
  user_id = (select auth.uid()) and status = 'pending'
  and reviewed_by is null and reviewed_at is null and created_team_id is null
);

create policy team_creation_requests_admin_update
on public.team_creation_requests for update to authenticated
using ((select private.is_platform_admin((select auth.uid()))))
with check ((select private.is_platform_admin((select auth.uid()))));

grant insert on public.clubs to authenticated;
grant insert on public.club_teams to authenticated;

create policy clubs_admin_insert
on public.clubs for insert to authenticated
with check ((select private.is_platform_admin((select auth.uid()))));

create policy club_teams_admin_insert
on public.club_teams for insert to authenticated
with check ((select private.is_platform_admin((select auth.uid()))));

create or replace function public.review_team_creation_request(p_request_id uuid, p_decision text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  request public.team_creation_requests;
  matched_club public.clubs;
  team_id uuid;
  placeholder text;
begin
  if p_decision not in ('approved', 'rejected') then raise exception 'Invalid decision'; end if;
  if not (select private.is_platform_admin((select auth.uid()))) then raise exception 'Not authorized'; end if;

  select * into request from public.team_creation_requests
  where id = p_request_id and status = 'pending' for update;
  if request.id is null then raise exception 'Pending request not found'; end if;

  if p_decision = 'approved' then
    select * into matched_club from public.clubs
    where lower(name) = lower(request.club_name) and lower(city) = lower(request.city)
    order by created_at limit 1;

    if matched_club.id is null then
      placeholder := upper(left(regexp_replace(request.club_name, '[^[:alnum:]]', '', 'g'), 3));
      insert into public.clubs (id, name, short_name, sport, country, city, logo_placeholder, source, source_id, source_url, status)
      values (gen_random_uuid()::text, request.club_name, left(request.club_name, 80), 'football', 'Slovensko', request.city,
        coalesce(nullif(placeholder, ''), 'KLUB'), 'user_request', request.id::text, request.source_url, 'active')
      returning * into matched_club;
    end if;

    insert into public.club_teams (club_id, name, category, season, source, source_id, source_url)
    values (matched_club.id, matched_club.name || ' ' || request.category, request.category, request.season,
      'user_request', request.id::text, request.source_url)
    on conflict (club_id, category, season) do nothing
    returning id into team_id;

    if team_id is null then
      select id into team_id from public.club_teams
      where club_id = matched_club.id and category = request.category and season = request.season;
    end if;

    insert into public.team_memberships (team_id, user_id, role, verified_by)
    values (team_id, request.user_id, request.requested_role, (select auth.uid()))
    on conflict (team_id, user_id) do nothing;
  end if;

  update public.team_creation_requests
  set status = p_decision, reviewed_by = (select auth.uid()), reviewed_at = now(), created_team_id = team_id
  where id = request.id;

  insert into public.admin_audit_log (actor_user_id, target_user_id, action, details)
  values ((select auth.uid()), request.user_id, 'team_creation_' || p_decision,
    jsonb_build_object('request_id', request.id, 'team_id', team_id, 'club_name', request.club_name));
end;
$$;

revoke execute on function public.review_team_creation_request(uuid, text) from public, anon;
grant execute on function public.review_team_creation_request(uuid, text) to authenticated;
