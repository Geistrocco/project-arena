import { tournaments as demoTournaments } from "@/data/tournaments";
import { createClient } from "@/lib/supabase/server";
import type { Tournament } from "@/types/tournament";

type TournamentRow = { slug: string; name: string; sport: string; category: string; event_date: string; place: string; country: "Slovensko" | "Česko"; registered_count: number; capacity: number; fee: number | string; organizer_name: string; playing_fields: number; match_duration: number; tournament_invited_teams?: { team_name: string }[] };
export type TournamentRepeatSource = {
  slug: string;
  name: string;
  sport: string;
  category: string;
  place: string;
  capacity: number;
  playingFields: number;
  matchDuration: number;
  fee: number;
  tournamentType: "Verejný" | "Pozvánkový" | "Kombinovaný";
  teamVisibility: "Zobrazovať všetkým" | "Iba prijatým tímom" | "Nezobrazovať";
  clubIds: string[];
  customTeams: string[];
};
const date = new Intl.DateTimeFormat("sk-SK", { dateStyle: "long", timeZone: "Europe/Bratislava" });

function mapTournament(row: TournamentRow): Tournament {
  const registered = Number(row.registered_count);
  return { slug: row.slug, name: row.name, sport: row.sport, category: row.category, date: row.event_date,
    displayDate: date.format(new Date(`${row.event_date}T12:00:00Z`)), city: row.place, country: row.country,
    registered, capacity: Number(row.capacity), participantLabel: "tímov", fee: Number(row.fee),
    status: registered >= Number(row.capacity) ? "Plná kapacita" : "Otvorená", organizer: row.organizer_name,
    description: `Turnaj ${row.name} v kategórii ${row.category}. Organizátor postupne doplní ďalšie informácie.`,
    rules: [`Počet hracích plôch: ${row.playing_fields}`, `Dĺžka zápasu: ${row.match_duration} minút`],
    participants: row.tournament_invited_teams?.map((team) => team.team_name) ?? [] };
}

export async function getPublicTournaments() {
  const supabase = await createClient();
  const { data } = await supabase.from("tournaments").select("slug,name,sport,category,event_date,place,country,registered_count,capacity,fee,organizer_name,playing_fields,match_duration").order("event_date");
  const saved = ((data as TournamentRow[] | null) ?? []).map(mapTournament);
  return [...saved, ...demoTournaments.filter((demo) => !saved.some((item) => item.slug === demo.slug))];
}

export async function getTournamentBySlug(slug: string) {
  const demo = demoTournaments.find((item) => item.slug === slug);
  const supabase = await createClient();
  const { data } = await supabase.from("tournaments").select("slug,name,sport,category,event_date,place,country,registered_count,capacity,fee,organizer_name,playing_fields,match_duration,tournament_invited_teams(team_name)").eq("slug", slug).maybeSingle();
  return data ? mapTournament(data as TournamentRow) : demo ?? null;
}

export async function getTournamentRepeatSource(slug: string): Promise<TournamentRepeatSource | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return null;

  const { data } = await supabase
    .from("tournaments")
    .select("slug,organizer_id,name,sport,category,place,capacity,playing_fields,match_duration,fee,tournament_type,team_visibility,tournament_invited_teams(club_id,team_name)")
    .eq("slug", slug)
    .eq("organizer_id", userId)
    .maybeSingle();
  if (!data) return null;

  const teams = (data.tournament_invited_teams ?? []) as { club_id: string | null; team_name: string }[];
  const tournamentTypes = { public: "Verejný", invitation: "Pozvánkový", combined: "Kombinovaný" } as const;
  const teamVisibilities = { all: "Zobrazovať všetkým", accepted: "Iba prijatým tímom", hidden: "Nezobrazovať" } as const;
  return {
    slug: data.slug,
    name: data.name,
    sport: data.sport,
    category: data.category,
    place: data.place,
    capacity: Number(data.capacity),
    playingFields: Number(data.playing_fields),
    matchDuration: Number(data.match_duration),
    fee: Number(data.fee),
    tournamentType: tournamentTypes[data.tournament_type as keyof typeof tournamentTypes],
    teamVisibility: teamVisibilities[data.team_visibility as keyof typeof teamVisibilities],
    clubIds: teams.flatMap((team) => team.club_id ? [team.club_id] : []),
    customTeams: teams.flatMap((team) => team.club_id ? [] : [team.team_name]),
  };
}