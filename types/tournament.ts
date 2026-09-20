import type { TournamentCountry } from "@/lib/tournament-location";

export type RegistrationStatus = "Otvorená" | "Posledné miesta" | "Plná kapacita";

export interface Tournament {
  slug: string;
  name: string;
  sport: string;
  category: string;
  date: string;
  displayDate: string;
  city: string;
  country: TournamentCountry;
  region?: string | null;
  surface?: string | null;
  registered: number;
  capacity: number;
  participantLabel: "tímov" | "hráčov";
  fee: number;
  status: RegistrationStatus;
  organizer: string;
  description: string;
  rules: string[];
  participants: string[];
  participantClubIds?: string[];
}
