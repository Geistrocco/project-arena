create table public.tournament_applications (
 id uuid primary key default gen_random_uuid(),
 tournament_id uuid not null references public.tournaments(id) on delete cascade,
 team_id uuid not null references public.club_teams(id) on delete restrict,
 applicant_id uuid not null references auth.users(id) on delete restrict,
 team_name text not null,
 contact_name text not null check(char_length(trim(contact_name)) between 2 and 120),
 contact_email text not null,
 phone text not null check(char_length(trim(phone)) between 3 and 40),
 note text not null default '' check(char_length(note)<=1000),
 status text not null default 'pending' check(status in ('pending','accepted','rejected')),
 decision_reason text check(char_length(decision_reason)<=500),
 decided_by uuid references auth.users(id),decided_at timestamptz,
 created_at timestamptz not null default now(),
 unique(tournament_id,team_id),unique(tournament_id,team_name)
);
alter table public.tournament_applications enable row level security;
revoke all on public.tournament_applications from public,anon,authenticated;
grant select on public.tournament_applications to authenticated;
create policy tournament_application_read on public.tournament_applications for select to authenticated
using(applicant_id=auth.uid() or exists(select 1 from public.tournaments t where t.id=tournament_id and t.organizer_id=auth.uid())
 or exists(select 1 from public.team_memberships m where m.team_id=tournament_applications.team_id and m.user_id=auth.uid() and m.role in ('coach','manager','club_admin')));
create index tournament_application_applicant_idx on public.tournament_applications(applicant_id);
create index tournament_application_team_idx on public.tournament_applications(team_id);

create function private.tournament_reserved_slots(p_id uuid)
returns integer language sql stable set search_path='' as $$
 select greatest(t.registered_count,(select count(*)::integer from public.tournament_invited_teams i where i.tournament_id=t.id))
 +(select count(*)::integer from public.tournament_applications a where a.tournament_id=t.id and a.status='accepted'
 and not exists(select 1 from public.tournament_invited_teams i where i.tournament_id=t.id and lower(trim(i.team_name))=lower(trim(a.team_name))))
 from public.tournaments t where t.id=p_id;
$$;
revoke all on function private.tournament_reserved_slots(uuid) from public,anon,authenticated;
create function public.get_tournament_application_summary(p_slug text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.tournaments;
begin
 select * into t from public.tournaments where slug=p_slug;
 if t.id is null or not coalesce(((t.publication_status='published' and t.tournament_type in ('public','combined')) or t.organizer_id=auth.uid()),false) then return null; end if;
 return jsonb_build_object('reserved',private.tournament_reserved_slots(t.id),'accepted',case when t.team_visibility in ('all','accepted') or t.organizer_id=auth.uid() then
 coalesce((select jsonb_agg(a.team_name order by a.team_name) from public.tournament_applications a where a.tournament_id=t.id and a.status='accepted'),'[]'::jsonb) else '[]'::jsonb end);
end $$;
revoke all on function public.get_tournament_application_summary(text) from public,anon;
grant execute on function public.get_tournament_application_summary(text) to anon,authenticated;

create function public.submit_tournament_application(p_slug text,p_team_id uuid,p_contact text,p_phone text,p_note text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare t public.tournaments; team public.club_teams; result uuid; email text;
begin
 if auth.uid() is null then raise exception 'Not authenticated'; end if;
 select * into t from public.tournaments where slug=p_slug for update;
 if t.id is null or t.publication_status<>'published' or t.tournament_type not in ('public','combined') or t.event_date<(now() at time zone 'Europe/Bratislava')::date then raise exception 'REGISTRATION_CLOSED'; end if;
 if exists(select 1 from public.tournament_result_locks where tournament_id=t.id and locked_at is not null) then raise exception 'REGISTRATION_CLOSED'; end if;
 if not exists(select 1 from public.team_memberships m where m.team_id=p_team_id and m.user_id=auth.uid() and m.role in ('coach','manager','club_admin')) then raise exception 'Not authorized'; end if;
 select * into team from public.club_teams where id=p_team_id and status='active';
 if team.id is null then raise exception 'TEAM_INACTIVE'; end if;
 if exists(select 1 from public.clubs c where c.id=team.club_id and lower(trim(c.sport))<>lower(trim(t.sport))) then raise exception 'SPORT_MISMATCH'; end if;
 if upper(trim(team.category))<>upper(trim(t.category)) then raise exception 'CATEGORY_MISMATCH'; end if;
 if exists(select 1 from public.tournament_applications a where a.tournament_id=t.id and (a.team_id=team.id or lower(trim(a.team_name))=lower(trim(team.name)))) then raise exception 'APPLICATION_EXISTS'; end if;
 if private.tournament_reserved_slots(t.id)>=t.capacity and not exists(select 1 from public.tournament_invited_teams i where i.tournament_id=t.id and lower(trim(i.team_name))=lower(trim(team.name))) then raise exception 'CAPACITY_FULL'; end if;
 if p_contact is null or char_length(trim(p_contact)) not between 2 and 120 or p_phone is null or char_length(trim(p_phone)) not between 3 and 40 or char_length(coalesce(p_note,''))>1000 then raise exception 'Invalid contact'; end if;
 select u.email into email from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null;
 if email is null then raise exception 'EMAIL_UNCONFIRMED'; end if;
 insert into public.tournament_applications(tournament_id,team_id,applicant_id,team_name,contact_name,contact_email,phone,note)
 values(t.id,team.id,auth.uid(),team.name,trim(p_contact),email,trim(p_phone),trim(coalesce(p_note,''))) returning id into result;
 return result;
end $$;
revoke all on function public.submit_tournament_application(text,uuid,text,text,text) from public,anon;
grant execute on function public.submit_tournament_application(text,uuid,text,text,text) to authenticated;

create function public.decide_tournament_application(p_id uuid,p_decision text,p_reason text default '')
returns void language plpgsql security definer set search_path='' as $$
declare a public.tournament_applications; t public.tournaments; tid uuid;
begin
 if auth.uid() is null then raise exception 'Not authenticated'; end if;
 if p_decision is null or p_decision not in ('accepted','rejected') or char_length(coalesce(p_reason,''))>500 then raise exception 'Invalid decision'; end if;
 select tournament_id into tid from public.tournament_applications where id=p_id;
 select * into t from public.tournaments where id=tid for update;
 if t.id is null or t.organizer_id<>auth.uid() then raise exception 'Not authorized'; end if;
 select * into a from public.tournament_applications where id=p_id for update;
 if a.status<>'pending' then raise exception 'ALREADY_DECIDED'; end if;
 if t.publication_status<>'published' or t.tournament_type not in ('public','combined') or t.event_date<(now() at time zone 'Europe/Bratislava')::date
 or exists(select 1 from public.tournament_result_locks where tournament_id=t.id and locked_at is not null) then raise exception 'REGISTRATION_CLOSED'; end if;
 if p_decision='accepted' then
 if exists(select 1 from public.club_teams ct join public.clubs c on c.id=ct.club_id where ct.id=a.team_id and lower(trim(c.sport))<>lower(trim(t.sport))) then raise exception 'SPORT_MISMATCH'; end if;
 if not exists(select 1 from public.club_teams c where c.id=a.team_id and c.status='active' and upper(trim(c.category))=upper(trim(t.category))) then raise exception 'TEAM_INACTIVE'; end if;
 if private.tournament_reserved_slots(t.id)>=t.capacity and not exists(select 1 from public.tournament_invited_teams i where i.tournament_id=t.id and lower(trim(i.team_name))=lower(trim(a.team_name))) then raise exception 'CAPACITY_FULL'; end if;
 end if;
 update public.tournament_applications set status=p_decision,decision_reason=nullif(trim(p_reason),''),decided_by=auth.uid(),decided_at=now() where id=p_id;
end $$;
revoke all on function public.decide_tournament_application(uuid,text,text) from public,anon;
grant execute on function public.decide_tournament_application(uuid,text,text) to authenticated;

-- Existing editing RPCs and direct manual-list inserts cannot overbook approved applications.
create function private.guard_application_capacity()
returns trigger language plpgsql security definer set search_path='' as $$
declare tid uuid; cap integer; occupied integer;
begin
 if tg_table_name='tournaments' then
   tid:=new.id;cap:=new.capacity;
 else
   if tg_op='DELETE' then tid:=old.tournament_id; else tid:=new.tournament_id; end if;
   select capacity into cap from public.tournaments where id=tid for update;
 end if;
 occupied:=private.tournament_reserved_slots(tid);
 if occupied>cap then raise exception 'CAPACITY_FULL'; end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function private.guard_application_capacity() from public,anon,authenticated;
create trigger application_capacity_guard after update of capacity,registered_count on public.tournaments for each row execute function private.guard_application_capacity();
create trigger invited_application_capacity_guard after insert or update or delete on public.tournament_invited_teams for each row execute function private.guard_application_capacity();
create function public.get_tournament_application_counts()
returns table(slug text,reserved integer) language sql stable security definer set search_path='' as $$
 select t.slug,private.tournament_reserved_slots(t.id) from public.tournaments t
 where (t.publication_status='published' and t.tournament_type in ('public','combined')) or t.organizer_id=auth.uid();
$$;
revoke all on function public.get_tournament_application_counts() from public,anon;
grant execute on function public.get_tournament_application_counts() to anon,authenticated;

create function private.guard_application_category()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (upper(trim(new.category))<>upper(trim(old.category)) or lower(trim(new.sport))<>lower(trim(old.sport)))
 and exists(select 1 from public.tournament_applications a where a.tournament_id=new.id and a.status='accepted') then raise exception 'ACCEPTED_TEAMS_CONFLICT'; end if;
 return new;
end $$;
revoke all on function private.guard_application_category() from public,anon,authenticated;
create trigger accepted_team_category_guard before update of sport,category on public.tournaments for each row execute function private.guard_application_category();
