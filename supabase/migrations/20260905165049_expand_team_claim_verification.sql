alter table public.team_claim_requests
  add column phone text;

alter table public.team_claim_requests
  add constraint team_claim_requests_phone_length_check
    check (phone is null or char_length(phone) between 7 and 30),
  add constraint team_claim_requests_message_length_check
    check (message is null or char_length(message) <= 1000);

comment on column public.team_claim_requests.phone is
  'Contact phone supplied for manual verification. Visible only to the requester and administrators through RLS.';
comment on column public.team_claim_requests.message is
  'Optional explanation or public contact that helps an administrator verify the relationship to the team.';
