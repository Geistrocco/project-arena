// Match fragments anywhere, regardless of Slovak/Czech accents or word order.
export function normalizeClubSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
}

export function matchesClubSearch(query: string, ...fields: (string | null | undefined)[]): boolean {
  const text = normalizeClubSearch(fields.filter(Boolean).join(" "));
  return normalizeClubSearch(query).split(" ").filter(Boolean).every(part => text.includes(part));
}
