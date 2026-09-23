-- Keep later round-robin stages distinct from preliminary groups in the UI.
alter table public.tournament_matches
  drop constraint tournament_matches_phase_check;

alter table public.tournament_matches
  add constraint tournament_matches_phase_check
  check (phase in ('group', 'final_group', 'placement', 'playoff'));
