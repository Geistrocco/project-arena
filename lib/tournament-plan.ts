import { suggestedGroupSizes } from "@/lib/tournament-schedule";

type PlanInput = { teamNames: string[]; teamCount: number; fieldCount: number; matchMinutes: number; startTime: string; lunchBreak: boolean; lunchStart?: string | null; lunchDuration?: number | null; gameSystem: "groups_playoff" | "round_robin" | "groups_placement" };
type PlanMatch = { group_code: string | null; phase: "group" | "placement" | "playoff"; round_number: number; match_number: number; starts_at: string; field_number: number; home_team_name: string | null; away_team_name: string | null; home_source: string | null; away_source: string | null };

function minutes(value: string) { const [hour, minute] = value.split(":").map(Number); return hour * 60 + minute; }
function time(value: number) { return `${String(Math.floor(value / 60) % 24).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`; }
function groupCode(index: number) { let value = index + 1; let code = ""; while (value > 0) { value -= 1; code = String.fromCharCode(65 + (value % 26)) + code; value = Math.floor(value / 26); } return code; }
function roundRobin(names: string[]) {
  const teams: (string | null)[] = names.length % 2 ? [...names, null] : [...names];
  const rounds: { home: string; away: string }[][] = [];
  for (let round = 0; round < teams.length - 1; round += 1) {
    const games: { home: string; away: string }[] = [];
    for (let i = 0; i < teams.length / 2; i += 1) { const home = teams[i]; const away = teams[teams.length - 1 - i]; if (home && away) games.push({ home, away }); }
    rounds.push(games);
    teams.splice(1, 0, teams.pop() ?? null);
  }
  return rounds;
}

export function createTournamentPlan(input: PlanInput) {
  const names = Array.from({ length: input.teamCount }, (_, index) => input.teamNames[index] ?? `Tím ${index + 1}`);
  const sizes = input.gameSystem === "round_robin" ? [input.teamCount] : suggestedGroupSizes(input.teamCount);
  const groups = sizes.map((_, index) => { const code = groupCode(index); return { code, name: `Skupina ${code}`, sort_order: index + 1 }; });
  const teams: { group_code: string; slot_number: number; team_name: string }[] = [];
  let offset = 0;
  groups.forEach((group, index) => { names.slice(offset, offset + sizes[index]).forEach((team_name, slot) => teams.push({ group_code: group.code, slot_number: slot + 1, team_name })); offset += sizes[index]; });

  const slot = Math.ceil((input.matchMinutes + 3) / 5) * 5;
  const lunchStart = input.lunchStart ? minutes(input.lunchStart) : 12 * 60;
  const lunchEnd = lunchStart + (input.lunchDuration ?? 45);
  let current = minutes(input.startTime); let matchNumber = 1; let overallRound = 1;
  const matches: PlanMatch[] = [];
  const roundsByGroup = groups.map((group) => roundRobin(teams.filter((team) => team.group_code === group.code).map((team) => team.team_name)));
  const maxRounds = Math.max(...roundsByGroup.map((rounds) => rounds.length));
  for (let round = 0; round < maxRounds; round += 1) {
    const games = roundsByGroup.flatMap((rounds, groupIndex) => (rounds[round] ?? []).map((game) => ({ ...game, group: groups[groupIndex].code })));
    for (let i = 0; i < games.length; i += input.fieldCount) {
      if (input.lunchBreak && current < lunchEnd && current + input.matchMinutes > lunchStart) current = lunchEnd;
      games.slice(i, i + input.fieldCount).forEach((game, field) => matches.push({ group_code: game.group, phase: "group", round_number: overallRound, match_number: matchNumber++, starts_at: time(current), field_number: field + 1, home_team_name: game.home, away_team_name: game.away, home_source: null, away_source: null }));
      current += slot;
    }
    current += slot;
    overallRound += 1;
  }
  if (input.gameSystem === "groups_placement" && groups.length === 2) {
    for (let rank = sizes[0]; rank >= 1; rank -= 1) {
      if (input.lunchBreak && current < lunchEnd && current + input.matchMinutes > lunchStart) current = lunchEnd;
      matches.push({ group_code: null, phase: "placement", round_number: overallRound, match_number: matchNumber++, starts_at: time(current), field_number: ((sizes[0] - rank) % input.fieldCount) + 1, home_team_name: null, away_team_name: null, home_source: `${rank}. miesto skupiny A`, away_source: `${rank}. miesto skupiny B` });
      if ((sizes[0] - rank + 1) % input.fieldCount === 0) current += slot;
    }
  }
  return { groups, teams, matches };
}
