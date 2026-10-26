alter table public.tournament_matches add column tennis_sets jsonb;
alter table public.tournament_score_events add column previous_tennis_sets jsonb, add column new_tennis_sets jsonb;

create function private.tennis_set_totals(p_sets jsonb,p_scoring text)
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

create function private.guard_tennis_match_score()
returns trigger language plpgsql security definer set search_path='' as $$
declare sport_name text; scoring text; totals record;
begin
  if new.status <> 'finished' then return new; end if;
  if tg_op='UPDATE' and new.tennis_sets is not distinct from old.tennis_sets and new.home_score is not distinct from old.home_score and new.away_score is not distinct from old.away_score and new.status=old.status then return new; end if;
  select sport,coalesce(format_settings->'tennis'->>'scoring','set6') into sport_name,scoring from public.tournaments where id=new.tournament_id;
  if sport_name='Tenis' then
    select * into totals from private.tennis_set_totals(new.tennis_sets,scoring);
    if new.home_score is distinct from totals.home or new.away_score is distinct from totals.away then raise exception 'INVALID_TENNIS_SCORE'; end if;
  elsif new.tennis_sets is not null then raise exception 'NOT_TENNIS'; end if;
  return new;
end; $$;
revoke all on function private.guard_tennis_match_score() from public,anon,authenticated;
create trigger tennis_score_guard before insert or update on public.tournament_matches for each row execute function private.guard_tennis_match_score();

create function private.update_tennis_match_score(p_match_id uuid,p_sets jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); m public.tournament_matches%rowtype; sport_name text; scoring text; totals record; tid uuid;
begin
  if uid is null then raise exception 'NOT_ALLOWED'; end if;
  select tournament_id into tid from public.tournament_matches where id=p_match_id;
  if tid is null or not private.can_score_tournament(uid,tid) then raise exception 'NOT_ALLOWED'; end if;
  select sport,coalesce(format_settings->'tennis'->>'scoring','set6') into sport_name,scoring from public.tournaments where id=tid for share;
  if sport_name <> 'Tenis' then raise exception 'NOT_TENNIS'; end if;
  select * into m from public.tournament_matches where id=p_match_id for update;
  if m.id is null then raise exception 'NOT_ALLOWED'; end if;
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
revoke all on function private.update_tennis_match_score(uuid,jsonb) from public,anon,authenticated;
grant execute on function private.update_tennis_match_score(uuid,jsonb) to authenticated;
create function public.update_tennis_match_score(p_match_id uuid,p_sets jsonb)
returns void language sql security invoker set search_path='' as $$ select private.update_tennis_match_score(p_match_id,p_sets); $$;
revoke all on function public.update_tennis_match_score(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.update_tennis_match_score(uuid,jsonb) to authenticated;
