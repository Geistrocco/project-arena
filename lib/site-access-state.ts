export type SiteAccess = { restricted: boolean; allowed: boolean };
export function parseSiteAccess(data: unknown, error?: unknown): SiteAccess {
  if (!error && data && typeof data === "object" && "restricted" in data && "allowed" in data
    && typeof data.restricted === "boolean" && typeof data.allowed === "boolean") {
    return { restricted: data.restricted, allowed: data.allowed };
  }
  // An unavailable access service must never reopen the site.
  return { restricted: true, allowed: false };
}
