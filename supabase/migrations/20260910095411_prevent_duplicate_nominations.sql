-- Preserve the most useful copy of an accidentally repeated nomination.
-- A copy with at least one response wins; otherwise the earliest copy wins.
with ranked as (
  select
    n.id,
    row_number() over (
      partition by n.team_id, lower(trim(n.title)), n.event_type, n.starts_at, coalesce(lower(trim(n.location)), '')
      order by
        exists (
          select 1
          from public.team_nomination_players np
          where np.nomination_id = n.id and np.response <> 'pending'
        ) desc,
        n.created_at asc,
        n.id asc
    ) as duplicate_rank
  from public.team_nominations n
)
delete from public.team_nominations n
using ranked r
where n.id = r.id and r.duplicate_rank > 1;

create unique index team_nominations_no_duplicates_idx
on public.team_nominations (
  team_id,
  lower(trim(title)),
  event_type,
  starts_at,
  coalesce(lower(trim(location)), '')
);