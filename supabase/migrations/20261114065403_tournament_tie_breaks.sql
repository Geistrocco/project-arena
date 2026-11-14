-- Historical tournaments keep their exact original order, including the last name comparison.
alter table public.tournaments add column ranking_rule text not null default 'legacy' check(ranking_rule in ('legacy','overall','head_to_head'));
create table public.tournament_ranking_frozen(tournament_id uuid primary key references public.tournaments(id) on delete cascade);
alter table public.tournament_ranking_frozen enable row level security;
revoke all on public.tournament_ranking_frozen from public,anon,authenticated;
insert into public.tournament_ranking_frozen(tournament_id)
select distinct tournament_id from public.tournament_matches where status='finished'
union select distinct tournament_id from public.tournament_score_events;
create table public.tournament_tie_decisions(
 id uuid primary key default gen_random_uuid(),tournament_id uuid not null references public.tournaments(id) on delete cascade,
 group_id uuid not null references public.tournament_groups(id) on delete cascade,
 version text not null,ordered_names text[] not null,reason text not null check(char_length(trim(reason)) between 5 and 1000),
 actor_id uuid references auth.users(id) on delete set null,created_at timestamptz not null default clock_timestamp()
);
alter table public.tournament_tie_decisions enable row level security;
revoke all on public.tournament_tie_decisions from public,anon,authenticated;
create index tournament_tie_group_version_idx on public.tournament_tie_decisions(group_id,version,created_at desc);
create index tournament_tie_tournament_idx on public.tournament_tie_decisions(tournament_id);
create index tournament_tie_actor_idx on public.tournament_tie_decisions(actor_id);

create function private.group_ranking_version(p_group uuid)
returns text language sql stable set search_path='' as $$
 select md5(jsonb_build_array(g.id,t.ranking_rule,
 (select jsonb_agg(jsonb_build_array(s.id,s.team_name,s.slot_number) order by s.id) from public.tournament_group_teams s where s.group_id=g.id),
 (select jsonb_agg(jsonb_build_array(m.id,m.home_team_name,m.away_team_name,m.home_score,m.away_score,m.status,m.phase) order by m.id) from public.tournament_matches m where m.group_id=g.id and m.phase in ('group','final_group')))::text)
 from public.tournament_groups g join public.tournaments t on t.id=g.tournament_id where g.id=p_group;
$$;

create function private.group_ranking(p_group uuid)
returns table(name text,played bigint,wins bigint,draws bigint,losses bigint,scored bigint,conceded bigint,difference bigint,points bigint,sport_rank bigint,"position" bigint,rank bigint,unresolved boolean)
language sql stable set search_path='' as $$
 with games as (
 select m.* from public.tournament_matches m where m.group_id=p_group and m.phase in ('group','final_group') and m.status='finished' and m.home_score is not null and m.away_score is not null
 ), appearances as (
 select home_team_name as name,away_team_name as opponent,home_score::bigint as gf,away_score::bigint as ga from games
 union all select away_team_name,home_team_name,away_score::bigint,home_score::bigint from games
 ), totals as (
 select s.team_name as name,s.slot_number,t.ranking_rule,count(a.name) as played,
 count(*) filter(where a.gf>a.ga) as wins,count(*) filter(where a.gf=a.ga) as draws,count(*) filter(where a.gf<a.ga) as losses,
 coalesce(sum(a.gf),0)::bigint as scored,coalesce(sum(a.ga),0)::bigint as conceded,
 coalesce(sum(case when a.gf>a.ga then 3 when a.gf=a.ga then 1 else 0 end),0)::bigint as points
 from public.tournament_group_teams s join public.tournament_groups g on g.id=s.group_id join public.tournaments t on t.id=g.tournament_id
 left join appearances a on a.name=s.team_name and exists(select 1 from public.tournament_group_teams x where x.group_id=p_group and x.team_name=a.opponent)
 where s.group_id=p_group group by s.team_name,s.slot_number,t.ranking_rule
 ), metrics as (
 select r.*,r.scored-r.conceded as difference,
 coalesce(sum(case when a.gf>a.ga then 3 when a.gf=a.ga then 1 else 0 end) filter(where o.name is not null),0)::bigint as mp,
 coalesce(sum(a.gf-a.ga) filter(where o.name is not null),0)::bigint as md,
 coalesce(sum(a.gf) filter(where o.name is not null),0)::bigint as mg
 from totals r left join appearances a on a.name=r.name left join totals o on o.name=a.opponent and o.points=r.points
 group by r.name,r.slot_number,r.ranking_rule,r.played,r.wins,r.draws,r.losses,r.scored,r.conceded,r.points
 ), ranked as (
 select m.*,rank() over(order by points desc,
 case when ranking_rule='head_to_head' then mp else difference end desc,
 case when ranking_rule='head_to_head' then md else scored end desc,
 case when ranking_rule='head_to_head' then mg when ranking_rule='overall' then mp else 0 end desc,
 case when ranking_rule='head_to_head' then difference when ranking_rule='overall' then md else 0 end desc,
 case when ranking_rule='head_to_head' then scored when ranking_rule='overall' then mg else 0 end desc,
 case when ranking_rule='legacy' then name else null end) as sr
 from metrics m
 ), decision as (
 select d.ordered_names from public.tournament_tie_decisions d where d.group_id=p_group and d.version=private.group_ranking_version(p_group) order by d.created_at desc,d.id desc limit 1
 ), ordered as (
 select r.*,count(*) over(partition by sr)>1 and not exists(select 1 from decision) as tied,
 row_number() over(order by sr,coalesce(array_position((select ordered_names from decision),r.name),r.slot_number)) as pos from ranked r
 )
 select name,played,wins,draws,losses,scored,conceded,difference,points,sr,pos,case when tied then sr else pos end,tied from ordered order by ordered.pos;
$$;

create function private.group_results_complete(p_group uuid)
returns boolean language sql stable set search_path='' as $$
 select (select count(*) from public.tournament_group_teams where group_id=p_group)>=2
 and exists(select 1 from public.tournament_matches where group_id=p_group and phase in ('group','final_group'))
 and not exists(select 1 from public.tournament_matches m where m.group_id=p_group and m.phase in ('group','final_group') and (m.status<>'finished' or m.home_score is null or m.away_score is null))
 and not exists(select 1 from public.tournament_group_teams a join public.tournament_group_teams b on b.group_id=a.group_id and b.id>a.id where a.group_id=p_group and not exists(
 select 1 from public.tournament_matches m where m.group_id=p_group and m.phase in ('group','final_group') and ((m.home_team_name=a.team_name and m.away_team_name=b.team_name) or (m.home_team_name=b.team_name and m.away_team_name=a.team_name))));
$$;

create function private.source_depends_on_group(p_tid uuid,p_source text,p_code text,p_depth integer default 0)
returns boolean language plpgsql stable set search_path='' as $$
declare parts text[]; m public.tournament_matches;
begin
 if p_source is null or p_depth>64 then return false; end if;
 parts:=regexp_match(p_source,'^(\d+)\. miesto skupiny ([A-Z0-9]+)$');
 if parts is not null then return parts[2]=p_code; end if;
 parts:=regexp_match(p_source,'^(Víťaz|Porazený) zápasu (\d+)$');
 if parts is null then return false; end if;
 select * into m from public.tournament_matches where tournament_id=p_tid and match_number=parts[2]::integer;
 return coalesce(private.source_depends_on_group(p_tid,m.home_source,p_code,p_depth+1) or private.source_depends_on_group(p_tid,m.away_source,p_code,p_depth+1),false);
end $$;

create function private.resolve_ranked_source(p_tid uuid,p_source text,p_depth integer default 0)
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
 if m.id is null or m.status<>'finished' or m.home_score is null or m.away_score is null or m.home_score=m.away_score then return null; end if;
 home:=coalesce(m.home_team_name,private.resolve_ranked_source(p_tid,m.home_source,p_depth+1));away:=coalesce(m.away_team_name,private.resolve_ranked_source(p_tid,m.away_source,p_depth+1));
 if home is null or away is null then return null; end if;
 return case when (parts[1]='Víťaz')=(m.home_score>m.away_score) then home else away end;
end $$;

create function public.get_tournament_rankings(p_slug text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.tournaments; result jsonb;
begin
 select * into t from public.tournaments where slug=p_slug;
 if t.id is null or not coalesce((t.publication_status='published' and t.tournament_type in ('public','combined') and t.team_visibility='all') or private.can_score_tournament(auth.uid(),t.id),false) then return null;end if;
 select coalesce(jsonb_object_agg(g.id::text,jsonb_build_object('rows',(select coalesce(jsonb_agg(to_jsonb(r) order by r.position),'[]'::jsonb) from private.group_ranking(g.id) r),
 'version',private.group_ranking_version(g.id),'reason',(select d.reason from public.tournament_tie_decisions d where d.group_id=g.id and d.version=private.group_ranking_version(g.id) order by d.created_at desc,d.id desc limit 1))),'{}'::jsonb)
 into result from public.tournament_groups g where g.tournament_id=t.id;
 return result;
end $$;
revoke all on function public.get_tournament_rankings(text) from public,anon;
grant execute on function public.get_tournament_rankings(text) to anon,authenticated;

create function public.decide_tournament_tie(p_group uuid,p_version text,p_names text[],p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare t public.tournaments; g public.tournament_groups; expected text[];
begin
 if auth.uid() is null then raise exception 'Not authenticated';end if;
 select * into g from public.tournament_groups where id=p_group;
 select * into t from public.tournaments where id=g.tournament_id for update;
 if t.id is null or t.organizer_id<>auth.uid() then raise exception 'Not authorized';end if;
 if exists(select 1 from public.tournament_result_locks where tournament_id=t.id and locked_at is not null) then raise exception 'RESULTS_LOCKED';end if;
 if p_version is distinct from private.group_ranking_version(g.id) then raise exception 'RANKING_CHANGED';end if;
 if t.ranking_rule='legacy' or not private.group_results_complete(g.id) then raise exception 'GROUP_NOT_COMPLETE';end if;
 if p_reason is null or char_length(trim(p_reason)) not between 5 and 1000 then raise exception 'REASON_REQUIRED';end if;
 if exists(select 1 from public.tournament_matches m where m.tournament_id=t.id and m.status='finished' and (private.source_depends_on_group(t.id,m.home_source,g.code) or private.source_depends_on_group(t.id,m.away_source,g.code))) then raise exception 'DEPENDENT_RESULTS_EXIST';end if;
 select array_agg(r.name order by r.name) into expected from private.group_ranking(g.id) r;
 if p_names is null or (select array_agg(n order by n) from unnest(p_names) n) is distinct from expected then raise exception 'INVALID_TIE_ORDER';end if;
 if not exists(select 1 from private.group_ranking(g.id) r group by r.sport_rank having count(*)>1) then raise exception 'NO_TIE';end if;
 if exists(select 1 from (select r.sport_rank,lag(r.sport_rank) over(order by n.ord) as previous from unnest(p_names) with ordinality n(name,ord) join private.group_ranking(g.id) r on r.name=n.name) ordered where previous>sport_rank) then raise exception 'INVALID_TIE_ORDER';end if;
 insert into public.tournament_tie_decisions(tournament_id,group_id,version,ordered_names,reason,actor_id) values(t.id,g.id,p_version,p_names,trim(p_reason),auth.uid());
end $$;
revoke all on function public.decide_tournament_tie(uuid,text,text[],text) from public,anon;
grant execute on function public.decide_tournament_tie(uuid,text,text[],text) to authenticated;

create function private.guard_ranking_rule()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.ranking_rule is distinct from old.ranking_rule and (exists(select 1 from public.tournament_ranking_frozen where tournament_id=old.id) or exists(select 1 from public.tournament_matches where tournament_id=old.id and (status='finished' or home_score is not null or away_score is not null))) then raise exception 'RANKING_RULE_FROZEN';end if;
 return new;
end $$;
create trigger ranking_rule_guard before update of ranking_rule on public.tournaments for each row execute function private.guard_ranking_rule();

create function private.guard_ranked_score()
returns trigger language plpgsql security definer set search_path='' as $$
declare t public.tournaments; code text;
begin
 select * into t from public.tournaments where id=new.tournament_id for share;
 if new.status='finished' then
 insert into public.tournament_ranking_frozen(tournament_id) values(t.id) on conflict do nothing;
 if t.ranking_rule<>'legacy' and ((new.home_source is not null and private.resolve_ranked_source(t.id,new.home_source) is null) or (new.away_source is not null and private.resolve_ranked_source(t.id,new.away_source) is null)) then raise exception 'UNRESOLVED_QUALIFIER';end if;
 end if;
 if tg_op='UPDATE' and t.ranking_rule<>'legacy' and (new.home_score is distinct from old.home_score or new.away_score is distinct from old.away_score or new.status is distinct from old.status) and old.group_id is not null then
 select g.code into code from public.tournament_groups g where g.id=old.group_id;
 if exists(select 1 from public.tournament_matches m where m.tournament_id=t.id and m.id<>new.id and m.status='finished' and (private.source_depends_on_group(t.id,m.home_source,code) or private.source_depends_on_group(t.id,m.away_source,code))) then raise exception 'DEPENDENT_RESULTS_EXIST';end if;
 end if;
 return new;
end $$;
create trigger ranked_score_guard before insert or update of home_score,away_score,status on public.tournament_matches for each row execute function private.guard_ranked_score();

create function private.guard_unresolved_finalization()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.locked_at is not null and exists(select 1 from public.tournaments t join public.tournament_groups g on g.tournament_id=t.id cross join lateral private.group_ranking(g.id) r where t.id=new.tournament_id and t.ranking_rule<>'legacy' and r.unresolved) then raise exception 'UNRESOLVED_TIE';end if;
 return new;
end $$;
create trigger unresolved_finalization_guard before insert or update on public.tournament_result_locks for each row execute function private.guard_unresolved_finalization();

-- Private helpers are called only by the explicitly checked RPCs/triggers.
do $$ declare f record;begin for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in ('group_ranking_version','group_ranking','group_results_complete','source_depends_on_group','resolve_ranked_source','guard_ranking_rule','guard_ranked_score','guard_unresolved_finalization') loop execute 'revoke all on function '||f.signature||' from public,anon,authenticated';end loop;end $$;

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
  created_slug := public.create_tournament_with_plan(
    p_name, p_sport, p_category, p_event_date, p_place, p_capacity,
    p_playing_fields, p_match_duration, p_fee, p_tournament_type,
    p_team_visibility, p_club_ids, p_custom_teams, p_start_time,
    p_turnover_minutes, p_schedule_slot_minutes, p_has_lunch_break,
    p_lunch_break_start, p_lunch_break_duration, p_game_system,
    p_qualifiers_per_group, p_third_place_match, p_plan
  );
  update public.tournaments
  set country = p_country, region = p_region, surface = p_surface,ranking_rule=coalesce(p_plan->>'ranking_rule','head_to_head')
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
  update public.tournaments set ranking_rule=coalesce(p_plan->>'ranking_rule',ranking_rule) where slug=p_slug and organizer_id=uid;
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
