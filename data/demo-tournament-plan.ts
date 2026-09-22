import type { PlanGroup, PlanMatch, PlanTeam } from "@/lib/tournament-plan-data";

type DemoGame = { home: string; away: string };

const groupTeams = {
  A: ["MŠK Senec", "ŠK Slovan Bratislava", "FC Petržalka", "FK Inter Bratislava"],
  B: ["FC Spartak Trnava", "FC DAC 1904", "FC Nitra", "MFK Skalica"],
  C: ["MŠK Žilina", "AS Trenčín", "FK Pohronie", "FC ViOn Zlaté Moravce"],
};

const goldTeams = [groupTeams.A[0], groupTeams.A[1], groupTeams.B[0], groupTeams.B[1], groupTeams.C[0], groupTeams.C[1]];
const silverTeams = [groupTeams.A[2], groupTeams.A[3], groupTeams.B[2], groupTeams.B[3], groupTeams.C[2], groupTeams.C[3]];

function roundRobin(names: string[]) {
  const rotating = [...names];
  const rounds: DemoGame[][] = [];
  for (let round = 0; round < rotating.length - 1; round += 1) {
    const games: DemoGame[] = [];
    for (let index = 0; index < rotating.length / 2; index += 1) games.push({ home: rotating[index], away: rotating[rotating.length - 1 - index] });
    rounds.push(games);
    rotating.splice(1, 0, rotating.pop()!);
  }
  return rounds;
}

function at(startMinutes: number, slot: number) {
  const total = startMinutes + slot * 25;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}:00`;
}

function demoTeam(groupId: string, teamName: string, slot: number): PlanTeam {
  return { id: `${groupId}-${slot}`, group_id: groupId, slot_number: slot, team_name: teamName };
}

function group(id: string, code: string, name: string, sortOrder: number, names: string[]): PlanGroup {
  return { id, code, name, sort_order: sortOrder, teams: names.map((nameValue, index) => demoTeam(id, nameValue, index + 1)) };
}

const groups: PlanGroup[] = [
  group("demo-group-a", "A", "Skupina A", 1, groupTeams.A),
  group("demo-group-b", "B", "Skupina B", 2, groupTeams.B),
  group("demo-group-c", "C", "Skupina C", 3, groupTeams.C),
  group("demo-group-gold", "GOLD", "Zlatá skupina", 4, goldTeams),
  group("demo-group-silver", "SILVER", "Strieborná skupina", 5, silverTeams),
];

let matchNumber = 1;
const matches: PlanMatch[] = [];

const basicRounds = Object.entries(groupTeams).map(([code, names]) => ({ code, names, rounds: roundRobin(names) }));
for (let roundIndex = 0; roundIndex < 3; roundIndex += 1) {
  basicRounds.forEach(({ code, names, rounds }, groupIndex) => {
    const round = rounds[roundIndex];
    round.forEach((game, gameIndex) => {
      const homeRank = names.indexOf(game.home);
      const awayRank = names.indexOf(game.away);
      const homeWins = homeRank < awayRank;
      matches.push({
        id: `demo-match-${matchNumber}`,
        group_id: `demo-group-${code.toLowerCase()}`,
        phase: "group",
        round_number: roundIndex + 1,
        match_number: matchNumber++,
        starts_at: at(9 * 60, roundIndex * 3 + groupIndex),
        field_number: gameIndex + 1,
        home_team_name: game.home,
        away_team_name: game.away,
        home_source: null,
        away_source: null,
        home_score: homeWins ? 2 : 0,
        away_score: homeWins ? 0 : 2,
        status: "finished",
        live_stream_url: null,
        live_stream_status: null,
      });
    });
  });
}

const finalRounds = [
  { groupId: "demo-group-gold", names: goldTeams, offset: 0 },
  { groupId: "demo-group-silver", names: silverTeams, offset: 1 },
].map((stage) => ({ ...stage, rounds: roundRobin(stage.names) }));
for (let roundIndex = 0; roundIndex < 5; roundIndex += 1) {
  finalRounds.forEach(({ groupId, offset, rounds }) => {
    const round = rounds[roundIndex];
    round.forEach((game, gameIndex) => {
      matches.push({
        id: `demo-match-${matchNumber}`,
        group_id: groupId,
        phase: "final_group",
        round_number: roundIndex + 1,
        match_number: matchNumber++,
        starts_at: at(13 * 60 + 30, roundIndex * 2 + offset),
        field_number: gameIndex + 1,
        home_team_name: game.home,
        away_team_name: game.away,
        home_source: null,
        away_source: null,
        home_score: null,
        away_score: null,
        status: "scheduled",
        live_stream_url: null,
        live_stream_status: null,
      });
    });
  });
}

export const demoGoldSilverPlan = { groups, matches, canManage: false };
