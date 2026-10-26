export type PlanTeam = { id: string; group_id: string; slot_number: number; team_name: string };
export type PlanMatch = { sport?: string; tennis_scoring?: import("@/lib/tennis").TennisScoring; tennis_system?: import("@/lib/tennis").TennisSystem; tennis_sets?: { home: number; away: number }[] | null; id: string; group_id: string | null; phase: "group" | "final_group" | "placement" | "playoff"; round_number: number; match_number: number; starts_at: string; field_number: number; home_team_name: string | null; away_team_name: string | null; home_source: string | null; away_source: string | null; home_score: number | null; away_score: number | null; status: "scheduled" | "finished"; live_stream_url: string | null; live_stream_status: "scheduled" | "live" | "ended" | null; resolved_home_name?: string | null; resolved_away_name?: string | null };
export type PlanGroup = { id: string; code: string; name: string; sort_order: number; teams: PlanTeam[] };
export type Standing = { name: string; played: number; wins: number; draws: number; losses: number; scored: number; conceded: number; difference: number; points: number };

export function calculateStandings(group: PlanGroup, matches: PlanMatch[]) {
  const rows = new Map(group.teams.map((team) => [team.team_name, { name: team.team_name, played: 0, wins: 0, draws: 0, losses: 0, scored: 0, conceded: 0, difference: 0, points: 0 }]));
  matches.filter((match) => match.group_id === group.id && match.status === "finished" && match.home_team_name && match.away_team_name).forEach((match) => {
    const home = rows.get(match.home_team_name!); const away = rows.get(match.away_team_name!); if (!home || !away) return;
    const hs = Number(match.home_score); const as = Number(match.away_score); home.played += 1; away.played += 1; home.scored += hs; home.conceded += as; away.scored += as; away.conceded += hs;
    if (hs > as) { home.wins += 1; home.points += 3; away.losses += 1; } else if (hs < as) { away.wins += 1; away.points += 3; home.losses += 1; } else { home.draws += 1; away.draws += 1; home.points += 1; away.points += 1; }
  });
  return [...rows.values()].map((row) => ({ ...row, difference: row.scored - row.conceded })).sort((a, b) => b.points - a.points || b.difference - a.difference || b.scored - a.scored || a.name.localeCompare(b.name, "sk"));
}

export function calculateTennisStandings(group: PlanGroup, matches: PlanMatch[]) {
  const played = matches.filter((m) => m.group_id === group.id && m.status === "finished" && m.tennis_sets?.length);
  const rows = group.teams.map((t) => {
    let wins = 0; let losses = 0; let setsWon = 0; let setsLost = 0; let gamesWon = 0; let gamesLost = 0;
    for (const m of played) {
      const home = (m.resolved_home_name ?? m.home_team_name) === t.team_name;
      if (!home && (m.resolved_away_name ?? m.away_team_name) !== t.team_name) continue;
      const own = home ? m.home_score! : m.away_score!; const other = home ? m.away_score! : m.home_score!;
      if (own > other) wins++; else losses++;
      setsWon += own; setsLost += other;
      m.tennis_sets!.forEach((s, i) => { if (i !== 2) { gamesWon += home ? s.home : s.away; gamesLost += home ? s.away : s.home; } });
    }
    return { name: t.team_name, played: wins + losses, wins, losses, draws: 0, scored: setsWon, conceded: setsLost, difference: setsWon - setsLost, points: wins, gamesWon, gamesLost };
  });
  return rows.sort((a, b) => {
    if (a.wins !== b.wins) return b.wins - a.wins;
    const tied = rows.filter((r) => r.wins === a.wins);
    if (tied.length === 2) {
      const head = played.find((m) => [m.home_team_name, m.away_team_name].includes(a.name) && [m.home_team_name, m.away_team_name].includes(b.name));
      if (head) return ((head.home_score! > head.away_score! ? head.home_team_name : head.away_team_name) === a.name) ? -1 : 1;
    }
    const setShare = (b.scored / Math.max(1, b.scored + b.conceded)) - (a.scored / Math.max(1, a.scored + a.conceded));
    const gameShare = (b.gamesWon / Math.max(1, b.gamesWon + b.gamesLost)) - (a.gamesWon / Math.max(1, a.gamesWon + a.gamesLost));
    return setShare || gameShare || group.teams.find((t) => t.team_name === a.name)!.slot_number - group.teams.find((t) => t.team_name === b.name)!.slot_number;
  });
}
