import { footballClubs } from "@/data/clubs";
import { createClient } from "@/lib/supabase/server";
import type { Club } from "@/types/club";

type ClubRow = {
  id: string;
  name: string;
  short_name: string;
  sport: string;
  country: string;
  city: string;
  logo_url: string | null;
  logo_placeholder: string;
  source: string;
  source_id: string | null;
  source_url: string | null;
};

export async function getActiveClubs(): Promise<Club[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return footballClubs;
  }

  try {
    const supabase = await createClient();
    // The full SFZ directory exceeds the Data API's default 1,000-row limit.
    // A stable unique order prevents skipping clubs at page boundaries.
    const data: ClubRow[] = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const page = await supabase
        .from("clubs")
        .select("id,name,short_name,sport,country,city,logo_url,logo_placeholder,source,source_id,source_url")
        .eq("status", "active")
        .order("id")
        .range(offset, offset + pageSize - 1)
        .returns<ClubRow[]>();
      if (page.error) throw page.error;
      data.push(...(page.data ?? []));
      if (!page.data || page.data.length < pageSize) break;
    }
    if (!data.length) return footballClubs;
    data.sort((a, b) => a.name.localeCompare(b.name, "sk") || a.id.localeCompare(b.id));

    return data.map((club) => ({
      id: club.id,
      name: club.name,
      shortName: club.short_name,
      sport: club.sport,
      country: club.country,
      city: club.city,
      logoUrl: club.logo_url,
      logoPlaceholder: club.logo_placeholder,
      source: club.source,
      sourceId: club.source_id,
      sourceUrl: club.source_url,
    }));
  } catch {
    return footballClubs;
  }
}

// Tournament invitations must identify a squad, never infer one from its club.
export async function getTournamentClubs(): Promise<Club[]> {
  const clubs = await getActiveClubs();
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return clubs;
  const supabase = await createClient();
  const byClub = new Map<string, NonNullable<Club["teams"]>>();
  for (let offset = 0; ; offset += 500) {
    const {data, error} = await supabase.from("club_teams")
      .select("id,club_id,name,category,season").eq("status", "active")
      .order("id").range(offset, offset + 499);
    if (error) throw new Error("Kategórie klubov sa nepodarilo načítať. Skús stránku obnoviť.");
    for (const team of data ?? []) {
      const teams = byClub.get(team.club_id) ?? [];
      teams.push({id:team.id, name:team.name, category:team.category, season:team.season});
      byClub.set(team.club_id, teams);
    }
    if (!data || data.length < 500) break;
  }
  return clubs.map(club => ({...club, teams:(byClub.get(club.id) ?? []).sort((a,b) =>
    b.season.localeCompare(a.season) || a.category.localeCompare(b.category,"sk",{numeric:true}) || a.name.localeCompare(b.name,"sk"))}));
}
