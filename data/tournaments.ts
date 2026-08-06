import type { Tournament } from "@/types/tournament";

export const tournaments: Tournament[] = [
  {
    slug: "summer-cup-2027", name: "Summer Cup 2027", sport: "Futbal", category: "U11",
    date: "2027-06-19", displayDate: "19. – 20. jún 2027", city: "Bratislava", country: "Slovensko",
    registered: 8, capacity: 12, participantLabel: "tímov", fee: 180, status: "Otvorená",
    organizer: "Arena Sports, o. z.",
    description: "Dvojdňový mládežnícky turnaj plný kvalitného futbalu, nových súperov a skvelej atmosféry. Hrá sa v modernom areáli s prírodnou trávou.",
    rules: ["Hrá sa 7 + 1 na polovici ihriska", "Hrací čas je 2 × 15 minút", "Minimálne 4 zápasy pre každý tím", "Súpiska môže obsahovať najviac 14 hráčov"],
    participants: [],
    participantClubIds: ["dac-1904", "slovan-bratislava", "spartak-trnava", "as-trencin", "inter-bratislava", "petrzalka", "karlova-ves", "banik-prievidza"],
  },
  {
    slug: "moravia-hockey-cup", name: "Moravia Hockey Cup", sport: "Hokej", category: "U12",
    date: "2027-08-14", displayDate: "14. – 15. august 2027", city: "Brno", country: "Česko",
    registered: 7, capacity: 8, participantLabel: "tímov", fee: 320, status: "Posledné miesta", organizer: "HC Moravia",
    description: "Medzinárodný mládežnícky hokejový turnaj v srdci Moravy.", rules: ["Hrá sa 3 × 12 minút", "Každý tím odohrá najmenej 4 zápasy"], participants: ["HC Kometa Brno", "HC Olomouc", "HK Nitra", "Dukla Trenčín", "HC Zlín", "HC Vítkovice", "HK Skalica"],
  },
  {
    slug: "florbal-open", name: "Florbal Open", sport: "Florbal", category: "U13",
    date: "2027-09-04", displayDate: "4. september 2027", city: "Olomouc", country: "Česko",
    registered: 10, capacity: 16, participantLabel: "tímov", fee: 120, status: "Otvorená", organizer: "FBC Olomouc",
    description: "Jednodňový florbalový festival pre mladé talenty.", rules: ["Hrá sa 5 + 1", "Hrací čas je 2 × 12 minút"], participants: ["FBC Olomouc", "Tatran Střešovice", "1. SC Vítkovice"],
  },
  {
    slug: "junior-tennis-masters", name: "Junior Tennis Masters", sport: "Tenis", category: "U14",
    date: "2027-07-10", displayDate: "10. – 11. júl 2027", city: "Trnava", country: "Slovensko",
    registered: 12, capacity: 16, participantLabel: "hráčov", fee: 65, status: "Otvorená", organizer: "TC Trnava",
    description: "Víkendový tenisový turnaj jednotlivcov na antukových kurtoch.", rules: ["Skupinová fáza a play-off", "Hrá sa na dva víťazné sety"], participants: ["Martin Kováč", "Jakub Novák", "Tomáš Urban"],
  },
  {
    slug: "winter-football-cup", name: "Winter Football Cup", sport: "Futbal", category: "U10",
    date: "2027-12-04", displayDate: "4. december 2027", city: "Senec", country: "Slovensko",
    registered: 8, capacity: 12, participantLabel: "tímov", fee: 150, status: "Otvorená", organizer: "FC Senec",
    description: "Zimný futbalový turnaj v krytej hale pre kategóriu U10.", rules: ["Hrá sa 4 + 1", "Hrací čas je 1 × 18 minút"], participants: ["FC Senec", "FC ŠTK 1914 Šamorín", "Inter Bratislava"],
  },
  {
    slug: "prague-youth-trophy", name: "Prague Youth Trophy", sport: "Futbal", category: "U13",
    date: "2027-05-22", displayDate: "22. – 23. máj 2027", city: "Praha", country: "Česko",
    registered: 16, capacity: 16, participantLabel: "tímov", fee: 210, status: "Plná kapacita", organizer: "Prague Football Academy",
    description: "Prestížny mládežnícky turnaj s tímami z celej strednej Európy.", rules: ["Hrá sa 8 + 1", "Hrací čas je 2 × 18 minút"], participants: ["AC Sparta Praha", "SK Slavia Praha", "Bohemians Praha 1905"],
  },
];

export const sports = ["Všetky športy", ...Array.from(new Set(tournaments.map((item) => item.sport)))];
