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
