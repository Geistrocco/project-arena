export const MINIMUM_TURNOVER_MINUTES = 3;
export type GameSystem = "groups_playoff" | "round_robin" | "groups_placement";

export type ScheduleSettings = {
  teamCount: number;
  fieldCount: number;
  matchMinutes: number;
  startTime: string;
  lunchBreak: boolean;
  lunchStart?: string;
  lunchDuration?: number;
  gameSystem?: GameSystem;
  qualifiersPerGroup?: number;
  thirdPlaceMatch?: boolean;
};

type Match = { home: number; away: number };

export type ScheduleSummary = {
  slotMinutes: number;
  turnoverMinutes: number;
  groupSizes: number[];
  matchCount: number;
  groupMatchCount: number;
  finalStageMatchCount: number;
  playingSlotCount: number;
  restSlotCount: number;
  finishTime: string;
};

export function recommendedSlotMinutes(matchMinutes: number) {
  if (!Number.isFinite(matchMinutes) || matchMinutes < 1) return 0;
  return Math.ceil((matchMinutes + MINIMUM_TURNOVER_MINUTES) / 5) * 5;
}

export function suggestedGroupSizes(teamCount: number) {
  if (!Number.isInteger(teamCount) || teamCount < 2) return [];
  let groupCount = Math.max(1, Math.round(teamCount / 4));
  while (Math.ceil(teamCount / groupCount) > 5) groupCount += 1;
  while (groupCount > 1 && Math.floor(teamCount / groupCount) < 3) groupCount -= 1;
  const base = Math.floor(teamCount / groupCount);
  const larger = teamCount % groupCount;
  return Array.from({ length: groupCount }, (_, index) => base + (index < larger ? 1 : 0));
}

function roundRobinMatches(groupSizes: number[]) {
  const matches: Match[] = [];
  let teamOffset = 0;
  for (const size of groupSizes) {
    for (let home = 0; home < size; home += 1) {
      for (let away = home + 1; away < size; away += 1) {
        matches.push({ home: teamOffset + home, away: teamOffset + away });
      }
    }
    teamOffset += size;
  }
  return matches;
}

function parseTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return 9 * 60;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatTime(minutes: number) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

export function createScheduleSummary(settings: ScheduleSettings): ScheduleSummary | null {
  const { teamCount, fieldCount, matchMinutes } = settings;
  if (!Number.isInteger(teamCount) || teamCount < 2 || !Number.isInteger(fieldCount) || fieldCount < 1 || !Number.isInteger(matchMinutes) || matchMinutes < 1) return null;

  const gameSystem = settings.gameSystem ?? "groups_playoff";
  const groupSizes = gameSystem === "round_robin" ? [teamCount] : suggestedGroupSizes(teamCount);
  const pending = roundRobinMatches(groupSizes);
  const groupMatchCount = pending.length;
  const lastSlot = new Map<number, number>();
  let slotIndex = 0;
  let restSlotCount = 0;

  while (pending.length > 0) {
    const used = new Set<number>();
    let scheduled = 0;
    for (let index = 0; index < pending.length && scheduled < fieldCount;) {
      const match = pending[index];
      const rested = [match.home, match.away].every((team) => (lastSlot.get(team) ?? -2) < slotIndex - 1);
      if (!rested || used.has(match.home) || used.has(match.away)) { index += 1; continue; }
      used.add(match.home); used.add(match.away);
      lastSlot.set(match.home, slotIndex); lastSlot.set(match.away, slotIndex);
      pending.splice(index, 1); scheduled += 1;
    }
    if (scheduled === 0) restSlotCount += 1;
    slotIndex += 1;
  }

  let finalStageMatchCount = 0;
  if (gameSystem === "groups_playoff") {
    const qualifiers = Math.min(teamCount, groupSizes.length * Math.max(1, settings.qualifiersPerGroup ?? 2));
    finalStageMatchCount = Math.max(0, qualifiers - 1) + (settings.thirdPlaceMatch && qualifiers >= 4 ? 1 : 0);
    let roundTeams = qualifiers;
    while (roundTeams > 1) {
      const roundMatches = Math.floor(roundTeams / 2);
      slotIndex += 1 + Math.max(1, Math.ceil(roundMatches / fieldCount));
      restSlotCount += 1;
      roundTeams = Math.ceil(roundTeams / 2);
    }
  } else if (gameSystem === "groups_placement") {
    finalStageMatchCount = Math.floor(teamCount / 2);
    if (finalStageMatchCount > 0) {
      slotIndex += 1 + Math.ceil(finalStageMatchCount / fieldCount);
      restSlotCount += 1;
    }
  }
  const matchCount = groupMatchCount + finalStageMatchCount;

  const slotMinutes = recommendedSlotMinutes(matchMinutes);
  let current = parseTime(settings.startTime);
  let lastMatchStart = current;
  const lunchStart = parseTime(settings.lunchStart ?? "12:00");
  const lunchEnd = lunchStart + (settings.lunchDuration ?? 45);
  for (let slot = 0; slot < slotIndex; slot += 1) {
    if (settings.lunchBreak && current < lunchEnd && current + matchMinutes > lunchStart) current = lunchEnd;
    lastMatchStart = current;
    current += slotMinutes;
  }

  return {
    slotMinutes,
    turnoverMinutes: slotMinutes - matchMinutes,
    groupSizes,
    matchCount,
    groupMatchCount,
    finalStageMatchCount,
    playingSlotCount: slotIndex,
    restSlotCount,
    finishTime: formatTime(lastMatchStart + matchMinutes),
  };
}
