-- Substitute the payload token with validated JSON from prepare-futbalnet-teams.py.
-- Do not send a payload containing the $team_import$ delimiter.
with imported as (
  select * from jsonb_to_recordset($team_import$__PAYLOAD__$team_import$::jsonb)
  as x(club_id text,name text,category text,season text,source_id text,source_url text,status text)
), applied as (
  insert into public.club_teams(club_id,name,category,season,source,source_id,source_url,status)
  select club_id,name,category,season,'sportnet_futbalnet',source_id,source_url,status from imported
  on conflict(club_id,category,season) do update
  set source=excluded.source,source_id=excluded.source_id,source_url=excluded.source_url,
      updated_at=now()
  where public.club_teams.source<>'sportnet_futbalnet' or public.club_teams.source_id=excluded.source_id
  returning id
)
select count(*) as imported from applied;
