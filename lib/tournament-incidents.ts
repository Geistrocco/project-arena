import type { PlanMatch, Standing } from "./tournament-plan-calculations";

export type WithdrawalRule = "keep" | "annul";
export const withdrawalLabels: Record<WithdrawalRule, string> = {
  keep: "Odohrané výsledky zostávajú, zostávajúce zápasy sa kontumujú",
  annul: "Všetky zápasy odstúpeného tímu v skupine sa vylúčia z tabuľky",
};
export type TournamentIncidents = {
  rules_frozen?: boolean;
  withdrawal_rule: WithdrawalRule;
  forfeit_score: number;
  withdrawals: { name: string; reason: string }[];
  events: { action: string; target: string; reason: string; created_at: string; changes?: IncidentPreview["changes"] }[];
};
export type IncidentPreview = {
  version: string; action: string; target: string; winner: string | null; reason: string;
  changes: { tennis_sets?: import("./tennis").TennisSet[] | null; tennis_result?: "played"|"wo"|"retired"; tennis_winner?: "home"|"away"|null; before_tennis_sets?: import("./tennis").TennisSet[]|null; before_tennis_result?: "played"|"wo"|"retired"; before_tennis_winner?: "home"|"away"|null; before_status?: string; number: number; home: string | null; away: string | null; before_home: number | null; before_away: number | null; home_score: number; away_score: number; outcome: string }[];
  rankings: Record<string, { rows: Standing[] }>;
};
export function matchOutcomeLabel(match: Pick<PlanMatch,"outcome"|"status"|"home_score"|"away_score">) {
  if (match.outcome === "void") return "Anulované – bez bodov";
  if (match.status !== "finished") return "– : –";
  return `${match.home_score} : ${match.away_score}${match.outcome === "forfeit" ? " (kont.)" : ""}`;
}
