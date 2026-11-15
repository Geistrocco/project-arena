create table private.tournament_invitations(
 id uuid primary key default gen_random_uuid(),tournament_id uuid not null references public.tournaments(id) on delete cascade,
 team_id uuid not null references public.club_teams(id),token_hash text not null unique,
 status text not null default 'pending' check(status in ('pending','accepted','declined')),
 expires_at timestamptz not null,revoked_at timestamptz,responded_by uuid references auth.users(id),responded_at timestamptz,
 unique(tournament_id,team_id)
);
create table private.tournament_invitation_responses(
 invitation_id uuid references private.tournament_invitations(id) on delete cascade,user_id uuid references auth.users(id),
 decision text not null check(decision in ('accepted','declined')),contact text not null,phone text not null,note text not null,
 review text not null default 'pending' check(review in ('pending','approved','rejected')),created_at timestamptz not null default now(),
 primary key(invitation_id,user_id)
);
alter table private.tournament_invitations enable row level security;
alter table private.tournament_invitation_responses enable row level security;
revoke all on private.tournament_invitations,private.tournament_invitation_responses from public,anon,authenticated;

create function private.open_invitation_tournament(p_id uuid) returns public.tournaments
language plpgsql set search_path='' as $$
declare t public.tournaments;
begin
 select * into t from public.tournaments where id=p_id for update;
 if t.id is null or t.publication_status='cancelled' or t.registration_closed_at is not null
 or t.event_date<(now() at time zone 'Europe/Bratislava')::date
 or exists(select 1 from public.tournament_result_locks where tournament_id=t.id and locked_at is not null)
 or exists(select 1 from public.tournament_matches where tournament_id=t.id and (status='finished' or home_score is not null or away_score is not null)) then raise exception 'INVITATIONS_CLOSED'; end if;
 return t;
end $$;
revoke all on function private.open_invitation_tournament(uuid) from public,anon,authenticated;

create function public.create_tournament_invitation(p_slug text,p_team uuid,p_token text)
returns void language plpgsql security definer set search_path='' as $$
declare t public.tournaments;
begin
 if exists(select 1 from public.account_controls where user_id=auth.uid() and status='suspended') then raise exception 'Not authorized'; end if;
 if auth.uid() is null then raise exception 'Not authenticated'; end if;
 select * into t from public.tournaments where slug=p_slug and organizer_id=auth.uid();
 if t.id is null then raise exception 'Not authorized'; end if;
 t:=private.open_invitation_tournament(t.id);
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_TOKEN'; end if;
 if not exists(select 1 from public.tournament_invited_teams i join public.club_teams c on c.id=i.club_team_id where i.tournament_id=t.id and i.club_team_id=p_team and c.status='active') then raise exception 'SELECT_A_SQUAD'; end if;
 insert into private.tournament_invitations(tournament_id,team_id,token_hash,expires_at)
 values(t.id,p_team,encode(sha256(convert_to(p_token,'UTF8')),'hex'),least(now()+interval '30 days',((t.event_date+1)::timestamp at time zone 'Europe/Bratislava')))
 on conflict(tournament_id,team_id) do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at,revoked_at=null;
 update public.tournaments set updated_at=now() where id=t.id;
end $$;

create function public.get_tournament_invitation(p_token text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare i private.tournament_invitations;t public.tournaments; squad public.club_teams; own_review text;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return null; end if;
 select * into i from private.tournament_invitations where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and revoked_at is null and expires_at>now();
 if i.id is null then return null; end if;
 select * into t from public.tournaments where id=i.tournament_id;
 select * into squad from public.club_teams where id=i.team_id and status='active';
 if squad.id is null or t.publication_status='cancelled' or not exists(select 1 from public.tournament_invited_teams where tournament_id=t.id and club_team_id=i.team_id) then return null; end if;
 select review into own_review from private.tournament_invitation_responses where invitation_id=i.id and user_id=auth.uid();
 return jsonb_build_object('name',t.name,'date',t.event_date,'place',t.place,'fee',t.fee,'team',squad.name,'category',squad.category,'season',squad.season,'status',i.status,'review',own_review,
 'signed_in',auth.uid() is not null,'closed',t.registration_closed_at is not null or t.event_date<(now() at time zone 'Europe/Bratislava')::date
 or exists(select 1 from public.tournament_result_locks where tournament_id=t.id and locked_at is not null)
 or exists(select 1 from public.tournament_matches where tournament_id=t.id and (status='finished' or home_score is not null or away_score is not null)));
end $$;

create function public.respond_tournament_invitation(p_token text,p_decision text,p_contact text,p_phone text,p_note text)
returns text language plpgsql security definer set search_path='' as $$
declare iid uuid;tid uuid;i private.tournament_invitations;t public.tournaments;verified boolean;
begin
 if auth.uid() is null then raise exception 'Not authenticated'; end if;
 if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) or exists(select 1 from public.account_controls where user_id=auth.uid() and status='suspended') then raise exception 'VERIFY_ACCOUNT'; end if;
 if p_decision is null or p_decision not in ('accepted','declined') or p_contact is null or char_length(trim(p_contact)) not between 2 and 120 or p_phone is null or char_length(trim(p_phone)) not between 3 and 40 or char_length(coalesce(p_note,''))>1000 then raise exception 'INVALID_RESPONSE'; end if;
 select id,tournament_id into iid,tid from private.tournament_invitations where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 t:=private.open_invitation_tournament(tid);
 select * into i from private.tournament_invitations where id=iid for update;
 if public.get_tournament_invitation(p_token) is null or i.status<>'pending' then raise exception 'INVITATION_UNAVAILABLE'; end if;
 verified:=exists(select 1 from public.team_memberships where team_id=i.team_id and user_id=auth.uid() and role in ('coach','manager','club_admin'));
 if exists(select 1 from private.tournament_invitation_responses where invitation_id=i.id and user_id=auth.uid()) then raise exception 'ALREADY_RESPONDED'; end if;
 insert into private.tournament_invitation_responses(invitation_id,user_id,decision,contact,phone,note,review)
 values(i.id,auth.uid(),p_decision,trim(p_contact),trim(p_phone),trim(coalesce(p_note,'')),case when verified then 'approved' else 'pending' end);
 if verified then update private.tournament_invitations set status=p_decision,responded_by=auth.uid(),responded_at=now() where id=i.id; end if;
 update public.tournaments set updated_at=now() where id=t.id;
 return case when verified then p_decision else 'review' end;
end $$;

create function public.review_tournament_invitation(p_id uuid,p_user uuid,p_approve boolean)
returns void language plpgsql security definer set search_path='' as $$
declare t public.tournaments;i private.tournament_invitations;r private.tournament_invitation_responses;tid uuid;
begin
 if exists(select 1 from public.account_controls where user_id=auth.uid() and status='suspended') then raise exception 'Not authorized'; end if;
 select tournament_id into tid from private.tournament_invitations where id=p_id;
 select * into t from public.tournaments where id=tid and organizer_id=auth.uid();
 if t.id is null then raise exception 'Not authorized'; end if;
 t:=private.open_invitation_tournament(t.id);
 select * into i from private.tournament_invitations where id=p_id for update;
 select * into r from private.tournament_invitation_responses where invitation_id=p_id and user_id=p_user for update;
 if r.user_id is null or r.review<>'pending' or i.status<>'pending' or i.revoked_at is not null or i.expires_at<=now() or p_approve is null then raise exception 'REVIEW_UNAVAILABLE'; end if;
 if p_approve and (not exists(select 1 from public.tournament_invited_teams where tournament_id=t.id and club_team_id=i.team_id) or not exists(select 1 from public.club_teams where id=i.team_id and status='active') or exists(select 1 from public.account_controls where user_id=p_user and status='suspended')) then raise exception 'REVIEW_UNAVAILABLE'; end if;
 update private.tournament_invitation_responses set review=case when p_approve then 'approved' else 'rejected' end where invitation_id=p_id and user_id=p_user;
 if p_approve then update private.tournament_invitations set status=r.decision,responded_by=p_user,responded_at=now() where id=p_id; end if;
 update public.tournaments set updated_at=now() where id=t.id;
end $$;

create function public.revoke_tournament_invitation(p_slug text,p_team uuid) returns void
language plpgsql security definer set search_path='' as $$
declare t public.tournaments;
begin
 if exists(select 1 from public.account_controls where user_id=auth.uid() and status='suspended') then raise exception 'Not authorized'; end if;
 select * into t from public.tournaments where slug=p_slug and organizer_id=auth.uid();
 if t.id is null then raise exception 'Not authorized'; end if;
 t:=private.open_invitation_tournament(t.id);
 update private.tournament_invitations set revoked_at=now() where tournament_id=t.id and team_id=p_team;
 update public.tournaments set updated_at=now() where id=t.id;
end $$;

create function public.list_tournament_invitations(p_slug text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t public.tournaments;
begin
 if exists(select 1 from public.account_controls where user_id=auth.uid() and status='suspended') then raise exception 'Not authorized'; end if;
 select * into t from public.tournaments where slug=p_slug and organizer_id=auth.uid();
 if t.id is null then raise exception 'Not authorized'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('closed',t.registration_closed_at is not null or t.event_date<(now() at time zone 'Europe/Bratislava')::date or exists(select 1 from public.tournament_result_locks where tournament_id=t.id and locked_at is not null) or exists(select 1 from public.tournament_matches where tournament_id=t.id and (status='finished' or home_score is not null or away_score is not null)),'team_id',s.id,'team',s.name,'category',s.category,'season',s.season,'id',i.id,'status',i.status,'revoked',i.revoked_at is not null,'expires',i.expires_at,'responses',coalesce((select jsonb_agg(jsonb_build_object('user_id',r.user_id,'contact',r.contact,'phone',r.phone,'note',r.note,'decision',r.decision,'review',r.review,'email',u.email)) from private.tournament_invitation_responses r join auth.users u on u.id=r.user_id where r.invitation_id=i.id),'[]'::jsonb)))
 from public.tournament_invited_teams v join public.club_teams s on s.id=v.club_team_id left join private.tournament_invitations i on i.tournament_id=t.id and i.team_id=s.id where v.tournament_id=t.id),'[]'::jsonb);
end $$;

-- Explicit, token-checked exception; no beta enrollment or team role is granted.
create or replace function public.enforce_private_site() returns void
language plpgsql security invoker set search_path='' as $$
begin
 if trim(both '/' from coalesce(current_setting('request.path',true),'')) in ('rpc/get_site_access','rpc/get_tournament_invitation','rpc/respond_tournament_invitation') then return; end if;
 if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')='service_role' then return; end if;
 if coalesce((public.get_site_access()->>'allowed')::boolean,false) then return; end if;
 raise sqlstate '42501' using message='PRIVATE_TESTING_ONLY';
end $$;
revoke all on function public.create_tournament_invitation(text,uuid,text),public.get_tournament_invitation(text),public.respond_tournament_invitation(text,text,text,text,text),public.review_tournament_invitation(uuid,uuid,boolean),public.revoke_tournament_invitation(text,uuid),public.list_tournament_invitations(text) from public,anon,authenticated;
grant execute on function public.get_tournament_invitation(text) to anon,authenticated;
grant execute on function public.create_tournament_invitation(text,uuid,text),public.respond_tournament_invitation(text,text,text,text,text),public.review_tournament_invitation(uuid,uuid,boolean),public.revoke_tournament_invitation(text,uuid),public.list_tournament_invitations(text) to authenticated;

create or replace function public.get_tournament_draw_context(p_slug text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.tournaments; participants jsonb; slots jsonb;
begin
 if auth.uid() is null then raise exception 'Not authenticated'; end if;
 select * into t from public.tournaments where slug=p_slug;
 if t.id is null or t.organizer_id<>auth.uid() then raise exception 'Not authorized'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('name',x.team_name,'source',x.source) order by x.team_name),'[]'::jsonb) into participants from (
 select distinct on(lower(trim(n.team_name))) n.team_name,n.source from (
 select a.team_name,'accepted'::text as source,0 as priority from public.tournament_applications a where a.tournament_id=t.id and a.status='accepted'
 union all select i.team_name,'manual',1 from public.tournament_invited_teams i where i.tournament_id=t.id and (i.club_team_id is null or exists(select 1 from private.tournament_invitations v where v.tournament_id=t.id and v.team_id=i.club_team_id and v.status='accepted'))
 ) n order by lower(trim(n.team_name)),n.priority,n.team_name) x;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.team_name,'group',g.name,'group_id',g.id,'slot',s.slot_number) order by g.sort_order,s.slot_number),'[]'::jsonb) into slots
 from public.tournament_group_teams s join public.tournament_groups g on g.id=s.group_id where s.tournament_id=t.id;
 return jsonb_build_object('version',private.tournament_draw_version(t.id),'capacity',t.capacity,'participants',participants,'slots',slots,
 'closed',t.registration_closed_at is not null,
 'locked',exists(select 1 from public.tournament_result_locks where tournament_id=t.id and locked_at is not null),
 'has_results',exists(select 1 from public.tournament_matches m where m.tournament_id=t.id and (m.status='finished' or m.home_score is not null or m.away_score is not null)),
 'invitation_pending',(select count(*) from public.tournament_invited_teams z where z.tournament_id=t.id and z.club_team_id is not null and not exists(select 1 from private.tournament_invitations v where v.tournament_id=t.id and v.team_id=z.club_team_id and v.status in ('accepted','declined'))),
 'pending',(select count(*) from public.tournament_applications where tournament_id=t.id and status='pending'));
end $$;
revoke all on function public.get_tournament_draw_context(text) from public,anon;
grant execute on function public.get_tournament_draw_context(text) to authenticated;


notify pgrst,'reload schema';

-- Pending invitations reserve a place; an explicit refusal releases it.
create or replace function private.tournament_reserved_slots(p_id uuid)
returns integer language sql stable set search_path='' as $$
 select greatest(0,t.registered_count-(select count(*)::integer from public.tournament_invited_teams i join private.tournament_invitations v on v.tournament_id=i.tournament_id and v.team_id=i.club_team_id where i.tournament_id=t.id and v.status='declined'),
 (select count(*)::integer from public.tournament_invited_teams i where i.tournament_id=t.id and not exists(select 1 from private.tournament_invitations v where v.tournament_id=t.id and v.team_id=i.club_team_id and v.status='declined')))
 +(select count(*)::integer from public.tournament_applications a where a.tournament_id=t.id and a.status='accepted' and not exists(select 1 from public.tournament_invited_teams i where i.tournament_id=t.id and lower(trim(i.team_name))=lower(trim(a.team_name)) and not exists(select 1 from private.tournament_invitations v where v.tournament_id=t.id and v.team_id=i.club_team_id and v.status='declined')))
 from public.tournaments t where t.id=p_id;
$$;

create or replace function public.get_tournament_application_summary(p_slug text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.tournaments;
begin
 select * into t from public.tournaments where slug=p_slug;
 if t.id is null or not coalesce(((t.publication_status='published' and t.tournament_type in ('public','combined')) or t.organizer_id=auth.uid()),false) then return null; end if;
 return jsonb_build_object('reserved',private.tournament_reserved_slots(t.id),'accepted',case when t.team_visibility in ('all','accepted') or t.organizer_id=auth.uid() then
 coalesce((select jsonb_agg(n.name order by n.name) from (select a.team_name name from public.tournament_applications a where a.tournament_id=t.id and a.status='accepted' union select i.team_name from public.tournament_invited_teams i join private.tournament_invitations v on v.tournament_id=i.tournament_id and v.team_id=i.club_team_id where i.tournament_id=t.id and v.status='accepted') n),'[]'::jsonb) else '[]'::jsonb end);
end $$;
revoke all on function public.get_tournament_application_summary(text) from public,anon;
grant execute on function public.get_tournament_application_summary(text) to anon,authenticated;


notify pgrst,'reload schema';
