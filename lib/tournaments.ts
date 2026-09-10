import { tournaments as demoTournaments } from "@/data/tournaments";
import { createClient } from "@/lib/supabase/server";
import type { Tournament } from "@/types/tournament";
import type { GameSystem } from "@/lib/tournament-schedule";

type TournamentRow = { slug: string; name: string; sport: string; category: string; event_date: string; place: string; country: "Slovensko" | "Česko"; registered_count: number; capacity: number; fee: number | string; organizer_name: string; playing_fields: number; match_duration: number; start_time?: string; turnover_minutes?: number; schedule_slot_minutes?: number; has_lunch_break?: boolean; lunch_break_start?: string | null; lunch_break_duration?: number | null; game_system?: GameSystem; qualifiers_per_group?: number | null; third_place_match?: boolean; tournament_invited_teams?: { team_name: string }[] };
export type TournamentRepeatSource = {
  slug: string;
  name: string;
  sport: string;
  category: string;
  place: string;
  capacity: number;
  playingFields: number;
  matchDuration: number;
  startTime: string;
  lunchBreak: boolean;
  lunchStart: string;
  lunchDuration: number;
  gameSystem: GameSystem;
  qualifiersPerGroup: number;
  thirdPlaceMatch: boolean;
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
    rules: [`Počet hracích plôch: ${row.playing_fields}`, `Dĺžka zápasu: ${row.match_duration} minút`, `Systém hry: ${gameSystemLabel(row.game_system)}`, ...(row.start_time ? [`Začiatok zápasov: ${row.start_time.slice(0, 5)}`, `Časový blok: ${row.schedule_slot_minutes} minút (prestávka ${row.turnover_minutes} minút)`] : []), ...(row.has_lunch_break ? [`Obedná prestávka: ${row.lunch_break_start?.slice(0, 5)}, ${row.lunch_break_duration} minút`] : [])],
    participants: row.tournament_invited_teams?.map((team) => team.team_name) ?? [] };
}

export async function getPublicTournaments() {
  const supabase = await createClient();
  const { data } = await supabase.from("tournaments").select("slug,name,sport,category,event_date,place,country,registered_count,capacity,fee,organizer_name,playing_fields,match_duration,start_time,turnover_minutes,schedule_slot_minutes,has_lunch_break,lunch_break_start,lunch_break_duration,game_system,qualifiers_per_group,third_place_match").order("event_date");
  const saved = ((data as TournamentRow[] | null) ?? []).map(mapTournament);
  return [...saved, ...demoTournaments.filter((demo) => !saved.some((item) => item.slug === demo.slug))];
}

export async function getTournamentBySlug(slug: string) {
  const demo = demoTournaments.find((item) => item.slug === slug);
  const supabase = await createClient();
  const { data } = await supabase.from("tournaments").select("slug,name,sport,category,event_date,place,country,registered_count,capacity,fee,organizer_name,playing_fields,match_duration,start_time,turnover_minutes,schedule_slot_minutes,has_lunch_break,lunch_break_start,lunch_break_duration,game_system,qualifiers_per_group,third_place_match,tournament_invited_teams(team_name)").eq("slug", slug).maybeSingle();
  return data ? mapTournament(data as TournamentRow) : demo ?? null;
}

export async function getTournamentRepeatSource(slug: string): Promise<TournamentRepeatSource | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return null;

  const { data } = await supabase
    .from("tournaments")
    .select("slug,organizer_id,name,sport,category,place,capacity,playing_fields,match_duration,start_time,has_lunch_break,lunch_break_start,lunch_break_duration,game_system,qualifiers_per_group,third_place_match,fee,tournament_type,team_visibility,tournament_invited_teams(club_id,team_name)")
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
    startTime: String(data.start_time ?? "09:00").slice(0, 5),
    lunchBreak: Boolean(data.has_lunch_break),
    lunchStart: String(data.lunch_break_start ?? "12:00").slice(0, 5),
    lunchDuration: Number(data.lunch_break_duration ?? 45),
    gameSystem: (data.game_system ?? "groups_playoff") as GameSystem,
    qualifiersPerGroup: Number(data.qualifiers_per_group ?? 2),
    thirdPlaceMatch: Boolean(data.third_place_match),
    fee: Number(data.fee),
    tournamentType: tournamentTypes[data.tournament_type as keyof typeof tournamentTypes],
    teamVisibility: teamVisibilities[data.team_visibility as keyof typeof teamVisibilities],
    clubIds: teams.flatMap((team) => team.club_id ? [team.club_id] : []),
    customTeams: teams.flatMap((team) => team.club_id ? [] : [team.team_name]),
  };
}

function gameSystemLabel(system?: GameSystem) { return ({ groups_playoff: "Skupiny + play-off", round_robin: "Každý s každým", groups_placement: "Skupiny + zápasy o umiestnenie" } as const)[system ?? "groups_playoff"]; }
