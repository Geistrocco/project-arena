create index team_nomination_players_attendance_recorder_idx
  on public.team_nomination_players (attendance_recorded_by)
  where attendance_recorded_by is not null;
