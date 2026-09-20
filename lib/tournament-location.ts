export const REGIONS = {
  Slovensko: ["Bratislavský kraj", "Trnavský kraj", "Trenčiansky kraj", "Nitriansky kraj", "Žilinský kraj", "Banskobystrický kraj", "Prešovský kraj", "Košický kraj"],
  Česko: ["Praha", "Stredočeský kraj", "Juhočeský kraj", "Plzenský kraj", "Karlovarský kraj", "Ústecký kraj", "Liberecký kraj", "Královohradecký kraj", "Pardubický kraj", "Vysočina", "Juhomoravský kraj", "Olomoucký kraj", "Zlínsky kraj", "Moravskosliezsky kraj"],
} as const;

export type TournamentCountry = keyof typeof REGIONS;
export const SURFACES = ["Prírodný trávnik", "Umelý trávnik", "Hala", "Ľadová plocha", "Antuka", "Tvrdý povrch", "Iný povrch"] as const;

export function isCountry(value: string): value is TournamentCountry {
  return Object.hasOwn(REGIONS, value);
}

export function isRegion(country: TournamentCountry, value: string): boolean {
  return (REGIONS[country] as readonly string[]).includes(value);
}

export function isSurface(value: string): boolean {
  return (SURFACES as readonly string[]).includes(value);
}
