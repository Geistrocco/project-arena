import { createScheduleSummary, recommendGameSystem, type GameSystem } from "@/lib/tournament-schedule";
import { validGroupSizes } from "@/lib/tournament-groups";
import type { FinalMode } from "@/lib/tournament-plan";
import { TENNIS_SCORING, TENNIS_SYSTEMS, type TennisScoring, type TennisSettings, type TennisSystem } from "@/lib/tennis";
import { suggestedGroupSizes } from "@/lib/tournament-groups";
import { createTennisPlan, recommendTennisSystem } from "@/lib/tennis-plan";

export type FormatSettings = { mode?: "custom"; sizes?: number[]; finalMode?: FinalMode; tennis?: TennisSettings };
export function resolveTournamentFormat(formData: FormData, settings: { sport?: string; teamCount: number; fieldCount: number; matchMinutes: number; startTime: string; lunchBreak: boolean; lunchStart?: string | null; lunchDuration?: number | null }) {
  const end = String(formData.get("preferredEnd") ?? "");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)) throw new Error("Zadajte želaný čas konca turnaja.");
  const choice = String(formData.get("formatChoice") ?? "");
  if (settings.sport === "Tenis") {
    if (settings.teamCount > 64) throw new Error("Tenisová verzia podporuje najviac 64 hráčov alebo dvojíc.");
    const rawSystem = choice === "tennis_recommended" ? recommendTennisSystem({ ...settings, teamNames: [], gameSystem: "round_robin", qualifiersPerGroup: Number(formData.get("qualifiersPerGroup") ?? 2) }, end) : choice.replace(/^tennis_/, "");
    const rawScoring = String(formData.get("tennisScoring") ?? "");
    const discipline = String(formData.get("tennisDiscipline") ?? "");
    if (!choice.startsWith("tennis_") || !Object.hasOwn(TENNIS_SYSTEMS, rawSystem) || !Object.hasOwn(TENNIS_SCORING, rawScoring) || !["singles", "doubles"].includes(discipline)) throw new Error("Vyberte tenisový systém, disciplínu a bodovanie.");
    const system = rawSystem as TennisSystem;
    if (system === "round_robin" && settings.teamCount > 16) throw new Error("Pre viac ako 16 hráčov použite skupiny alebo pavúk.");
    const groupSizes = system === "round_robin" ? [settings.teamCount] : suggestedGroupSizes(settings.teamCount);
    const qualifiers = Number(formData.get("qualifiersPerGroup") ?? 2);
    const tennis: TennisSettings = { system, scoring: rawScoring as TennisScoring, discipline: discipline as "singles" | "doubles", noAd: formData.get("tennisNoAd") === "on", groupSizes, qualifiers };
    const gameSystem: GameSystem = system === "groups_playoff" ? "groups_playoff" : "round_robin";
    const plan = createTennisPlan({ ...settings, teamNames: [], gameSystem }, tennis);
    const groupMatchCount = plan.matches.filter((m) => m.phase === "group").length;
    return { gameSystem, groupSizes, finalMode: undefined, formatSettings: { tennis } as FormatSettings, tennis, preferredEnd: end, qualifiers: system === "groups_playoff" ? qualifiers : null, thirdPlace: false,
      summary: { slotMinutes: Math.ceil((settings.matchMinutes + 3) / 5) * 5, turnoverMinutes: 3, groupSizes, matchCount: plan.matches.length, groupMatchCount, finalStageMatchCount: plan.matches.length - groupMatchCount, playingSlotCount: plan.playingSlotCount, restSlotCount: plan.restSlotCount, finishTime: plan.finishTime } };
  }
  const qualifiers = Number(formData.get("qualifiersPerGroup") ?? 2);
  const thirdPlace = formData.get("thirdPlaceMatch") === "on";
  let gameSystem: GameSystem;
  let groupSizes: number[] | undefined;
  let finalMode: FinalMode | undefined;
  let formatSettings: FormatSettings = {};
  if (choice === "recommended") {
    const recommended = recommendGameSystem(settings, end);
    if (!recommended) throw new Error("Pre tieto parametre nie je dostupný automatický systém hry.");
    gameSystem = recommended.gameSystem;
  } else if (choice === "custom") {
    const raw = String(formData.get("groupSizes") ?? "");
    if (!/^\s*\d+(\s*,\s*\d+)*\s*$/.test(raw)) throw new Error("Veľkosti skupín zadajte napríklad ako 4,4,4.");
    groupSizes = raw.split(",").map((part) => Number(part.trim()));
    if (!validGroupSizes(groupSizes, settings.teamCount)) throw new Error("Súčet tímov v skupinách musí sedieť a každá skupina potrebuje aspoň dva tímy.");
    const chosenFinal = String(formData.get("finalMode") ?? "");
    if (!["none", "placement", "playoff"].includes(chosenFinal)) throw new Error("Vyberte záverečnú časť turnaja.");
    finalMode = chosenFinal as FinalMode;
    if (finalMode === "none" && groupSizes.length < 1) throw new Error("Zadajte skupiny.");
    gameSystem = finalMode === "playoff" ? "groups_playoff" : "groups_placement";
    formatSettings = { mode: "custom", sizes: groupSizes, finalMode };
  } else if (["groups_playoff", "round_robin", "groups_placement"].includes(choice)) {
    gameSystem = choice as GameSystem;
    if (gameSystem === "round_robin" && settings.teamCount > 16) throw new Error("Pre viac ako 16 tímov vyberte rozdelenie do skupín.");
  } else throw new Error("Vyberte systém hry.");
  const effectiveQualifiers = gameSystem === "groups_playoff" ? qualifiers : null;
  const effectiveThirdPlace = gameSystem === "groups_playoff" && thirdPlace;
  if (gameSystem === "groups_playoff" && (!Number.isInteger(qualifiers) || qualifiers < 1 || qualifiers > 2)) throw new Error("Skontrolujte počet postupujúcich.");
  const summary = createScheduleSummary({ ...settings, gameSystem, groupSizes, finalMode, qualifiersPerGroup: qualifiers, thirdPlaceMatch: thirdPlace });
  if (!summary) throw new Error("Tento systém hry nie je možné zostaviť. Upravte skupiny alebo záverečnú časť.");
  return { gameSystem, groupSizes, finalMode, formatSettings, tennis: null, preferredEnd: end, qualifiers: effectiveQualifiers, thirdPlace: effectiveThirdPlace, summary };
}
