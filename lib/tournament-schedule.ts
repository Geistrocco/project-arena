import { createTournamentPlan, type FinalMode } from "@/lib/tournament-plan";

export const MINIMUM_TURNOVER_MINUTES = 3;
export type GameSystem = "groups_playoff" | "round_robin" | "groups_placement";
export { suggestedGroupSizes } from "@/lib/tournament-groups";
export type ScheduleSettings = {
  teamCount: number;
  fieldCount: number;
  matchMinutes: number;
  startTime: string;
  lunchBreak: boolean;
  lunchStart?: string | null;
  lunchDuration?: number | null;
  gameSystem?: GameSystem;
  qualifiersPerGroup?: number;
  thirdPlaceMatch?: boolean;
  groupSizes?: number[];
  finalMode?: FinalMode;
};
export type ScheduleSummary = {
  slotMinutes: number; turnoverMinutes: number; groupSizes: number[];
  matchCount: number; groupMatchCount: number; finalStageMatchCount: number;
  playingSlotCount: number; restSlotCount: number; finishTime: string;
};
export function recommendedSlotMinutes(matchMinutes: number) {
  if (!Number.isFinite(matchMinutes) || matchMinutes < 1) return 0;
  return Math.ceil((matchMinutes + MINIMUM_TURNOVER_MINUTES) / 5) * 5;
}
export function createScheduleSummary(settings: ScheduleSettings): ScheduleSummary | null {
  if (!Number.isInteger(settings.teamCount) || settings.teamCount < 2 || settings.teamCount > 256
    || !Number.isInteger(settings.fieldCount) || settings.fieldCount < 1 || settings.fieldCount > 32
    || !Number.isInteger(settings.matchMinutes) || settings.matchMinutes < 1 || settings.matchMinutes > 240) return null;
  try {
    const plan = createTournamentPlan({ teamNames: [], teamCount: settings.teamCount, fieldCount: settings.fieldCount,
      matchMinutes: settings.matchMinutes, startTime: settings.startTime, lunchBreak: settings.lunchBreak,
      lunchStart: settings.lunchStart, lunchDuration: settings.lunchDuration, gameSystem: settings.gameSystem ?? "groups_playoff",
      groupSizes: settings.groupSizes, finalMode: settings.finalMode, qualifiersPerGroup: settings.qualifiersPerGroup,
      thirdPlaceMatch: settings.thirdPlaceMatch });
    const groupMatchCount = plan.matches.filter((match) => match.phase === "group").length;
    const slotMinutes = recommendedSlotMinutes(settings.matchMinutes);
    return { slotMinutes, turnoverMinutes: slotMinutes - settings.matchMinutes,
      groupSizes: plan.groups.map((group) => plan.teams.filter((team) => team.group_code === group.code).length),
      matchCount: plan.matches.length, groupMatchCount, finalStageMatchCount: plan.matches.length - groupMatchCount,
      playingSlotCount: plan.playingSlotCount, restSlotCount: plan.restSlotCount, finishTime: plan.finishTime };
  } catch { return null; }
}

export function recommendGameSystem(settings: Omit<ScheduleSettings, "gameSystem" | "groupSizes" | "finalMode">, preferredEnd: string) {
  const options: { gameSystem: GameSystem; label: string; summary: ScheduleSummary | null; quality: number }[] = [];
  if (settings.teamCount <= 8) options.push({ gameSystem: "round_robin", label: "Každý s každým", summary: createScheduleSummary({ ...settings, gameSystem: "round_robin" }), quality: 3 });
  options.push({ gameSystem: "groups_playoff", label: "Skupiny + play-off", summary: createScheduleSummary({ ...settings, gameSystem: "groups_playoff", qualifiersPerGroup: 2, thirdPlaceMatch: true }), quality: 2 });
  if (settings.teamCount % 2 === 0) options.push({ gameSystem: "groups_placement", label: "Dve skupiny + umiestnenie", summary: createScheduleSummary({ ...settings, gameSystem: "groups_placement", groupSizes: [settings.teamCount / 2, settings.teamCount / 2] }), quality: 1 });
  const valid = options.filter((option): option is typeof option & { summary: ScheduleSummary } => option.summary !== null);
  const at = (value: string) => { const [hours, minutes] = value.split(":").map(Number); return hours * 60 + minutes; };
  const end = at(preferredEnd); const start = at(settings.startTime);
  const fits = valid.filter((option) => at(option.summary.finishTime) <= end && at(option.summary.finishTime) > start);
  const selected = [...(fits.length ? fits : valid)].sort((a, b) => fits.length ? b.quality - a.quality : at(a.summary.finishTime) - at(b.summary.finishTime))[0];
  return selected ? { ...selected, fits: fits.length > 0 } : null;
}
