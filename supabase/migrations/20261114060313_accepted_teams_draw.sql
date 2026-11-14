alter table public.tournaments add column registration_closed_at timestamptz;
create function private.tournament_draw_version(p_id uuid)
returns text language sql stable set search_path='' as $$
 select md5(jsonb_build_array(to_jsonb(t),
 (select jsonb_agg(to_jsonb(a) order by a.id) from public.tournament_applications a where a.tournament_id=t.id),
 (select jsonb_agg(to_jsonb(i) order by i.team_name) from public.tournament_invited_teams i where i.tournament_id=t.id),
 (select jsonb_agg(to_jsonb(g) order by g.id) from public.tournament_groups g where g.tournament_id=t.id),
 (select jsonb_agg(to_jsonb(s) order by s.id) from public.tournament_group_teams s where s.tournament_id=t.id),
 (select jsonb_agg(to_jsonb(m) order by m.id) from public.tournament_matches m where m.tournament_id=t.id))::text)
 from public.tournaments t where t.id=p_id;
$$;
revoke all on function private.tournament_draw_version(uuid) from public,anon,authenticated;
create function public.get_tournament_draw_context(p_slug text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.tournaments; participants jsonb; slots jsonb;
begin
 if auth.uid() is null then raise exception 'Not authenticated'; end if;
 select * into t from public.tournaments where slug=p_slug;
 if t.id is null or t.organizer_id<>auth.uid() then raise exception 'Not authorized'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('name',x.team_name,'source',x.source) order by x.team_name),'[]'::jsonb) into participants from (
 select distinct on(lower(trim(n.team_name))) n.team_name,n.source from (
 select a.team_name,'accepted'::text as source,0 as priority from public.tournament_applications a where a.tournament_id=t.id and a.status='accepted'
 union all select i.team_name,'manual',1 from public.tournament_invited_teams i where i.tournament_id=t.id
 ) n order by lower(trim(n.team_name)),n.priority,n.team_name) x;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.team_name,'group',g.name,'group_id',g.id,'slot',s.slot_number) order by g.sort_order,s.slot_number),'[]'::jsonb) into slots
 from public.tournament_group_teams s join public.tournament_groups g on g.id=s.group_id where s.tournament_id=t.id;
 return jsonb_build_object('version',private.tournament_draw_version(t.id),'capacity',t.capacity,'participants',participants,'slots',slots,
 'closed',t.registration_closed_at is not null,
 'locked',exists(select 1 from public.tournament_result_locks where tournament_id=t.id and locked_at is not null),
 'has_results',exists(select 1 from public.tournament_matches m where m.tournament_id=t.id and (m.status='finished' or m.home_score is not null or m.away_score is not null)),
 'pending',(select count(*) from public.tournament_applications where tournament_id=t.id and status='pending'));
end $$;
revoke all on function public.get_tournament_draw_context(text) from public,anon;
grant execute on function public.get_tournament_draw_context(text) to authenticated;

create function public.apply_tournament_draw(p_slug text,p_version text,p_names text[],p_confirm boolean)
returns void language plpgsql security definer set search_path='' as $$
declare t public.tournaments; ctx jsonb; expected text[]; old_names text[]; slot_ids uuid[]; count_slots integer;
begin
 if auth.uid() is null then raise exception 'Not authenticated'; end if;
 select * into t from public.tournaments where slug=p_slug for update;
 if t.id is null or t.organizer_id<>auth.uid() then raise exception 'Not authorized'; end if;
 if p_confirm is distinct from true then raise exception 'CONFIRMATION_REQUIRED'; end if;
 -- Serialize with score updates, participant decisions, edits and final result locking.
 perform 1 from public.tournament_matches where tournament_id=t.id order by id for update;
 ctx:=public.get_tournament_draw_context(p_slug);
 if (ctx->>'locked')::boolean then raise exception 'RESULTS_LOCKED'; end if;
 if (ctx->>'has_results')::boolean then raise exception 'RESULTS_EXIST'; end if;
 if t.publication_status='cancelled' or t.event_date<(now() at time zone 'Europe/Bratislava')::date then raise exception 'DRAW_CLOSED'; end if;
 if p_version is distinct from ctx->>'version' then raise exception 'DRAW_CHANGED'; end if;
 select array_agg(x->>'name' order by x->>'name') into expected from jsonb_array_elements(ctx->'participants') x;
 select array_agg((x->>'id')::uuid order by ord),array_agg(x->>'name' order by ord) into slot_ids,old_names from jsonb_array_elements(ctx->'slots') with ordinality as s(x,ord);
 count_slots:=coalesce(cardinality(slot_ids),0);
 if count_slots<2 or count_slots<>t.capacity or count_slots<>coalesce(cardinality(expected),0)
 or count_slots<>(select count(distinct n) from unnest(old_names) n) then raise exception 'DRAW_SIZE_MISMATCH'; end if;
 if exists(select 1 from public.tournament_matches m where m.tournament_id=t.id and ((m.home_team_name is not null and not(m.home_team_name=any(old_names))) or (m.away_team_name is not null and not(m.away_team_name=any(old_names))))) then raise exception 'DRAW_SIZE_MISMATCH'; end if;
 if p_names is null or cardinality(p_names)<>count_slots or (select array_agg(n order by n) from unnest(p_names) n) is distinct from expected then raise exception 'DRAW_NAMES_MISMATCH'; end if;
 -- All substitutions use the original mapping in one statement: swaps never cascade.
 update public.tournament_group_teams s set team_name=p_names[array_position(slot_ids,s.id)] where s.tournament_id=t.id and s.id=any(slot_ids);
 update public.tournament_matches m set
 home_team_name=case when m.home_team_name=any(old_names) then p_names[array_position(old_names,m.home_team_name)] else m.home_team_name end,
 away_team_name=case when m.away_team_name=any(old_names) then p_names[array_position(old_names,m.away_team_name)] else m.away_team_name end
 where m.tournament_id=t.id;
 insert into public.tournament_invited_teams(tournament_id,team_name)
 select t.id,a.team_name from public.tournament_applications a where a.tournament_id=t.id and a.status='accepted'
 and not exists(select 1 from public.tournament_invited_teams i where i.tournament_id=t.id and lower(trim(i.team_name))=lower(trim(a.team_name)));
 update public.tournaments set registration_closed_at=coalesce(registration_closed_at,now()),updated_at=now() where id=t.id;
end $$;
revoke all on function public.apply_tournament_draw(text,text,text[],boolean) from public,anon;
grant execute on function public.apply_tournament_draw(text,text,text[],boolean) to authenticated;

create function private.guard_draw_registration()
returns trigger language plpgsql security definer set search_path='' as $$
declare closed timestamptz;
begin
 if tg_op='INSERT' or (new.status='accepted' and old.status is distinct from 'accepted') then
 select registration_closed_at into closed from public.tournaments where id=new.tournament_id for update;
 if closed is not null then raise exception 'REGISTRATION_CLOSED'; end if;
 end if;
 return new;
end $$;
revoke all on function private.guard_draw_registration() from public,anon,authenticated;
create trigger closed_draw_application_guard before insert or update on public.tournament_applications for each row execute function private.guard_draw_registration();

create or replace function public.submit_tournament_application(p_slug text,p_team_id uuid,p_contact text,p_phone text,p_note text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare t public.tournaments; team public.club_teams; result uuid; email text;
begin
 if auth.uid() is null then raise exception 'Not authenticated'; end if;
 select * into t from public.tournaments where slug=p_slug for update;
 if t.registration_closed_at is not null then raise exception 'REGISTRATION_CLOSED'; end if;
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

create or replace function public.decide_tournament_application(p_id uuid,p_decision text,p_reason text default '')
returns void language plpgsql security definer set search_path='' as $$
declare a public.tournament_applications; t public.tournaments; tid uuid;
begin
 if auth.uid() is null then raise exception 'Not authenticated'; end if;
 if p_decision is null or p_decision not in ('accepted','rejected') or char_length(coalesce(p_reason,''))>500 then raise exception 'Invalid decision'; end if;
 select tournament_id into tid from public.tournament_applications where id=p_id;
 select * into t from public.tournaments where id=tid for update;
 if t.id is null or t.organizer_id<>auth.uid() then raise exception 'Not authorized'; end if;
 select * into a from public.tournament_applications where id=p_id for update;
 if p_decision='accepted' and t.registration_closed_at is not null then raise exception 'REGISTRATION_CLOSED'; end if;
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

