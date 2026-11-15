export type ClubTeamOption = { id: string; name: string; category: string; season: string };

export interface Club {
  teams?: ClubTeamOption[];
  id: string;
  name: string;
  shortName: string;
  sport: string;
  country: string;
  city: string;
  logoUrl?: string | null;
  logoPlaceholder: string;
  source?: string;
  sourceId?: string | null;
  sourceUrl?: string | null;
}
