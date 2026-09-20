import { suggestedGroupSizes, validGroupSizes } from "@/lib/tournament-groups";

export type FinalMode = "none" | "placement" | "playoff";
export type PlanInput = { teamNames: string[]; teamCount: number; fieldCount: number; matchMinutes: number; startTime: string; lunchBreak: boolean; lunchStart?: string | null; lunchDuration?: number | null; gameSystem: "groups_playoff" | "round_robin" | "groups_placement"; groupSizes?: number[]; finalMode?: FinalMode; qualifiersPerGroup?: number; thirdPlaceMatch?: boolean };
type PlanMatch = { group_code: string | null; phase: "group" | "placement" | "playoff"; round_number: number; match_number: number; starts_at: string; field_number: number; home_team_name: string | null; away_team_name: string | null; home_source: string | null; away_source: string | null };
type Game = { home: string; away: string; group: string };
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
  const sizes = input.groupSizes ?? (input.gameSystem === "round_robin" ? [input.teamCount] : input.gameSystem === "groups_placement" && input.teamCount % 2 === 0 ? [input.teamCount / 2, input.teamCount / 2] : suggestedGroupSizes(input.teamCount));
  if (!validGroupSizes(sizes, input.teamCount)) throw new Error("Nesprávne rozdelenie tímov do skupín.");
  const finalMode = input.finalMode ?? (input.gameSystem === "round_robin" ? "none" : input.gameSystem === "groups_placement" ? "placement" : "playoff");
  if (finalMode === "placement" && (sizes.length !== 2 || sizes[0] !== sizes[1])) throw new Error("Zápasy o umiestnenie vyžadujú dve rovnako veľké skupiny.");
  const qualifiers = input.qualifiersPerGroup ?? 2;
  if (finalMode === "playoff" && (sizes.length < 2 || qualifiers < 1 || qualifiers > 2 || sizes.some((size) => size <= qualifiers))) throw new Error("Play-off potrebuje aspoň dve skupiny a platný počet postupujúcich.");
  const names = Array.from({ length: input.teamCount }, (_, index) => input.teamNames[index] ?? `Tím ${index + 1}`);
  const groups = sizes.map((_, index) => { const code = groupCode(index); return { code, name: `Skupina ${code}`, sort_order: index + 1 }; });
  const teams: { group_code: string; slot_number: number; team_name: string }[] = [];
  let offset = 0;
  groups.forEach((group, index) => { names.slice(offset, offset + sizes[index]).forEach((team_name, slot) => teams.push({ group_code: group.code, slot_number: slot + 1, team_name })); offset += sizes[index]; });

  const slot = Math.ceil((input.matchMinutes + 3) / 5) * 5;
  const lunchStart = input.lunchStart ? minutes(input.lunchStart) : 12 * 60;
  const lunchEnd = lunchStart + (input.lunchDuration ?? 45);
  let current = minutes(input.startTime); let matchNumber = 1; let overallRound = 1; let restSlotCount = 0; let playingSlotCount = 0;
  const matches: PlanMatch[] = [];
  const advance = () => { if (input.lunchBreak && current < lunchEnd && current + input.matchMinutes > lunchStart) current = lunchEnd; };
  const append = (phase: PlanMatch["phase"], field: number, home: string, away: string, group: string | null = null, sources = false) => {
    matches.push({ group_code: group, phase, round_number: overallRound, match_number: matchNumber++, starts_at: time(current), field_number: field,
      home_team_name: sources ? null : home, away_team_name: sources ? null : away,
      home_source: sources ? home : null, away_source: sources ? away : null });
  };
  const roundsByGroup = groups.map((group) => roundRobin(teams.filter((team) => team.group_code === group.code).map((team) => team.team_name)));
  const pending: Game[] = [];
  for (let round = 0; round < Math.max(...roundsByGroup.map((rounds) => rounds.length)); round++) {
    for (let index = 0; index < groups.length; index++) for (const game of roundsByGroup[index][round] ?? []) pending.push({ ...game, group: groups[index].code });
  }
  const lastSlot = new Map<string, number>();
  let slotIndex = 0;
  while (pending.length) {
    advance();
    const used = new Set<string>(); let field = 1;
    for (let i = 0; i < pending.length && field <= input.fieldCount;) {
      const game = pending[i];
      if (used.has(game.home) || used.has(game.away) || [game.home, game.away].some((team) => (lastSlot.get(team) ?? -2) >= slotIndex - 1)) { i++; continue; }
      append("group", field++, game.home, game.away, game.group);
      used.add(game.home); used.add(game.away); lastSlot.set(game.home, slotIndex); lastSlot.set(game.away, slotIndex);
      pending.splice(i, 1);
    }
    if (field === 1) restSlotCount++;
    current += slot; slotIndex++; playingSlotCount++; overallRound++;
  }
  if (finalMode === "placement") {
    current += slot; restSlotCount++; playingSlotCount++; overallRound++;
    for (let rank = sizes[0]; rank >= 1;) {
      advance();
      for (let field = 1; field <= input.fieldCount && rank >= 1; field++, rank--)
        append("placement", field, `${rank}. miesto skupiny A`, `${rank}. miesto skupiny B`, null, true);
      current += slot; playingSlotCount++; overallRound++;
    }
  }
  if (finalMode === "playoff") {
    const entrants = Array.from({ length: qualifiers }, (_, rank) => groups.map((group) => `${rank + 1}. miesto skupiny ${group.code}`)).flat();
    const bracketSize = 2 ** Math.ceil(Math.log2(entrants.length));
    // Standard seeded bracket: 1 vs last seed, 4 vs 5, 2 vs 7, 3 vs 6.
    let seedPositions = [1];
    for (let size = 2; size <= bracketSize; size *= 2) seedPositions = seedPositions.flatMap((seed) => [seed, size + 1 - seed]);
    let currentRound: (string | null)[] = seedPositions.map((seed) => entrants[seed - 1] ?? null);
    let semifinalMatches: number[] = [];
    while (currentRound.length > 1) {
      const roundGames: { home: string; away: string; position: number }[] = [];
      const next: (string | null)[] = [];
      for (let i = 0; i < currentRound.length; i += 2) {
        const home = currentRound[i]; const away = currentRound[i + 1];
        if (home && away) { roundGames.push({ home, away, position: next.length }); next.push(null); }
        else next.push(home ?? away);
      }
      if (roundGames.length) {
        current += slot; restSlotCount++; playingSlotCount++; overallRound++;
        const played: number[] = [];
        for (let i = 0; i < roundGames.length; i += input.fieldCount) {
          advance();
          roundGames.slice(i, i + input.fieldCount).forEach((game, field) => {
            append("playoff", field + 1, game.home, game.away, null, true);
            next[game.position] = `Víťaz zápasu ${matchNumber - 1}`;
            played.push(matchNumber - 1);
          });
          current += slot; playingSlotCount++; overallRound++;
        }
        if (currentRound.length === 4) semifinalMatches = played;
      }
      currentRound = next;
    }
    if (input.thirdPlaceMatch && semifinalMatches.length === 2) {
      advance();
      append("placement", 1, `Porazený zápasu ${semifinalMatches[0]}`, `Porazený zápasu ${semifinalMatches[1]}`, null, true);
      current += slot; playingSlotCount++;
    }
  }
  const last = matches.at(-1);
  return { groups, teams, matches, playingSlotCount, restSlotCount, finishTime: last ? time(minutes(last.starts_at) + input.matchMinutes) : time(current) };
}
