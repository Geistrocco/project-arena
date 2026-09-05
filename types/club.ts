export interface Club {
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
