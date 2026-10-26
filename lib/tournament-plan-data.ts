import { createClient } from "@/lib/supabase/server";
import { calculateStandings, type PlanGroup, type PlanMatch, type PlanTeam } from "@/lib/tournament-plan-calculations";
export type { PlanGroup, PlanMatch, PlanTeam, Standing } from "@/lib/tournament-plan-calculations";
export type TournamentAuditEvent = { id: string; title: string; detail: string; createdAt: string };

export async function getTournamentPlan(slug: string, options: { publicExport?: boolean } = {}) {
  const supabase = await createClient();
  const [{ data: auth }, { data: tournament }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.from("tournaments").select("id,organizer_id").eq("slug", slug).maybeSingle(),
  ]);
  if (!tournament) return null;
  const [groupResult, teamResult, matchResult] = await Promise.all([
    supabase.from("tournament_groups").select("id,code,name,sort_order").eq("tournament_id", tournament.id).order("sort_order"),
    supabase.from("tournament_group_teams").select("id,group_id,slot_number,team_name").eq("tournament_id", tournament.id).order("slot_number"),
    supabase.from("tournament_matches").select("id,group_id,phase,round_number,match_number,starts_at,field_number,home_team_name,away_team_name,home_source,away_source,home_score,away_score,status,live_stream_url,live_stream_status").eq("tournament_id", tournament.id).order("match_number"),
  ]);
  if (options.publicExport && (groupResult.error || teamResult.error || matchResult.error)) throw new Error("Výsledky sa nepodarilo načítať.");
  const { data: groups } = groupResult;
  const { data: teams } = teamResult;
  const { data: matches } = matchResult;
  const planGroups = ((groups ?? []) as Omit<PlanGroup, "teams">[]).map((group) => ({ ...group, teams: ((teams ?? []) as PlanTeam[]).filter((team) => team.group_id === group.id) }));
  const planMatches = resolveTournamentSources(planGroups, (matches ?? []) as PlanMatch[]);
  const userId = auth?.claims?.sub;
  const canManage = userId === tournament.organizer_id;
  const { data: resultLock, error: lockError } = await supabase.from("tournament_result_locks").select("locked_at").eq("tournament_id", tournament.id).maybeSingle();
  if (lockError) throw new Error("Stav uzamknutia výsledkov sa nepodarilo načítať.");
  const lockedAt = resultLock?.locked_at ?? null;
  const { data: assignments } = userId && !options.publicExport
    ? await supabase.from("tournament_scorekeepers").select("id,user_id,invited_email,display_name,granted_at,revoked_at").eq("tournament_id", tournament.id).order("granted_at")
    : { data: [] };
  const scorekeepers = (assignments ?? []).filter((assignment) => assignment.revoked_at === null);
  const auditEvents: TournamentAuditEvent[] = [];
  if (canManage && !options.publicExport) {
    const [{ data: scoreEvents }, { data: permissionEvents }, { data: lockEvents }] = await Promise.all([
      supabase.from("tournament_score_events").select("id,match_id,actor_user_id,previous_home_score,previous_away_score,new_home_score,new_away_score,created_at").eq("tournament_id", tournament.id).order("created_at", { ascending: false }).limit(30),
      supabase.from("tournament_scorekeeper_events").select("id,scorekeeper_user_id,action,created_at").eq("tournament_id", tournament.id).order("created_at", { ascending: false }).limit(30),
      supabase.from("tournament_result_lock_events").select("id,action,reason,created_at").eq("tournament_id", tournament.id).order("created_at", { ascending: false }).limit(30),
    ]);
    const matchById = new Map(planMatches.map((match) => [match.id, match]));
    const personById = new Map((assignments ?? []).map((assignment) => [assignment.user_id, assignment.display_name || assignment.invited_email]));
    for (const event of scoreEvents ?? []) {
      const match = matchById.get(event.match_id);
      const actor = event.actor_user_id === tournament.organizer_id ? "Organizátor" : personById.get(event.actor_user_id ?? "") ?? "Poverený používateľ";
      const previous = event.previous_home_score === null || event.previous_away_score === null ? "bez výsledku" : `${event.previous_home_score}:${event.previous_away_score}`;
      auditEvents.push({ id: `score-${event.id}`, title: `Výsledok zápasu č. ${match?.match_number ?? "—"}`, detail: `${actor}: ${previous} → ${event.new_home_score}:${event.new_away_score}`, createdAt: event.created_at });
    }
    for (const event of permissionEvents ?? []) {
      auditEvents.push({ id: `permission-${event.id}`, title: event.action === "granted" ? "Udelené oprávnenie" : "Odobraté oprávnenie", detail: personById.get(event.scorekeeper_user_id) ?? "Používateľ", createdAt: event.created_at });
    }
    for (const event of lockEvents ?? []) auditEvents.push({ id: `lock-${event.id}`, title: event.action === "locked" ? "Výsledky potvrdené a uzamknuté" : "Výsledky odomknuté", detail: event.reason ? `Organizátor: ${event.reason}` : "Organizátor potvrdil výsledky turnaja.", createdAt: event.created_at });
    auditEvents.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return {
    groups: planGroups,
    matches: planMatches,
    canManage,
    lockedAt,
    canScore: canManage || Boolean(userId && scorekeepers.some((assignment) => assignment.user_id === userId)),
    scorekeepers: canManage ? scorekeepers.map((assignment) => ({
      id: assignment.id,
      invited_email: assignment.invited_email,
      display_name: assignment.display_name,
      granted_at: assignment.granted_at,
    })) : [],
    auditEvents: auditEvents.slice(0, 30),
  };
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
