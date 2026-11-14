-- Match history is retained: annulled matches have outcome void and are excluded from standings.
alter table public.tournaments
 add column withdrawal_rule text not null default 'keep' check(withdrawal_rule in ('keep','annul')),
 add column forfeit_score integer not null default 3 check(forfeit_score between 1 and 999);
alter table public.tournament_matches
 add column outcome text not null default 'played' check(outcome in ('played','forfeit','void')),
 add column outcome_reason text,
 add constraint tournament_outcome_reason check(outcome='played' or (outcome_reason is not null and char_length(trim(outcome_reason)) between 5 and 1000));
create table public.tournament_withdrawals(
 tournament_id uuid not null references public.tournaments(id) on delete cascade,
 team_name text not null,reason text not null check(char_length(trim(reason)) between 5 and 1000),
 actor_id uuid references auth.users(id) on delete set null,created_at timestamptz not null default clock_timestamp(),
 primary key(tournament_id,team_name)
);
create index tournament_withdrawal_actor_idx on public.tournament_withdrawals(actor_id);
alter table public.tournament_withdrawals enable row level security;
revoke all on public.tournament_withdrawals from public,anon,authenticated;
create table public.tournament_incident_events(
 id uuid primary key default gen_random_uuid(),tournament_id uuid not null references public.tournaments(id) on delete cascade,
 action text not null,target text not null,reason text not null,actor_id uuid references auth.users(id) on delete set null,
 before_matches jsonb not null,after_matches jsonb not null,created_at timestamptz not null default clock_timestamp()
);
create index tournament_incident_event_idx on public.tournament_incident_events(tournament_id,created_at desc);
create index tournament_incident_actor_idx on public.tournament_incident_events(actor_id);
alter table public.tournament_incident_events enable row level security;
revoke all on public.tournament_incident_events from public,anon,authenticated;

create function private.guard_incident_rules()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.withdrawal_rule,new.forfeit_score) is distinct from (old.withdrawal_rule,old.forfeit_score)
 and (exists(select 1 from public.tournament_ranking_frozen where tournament_id=old.id)
 or exists(select 1 from public.tournament_matches where tournament_id=old.id and status='finished')) then raise exception 'INCIDENT_RULES_FROZEN';end if;
 return new;
end $$;
create trigger incident_rules_guard before update of withdrawal_rule,forfeit_score on public.tournaments for each row execute function private.guard_incident_rules();
create or replace function private.group_ranking_version(p_group uuid)
returns text language sql stable set search_path='' as $$
 select md5(jsonb_build_array(g.id,t.ranking_rule,(select jsonb_agg(w.team_name order by w.team_name) from public.tournament_withdrawals w where w.tournament_id=t.id),
 (select jsonb_agg(jsonb_build_array(s.id,s.team_name,s.slot_number) order by s.id) from public.tournament_group_teams s where s.group_id=g.id),
 (select jsonb_agg(jsonb_build_array(m.id,m.home_team_name,m.away_team_name,m.home_score,m.away_score,m.status,m.phase,m.outcome) order by m.id) from public.tournament_matches m where m.group_id=g.id and m.phase in ('group','final_group')))::text)
 from public.tournament_groups g join public.tournaments t on t.id=g.tournament_id where g.id=p_group;
$$;
create or replace function private.group_ranking(p_group uuid)
returns table(name text,played bigint,wins bigint,draws bigint,losses bigint,scored bigint,conceded bigint,difference bigint,points bigint,sport_rank bigint,"position" bigint,rank bigint,unresolved boolean)
language sql stable set search_path='' as $$
 with games as (
 select m.* from public.tournament_matches m where m.group_id=p_group and m.phase in ('group','final_group') and m.status='finished' and m.outcome<>'void' and m.home_score is not null and m.away_score is not null
 ), appearances as (
 select home_team_name as name,away_team_name as opponent,home_score::bigint as gf,away_score::bigint as ga from games
 union all select away_team_name,home_team_name,away_score::bigint,home_score::bigint from games
 ), totals as (
 select s.team_name as name,s.slot_number,t.ranking_rule,exists(select 1 from public.tournament_withdrawals w where w.tournament_id=g.tournament_id and w.team_name=s.team_name) as withdrawn,count(a.name) as played,
 count(*) filter(where a.gf>a.ga) as wins,count(*) filter(where a.gf=a.ga) as draws,count(*) filter(where a.gf<a.ga) as losses,
 coalesce(sum(a.gf),0)::bigint as scored,coalesce(sum(a.ga),0)::bigint as conceded,
 coalesce(sum(case when a.gf>a.ga then 3 when a.gf=a.ga then 1 else 0 end),0)::bigint as points
 from public.tournament_group_teams s join public.tournament_groups g on g.id=s.group_id join public.tournaments t on t.id=g.tournament_id
 left join appearances a on a.name=s.team_name and exists(select 1 from public.tournament_group_teams x where x.group_id=p_group and x.team_name=a.opponent)
 where s.group_id=p_group group by s.team_name,s.slot_number,t.ranking_rule,g.tournament_id
 ), metrics as (
 select r.*,r.scored-r.conceded as difference,
 coalesce(sum(case when a.gf>a.ga then 3 when a.gf=a.ga then 1 else 0 end) filter(where o.name is not null),0)::bigint as mp,
 coalesce(sum(a.gf-a.ga) filter(where o.name is not null),0)::bigint as md,
 coalesce(sum(a.gf) filter(where o.name is not null),0)::bigint as mg
 from totals r left join appearances a on a.name=r.name left join totals o on o.name=a.opponent and o.points=r.points and o.withdrawn=r.withdrawn
 group by r.name,r.slot_number,r.ranking_rule,r.played,r.wins,r.draws,r.losses,r.scored,r.conceded,r.points,r.withdrawn
 ), ranked as (
 select m.*,rank() over(order by withdrawn asc,points desc,
 case when ranking_rule='head_to_head' then mp else difference end desc,
 case when ranking_rule='head_to_head' then md else scored end desc,
 case when ranking_rule='head_to_head' then mg when ranking_rule='overall' then mp else 0 end desc,
 case when ranking_rule='head_to_head' then difference when ranking_rule='overall' then md else 0 end desc,
 case when ranking_rule='head_to_head' then scored when ranking_rule='overall' then mg else 0 end desc,
 case when ranking_rule='legacy' or withdrawn then name else null end) as sr
 from metrics m
 ), decision as (
 select d.ordered_names from public.tournament_tie_decisions d where d.group_id=p_group and d.version=private.group_ranking_version(p_group) order by d.created_at desc,d.id desc limit 1
 ), ordered as (
 select r.*,count(*) over(partition by sr)>1 and not exists(select 1 from decision) as tied,
 row_number() over(order by sr,coalesce(array_position((select ordered_names from decision),r.name),r.slot_number)) as pos from ranked r
 )
 select name,played,wins,draws,losses,scored,conceded,difference,points,sr,pos,case when tied then sr else pos end,tied from ordered order by ordered.pos;
$$;
create or replace function private.resolve_ranked_source(p_tid uuid,p_source text,p_depth integer default 0)
returns text language plpgsql stable set search_path='' as $$
declare parts text[]; gid uuid; m public.tournament_matches; home text; away text; result text;
begin
 if p_source is null or p_depth>64 then return null; end if;
 parts:=regexp_match(p_source,'^(\d+)\. miesto skupiny ([A-Z0-9]+)$');
 if parts is not null then
 select id into gid from public.tournament_groups where tournament_id=p_tid and code=parts[2];
 if gid is null or not private.group_results_complete(gid) then return null; end if;
 select r.name into result from private.group_ranking(gid) r where r.position=parts[1]::integer and not r.unresolved;return result;
 end if;
 parts:=regexp_match(p_source,'^(Víťaz|Porazený) zápasu (\d+)$');if parts is null then return null;end if;
 select * into m from public.tournament_matches where tournament_id=p_tid and match_number=parts[2]::integer;
 if m.id is null or m.outcome='void' or m.status<>'finished' or m.home_score is null or m.away_score is null or m.home_score=m.away_score then return null; end if;
 home:=coalesce(m.home_team_name,private.resolve_ranked_source(p_tid,m.home_source,p_depth+1));away:=coalesce(m.away_team_name,private.resolve_ranked_source(p_tid,m.away_source,p_depth+1));
 if m.outcome='played' and (home is null or away is null) then return null; end if;
 return case when (parts[1]='Víťaz')=(m.home_score>m.away_score) then home else away end;
end $$;
create or replace function public.get_tournament_rankings(p_slug text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.tournaments; result jsonb;
begin
 select * into t from public.tournaments where slug=p_slug;
 if t.id is null or not coalesce((t.publication_status='published' and t.tournament_type in ('public','combined') and t.team_visibility='all') or private.can_score_tournament(auth.uid(),t.id),false) then return null;end if;
 select coalesce(jsonb_object_agg(g.id::text,jsonb_build_object('rows',(select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('withdrawn',exists(select 1 from public.tournament_withdrawals w where w.tournament_id=t.id and w.team_name=r.name)) order by r.position),'[]'::jsonb) from private.group_ranking(g.id) r),
 'version',private.group_ranking_version(g.id),'reason',(select d.reason from public.tournament_tie_decisions d where d.group_id=g.id and d.version=private.group_ranking_version(g.id) order by d.created_at desc,d.id desc limit 1))),'{}'::jsonb)
 into result from public.tournament_groups g where g.tournament_id=t.id;
 return result;
end $$;
create or replace function public.create_tournament_with_location(
  p_name text, p_sport text, p_category text, p_event_date date, p_place text,
  p_capacity integer, p_playing_fields integer, p_match_duration integer, p_fee numeric,
  p_tournament_type text, p_team_visibility text, p_club_ids text[], p_custom_teams text[],
  p_start_time time, p_turnover_minutes integer, p_schedule_slot_minutes integer,
  p_has_lunch_break boolean, p_lunch_break_start time, p_lunch_break_duration integer,
  p_game_system text, p_qualifiers_per_group integer, p_third_place_match boolean,
  p_plan jsonb, p_country text, p_region text, p_surface text
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  created_slug text;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_country not in ('Slovensko', 'Česko') or p_region is null or p_surface is null then
    raise exception 'Invalid tournament location';
  end if;
  if coalesce(p_plan->>'ranking_rule','head_to_head') not in ('head_to_head','overall','legacy') then raise exception 'Invalid ranking rule';end if;
  if coalesce(p_plan->>'withdrawal_rule','keep') not in ('keep','annul') or coalesce((p_plan->>'forfeit_score')::integer,3) not between 1 and 999 then raise exception 'INVALID_INCIDENT_RULES';end if;
  created_slug := public.create_tournament_with_plan(
    p_name, p_sport, p_category, p_event_date, p_place, p_capacity,
    p_playing_fields, p_match_duration, p_fee, p_tournament_type,
    p_team_visibility, p_club_ids, p_custom_teams, p_start_time,
    p_turnover_minutes, p_schedule_slot_minutes, p_has_lunch_break,
    p_lunch_break_start, p_lunch_break_duration, p_game_system,
    p_qualifiers_per_group, p_third_place_match, p_plan
  );
  update public.tournaments
  set country = p_country, region = p_region, surface = p_surface,ranking_rule=coalesce(p_plan->>'ranking_rule','head_to_head'),withdrawal_rule=coalesce(p_plan->>'withdrawal_rule','keep'),forfeit_score=coalesce((p_plan->>'forfeit_score')::integer,3)
  where slug = created_slug and organizer_id = uid;
  if not found then raise exception 'Tournament location could not be saved'; end if;
  return created_slug;
end; $$;

create or replace function public.update_tournament_with_location(
  p_slug text, p_name text, p_sport text, p_category text, p_event_date date, p_place text,
  p_capacity integer, p_playing_fields integer, p_match_duration integer, p_fee numeric,
  p_tournament_type text, p_team_visibility text, p_club_ids text[], p_custom_teams text[],
  p_start_time time, p_turnover_minutes integer, p_schedule_slot_minutes integer,
  p_has_lunch_break boolean, p_lunch_break_start time, p_lunch_break_duration integer,
  p_game_system text, p_qualifiers_per_group integer, p_third_place_match boolean,
  p_plan jsonb, p_confirm_reset boolean, p_country text, p_region text, p_surface text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_country not in ('Slovensko', 'Česko') or p_region is null or p_surface is null then
    raise exception 'Invalid tournament location';
  end if;
  -- Validate/freeze the rule before the existing edit RPC can regenerate score rows.
  update public.tournaments set ranking_rule=coalesce(p_plan->>'ranking_rule',ranking_rule),withdrawal_rule=coalesce(p_plan->>'withdrawal_rule',withdrawal_rule),forfeit_score=coalesce((p_plan->>'forfeit_score')::integer,forfeit_score) where slug=p_slug and organizer_id=uid;
  if not found then raise exception 'Not allowed';end if;
  perform public.update_tournament_with_plan(
    p_slug, p_name, p_sport, p_category, p_event_date, p_place, p_capacity,
    p_playing_fields, p_match_duration, p_fee, p_tournament_type,
    p_team_visibility, p_club_ids, p_custom_teams, p_start_time,
    p_turnover_minutes, p_schedule_slot_minutes, p_has_lunch_break,
    p_lunch_break_start, p_lunch_break_duration, p_game_system,
    p_qualifiers_per_group, p_third_place_match, p_plan, p_confirm_reset
  );
  update public.tournaments
  set country = p_country, region = p_region, surface = p_surface, updated_at = now()
  where slug = p_slug and organizer_id = uid;
  if not found then raise exception 'Not allowed'; end if;
end; $$;

revoke execute on function public.create_tournament_with_location(text,text,text,date,text,integer,integer,integer,numeric,text,text,text[],text[],time,integer,integer,boolean,time,integer,text,integer,boolean,jsonb,text,text,text) from public, anon;
grant execute on function public.create_tournament_with_location(text,text,text,date,text,integer,integer,integer,numeric,text,text,text[],text[],time,integer,integer,boolean,time,integer,text,integer,boolean,jsonb,text,text,text) to authenticated;
revoke execute on function public.update_tournament_with_location(text,text,text,text,date,text,integer,integer,integer,numeric,text,text,text[],text[],time,integer,integer,boolean,time,integer,text,integer,boolean,jsonb,boolean,text,text,text) from public, anon;
grant execute on function public.update_tournament_with_location(text,text,text,text,date,text,integer,integer,integer,numeric,text,text,text[],text[],time,integer,integer,boolean,time,integer,text,integer,boolean,jsonb,boolean,text,text,text) to authenticated;

-- A finished void match is a known absence, not an unknown qualifier.
create function private.incident_source_ready(p_tid uuid,p_source text)
returns boolean language plpgsql stable set search_path='' as $$
declare parts text[];m public.tournament_matches;gid uuid;
begin
 if p_source is null then return true;end if;
 parts:=regexp_match(p_source,'^(\d+)\. miesto skupiny ([A-Z0-9]+)$');
 if parts is not null then
  select id into gid from public.tournament_groups where tournament_id=p_tid and code=parts[2];
  return gid is not null and private.group_results_complete(gid) and exists(select 1 from private.group_ranking(gid) r where r.position=parts[1]::integer and not r.unresolved);
 end if;
 parts:=regexp_match(p_source,'^(Víťaz|Porazený) zápasu (\d+)$');
 if parts is null then return false;end if;
 select * into m from public.tournament_matches where tournament_id=p_tid and match_number=parts[2]::integer;
 return coalesce(m.status='finished' and (m.outcome='void' or m.home_score<>m.away_score),false);
end $$;

create function private.incident_match_dependency(p_tid uuid,p_source text,p_number integer,p_depth integer default 0)
returns boolean language plpgsql stable set search_path='' as $$
declare parts text[];m public.tournament_matches;
begin
 if p_source is null or p_depth>64 then return false;end if;
 parts:=regexp_match(p_source,'^(Víťaz|Porazený) zápasu (\d+)$');
 if parts is null then return false;end if;
 if parts[2]::integer=p_number then return true;end if;
 select * into m from public.tournament_matches where tournament_id=p_tid and match_number=parts[2]::integer;
 return coalesce(private.incident_match_dependency(p_tid,m.home_source,p_number,p_depth+1) or private.incident_match_dependency(p_tid,m.away_source,p_number,p_depth+1),false);
end $$;

create or replace function private.guard_ranked_score()
returns trigger language plpgsql security definer set search_path='' as $$
declare t public.tournaments;code text;
begin
 select * into t from public.tournaments where id=new.tournament_id for share;
 if new.status='finished' then
  insert into public.tournament_ranking_frozen(tournament_id) values(t.id) on conflict do nothing;
  if t.ranking_rule<>'legacy' and
    ((new.home_source is not null and not private.incident_source_ready(t.id,new.home_source)) or
     (new.away_source is not null and not private.incident_source_ready(t.id,new.away_source))) then raise exception 'UNRESOLVED_QUALIFIER';end if;
  if new.outcome='played' and (coalesce(new.home_team_name,private.resolve_ranked_source(t.id,new.home_source)) is null or coalesce(new.away_team_name,private.resolve_ranked_source(t.id,new.away_source)) is null) then raise exception 'UNRESOLVED_QUALIFIER';end if;
  if new.outcome='played' and exists(select 1 from public.tournament_withdrawals w where w.tournament_id=t.id and w.team_name in (coalesce(new.home_team_name,private.resolve_ranked_source(t.id,new.home_source)),coalesce(new.away_team_name,private.resolve_ranked_source(t.id,new.away_source)))) then raise exception 'WITHDRAWN_TEAM';end if;
 end if;
 if tg_op='UPDATE' and (new.home_score,new.away_score,new.status,new.outcome) is distinct from (old.home_score,old.away_score,old.status,old.outcome) then
  if exists(select 1 from public.tournament_matches m where m.tournament_id=t.id and m.id<>new.id and m.status='finished' and
    (private.incident_match_dependency(t.id,m.home_source,old.match_number) or private.incident_match_dependency(t.id,m.away_source,old.match_number))) then raise exception 'DEPENDENT_RESULTS_EXIST';end if;
  if old.group_id is not null then
   select g.code into code from public.tournament_groups g where g.id=old.group_id;
   if exists(select 1 from public.tournament_matches m where m.tournament_id=t.id and m.id<>new.id and m.status='finished' and
     (private.source_depends_on_group(t.id,m.home_source,code) or private.source_depends_on_group(t.id,m.away_source,code))) then raise exception 'DEPENDENT_RESULTS_EXIST';end if;
  end if;
 end if;
 return new;
end $$;
-- The existing trigger already calls this function; it must now also track outcome changes.
drop trigger ranked_score_guard on public.tournament_matches;
create trigger ranked_score_guard before insert or update of home_score,away_score,status,outcome on public.tournament_matches for each row execute function private.guard_ranked_score();

create function private.settle_withdrawn_matches(p_tid uuid)
returns void language plpgsql security definer set search_path='' as $$
declare m public.tournament_matches;hs text;aws text;ha boolean;aa boolean;changed boolean;score integer;reason text;
begin
 if not exists(select 1 from public.tournament_withdrawals where tournament_id=p_tid) then return;end if;
 select forfeit_score into score from public.tournaments where id=p_tid for update;
 loop
  changed:=false;
  for m in select * from public.tournament_matches where tournament_id=p_tid and status='scheduled' order by match_number for update loop
   if (m.home_source is not null and not private.incident_source_ready(p_tid,m.home_source)) or (m.away_source is not null and not private.incident_source_ready(p_tid,m.away_source)) then continue;end if;
   hs:=coalesce(m.home_team_name,private.resolve_ranked_source(p_tid,m.home_source));aws:=coalesce(m.away_team_name,private.resolve_ranked_source(p_tid,m.away_source));
   ha:=hs is null or exists(select 1 from public.tournament_withdrawals where tournament_id=p_tid and team_name=hs);
   aa:=aws is null or exists(select 1 from public.tournament_withdrawals where tournament_id=p_tid and team_name=aws);
   if not ha and not aa then continue;end if;
   reason:='Odstúpenie tímu: '||coalesce((select string_agg(w.team_name||' – '||w.reason,'; ' order by w.team_name) from public.tournament_withdrawals w where w.tournament_id=p_tid and w.team_name in (hs,aws)),'bez postupujúceho po odstúpení');
   update public.tournament_matches set status='finished',home_score=case when ha then 0 else score end,away_score=case when aa then 0 else score end,
    outcome=case when ha and aa then 'void' else 'forfeit' end,outcome_reason=left(reason,1000),updated_at=now() where id=m.id;
   changed:=true;
  end loop;
  exit when not changed;
 end loop;
end $$;

create function private.settle_withdrawn_after_score()
returns trigger language plpgsql security definer set search_path='' as $$
declare before_rows jsonb;after_rows jsonb;
begin
 if pg_trigger_depth()>1 or current_setting('tournio.incident_batch',true)='on' then return new;end if;
 if new.status='finished' and (new.home_score,new.away_score,new.status) is distinct from (old.home_score,old.away_score,old.status) then
  select coalesce(jsonb_agg(to_jsonb(m) order by m.id),'[]'::jsonb) into before_rows from public.tournament_matches m where tournament_id=new.tournament_id;
  perform private.settle_withdrawn_matches(new.tournament_id);
  select coalesce(jsonb_agg(to_jsonb(m) order by m.id),'[]'::jsonb) into after_rows from public.tournament_matches m where tournament_id=new.tournament_id;
  if before_rows<>after_rows then
   insert into public.tournament_incident_events(tournament_id,action,target,reason,actor_id,before_matches,after_matches)
   values(new.tournament_id,'automatic',new.id::text,'Automatické vyriešenie zápasov odstúpených tímov po výsledku zápasu.',auth.uid(),before_rows,after_rows);
  end if;
 end if;return new;
end $$;
create trigger settle_withdrawn_score after update of home_score,away_score,status on public.tournament_matches for each row execute function private.settle_withdrawn_after_score();

create function private.incident_version(p_tid uuid)
returns text language sql stable set search_path='' as $$
 select md5(jsonb_build_array(t.withdrawal_rule,t.forfeit_score,t.ranking_rule,
 (select jsonb_agg(jsonb_build_array(m.id,m.group_id,m.home_team_name,m.away_team_name,m.home_source,m.away_source,m.home_score,m.away_score,m.status,m.outcome,m.outcome_reason) order by m.id) from public.tournament_matches m where tournament_id=t.id),
 (select jsonb_agg(to_jsonb(w) order by w.team_name) from public.tournament_withdrawals w where tournament_id=t.id),
 (select jsonb_agg(jsonb_build_array(s.id,s.group_id,s.team_name,s.slot_number) order by s.id) from public.tournament_group_teams s where tournament_id=t.id),
 (select jsonb_agg(to_jsonb(d) order by d.id) from public.tournament_tie_decisions d where tournament_id=t.id),
 (select locked_at from public.tournament_result_locks where tournament_id=t.id))::text) from public.tournaments t where t.id=p_tid;
$$;

create function public.get_tournament_incidents(p_slug text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.tournaments;
begin
 select * into t from public.tournaments where slug=p_slug;
 if t.id is null or not coalesce((t.publication_status='published' and t.tournament_type in ('public','combined') and t.team_visibility='all') or private.can_score_tournament(auth.uid(),t.id),false) then return null;end if;
 return jsonb_build_object('withdrawal_rule',t.withdrawal_rule,'forfeit_score',t.forfeit_score,'rules_frozen',exists(select 1 from public.tournament_ranking_frozen where tournament_id=t.id),
 'withdrawals',(select coalesce(jsonb_agg(jsonb_build_object('name',w.team_name,'reason',w.reason) order by w.team_name),'[]'::jsonb) from public.tournament_withdrawals w where tournament_id=t.id),
 'events',(select coalesce(jsonb_agg(x order by created_at desc),'[]'::jsonb) from (select e.action,e.target,e.reason,e.created_at,(select coalesce(jsonb_agg(jsonb_build_object('number',a->'match_number','home',coalesce(a->>'home_team_name',a->>'home_source'),'away',coalesce(a->>'away_team_name',a->>'away_source'),'before_home',b->'home_score','before_away',b->'away_score','home_score',a->'home_score','away_score',a->'away_score','outcome',a->'outcome')),'[]'::jsonb) from jsonb_array_elements(e.after_matches) a join jsonb_array_elements(e.before_matches) b on a->>'id'=b->>'id' where (a-'updated_at') is distinct from (b-'updated_at')) as changes from public.tournament_incident_events e where e.tournament_id=t.id order by e.created_at desc limit 30) x));
end $$;
revoke all on function public.get_tournament_incidents(text) from public,anon;
grant execute on function public.get_tournament_incidents(text) to anon,authenticated;

create function private.apply_tournament_incident(p_tid uuid,p_action text,p_target text,p_winner text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare t public.tournaments;m public.tournament_matches;g public.tournament_groups;before_rows jsonb;after_rows jsonb;hs text;aws text;prior jsonb;previous_batch text;event public.tournament_incident_events;step record;current_row jsonb;
begin
 select * into t from public.tournaments where id=p_tid for update;
 if auth.uid() is null or t.organizer_id is distinct from auth.uid() then raise exception 'NOT_ALLOWED';end if;
 if exists(select 1 from public.tournament_result_locks where tournament_id=t.id and locked_at is not null) then raise exception 'RESULTS_LOCKED';end if;
 if p_reason is null or char_length(trim(p_reason)) not between 5 and 1000 then raise exception 'REASON_REQUIRED';end if;
 if t.sport='Tenis' then raise exception 'TENNIS_NOT_SUPPORTED';end if;
 perform 1 from public.tournament_matches where tournament_id=t.id order by id for update;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) into before_rows from public.tournament_matches x where tournament_id=t.id;
 previous_batch:=current_setting('tournio.incident_batch',true);perform set_config('tournio.incident_batch','on',true);
 if p_action='withdraw' then
  if not exists(select 1 from public.tournament_group_teams where tournament_id=t.id and team_name=p_target) then raise exception 'UNKNOWN_TEAM';end if;
  if exists(select 1 from public.tournament_withdrawals where tournament_id=t.id and team_name=p_target) then raise exception 'ALREADY_WITHDRAWN';end if;
  -- Even with preserved scores, moving a withdrawn team changes qualifying positions.
  for g in select distinct gr.* from public.tournament_groups gr join public.tournament_group_teams s on s.group_id=gr.id where s.tournament_id=t.id and s.team_name=p_target loop
   if exists(select 1 from public.tournament_matches x where x.tournament_id=t.id and x.status='finished' and
     (private.source_depends_on_group(t.id,x.home_source,g.code) or private.source_depends_on_group(t.id,x.away_source,g.code))) then raise exception 'DEPENDENT_RESULTS_EXIST';end if;
  end loop;
  if t.withdrawal_rule='annul' then
   update public.tournament_matches set outcome='void',outcome_reason=trim(p_reason),status='finished',home_score=coalesce(home_score,0),away_score=coalesce(away_score,0),updated_at=now()
   where tournament_id=t.id and (home_team_name=p_target or away_team_name=p_target) and phase in ('group','final_group');
  end if;
  insert into public.tournament_withdrawals(tournament_id,team_name,reason,actor_id) values(t.id,p_target,trim(p_reason),auth.uid());
 elsif p_action='reinstate' then
  if not exists(select 1 from public.tournament_withdrawals where tournament_id=t.id and team_name=p_target) then raise exception 'NOT_WITHDRAWN';end if;
  if (select count(*) from public.tournament_withdrawals where tournament_id=t.id)>1 then raise exception 'WITHDRAWAL_CHANGED';end if;
  select * into event from public.tournament_incident_events where tournament_id=t.id and action='withdraw' and target=p_target order by created_at desc,id desc limit 1;
  if event.id is null then raise exception 'CANNOT_RESTORE';end if;
  for g in select distinct gr.* from public.tournament_groups gr join public.tournament_group_teams s on s.group_id=gr.id where s.tournament_id=t.id and s.team_name=p_target loop
   if exists(select 1 from public.tournament_matches z where z.tournament_id=t.id and z.status='finished' and
    (private.source_depends_on_group(t.id,z.home_source,g.code) or private.source_depends_on_group(t.id,z.away_source,g.code)) and
    not exists(select 1 from jsonb_array_elements(event.before_matches) b join jsonb_array_elements(event.after_matches) a on b->>'id'=a->>'id' where a->>'id'=z.id::text and jsonb_build_array(a->'home_score',a->'away_score',a->'status',a->'outcome')<>jsonb_build_array(b->'home_score',b->'away_score',b->'status',b->'outcome'))) then raise exception 'DEPENDENT_RESULTS_EXIST';end if;
  end loop;
  -- Undo only untouched decisions from this withdrawal, in reverse bracket order.
  delete from public.tournament_withdrawals where tournament_id=t.id and team_name=p_target;
  for step in select a,b from jsonb_array_elements(event.after_matches) a join jsonb_array_elements(event.before_matches) b on a->>'id'=b->>'id'
   where jsonb_build_array(a->'home_score',a->'away_score',a->'status',a->'outcome',a->'outcome_reason')<>jsonb_build_array(b->'home_score',b->'away_score',b->'status',b->'outcome',b->'outcome_reason') order by (a->>'match_number')::integer desc loop
   select to_jsonb(z) into current_row from public.tournament_matches z where id::text=step.a->>'id' and tournament_id=t.id;
   if current_row is null or jsonb_build_array(current_row->'home_score',current_row->'away_score',current_row->'status',current_row->'outcome',current_row->'outcome_reason')<>jsonb_build_array(step.a->'home_score',step.a->'away_score',step.a->'status',step.a->'outcome',step.a->'outcome_reason') then raise exception 'WITHDRAWAL_CHANGED';end if;
   update public.tournament_matches set home_score=(step.b->>'home_score')::integer,away_score=(step.b->>'away_score')::integer,status=step.b->>'status',outcome=step.b->>'outcome',outcome_reason=step.b->>'outcome_reason',updated_at=now() where id::text=step.b->>'id' and tournament_id=t.id;
  end loop;
 elsif p_action in ('forfeit','restore') then
  select * into m from public.tournament_matches where tournament_id=t.id and id::text=p_target for update;
  if m.id is null then raise exception 'UNKNOWN_MATCH';end if;
  hs:=coalesce(m.home_team_name,private.resolve_ranked_source(t.id,m.home_source));aws:=coalesce(m.away_team_name,private.resolve_ranked_source(t.id,m.away_source));
  if hs is null or aws is null then raise exception 'UNRESOLVED_QUALIFIER';end if;
  if exists(select 1 from public.tournament_withdrawals w where w.tournament_id=t.id and w.team_name in (hs,aws)) then raise exception 'WITHDRAWN_TEAM';end if;
  if p_action='forfeit' then
   if p_winner is null or p_winner not in ('home','away') then raise exception 'INVALID_WINNER';end if;
   update public.tournament_matches set home_score=case when p_winner='home' then t.forfeit_score else 0 end,away_score=case when p_winner='away' then t.forfeit_score else 0 end,
    status='finished',outcome='forfeit',outcome_reason=trim(p_reason),updated_at=now() where id=m.id;
  else
   if m.outcome<>'forfeit' then raise exception 'NOT_A_FORFEIT';end if;
   select b into prior from public.tournament_incident_events e cross join lateral jsonb_array_elements(e.before_matches) b
   where e.tournament_id=t.id and e.action='forfeit' and e.target=m.id::text and b->>'id'=m.id::text and b->>'outcome'='played' order by e.created_at desc,e.id desc limit 1;
   if prior is null then raise exception 'CANNOT_RESTORE';end if;
   update public.tournament_matches set home_score=(prior->>'home_score')::integer,away_score=(prior->>'away_score')::integer,status=prior->>'status',outcome='played',outcome_reason=null,updated_at=now() where id=m.id;
  end if;
 else raise exception 'INVALID_ACTION';end if;
 perform private.settle_withdrawn_matches(t.id);
 perform set_config('tournio.incident_batch',coalesce(previous_batch,''),true);
 select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) into after_rows from public.tournament_matches x where tournament_id=t.id;
 insert into public.tournament_incident_events(tournament_id,action,target,reason,actor_id,before_matches,after_matches)
 values(t.id,p_action,p_target,trim(p_reason),auth.uid(),before_rows,after_rows);
 -- A withdrawal is a sporting decision even if all its scores were already present.
 insert into public.tournament_ranking_frozen(tournament_id) values(t.id) on conflict do nothing;
end $$;

-- Preview runs the very same database operation in a rolled-back subtransaction.
-- No scores, withdrawals, events or rule locks survive a preview.
create function public.preview_tournament_incident(p_slug text,p_action text,p_target text,p_winner text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.tournaments;version text;preview jsonb;before_rows jsonb;after_rows jsonb;
begin
 select * into t from public.tournaments where slug=p_slug for update;
 if auth.uid() is null or t.organizer_id is distinct from auth.uid() then raise exception 'NOT_ALLOWED';end if;
 version:=private.incident_version(t.id);
 select coalesce(jsonb_agg(to_jsonb(m) order by m.id),'[]'::jsonb) into before_rows from public.tournament_matches m where tournament_id=t.id;
 begin
  perform private.apply_tournament_incident(t.id,p_action,p_target,p_winner,p_reason);
  select coalesce(jsonb_agg(to_jsonb(m) order by m.id),'[]'::jsonb) into after_rows from public.tournament_matches m where tournament_id=t.id;
  preview:=jsonb_build_object('version',version,'action',p_action,'target',p_target,'winner',p_winner,'reason',trim(p_reason),
   'changes',(select coalesce(jsonb_agg(jsonb_build_object('number',a->'match_number','home',coalesce(a->>'home_team_name',private.resolve_ranked_source(t.id,a->>'home_source'),a->>'home_source'),'away',coalesce(a->>'away_team_name',private.resolve_ranked_source(t.id,a->>'away_source'),a->>'away_source'),'before_home',b->'home_score','before_away',b->'away_score','home_score',a->'home_score','away_score',a->'away_score','outcome',a->'outcome')),'[]'::jsonb)
    from jsonb_array_elements(after_rows) a join jsonb_array_elements(before_rows) b on a->>'id'=b->>'id' where (a-'updated_at') is distinct from (b-'updated_at')),
   'rankings',public.get_tournament_rankings(p_slug));
  raise exception using errcode='PT001',message='Preview rollback';
 exception when sqlstate 'PT001' then null;end;
 return preview;
end $$;
revoke all on function public.preview_tournament_incident(text,text,text,text,text) from public,anon;
grant execute on function public.preview_tournament_incident(text,text,text,text,text) to authenticated;

create function public.confirm_tournament_incident(p_slug text,p_version text,p_action text,p_target text,p_winner text,p_reason text,p_confirm boolean)
returns void language plpgsql security definer set search_path='' as $$
declare t public.tournaments;
begin
 select * into t from public.tournaments where slug=p_slug for update;
 if auth.uid() is null or t.organizer_id is distinct from auth.uid() then raise exception 'NOT_ALLOWED';end if;
 if p_confirm is distinct from true then raise exception 'CONFIRMATION_REQUIRED';end if;
 if p_version is distinct from private.incident_version(t.id) then raise exception 'INCIDENT_CHANGED';end if;
 perform private.apply_tournament_incident(t.id,p_action,p_target,p_winner,p_reason);
end $$;
revoke all on function public.confirm_tournament_incident(text,text,text,text,text,text,boolean) from public,anon;
grant execute on function public.confirm_tournament_incident(text,text,text,text,text,text,boolean) to authenticated;

-- Standard score entry cannot silently turn an exceptional result back into a played match.
create or replace function public.update_tournament_match_score(p_match_id uuid,p_home_score integer,p_away_score integer)
returns void language plpgsql security definer set search_path='' as $$
declare m public.tournament_matches;tid uuid;uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'Not authenticated';end if;
 if p_home_score is null or p_away_score is null or p_home_score not between 0 and 999 or p_away_score not between 0 and 999 then raise exception 'Invalid score';end if;
 select tournament_id into tid from public.tournament_matches where id=p_match_id;
 perform 1 from public.tournaments where id=tid for update;
 select * into m from public.tournament_matches where id=p_match_id for update;
 if m.id is null or not private.can_score_tournament(uid,m.tournament_id) then raise exception 'Not allowed';end if;
 if m.outcome<>'played' then raise exception 'SPECIAL_RESULT';end if;
 if m.phase='playoff' and p_home_score=p_away_score then raise exception 'Playoff matches need a winner';end if;
 update public.tournament_matches set home_score=p_home_score,away_score=p_away_score,status='finished',score_updated_by=uid,updated_at=now() where id=m.id;
 insert into public.tournament_score_events(tournament_id,match_id,actor_user_id,previous_home_score,previous_away_score,previous_status,new_home_score,new_away_score)
 values(m.tournament_id,m.id,uid,m.home_score,m.away_score,m.status,p_home_score,p_away_score);
end $$;

-- Void playoff matches are complete but have no winner; absence propagates as a bye.
create or replace function private.set_tournament_result_lock(p_slug text, p_locked boolean, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  tid uuid;
  was_locked boolean;
begin
  if uid is null or p_locked is null then raise exception 'NOT_ALLOWED'; end if;
  -- Parent row serializes finalization, score writes and plan regeneration.
  select id into tid from public.tournaments where slug = p_slug and organizer_id = uid for update;
  if tid is null then raise exception 'NOT_ALLOWED'; end if;
  select locked_at is not null into was_locked from public.tournament_result_locks where tournament_id = tid;
  if coalesce(was_locked,false) = p_locked then raise exception 'LOCK_STATE_CHANGED'; end if;
  if p_locked then
    if not exists (select 1 from public.tournament_matches where tournament_id = tid)
      or exists (select 1 from public.tournament_matches where tournament_id = tid and
        (status <> 'finished' or home_score is null or away_score is null or (phase = 'playoff' and outcome <> 'void' and home_score = away_score))) then
      raise exception 'UNFINISHED_MATCHES';
    end if;
  elsif p_reason is null or char_length(trim(p_reason)) not between 5 and 1000 then
    raise exception 'REASON_REQUIRED';
  end if;
  insert into public.tournament_result_locks(tournament_id,locked_at,updated_at)
  values (tid,case when p_locked then now() else null end,now())
  on conflict (tournament_id) do update set locked_at = excluded.locked_at, updated_at = excluded.updated_at;
  insert into public.tournament_result_lock_events(tournament_id,actor_user_id,action,reason)
  values (tid,uid,case when p_locked then 'locked' else 'unlocked' end,case when not p_locked then trim(p_reason) else null end);
end; $$;
do $$ declare f record;begin for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in ('guard_incident_rules','incident_source_ready','incident_match_dependency','settle_withdrawn_matches','settle_withdrawn_after_score','incident_version','apply_tournament_incident') loop execute 'revoke all on function '||f.signature||' from public,anon,authenticated';end loop;end $$;

-- An incident is attached to the original roster and schedule. Regeneration must not erase it.
create function private.guard_incident_roster()
returns trigger language plpgsql security definer set search_path='' as $$
declare tid uuid;
begin
 if tg_op='UPDATE' then
  if tg_table_name='tournament_matches' and
   (to_jsonb(new)-array['home_score','away_score','status','outcome','outcome_reason','updated_at','score_updated_by','live_stream_url','live_stream_status','live_stream_updated_at','live_stream_updated_by','tennis_sets']) =
   (to_jsonb(old)-array['home_score','away_score','status','outcome','outcome_reason','updated_at','score_updated_by','live_stream_url','live_stream_status','live_stream_updated_at','live_stream_updated_by','tennis_sets']) then return new;end if;
  if to_jsonb(new)=to_jsonb(old) then return new;end if;
 end if;
 if tg_op='INSERT' then tid:=new.tournament_id;else tid:=old.tournament_id;end if;
 if exists(select 1 from public.tournament_withdrawals where tournament_id=tid) then raise exception 'WITHDRAWAL_ROSTER_LOCKED';end if;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
revoke all on function private.guard_incident_roster() from public,anon,authenticated;
create trigger incident_match_roster before insert or update or delete on public.tournament_matches for each row execute function private.guard_incident_roster();
create trigger incident_group_roster before insert or update or delete on public.tournament_groups for each row execute function private.guard_incident_roster();
create trigger incident_team_roster before insert or update or delete on public.tournament_group_teams for each row execute function private.guard_incident_roster();
