import { createClient } from "@/lib/supabase/server";

export type PlanTeam = { id: string; group_id: string; slot_number: number; team_name: string };
export type PlanMatch = { id: string; group_id: string | null; phase: "group" | "placement" | "playoff"; round_number: number; match_number: number; starts_at: string; field_number: number; home_team_name: string | null; away_team_name: string | null; home_source: string | null; away_source: string | null; home_score: number | null; away_score: number | null; status: "scheduled" | "finished" };
export type PlanGroup = { id: string; code: string; name: string; sort_order: number; teams: PlanTeam[] };
export type Standing = { name: string; played: number; wins: number; draws: number; losses: number; scored: number; conceded: number; difference: number; points: number };

export async function getTournamentPlan(slug: string) {
  const supabase = await createClient();
  const [{ data: auth }, { data: tournament }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.from("tournaments").select("id,organizer_id").eq("slug", slug).maybeSingle(),
  ]);
  if (!tournament) return null;
  const [{ data: groups }, { data: teams }, { data: matches }] = await Promise.all([
    supabase.from("tournament_groups").select("id,code,name,sort_order").eq("tournament_id", tournament.id).order("sort_order"),
    supabase.from("tournament_group_teams").select("id,group_id,slot_number,team_name").eq("tournament_id", tournament.id).order("slot_number"),
    supabase.from("tournament_matches").select("id,group_id,phase,round_number,match_number,starts_at,field_number,home_team_name,away_team_name,home_source,away_source,home_score,away_score,status").eq("tournament_id", tournament.id).order("match_number"),
  ]);
  const planGroups = ((groups ?? []) as Omit<PlanGroup, "teams">[]).map((group) => ({ ...group, teams: ((teams ?? []) as PlanTeam[]).filter((team) => team.group_id === group.id) }));
  return { groups: planGroups, matches: (matches ?? []) as PlanMatch[], canManage: auth?.claims?.sub === tournament.organizer_id };
}

export function calculateStandings(group: PlanGroup, matches: PlanMatch[]) {
  const rows = new Map(group.teams.map((team) => [team.team_name, { name: team.team_name, played: 0, wins: 0, draws: 0, losses: 0, scored: 0, conceded: 0, difference: 0, points: 0 }]));
  matches.filter((match) => match.group_id === group.id && match.status === "finished" && match.home_team_name && match.away_team_name).forEach((match) => {
    const home = rows.get(match.home_team_name!); const away = rows.get(match.away_team_name!); if (!home || !away) return;
    const hs = Number(match.home_score); const as = Number(match.away_score); home.played += 1; away.played += 1; home.scored += hs; home.conceded += as; away.scored += as; away.conceded += hs;
    if (hs > as) { home.wins += 1; home.points += 3; away.losses += 1; } else if (hs < as) { away.wins += 1; away.points += 3; home.losses += 1; } else { home.draws += 1; away.draws += 1; home.points += 1; away.points += 1; }
  });
  return [...rows.values()].map((row) => ({ ...row, difference: row.scored - row.conceded })).sort((a, b) => b.points - a.points || b.difference - a.difference || b.scored - a.scored || a.name.localeCompare(b.name, "sk"));
}
