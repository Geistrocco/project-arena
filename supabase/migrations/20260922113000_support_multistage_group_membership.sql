-- A team can advance from a preliminary group into a later-stage group.
-- Prevent duplicates only inside the same group, not across the whole tournament.
alter table public.tournament_group_teams
  drop constraint tournament_group_teams_tournament_id_team_name_key;

alter table public.tournament_group_teams
  add constraint tournament_group_teams_group_id_team_name_key
  unique (group_id, team_name) deferrable initially deferred;
