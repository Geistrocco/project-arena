import { createClient } from "@/lib/supabase/server";
import { calculateStandings, type PlanGroup, type PlanMatch, type PlanTeam } from "@/lib/tournament-plan-calculations";
export type { PlanGroup, PlanMatch, PlanTeam, Standing } from "@/lib/tournament-plan-calculations";

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
    supabase.from("tournament_matches").select("id,group_id,phase,round_number,match_number,starts_at,field_number,home_team_name,away_team_name,home_source,away_source,home_score,away_score,status,live_stream_url,live_stream_status").eq("tournament_id", tournament.id).order("match_number"),
  ]);
  const planGroups = ((groups ?? []) as Omit<PlanGroup, "teams">[]).map((group) => ({ ...group, teams: ((teams ?? []) as PlanTeam[]).filter((team) => team.group_id === group.id) }));
  const planMatches = resolveTournamentSources(planGroups, (matches ?? []) as PlanMatch[]);
  return { groups: planGroups, matches: planMatches, canManage: auth?.claims?.sub === tournament.organizer_id };
}

export function resolveTournamentSources(groups: PlanGroup[], matches: PlanMatch[]) {
  const byNumber = new Map(matches.map((match) => [match.match_number, match]));
  const groupMatches = matches.filter((match) => match.phase === "group" || match.phase === "final_group");
  const standings = new Map(groups.map((group) => [group.code, groupMatches.filter((match) => match.group_id === group.id).every((match) => match.status === "finished")
    ? calculateStandings(group, groupMatches) : null]));
  function resolve(source: string | null, seen = new Set<number>()): string | null {
    if (!source) return null;
    const position = /^(\d+)\. miesto skupiny ([A-Z]+)$/.exec(source);
    if (position) return standings.get(position[2])?.[Number(position[1]) - 1]?.name ?? null;
    const prior = /^(Víťaz|Porazený) zápasu (\d+)$/.exec(source);
    if (!prior) return null;
    const number = Number(prior[2]); const match = byNumber.get(number);
    if (!match || match.status !== "finished" || seen.has(number) || match.home_score === match.away_score) return null;
    const nextSeen = new Set(seen); nextSeen.add(number);
    const home = match.home_team_name ?? resolve(match.home_source, nextSeen);
    const away = match.away_team_name ?? resolve(match.away_source, nextSeen);
    if (!home || !away) return null;
    const homeWon = Number(match.home_score) > Number(match.away_score);
    return (prior[1] === "Víťaz") === homeWon ? home : away;
  }
  return matches.map((match) => ({ ...match,
    resolved_home_name: match.home_team_name ?? resolve(match.home_source),
    resolved_away_name: match.away_team_name ?? resolve(match.away_source) }));
}
