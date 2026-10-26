export const TENNIS_SYSTEMS = {
  round_robin: "Každý s každým",
  groups_playoff: "Skupiny + play-off",
  knockout: "Vyraďovací pavúk",
  consolation: "Pavúk s útechou po prvej prehre",
} as const;
export const TENNIS_SCORING = {
  set6: "Jeden set do 6 gemov, tiebreak za 6:6",
  short4: "Jeden krátky set do 4 gemov, tiebreak za 4:4",
  match_tiebreak: "Dva víťazné sety, tretí set nahrádza match-tiebreak do 10",
} as const;
export type TennisSystem = keyof typeof TENNIS_SYSTEMS;
export type TennisScoring = keyof typeof TENNIS_SCORING;
export type TennisSettings = { system: TennisSystem; scoring: TennisScoring; discipline: "singles" | "doubles"; noAd: boolean; groupSizes: number[]; qualifiers: number };
export type TennisSet = { home: number; away: number };

export function validateTennisScore(sets: TennisSet[], scoring: TennisScoring) {
  let home = 0; let away = 0;
  const target = scoring === "match_tiebreak" ? 2 : 1;
  if (!sets.length || sets.length > (target === 2 ? 3 : 1)) throw new Error("Nesprávny počet setov.");
  sets.forEach((set, index) => {
    if (home === target || away === target) throw new Error("Zápas sa už skončil v predchádzajúcom sete.");
    const high = Math.max(set.home, set.away); const low = Math.min(set.home, set.away);
    if (![set.home, set.away].every((n) => Number.isInteger(n) && n >= 0 && n <= 99)) throw new Error("Zadajte celé nezáporné skóre setu.");
    const max = scoring === "short4" ? 4 : 6;
    const valid = index === 2
      ? (high === 10 && low <= 8 || high > 10 && high - low === 2)
      : (high === max && low <= max - 2 || high === max + 1 && (low === max - 1 || low === max));
    if (!valid) throw new Error("Set nie je dohraný alebo nezodpovedá zvolenému bodovaniu.");
    if (set.home > set.away) home++; else away++;
  });
  if (Math.max(home, away) !== target) throw new Error("Zadajte všetky sety dohraného zápasu.");
  return { home, away };
}

export function tennisScoreLabel(sets?: TennisSet[] | null) {
  return sets?.map((s, index) => index === 2 ? `[${s.home}:${s.away}]` : `${s.home}:${s.away}`).join(", ") || "– : –";
}
