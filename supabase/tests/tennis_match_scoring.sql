begin;
do $$
declare tid uuid:=gen_random_uuid(); mid uuid:=gen_random_uuid(); uid uuid; test_slug text:='tennis-test-'||replace(tid::text,'-',''); totals record; event_count integer;
begin
  select organizer_id into uid from public.tournaments limit 1;
  if uid is null then raise exception 'NO_FIXTURE_OWNER'; end if;
  insert into public.tournaments select (jsonb_populate_record(null::public.tournaments,to_jsonb(t)||jsonb_build_object('id',tid,'slug',test_slug,'name','Tennis test','sport','Tenis','format_settings',jsonb_build_object('tennis',jsonb_build_object('scoring','match_tiebreak'))))).* from public.tournaments t limit 1;
  insert into public.tournament_matches(id,tournament_id,phase,round_number,match_number,starts_at,field_number,home_team_name,away_team_name) values(mid,tid,'group',1,1,'09:00',1,'Player A','Player B');
  perform set_config('request.jwt.claim.sub',uid::text,true);
  begin perform public.update_tournament_match_score(mid,2,0); raise exception 'TEST_LEGACY_SCORE_ACCEPTED'; exception when others then if sqlerrm<>'INVALID_TENNIS_SCORE' then raise; end if; end;
  begin perform public.update_tennis_match_score(mid,'[{"home":6,"away":3}]'); raise exception 'TEST_INCOMPLETE_MATCH_ACCEPTED'; exception when others then if sqlerrm<>'INVALID_TENNIS_SCORE' then raise; end if; end;
  begin perform public.update_tennis_match_score(mid,'[{"home":6,"away":3},{"home":4,"away":6},{"home":10,"away":9}]'); raise exception 'TEST_BAD_TB_ACCEPTED'; exception when others then if sqlerrm<>'INVALID_TENNIS_SCORE' then raise; end if; end;
  perform public.update_tennis_match_score(mid,'[{"home":6,"away":3},{"home":4,"away":6},{"home":12,"away":10}]');
  if not exists(select 1 from public.tournament_matches where id=mid and home_score=2 and away_score=1 and jsonb_array_length(tennis_sets)=3) then raise exception 'TEST_VALID_SCORE_FAILED'; end if;
  select count(*) into event_count from public.tournament_score_events where match_id=mid and new_tennis_sets is not null;
  if event_count<>1 then raise exception 'TEST_AUDIT_FAILED'; end if;
  perform public.set_tournament_result_lock(test_slug,true,null);
  begin perform public.update_tennis_match_score(mid,'[{"home":6,"away":1},{"home":6,"away":2}]'); raise exception 'TEST_LOCK_BYPASS'; exception when others then if sqlerrm<>'RESULTS_LOCKED' then raise; end if; end;
  perform public.set_tournament_result_lock(test_slug,false,'Test score correction');
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin perform public.update_tennis_match_score(mid,'[{"home":6,"away":1},{"home":6,"away":2}]'); raise exception 'TEST_PERMISSION_BYPASS'; exception when others then if sqlerrm<>'NOT_ALLOWED' then raise; end if; end;
  select * into totals from private.tennis_set_totals('[{"home":5,"away":4}]','short4');
  if totals.home<>1 then raise exception 'TEST_SHORT_SET_FAILED'; end if;
  if has_function_privilege('anon','public.update_tennis_match_score(uuid,jsonb)','EXECUTE') then raise exception 'TEST_ANON_ACCESS'; end if;
end $$;
rollback;
select 'PASS: tennis scoring validation, audit, permissions, and result lock; fixtures rolled back' as tests;
