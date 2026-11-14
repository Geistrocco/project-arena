import { createTournamentPlan, type PlanInput } from "@/lib/tournament-plan";
import type { TennisSettings } from "@/lib/tennis";
import { suggestedGroupSizes } from "@/lib/tournament-groups";

export function createTennisPlan(input: PlanInput, settings: TennisSettings) {
  if (!Number.isInteger(input.teamCount) || input.teamCount < 2 || input.teamCount > 64 || !Number.isInteger(input.fieldCount) || input.fieldCount < 1 || input.fieldCount > 32 || !Number.isInteger(input.matchMinutes) || input.matchMinutes < 5 || input.matchMinutes > 240 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.startTime)) throw new Error("Skontrolujte počet hráčov, kurtov, odhad trvania a začiatok turnaja.");
  const names = Array.from({ length: input.teamCount }, (_, i) => input.teamNames[i] ?? `${settings.discipline === "doubles" ? "Dvojica" : "Hráč"} ${i + 1}`);
  if (names.some((name) => name.trim().length < 2 || name.length > 180)) throw new Error("Označenie hráča alebo dvojice musí mať 2 až 180 znakov.");
  if (new Set(names).size !== names.length) throw new Error("Hráči alebo dvojice musia mať odlišné označenia.");
  if (settings.system === "round_robin" || settings.system === "groups_playoff") {
    if (settings.system === "round_robin" && input.teamCount > 16) throw new Error("Každý s každým podporuje najviac 16 hráčov. Zvoľte skupiny alebo pavúk.");
    if (!Number.isInteger(settings.qualifiers) || settings.qualifiers < 1 || settings.qualifiers > 2) throw new Error("Vyberte jedného alebo dvoch postupujúcich.");
    const plan = createTournamentPlan({ ...input, teamNames: names, gameSystem: settings.system, groupSizes: settings.groupSizes, qualifiersPerGroup: settings.qualifiers, thirdPlaceMatch: false });
    // Six qualifiers from three pools need a rotated second-place seeding to
    // avoid C1 vs C2 in the first knockout round of the standard seeded draw.
    if (settings.system === "groups_playoff" && plan.groups.length === 3 && settings.qualifiers === 2) {
      const rotate = (source: string | null) => source?.replace(/^2\. miesto skupiny ([ABC])$/, (_, group: string) => `2. miesto skupiny ${{ A: "B", B: "C", C: "A" }[group as "A" | "B" | "C"]}`) ?? null;
      plan.matches.forEach((m) => { m.home_source = rotate(m.home_source); m.away_source = rotate(m.away_source); });
    }
    const at = (value: string) => { const [h, m] = value.split(":").map(Number); return h * 60 + m; };
    if (plan.matches.some((m, i) => at(m.starts_at) < at(i ? plan.matches[i - 1].starts_at : input.startTime)) || at(plan.finishTime) < at(plan.matches.at(-1)?.starts_at ?? input.startTime)) throw new Error("Rozpis presahuje jeden deň. Pridajte kurty, zvoľte kratšie zápasy alebo iný systém.");
    return plan;
  }
  if (settings.system === "consolation" && (input.teamCount < 4 || (input.teamCount & (input.teamCount - 1)) !== 0)) throw new Error("Útecha vyžaduje plný pavúk: 4, 8, 16, 32 alebo 64 hráčov. Pre iný počet zvoľte skupiny alebo bežný pavúk.");
  const groups = [{ code: "P", name: "Účastníci", sort_order: 1 }];
  const teams = names.map((team_name, i) => ({ group_code: "P", slot_number: i + 1, team_name }));
  type Entry = { name: string | null; source: string | null };
  type Match = { group_code: null; phase: "playoff" | "placement"; round_number: number; match_number: number; starts_at: string; field_number: number; home_team_name: string | null; away_team_name: string | null; home_source: string | null; away_source: string | null };
  const matches: Match[] = [];
  const at = (v: string) => { const [h, m] = v.split(":").map(Number); return h * 60 + m; };
  const clock = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  const slot = Math.ceil((input.matchMinutes + 3) / 5) * 5;
  let current = at(input.startTime); let round = 1;
  const firstLosers: Entry[] = [];
  function bracket(entries: (Entry | null)[], phase: Match["phase"]) {
    let players = entries;
    let first = true;
    while (players.length > 1) {
      const next: (Entry | null)[] = [];
      const pending: { home: Entry; away: Entry; position: number }[] = [];
      for (let i = 0; i < players.length; i += 2) {
        const home = players[i]; const away = players[i + 1];
        if (!home || !away) next.push(home ?? away);
        else { pending.push({ home, away, position: next.length }); next.push(null); }
      }
      for (let i = 0; i < pending.length; i += input.fieldCount) {
        const lunch = at(input.lunchStart ?? "12:00");
        if (input.lunchBreak && current < lunch + (input.lunchDuration ?? 45) && current + input.matchMinutes > lunch) current = lunch + (input.lunchDuration ?? 45);
        if (current + input.matchMinutes >= 24 * 60) throw new Error("Rozpis presahuje jeden deň. Znížte počet hráčov alebo odhad trvania, prípadne pridajte kurty.");
        pending.slice(i, i + input.fieldCount).forEach(({ home, away, position }, court) => {
          const number = matches.length + 1;
          matches.push({ group_code: null, phase, round_number: round, match_number: number, starts_at: clock(current), field_number: court + 1, home_team_name: home.name, away_team_name: away.name, home_source: home.source, away_source: away.source });
          next[position] = { name: null, source: `Víťaz zápasu ${number}` };
          if (first && phase === "playoff") firstLosers.push({ name: null, source: `Porazený zápasu ${number}` });
        });
        current += slot;
      }
      current += slot; round++; players = next; first = false;
    }
  }
  const size = 2 ** Math.ceil(Math.log2(input.teamCount));
  let seeds = [1];
  for (let n = 2; n <= size; n *= 2) seeds = seeds.flatMap((seed) => [seed, n + 1 - seed]);
  bracket(seeds.map((seed) => names[seed - 1] ? { name: names[seed - 1], source: null } : null), "playoff");
  if (settings.system === "consolation") bracket(firstLosers, "placement");
  return { groups, teams, matches, playingSlotCount: round, restSlotCount: round - 1, finishTime: matches.length ? clock(at(matches.at(-1)!.starts_at) + input.matchMinutes) : input.startTime };
}

export function recommendTennisSystem(input: PlanInput, preferredEnd: string) {
  const systems: TennisSettings["system"][] = input.teamCount <= 5 ? ["round_robin", "groups_playoff", "consolation", "knockout"] : ["groups_playoff", "round_robin", "consolation", "knockout"];
  const candidates = systems.flatMap((system) => {
    if (system === "round_robin" && input.teamCount > 8) return [];
    try {
      const plan = createTennisPlan(input, { system, scoring: "set6", discipline: "singles", noAd: false, groupSizes: system === "round_robin" ? [input.teamCount] : suggestedGroupSizes(input.teamCount), qualifiers: input.qualifiersPerGroup ?? 2 });
      return [{ system, finish: plan.finishTime }];
    } catch { return []; }
  });
  return candidates.find((c) => c.finish <= preferredEnd)?.system ?? candidates.sort((a, b) => a.finish.localeCompare(b.finish))[0]?.system ?? "groups_playoff";
}
