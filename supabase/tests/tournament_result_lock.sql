-- Non-destructive integration check: all fixture writes are rolled back.
begin;
do $$
declare
  tid uuid := gen_random_uuid();
  mid uuid := gen_random_uuid();
  uid uuid;
  test_slug text := 'lock-test-' || replace(tid::text,'-','');
  n integer;
begin
  select organizer_id into uid from public.tournaments limit 1;
  if uid is null then raise exception 'NO_FIXTURE_OWNER'; end if;
  insert into public.tournaments
    select (jsonb_populate_record(null::public.tournaments,to_jsonb(t) || jsonb_build_object('id',tid,'slug',test_slug,'name','Lock transaction test'))).*
    from public.tournaments t limit 1;
  perform set_config('request.jwt.claim.sub',uid::text,true);
  begin
    perform public.set_tournament_result_lock(test_slug,true,null);
    raise exception 'TEST_EMPTY_FAILED';
  exception when others then if sqlerrm <> 'UNFINISHED_MATCHES' then raise; end if; end;
  insert into public.tournament_matches(id,tournament_id,phase,round_number,match_number,starts_at,field_number,home_team_name,away_team_name)
    values(mid,tid,'group',1,1,'09:00',1,'Home','Away');
  begin
    perform public.set_tournament_result_lock(test_slug,true,null);
    raise exception 'TEST_UNFINISHED_FAILED';
  exception when others then if sqlerrm <> 'UNFINISHED_MATCHES' then raise; end if; end;
  perform public.update_tournament_match_score(mid,2,0);
  perform public.set_tournament_result_lock(test_slug,true,null);
  begin
    perform public.update_tournament_match_score(mid,3,0);
    raise exception 'TEST_SCORE_FAILED';
  exception when others then if sqlerrm <> 'RESULTS_LOCKED' then raise; end if; end;
  begin
    update public.tournaments set capacity=capacity+1 where id=tid;
    raise exception 'TEST_EDIT_FAILED';
  exception when others then if sqlerrm <> 'RESULTS_LOCKED' then raise; end if; end;
  begin
    delete from public.tournament_matches where id=mid;
    raise exception 'TEST_DELETE_FAILED';
  exception when others then if sqlerrm <> 'RESULTS_LOCKED' then raise; end if; end;
  update public.tournament_matches set live_stream_status='ended' where id=mid;
  begin
    perform public.set_tournament_result_lock(test_slug,false,'');
    raise exception 'TEST_REASON_FAILED';
  exception when others then if sqlerrm <> 'REASON_REQUIRED' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
    perform public.set_tournament_result_lock(test_slug,false,'Invalid user test');
    raise exception 'TEST_OWNER_FAILED';
  exception when others then if sqlerrm <> 'NOT_ALLOWED' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',uid::text,true);
  perform public.set_tournament_result_lock(test_slug,false,'Correction test');
  perform public.update_tournament_match_score(mid,3,0);
  perform public.set_tournament_result_lock(test_slug,true,null);
  select count(*) into n from public.tournament_result_lock_events where tournament_id=tid;
  if n <> 3 then raise exception 'TEST_AUDIT_FAILED'; end if;
  if has_function_privilege('anon','public.set_tournament_result_lock(text,boolean,text)','EXECUTE') then raise exception 'TEST_ANON_FAILED'; end if;
end $$;
rollback;
select 'PASS: 12 database lock checks; all fixtures rolled back' as tests;
