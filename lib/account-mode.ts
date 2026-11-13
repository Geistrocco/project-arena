// Presentation preference only. Team/club authorization always uses verified memberships.
export type AccountMode = "parent" | "coach";
export function resolveAccountMode(preference: unknown, hasStaffActivity: boolean): AccountMode {
  if (preference === "parent" || preference === "coach") return preference;
  return hasStaffActivity ? "coach" : "parent";
}
