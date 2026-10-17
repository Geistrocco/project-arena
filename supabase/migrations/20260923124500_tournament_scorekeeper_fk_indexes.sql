create index if not exists tournament_scorekeepers_granted_by_idx on public.tournament_scorekeepers (granted_by);
create index if not exists tournament_scorekeepers_revoked_by_idx on public.tournament_scorekeepers (revoked_by) where revoked_by is not null;
create index if not exists tournament_scorekeeper_events_scorekeeper_idx on public.tournament_scorekeeper_events (scorekeeper_user_id);
create index if not exists tournament_scorekeeper_events_actor_idx on public.tournament_scorekeeper_events (actor_user_id) where actor_user_id is not null;
create index if not exists tournament_score_events_actor_idx on public.tournament_score_events (actor_user_id) where actor_user_id is not null;
create index if not exists tournament_matches_score_updated_by_idx on public.tournament_matches (score_updated_by) where score_updated_by is not null;
