-- Bootstrap the unmerged PR46 schema on fresh databases; production already has these columns.
alter table public.tournament_matches add column if not exists tennis_sets jsonb;
alter table public.tournament_score_events add column if not exists previous_tennis_sets jsonb, add column if not exists new_tennis_sets jsonb;
create or replace function private.tennis_set_totals(p_sets jsonb,p_scoring text)
returns table(home integer,away integer) language plpgsql immutable security invoker set search_path='' as $$
declare s jsonb; i integer := 0; h integer; a integer; hi integer; lo integer; target integer; max_games integer;
begin
  if p_scoring not in ('set6','short4','match_tiebreak') or p_scoring is null or jsonb_typeof(p_sets) is distinct from 'array' then raise exception 'INVALID_TENNIS_SCORE'; end if;
  target := case when p_scoring='match_tiebreak' then 2 else 1 end;
  if jsonb_array_length(p_sets) < 1 or jsonb_array_length(p_sets) > (case when target=2 then 3 else 1 end) then raise exception 'INVALID_TENNIS_SCORE'; end if;
  home:=0; away:=0;
  for s in select value from jsonb_array_elements(p_sets) loop
    if home=target or away=target or not coalesce((s->>'home') ~ '^[0-9]{1,2}$',false) or not coalesce((s->>'away') ~ '^[0-9]{1,2}$',false) then raise exception 'INVALID_TENNIS_SCORE'; end if;
    h:=(s->>'home')::integer; a:=(s->>'away')::integer; hi:=greatest(h,a); lo:=least(h,a);
    max_games:=case when p_scoring='short4' then 4 else 6 end;
    if i=2 then
      if not ((hi=10 and lo<=8) or (hi>10 and hi-lo=2)) then raise exception 'INVALID_TENNIS_SCORE'; end if;
    elsif not ((hi=max_games and lo<=max_games-2) or (hi=max_games+1 and lo in (max_games-1,max_games))) then raise exception 'INVALID_TENNIS_SCORE';
    end if;
    if h>a then home:=home+1; else away:=away+1; end if; i:=i+1;
  end loop;
  if greatest(home,away)<>target then raise exception 'INVALID_TENNIS_SCORE'; end if;
  return next;
end; $$;
revoke all on function private.tennis_set_totals(jsonb,text) from public,anon,authenticated;
create or replace function private.guard_tournament_result_lock()
returns trigger language plpgsql security definer set search_path = '' as $$
declare tid uuid; locked boolean;
begin
  -- Streams may be updated after a tournament; scores and identity may not.
  if tg_table_name = 'tournament_matches' and tg_op = 'UPDATE' then
    if (to_jsonb(new) - array['live_stream_url','live_stream_status','live_stream_updated_at','live_stream_updated_by','updated_at'])
      = (to_jsonb(old) - array['live_stream_url','live_stream_status','live_stream_updated_at','live_stream_updated_by','updated_at']) then return new; end if;
  end if;
  if tg_table_name = 'tournaments' then
    tid := old.id;
  else
    if tg_op <> 'INSERT' then tid := old.tournament_id; else tid := new.tournament_id; end if;
    -- Every write participates in the same parent lock as finalization.
    perform 1 from public.tournaments where id = tid for share;
  end if;
  select locked_at is not null into locked from public.tournament_result_locks where tournament_id = tid;
  if coalesce(locked,false) then raise exception 'RESULTS_LOCKED'; end if;
  if tg_op = 'UPDATE' and tg_table_name <> 'tournaments' and (to_jsonb(new)->>'tournament_id') is distinct from (to_jsonb(old)->>'tournament_id') then
    perform 1 from public.tournaments where id = (to_jsonb(new)->>'tournament_id')::uuid for share;
    if exists (select 1 from public.tournament_result_locks where tournament_id = (to_jsonb(new)->>'tournament_id')::uuid and locked_at is not null) then raise exception 'RESULTS_LOCKED'; end if;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end; $$;

revoke all on function private.guard_tournament_result_lock() from public,anon,authenticated;
-- Tennis outcome and observed set score are separate; W.O. never invents 6:0 sets.
alter table public.tournament_matches
 add column tennis_result text not null default 'played' check(tennis_result in ('played','wo','retired')),
 add column tennis_winner text check(tennis_winner in ('home','away'));
create or replace function private.ball_group_ranking(p_group uuid)
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
create function private.tennis_progress(p_sets jsonb,p_scoring text)
returns table(home integer,away integer,complete boolean) language plpgsql immutable set search_path='' as $$
declare s jsonb;i integer:=0;h integer;a integer;hi integer;lo integer;mx integer;target integer;finished boolean;
begin
 if p_scoring is null or p_scoring not in ('set6','short4','match_tiebreak') or jsonb_typeof(p_sets) is distinct from 'array' then raise exception 'INVALID_TENNIS_SCORE';end if;
 target:=case when p_scoring='match_tiebreak' then 2 else 1 end;home:=0;away:=0;
 if jsonb_array_length(p_sets)>(case when target=2 then 3 else 1 end) then raise exception 'INVALID_TENNIS_SCORE';end if;
 for s in select value from jsonb_array_elements(p_sets) loop
  if home=target or away=target or not coalesce((s->>'home')~'^[0-9]{1,2}$',false) or not coalesce((s->>'away')~'^[0-9]{1,2}$',false) then raise exception 'INVALID_TENNIS_SCORE';end if;
  h:=(s->>'home')::integer;a:=(s->>'away')::integer;hi:=greatest(h,a);lo:=least(h,a);mx:=case when p_scoring='short4' then 4 else 6 end;
  if i=2 then finished:=(hi=10 and lo<=8) or (hi>10 and hi-lo=2);
   if not finished and not (hi<10 or hi-lo<=1) then raise exception 'INVALID_TENNIS_SCORE';end if;
  else finished:=(hi=mx and lo<=mx-2) or (hi=mx+1 and lo in (mx-1,mx));
   if not finished and hi>mx then raise exception 'INVALID_TENNIS_SCORE';end if;
  end if;
  if not finished and i<>jsonb_array_length(p_sets)-1 then raise exception 'INVALID_TENNIS_SCORE';end if;
  if finished then if h>a then home:=home+1;else away:=away+1;end if;end if;i:=i+1;
 end loop;
 complete:=greatest(home,away)=target;return next;
end $$;

create function private.tennis_group_ranking(p_group uuid)
returns table(name text,played bigint,wins bigint,draws bigint,losses bigint,scored bigint,conceded bigint,difference bigint,points bigint,sport_rank bigint,"position" bigint,rank bigint,unresolved boolean)
language sql stable set search_path='' as $$
 with games as (
 select m.*,coalesce(m.tennis_winner='home',m.home_score>m.away_score) as hw,
 coalesce((select sum((s->>'home')::bigint) from jsonb_array_elements(coalesce(m.tennis_sets,'[]'::jsonb)) with ordinality x(s,i) where i<>3),0)::bigint as hg,
 coalesce((select sum((s->>'away')::bigint) from jsonb_array_elements(coalesce(m.tennis_sets,'[]'::jsonb)) with ordinality x(s,i) where i<>3),0)::bigint as ag
 from public.tournament_matches m where m.group_id=p_group and m.phase in ('group','final_group') and m.status='finished' and m.outcome<>'void'
 ), appearances as (
 select home_team_name as name,away_team_name as opponent,hw as won,home_score::bigint as sw,away_score::bigint as sl,hg as gw,ag as gl from games
 union all select away_team_name,home_team_name,not hw,away_score::bigint,home_score::bigint,ag,hg from games
 ), totals as (
 select s.team_name as name,s.slot_number,count(a.name) as played,count(*) filter(where a.won) as wins,count(*) filter(where not a.won) as losses,
 coalesce(sum(a.sw),0)::bigint as scored,coalesce(sum(a.sl),0)::bigint as conceded,coalesce(sum(a.gw),0)::numeric as gw,coalesce(sum(a.gl),0)::numeric as gl
 from public.tournament_group_teams s left join appearances a on a.name=s.team_name where s.group_id=p_group group by s.team_name,s.slot_number
 ), metrics as (
 select r.*,case when (select count(*) from totals o where o.wins=r.wins)=2 then (select count(*) from appearances a join totals o on o.name=a.opponent and o.wins=r.wins where a.name=r.name and a.won) else 0 end as head from totals r
 ), ranked as (
 select r.*,rank() over(order by wins desc,head desc,scored::numeric/greatest(1,scored+conceded) desc,gw/greatest(1,gw+gl) desc) as sr from metrics r
 ), decision as (
 select ordered_names from public.tournament_tie_decisions d where group_id=p_group and version=private.group_ranking_version(p_group) order by created_at desc,id desc limit 1
 ), ordered as (
 select r.*,count(*) over(partition by sr)>1 and not exists(select 1 from decision) as tied,row_number() over(order by sr,coalesce(array_position((select ordered_names from decision),r.name),r.slot_number)) as pos from ranked r
 ) select name,played,wins,0::bigint,losses,scored,conceded,scored-conceded,wins,sr,pos,case when tied then sr else pos end,tied from ordered order by ordered.pos;
$$;
create or replace function private.group_ranking(p_group uuid)
returns table(name text,played bigint,wins bigint,draws bigint,losses bigint,scored bigint,conceded bigint,difference bigint,points bigint,sport_rank bigint,"position" bigint,rank bigint,unresolved boolean)
language sql stable set search_path='' as $$
 select r.* from private.tennis_group_ranking(p_group) r where exists(select 1 from public.tournament_groups g join public.tournaments t on t.id=g.tournament_id where g.id=p_group and t.sport='Tenis')
 union all select r.* from private.ball_group_ranking(p_group) r where exists(select 1 from public.tournament_groups g join public.tournaments t on t.id=g.tournament_id where g.id=p_group and t.sport<>'Tenis');
$$;
create or replace function private.ball_group_ranking_version(p_group uuid)
returns text language sql stable set search_path='' as $$
 select md5(jsonb_build_array(g.id,t.ranking_rule,(select jsonb_agg(w.team_name order by w.team_name) from public.tournament_withdrawals w where w.tournament_id=t.id),
 (select jsonb_agg(jsonb_build_array(s.id,s.team_name,s.slot_number) order by s.id) from public.tournament_group_teams s where s.group_id=g.id),
 (select jsonb_agg(jsonb_build_array(m.id,m.home_team_name,m.away_team_name,m.home_score,m.away_score,m.status,m.phase,m.outcome) order by m.id) from public.tournament_matches m where m.group_id=g.id and m.phase in ('group','final_group')))::text)
 from public.tournament_groups g join public.tournaments t on t.id=g.tournament_id where g.id=p_group;
$$;
create or replace function private.group_ranking_version(p_group uuid)
returns text language sql stable set search_path='' as $$
 select case when t.sport='Tenis' then md5(jsonb_build_array(g.id,t.ranking_rule,t.format_settings,(select jsonb_agg(w.team_name order by w.team_name) from public.tournament_withdrawals w where w.tournament_id=t.id),
 (select jsonb_agg(jsonb_build_array(s.id,s.team_name,s.slot_number) order by s.id) from public.tournament_group_teams s where s.group_id=g.id),
 (select jsonb_agg(jsonb_build_array(m.id,m.home_team_name,m.away_team_name,m.home_score,m.away_score,m.status,m.phase,m.outcome,m.tennis_sets,m.tennis_result,m.tennis_winner) order by m.id) from public.tournament_matches m where m.group_id=g.id and m.phase in ('group','final_group')))::text) else private.ball_group_ranking_version(p_group) end
 from public.tournament_groups g join public.tournaments t on t.id=g.tournament_id where g.id=p_group;
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
 if m.id is null or m.outcome='void' or m.status<>'finished' or m.home_score is null or m.away_score is null or (m.home_score=m.away_score and m.tennis_winner is null) then return null; end if;
 home:=coalesce(m.home_team_name,private.resolve_ranked_source(p_tid,m.home_source,p_depth+1));away:=coalesce(m.away_team_name,private.resolve_ranked_source(p_tid,m.away_source,p_depth+1));
 if m.outcome='played' and (home is null or away is null) then return null; end if;
 return case when (parts[1]='Víťaz')=coalesce(m.tennis_winner='home',m.home_score>m.away_score) then home else away end;
end $$;
create or replace function private.incident_source_ready(p_tid uuid,p_source text)
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
 return coalesce(m.status='finished' and (m.outcome='void' or m.home_score<>m.away_score or m.tennis_winner is not null),false);
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
 if tg_op='UPDATE' and (new.home_score,new.away_score,new.status,new.outcome,new.tennis_sets,new.tennis_result,new.tennis_winner) is distinct from (old.home_score,old.away_score,old.status,old.outcome,old.tennis_sets,old.tennis_result,old.tennis_winner) then
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
drop trigger ranked_score_guard on public.tournament_matches;
create trigger ranked_score_guard before insert or update of home_score,away_score,status,outcome,tennis_sets,tennis_result,tennis_winner on public.tournament_matches for each row execute function private.guard_ranked_score();
create function private.guard_tennis_rules()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.sport='Tenis' and old.sport<>'Tenis' and exists(select 1 from public.tournament_applications where tournament_id=old.id and status in ('pending','accepted')) then raise exception 'TENNIS_APPLICATIONS_EXIST';end if;
 if (old.sport='Tenis' or new.sport='Tenis') and (old.sport,old.format_settings->'tennis') is distinct from (new.sport,new.format_settings->'tennis') and exists(select 1 from public.tournament_ranking_frozen where tournament_id=old.id) then raise exception 'TENNIS_RULES_FROZEN';end if;
 return new;
end $$;
create trigger tennis_rules_guard before update on public.tournaments for each row execute function private.guard_tennis_rules();

create or replace function private.guard_tennis_match_score()
returns trigger language plpgsql security definer set search_path='' as $$
declare sport_name text;scoring text;totals record;
begin
 select sport,coalesce(format_settings->'tennis'->>'scoring','set6') into sport_name,scoring from public.tournaments where id=new.tournament_id;
 if sport_name<>'Tenis' then
  if new.tennis_result<>'played' or new.tennis_winner is not null or new.tennis_sets is not null then raise exception 'NOT_TENNIS';end if;return new;
 end if;
 if new.status<>'finished' then
  if new.tennis_result<>'played' or new.tennis_winner is not null or new.tennis_sets is not null then raise exception 'INVALID_TENNIS_SCORE';end if;return new;
 end if;
 if new.tennis_result='played' then
  if new.tennis_winner is not null then raise exception 'INVALID_TENNIS_SCORE';end if;
  select * into totals from private.tennis_set_totals(new.tennis_sets,scoring);
 else
  if new.tennis_winner is null or new.outcome_reason is null or char_length(trim(new.outcome_reason)) not between 5 and 1000 then raise exception 'REASON_REQUIRED';end if;
  select * into totals from private.tennis_progress(new.tennis_sets,scoring);
  if new.tennis_result='wo' and jsonb_array_length(new.tennis_sets)<>0 then raise exception 'WO_HAS_SCORE';end if;
  if new.tennis_result='retired' and (jsonb_array_length(new.tennis_sets)=0 or totals.complete) then raise exception 'INVALID_RETIREMENT';end if;
 end if;
 if new.home_score is distinct from totals.home or new.away_score is distinct from totals.away then raise exception 'INVALID_TENNIS_SCORE';end if;
 return new;
end $$;

create function private.apply_tennis_result(p_tid uuid,p_match uuid,p_kind text,p_winner text,p_sets jsonb,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare t public.tournaments;m public.tournament_matches;scoring text;totals record;before_rows jsonb;after_rows jsonb;prior jsonb;saved jsonb;updated public.tournament_matches;
begin
 select * into t from public.tournaments where id=p_tid for update;
 if auth.uid() is null or t.organizer_id is distinct from auth.uid() then raise exception 'NOT_ALLOWED';end if;
 if t.sport<>'Tenis' then raise exception 'NOT_TENNIS';end if;
 if exists(select 1 from public.tournament_result_locks where tournament_id=t.id and locked_at is not null) then raise exception 'RESULTS_LOCKED';end if;
 if p_kind is null or p_kind not in ('wo','retired','played','restore') or p_reason is null or char_length(trim(p_reason)) not between 5 and 1000 then raise exception 'REASON_REQUIRED';end if;
 if p_kind in ('wo','retired') and (p_winner is null or p_winner not in ('home','away')) then raise exception 'INVALID_WINNER';end if;
 select * into m from public.tournament_matches where id=p_match and tournament_id=t.id for update;
 if m.id is null then raise exception 'UNKNOWN_MATCH';end if;
 if coalesce(m.home_team_name,private.resolve_ranked_source(t.id,m.home_source)) is null or coalesce(m.away_team_name,private.resolve_ranked_source(t.id,m.away_source)) is null then raise exception 'UNRESOLVED_QUALIFIER';end if;
 if p_kind='restore' then
  select b,a into prior,saved from public.tournament_incident_events e cross join lateral jsonb_array_elements(e.before_matches) b join lateral jsonb_array_elements(e.after_matches) a on a->>'id'=b->>'id' where e.tournament_id=t.id and e.target=m.id::text and e.action like 'tennis_%' and b->>'id'=m.id::text order by e.created_at desc,e.id desc limit 1;
  if prior is null or jsonb_build_array(to_jsonb(m)->'home_score',to_jsonb(m)->'away_score',to_jsonb(m)->'tennis_sets',to_jsonb(m)->'tennis_result',to_jsonb(m)->'tennis_winner',to_jsonb(m)->'status') is distinct from jsonb_build_array(saved->'home_score',saved->'away_score',saved->'tennis_sets',saved->'tennis_result',saved->'tennis_winner',saved->'status') then raise exception 'TENNIS_RESULT_CHANGED';end if;
 end if;
 scoring:=coalesce(t.format_settings->'tennis'->>'scoring','set6');
 if p_kind='restore' then null;elsif p_kind='played' then select * into totals from private.tennis_set_totals(p_sets,scoring);
 else select * into totals from private.tennis_progress(p_sets,scoring);end if;
 select jsonb_agg(to_jsonb(x) order by x.id) into before_rows from public.tournament_matches x where tournament_id=t.id;
 if p_kind='restore' then
 update public.tournament_matches set tennis_sets=nullif(prior->'tennis_sets','null'::jsonb),tennis_result=prior->>'tennis_result',tennis_winner=prior->>'tennis_winner',home_score=(prior->>'home_score')::integer,away_score=(prior->>'away_score')::integer,status=prior->>'status',outcome='played',outcome_reason=trim(p_reason),score_updated_by=auth.uid(),updated_at=now() where id=m.id;
 else
 update public.tournament_matches set tennis_sets=p_sets,tennis_result=p_kind,tennis_winner=case when p_kind='played' then null else p_winner end,
  home_score=totals.home,away_score=totals.away,status='finished',outcome='played',outcome_reason=trim(p_reason),score_updated_by=auth.uid(),updated_at=now() where id=m.id;
 end if;
 select * into updated from public.tournament_matches where id=m.id;
 select jsonb_agg(to_jsonb(x) order by x.id) into after_rows from public.tournament_matches x where tournament_id=t.id;
 insert into public.tournament_incident_events(tournament_id,action,target,reason,actor_id,before_matches,after_matches)
 values(t.id,'tennis_'||p_kind,m.id::text,trim(p_reason),auth.uid(),before_rows,after_rows);
 if updated.status='finished' then
 insert into public.tournament_score_events(tournament_id,match_id,actor_user_id,previous_home_score,previous_away_score,previous_status,new_home_score,new_away_score,previous_tennis_sets,new_tennis_sets)
 values(t.id,m.id,auth.uid(),m.home_score,m.away_score,m.status,updated.home_score,updated.away_score,m.tennis_sets,updated.tennis_sets);
 end if;
end $$;

create function public.preview_tennis_result(p_slug text,p_match uuid,p_kind text,p_winner text,p_sets jsonb,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.tournaments;version text;preview jsonb;m public.tournament_matches;
begin
 select * into t from public.tournaments where slug=p_slug for update;
 if auth.uid() is null or t.organizer_id is distinct from auth.uid() then raise exception 'NOT_ALLOWED';end if;
 version:=private.incident_version(t.id);
 begin
  perform private.apply_tennis_result(t.id,p_match,p_kind,p_winner,p_sets,p_reason);
  select * into m from public.tournament_matches where id=p_match;
  preview:=jsonb_build_object('version',version,'match',p_match,'kind',p_kind,'winner',case when p_kind='played' then null else p_winner end,'sets',p_sets,'reason',trim(p_reason),'after',jsonb_build_object('status',m.status,'tennis_result',m.tennis_result,'tennis_sets',m.tennis_sets,'tennis_winner',m.tennis_winner),
   'home',coalesce(m.home_team_name,private.resolve_ranked_source(t.id,m.home_source)),'away',coalesce(m.away_team_name,private.resolve_ranked_source(t.id,m.away_source)),'rankings',(select coalesce(jsonb_object_agg(k,v),'{}'::jsonb) from jsonb_each(public.get_tournament_rankings(p_slug)) x(k,v) where exists(select 1 from public.tournament_matches z where z.group_id::text=k and z.phase in ('group','final_group'))));
  raise exception using errcode='PT002',message='Preview rollback';
 exception when sqlstate 'PT002' then null;end;
 return preview;
end $$;
create function public.confirm_tennis_result(p_slug text,p_version text,p_match uuid,p_kind text,p_winner text,p_sets jsonb,p_reason text,p_confirm boolean)
returns void language plpgsql security definer set search_path='' as $$
declare t public.tournaments;
begin
 select * into t from public.tournaments where slug=p_slug for update;
 if auth.uid() is null or t.organizer_id is distinct from auth.uid() then raise exception 'NOT_ALLOWED';end if;
 if p_confirm is distinct from true then raise exception 'CONFIRMATION_REQUIRED';end if;
 if p_version is distinct from private.incident_version(t.id) then raise exception 'INCIDENT_CHANGED';end if;
 perform private.apply_tennis_result(t.id,p_match,p_kind,p_winner,p_sets,p_reason);
end $$;
revoke all on function public.preview_tennis_result(text,uuid,text,text,jsonb,text) from public,anon;
revoke all on function public.confirm_tennis_result(text,text,uuid,text,text,jsonb,text,boolean) from public,anon;
grant execute on function public.preview_tennis_result(text,uuid,text,text,jsonb,text) to authenticated;
grant execute on function public.confirm_tennis_result(text,text,uuid,text,text,jsonb,text,boolean) to authenticated;

create or replace function private.incident_version(p_tid uuid)
returns text language sql stable set search_path='' as $$
 select md5(jsonb_build_array(t.withdrawal_rule,t.forfeit_score,t.ranking_rule,t.format_settings,
 (select jsonb_agg(e.id order by e.id) from public.tournament_incident_events e where tournament_id=t.id),
 (select jsonb_agg(jsonb_build_array(m.id,m.group_id,m.home_team_name,m.away_team_name,m.home_source,m.away_source,m.home_score,m.away_score,m.status,m.outcome,m.outcome_reason,m.tennis_sets,m.tennis_result,m.tennis_winner) order by m.id) from public.tournament_matches m where tournament_id=t.id),
 (select jsonb_agg(to_jsonb(w) order by w.team_name) from public.tournament_withdrawals w where tournament_id=t.id),
 (select jsonb_agg(jsonb_build_array(s.id,s.group_id,s.team_name,s.slot_number) order by s.id) from public.tournament_group_teams s where tournament_id=t.id),
 (select jsonb_agg(to_jsonb(d) order by d.id) from public.tournament_tie_decisions d where tournament_id=t.id),
 (select locked_at from public.tournament_result_locks where tournament_id=t.id))::text) from public.tournaments t where t.id=p_tid;
$$;
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
        (status <> 'finished' or home_score is null or away_score is null or (phase = 'playoff' and outcome <> 'void' and home_score = away_score and tennis_winner is null))) then
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
create or replace function public.decide_tournament_tie(p_group uuid,p_version text,p_names text[],p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare t public.tournaments; g public.tournament_groups; expected text[];
begin
 if auth.uid() is null then raise exception 'Not authenticated';end if;
 select * into g from public.tournament_groups where id=p_group;
 select * into t from public.tournaments where id=g.tournament_id for update;
 if t.id is null or t.organizer_id<>auth.uid() then raise exception 'Not authorized';end if;
 if exists(select 1 from public.tournament_result_locks where tournament_id=t.id and locked_at is not null) then raise exception 'RESULTS_LOCKED';end if;
 if p_version is distinct from private.group_ranking_version(g.id) then raise exception 'RANKING_CHANGED';end if;
 if (t.ranking_rule='legacy' and t.sport<>'Tenis') or not private.group_results_complete(g.id) then raise exception 'GROUP_NOT_COMPLETE';end if;
 if p_reason is null or char_length(trim(p_reason)) not between 5 and 1000 then raise exception 'REASON_REQUIRED';end if;
 if exists(select 1 from public.tournament_matches m where m.tournament_id=t.id and m.status='finished' and (private.source_depends_on_group(t.id,m.home_source,g.code) or private.source_depends_on_group(t.id,m.away_source,g.code))) then raise exception 'DEPENDENT_RESULTS_EXIST';end if;
 select array_agg(r.name order by r.name) into expected from private.group_ranking(g.id) r;
 if p_names is null or (select array_agg(n order by n) from unnest(p_names) n) is distinct from expected then raise exception 'INVALID_TIE_ORDER';end if;
 if not exists(select 1 from private.group_ranking(g.id) r group by r.sport_rank having count(*)>1) then raise exception 'NO_TIE';end if;
 if exists(select 1 from (select r.sport_rank,lag(r.sport_rank) over(order by n.ord) as previous from unnest(p_names) with ordinality n(name,ord) join private.group_ranking(g.id) r on r.name=n.name) ordered where previous>sport_rank) then raise exception 'INVALID_TIE_ORDER';end if;
 insert into public.tournament_tie_decisions(tournament_id,group_id,version,ordered_names,reason,actor_id) values(t.id,g.id,p_version,p_names,trim(p_reason),auth.uid());
end $$;
create or replace function private.guard_unresolved_finalization()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.locked_at is not null and exists(select 1 from public.tournaments t join public.tournament_groups g on g.tournament_id=t.id cross join lateral private.group_ranking(g.id) r where t.id=new.tournament_id and (t.ranking_rule<>'legacy' or t.sport='Tenis') and exists(select 1 from public.tournament_matches m where m.group_id=g.id and m.phase in ('group','final_group')) and r.unresolved) then raise exception 'UNRESOLVED_TIE';end if;
 return new;
end $$;
create or replace function private.update_tennis_match_score(p_match_id uuid,p_sets jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); m public.tournament_matches%rowtype; sport_name text; scoring text; totals record; tid uuid;
begin
  if uid is null then raise exception 'NOT_ALLOWED'; end if;
  select tournament_id into tid from public.tournament_matches where id=p_match_id;
  if tid is null or not private.can_score_tournament(uid,tid) then raise exception 'NOT_ALLOWED'; end if;
  select sport,coalesce(format_settings->'tennis'->>'scoring','set6') into sport_name,scoring from public.tournaments where id=tid for update;
  if sport_name <> 'Tenis' then raise exception 'NOT_TENNIS'; end if;
  select * into m from public.tournament_matches where id=p_match_id for update;
  if m.id is null then raise exception 'NOT_ALLOWED'; end if;
  if m.tennis_result<>'played' then raise exception 'SPECIAL_RESULT';end if;
  select * into totals from private.tennis_set_totals(p_sets,scoring);
  -- Reject scoring a bracket whose preceding match has not finished yet.
  if exists (select 1 from unnest(array[m.home_source,m.away_source]) s where s ~ '^(Víťaz|Porazený) zápasu [0-9]+$' and not exists
    (select 1 from public.tournament_matches prior where prior.tournament_id=tid and prior.match_number=substring(s from '[0-9]+$')::integer and prior.status='finished')) then raise exception 'WAITING_FOR_PLAYERS'; end if;
  if exists (select 1 from unnest(array[m.home_source,m.away_source]) s where s ~ '^[0-9]+\. miesto skupiny [A-Z]+$' and exists
    (select 1 from public.tournament_matches prior join public.tournament_groups g on g.id=prior.group_id where prior.tournament_id=tid and g.code=substring(s from '[A-Z]+$') and prior.status<>'finished')) then raise exception 'WAITING_FOR_PLAYERS'; end if;
  update public.tournament_matches set tennis_sets=p_sets,home_score=totals.home,away_score=totals.away,status='finished',score_updated_by=uid,updated_at=now() where id=p_match_id;
  insert into public.tournament_score_events(tournament_id,match_id,actor_user_id,previous_home_score,previous_away_score,previous_status,new_home_score,new_away_score,previous_tennis_sets,new_tennis_sets)
    values(tid,p_match_id,uid,m.home_score,m.away_score,m.status,totals.home,totals.away,m.tennis_sets,p_sets);
end; $$;
do $$ declare f record;begin for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in ('ball_group_ranking','ball_group_ranking_version','tennis_progress','tennis_group_ranking','guard_tennis_rules','apply_tennis_result') loop execute 'revoke all on function '||f.signature||' from public,anon,authenticated';end loop;end $$;

create function private.guard_tennis_application()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.tournaments where id=new.tournament_id and sport='Tenis') then raise exception 'TENNIS_REGISTRATION_ORGANIZER_ONLY';end if;return new;
end $$;
revoke all on function private.guard_tennis_application() from public,anon,authenticated;
create trigger tennis_application_guard before insert on public.tournament_applications for each row execute function private.guard_tennis_application();

create or replace function public.get_tournament_incidents(p_slug text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.tournaments;
begin
 select * into t from public.tournaments where slug=p_slug;
 if t.id is null or not coalesce((t.publication_status='published' and t.tournament_type in ('public','combined') and t.team_visibility='all') or private.can_score_tournament(auth.uid(),t.id),false) then return null;end if;
 return jsonb_build_object('withdrawal_rule',t.withdrawal_rule,'forfeit_score',t.forfeit_score,'rules_frozen',exists(select 1 from public.tournament_ranking_frozen where tournament_id=t.id),
 'withdrawals',(select coalesce(jsonb_agg(jsonb_build_object('name',w.team_name,'reason',w.reason) order by w.team_name),'[]'::jsonb) from public.tournament_withdrawals w where tournament_id=t.id),
 'events',(select coalesce(jsonb_agg(x order by created_at desc),'[]'::jsonb) from (select e.action,e.target,e.reason,e.created_at,(select coalesce(jsonb_agg(jsonb_build_object('number',a->'match_number','home',coalesce(a->>'home_team_name',a->>'home_source'),'away',coalesce(a->>'away_team_name',a->>'away_source'),'before_home',b->'home_score','before_away',b->'away_score','home_score',a->'home_score','away_score',a->'away_score','outcome',a->'outcome','tennis_sets',a->'tennis_sets','tennis_result',a->'tennis_result','tennis_winner',a->'tennis_winner','before_tennis_sets',b->'tennis_sets','before_tennis_result',b->'tennis_result','before_tennis_winner',b->'tennis_winner','before_status',b->'status')),'[]'::jsonb) from jsonb_array_elements(e.after_matches) a join jsonb_array_elements(e.before_matches) b on a->>'id'=b->>'id' where (a-'updated_at') is distinct from (b-'updated_at')) as changes from public.tournament_incident_events e where e.tournament_id=t.id order by e.created_at desc limit 30) x));
end $$;

drop trigger if exists tennis_score_guard on public.tournament_matches;
create trigger tennis_score_guard before insert or update on public.tournament_matches for each row execute function private.guard_tennis_match_score();
revoke all on function private.guard_tennis_match_score() from public,anon,authenticated;
revoke all on function private.update_tennis_match_score(uuid,jsonb) from public,anon,authenticated;
grant execute on function private.update_tennis_match_score(uuid,jsonb) to authenticated;
create or replace function public.update_tennis_match_score(p_match_id uuid,p_sets jsonb)
returns void language sql security invoker set search_path='' as $$ select private.update_tennis_match_score(p_match_id,p_sets); $$;
revoke all on function public.update_tennis_match_score(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.update_tennis_match_score(uuid,jsonb) to authenticated;
