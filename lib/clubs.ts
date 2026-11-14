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
