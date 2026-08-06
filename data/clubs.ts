import type { Club } from "@/types/club";

export const footballClubs: Club[] = [
  { id: "dac-1904", name: "FK DAC 1904 Dunajská Streda", shortName: "DAC 1904", sport: "football", country: "Slovensko", city: "Dunajská Streda", logoPlaceholder: "DAC" },
  { id: "slovan-bratislava", name: "ŠK Slovan Bratislava futbal", shortName: "Slovan", sport: "football", country: "Slovensko", city: "Bratislava", logoPlaceholder: "ŠKB" },
  { id: "spartak-trnava", name: "FC Spartak Trnava", shortName: "Spartak", sport: "football", country: "Slovensko", city: "Trnava", logoPlaceholder: "FCS" },
  { id: "as-trencin", name: "AS Trenčín", shortName: "Trenčín", sport: "football", country: "Slovensko", city: "Trenčín", logoPlaceholder: "AST" },
  { id: "inter-bratislava", name: "FK Inter Bratislava", shortName: "Inter", sport: "football", country: "Slovensko", city: "Bratislava", logoPlaceholder: "FKI" },
  { id: "petrzalka", name: "FC Petržalka", shortName: "Petržalka", sport: "football", country: "Slovensko", city: "Bratislava", logoPlaceholder: "FCP" },
  { id: "karlova-ves", name: "FKM Karlova Ves Bratislava", shortName: "Karlova Ves", sport: "football", country: "Slovensko", city: "Bratislava", logoPlaceholder: "FKM" },
  { id: "banik-prievidza", name: "FC Baník Prievidza", shortName: "Baník", sport: "football", country: "Slovensko", city: "Prievidza", logoPlaceholder: "FCB" },
  { id: "fc-nitra", name: "FC Nitra", shortName: "Nitra", sport: "football", country: "Slovensko", city: "Nitra", logoPlaceholder: "FCN" },
  { id: "vion-zlate-moravce", name: "FC ViOn Zlaté Moravce – Vráble", shortName: "ViOn", sport: "football", country: "Slovensko", city: "Zlaté Moravce", logoPlaceholder: "VIO" },
  { id: "kfc-komarno", name: "KFC Komárno futbal", shortName: "Komárno", sport: "football", country: "Slovensko", city: "Komárno", logoPlaceholder: "KFC" },
  { id: "sdm-domino", name: "SDM Domino", shortName: "Domino", sport: "football", country: "Slovensko", city: "Bratislava", logoPlaceholder: "SDM" },
  { id: "slovan-levice", name: "FK Slovan Levice", shortName: "Levice", sport: "football", country: "Slovensko", city: "Levice", logoPlaceholder: "FKL" },
  { id: "msk-puchov", name: "MŠK Púchov", shortName: "Púchov", sport: "football", country: "Slovensko", city: "Púchov", logoPlaceholder: "MŠK" },
  { id: "raca-bratislava", name: "FK Rača Bratislava", shortName: "Rača", sport: "football", country: "Slovensko", city: "Bratislava", logoPlaceholder: "FKR" },
  { id: "spartak-dubnica", name: "FK Spartak Dubnica nad Váhom", shortName: "Dubnica", sport: "football", country: "Slovensko", city: "Dubnica nad Váhom", logoPlaceholder: "FSD" },
  { id: "mfk-skalica", name: "MFK Skalica", shortName: "Skalica", sport: "football", country: "Slovensko", city: "Skalica", logoPlaceholder: "MFK" },
  { id: "msk-senec", name: "MŠK Senec", shortName: "Senec", sport: "football", country: "Slovensko", city: "Senec", logoPlaceholder: "MŠK" },
  { id: "stk-samorin", name: "FC ŠTK 1914 Šamorín", shortName: "Šamorín", sport: "football", country: "Slovensko", city: "Šamorín", logoPlaceholder: "ŠTK" },
  { id: "povazska-bystrica", name: "MŠK Považská Bystrica", shortName: "Považská Bystrica", sport: "football", country: "Slovensko", city: "Považská Bystrica", logoPlaceholder: "PBY" },
  { id: "fc-topolcany", name: "FC Topoľčany", shortName: "Topoľčany", sport: "football", country: "Slovensko", city: "Topoľčany", logoPlaceholder: "FCT" },
];

export const clubsById = new Map(footballClubs.map((club) => [club.id, club]));
