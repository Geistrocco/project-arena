import { withdrawalLabels, type WithdrawalRule } from "@/lib/tournament-incidents";
import { rankingLabels, type RankingRule } from "@/lib/tournament-ranking";
import { tournaments as demoTournaments } from "@/data/tournaments";
import { createClient } from "@/lib/supabase/server";
import type { Tournament } from "@/types/tournament";
import type { GameSystem } from "@/lib/tournament-schedule";
import type { TournamentCountry } from "@/lib/tournament-location";
import type { FormatSettings } from "@/lib/tournament-format";
import { TENNIS_SYSTEMS, TENNIS_SCORING, TENNIS_RANKING_LABEL } from "@/lib/tennis";

type TournamentRow = { withdrawal_rule?: WithdrawalRule; forfeit_score?: number; ranking_rule?: RankingRule; slug: string; organizer_id?: string; name: string; sport: string; category: string; event_date: string; place: string; country: TournamentCountry; region: string | null; surface: string | null; registered_count: number; capacity: number; fee: number | string; organizer_name: string; playing_fields: number; match_duration: number; start_time?: string; turnover_minutes?: number; schedule_slot_minutes?: number; has_lunch_break?: boolean; lunch_break_start?: string | null; lunch_break_duration?: number | null; game_system?: GameSystem; format_settings?: FormatSettings | null; qualifiers_per_group?: number | null; third_place_match?: boolean; tournament_invited_teams?: { team_name: string }[] };
export type TournamentRepeatSource = {
  rankingRule?: RankingRule;
  withdrawalRule?: WithdrawalRule;
  forfeitScore?: number;
  slug: string;
  name: string;
  sport: string;
  category: string;
  place: string;
  country: TournamentCountry;
  region: string | null;
  surface: string | null;
  formatSettings: FormatSettings | null;
  preferredFinish: string | null;
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
export type TournamentEditSource = TournamentRepeatSource & { eventDate: string; hasResults: boolean; rulesFrozen?: boolean };
const date = new Intl.DateTimeFormat("sk-SK", { dateStyle: "long", timeZone: "Europe/Bratislava" });

function mapTournament(row: TournamentRow, userId?: string): Tournament {
  const registered = Number(row.registered_count);
  return { slug: row.slug, name: row.name, sport: row.sport, category: row.category, date: row.event_date,
    displayDate: date.format(new Date(`${row.event_date}T12:00:00Z`)), city: row.place, country: row.country, region: row.region, surface: row.surface,
    registered, capacity: Number(row.capacity), participantLabel: row.sport === "Tenis" ? (row.format_settings?.tennis?.discipline === "doubles" ? "dvojíc" : "hráčov") : "tímov", fee: Number(row.fee),
    status: registered >= Number(row.capacity) ? "Plná kapacita" : "Otvorená", organizer: row.organizer_name,
    description: `Turnaj ${row.name} v kategórii ${row.category}. Organizátor postupne doplní ďalšie informácie.`,
    rules: [...(row.sport === "Tenis" ? [TENNIS_RANKING_LABEL, `Systém: ${TENNIS_SYSTEMS[row.format_settings?.tennis?.system ?? "round_robin"]}`, `Bodovanie: ${TENNIS_SCORING[row.format_settings?.tennis?.scoring ?? "set6"]}`] : []),...(row.sport === "Tenis" ? [] : [`Odstúpenie: ${withdrawalLabels[row.withdrawal_rule ?? "keep"]}`, `Kontumačné skóre: ${row.forfeit_score ?? 3}:0`]),...(row.sport === "Tenis" ? [`Rozhodujúci gem: ${row.format_settings?.tennis?.noAd ? "No-Ad" : "s výhodou"}`] : [`Rovnosť bodov: ${rankingLabels[row.ranking_rule ?? "legacy"]}`]), `${row.sport === "Tenis" ? "Počet kurtov" : "Počet hracích plôch"}: ${row.playing_fields}`, `${row.sport === "Tenis" ? "Odhad trvania zápasu" : "Dĺžka zápasu"}: ${row.match_duration} minút`, ...(row.sport === "Tenis" ? [] : [`Systém hry: ${row.format_settings?.mode === "custom" ? `Vlastné skupiny (${row.format_settings.sizes?.join(" + ") ?? ""})` : gameSystemLabel(row.game_system)}`]), ...(row.start_time ? [`Začiatok zápasov: ${row.start_time.slice(0, 5)}`, `Časový blok: ${row.schedule_slot_minutes} minút (prestávka ${row.turnover_minutes} minút)`] : []), ...(row.has_lunch_break ? [`Obedná prestávka: ${row.lunch_break_start?.slice(0, 5)}, ${row.lunch_break_duration} minút`] : [])],
    participants: row.tournament_invited_teams?.map((team) => team.team_name) ?? [],
    isOwned: Boolean(userId && row.organizer_id === userId) };
}

export async function getPublicTournaments() {
  const supabase = await createClient();
  const [{ data }, { data: auth }] = await Promise.all([
    supabase.from("tournaments").select("slug,organizer_id,name,sport,category,ranking_rule,withdrawal_rule,forfeit_score,event_date,place,country,region,surface,format_settings,registered_count,capacity,fee,organizer_name,playing_fields,match_duration,start_time,turnover_minutes,schedule_slot_minutes,has_lunch_break,lunch_break_start,lunch_break_duration,game_system,qualifiers_per_group,third_place_match").order("event_date"),
    supabase.auth.getClaims(),
  ]);
  const userId = typeof auth?.claims?.sub === "string" ? auth.claims.sub : undefined;
  const saved = (await withApplicationCounts((data as TournamentRow[] | null) ?? [],supabase)).map((row) => mapTournament(row, userId));
  saved.sort((a, b) => Number(b.isOwned) - Number(a.isOwned));
  return [...saved, ...demoTournaments.filter((demo) => !saved.some((item) => item.slug === demo.slug))];
}

export async function getMyTournaments(): Promise<Tournament[] | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (typeof userId !== "string") return null;
  const { data } = await supabase.from("tournaments")
    .select("slug,organizer_id,name,sport,category,ranking_rule,withdrawal_rule,forfeit_score,event_date,place,country,region,surface,format_settings,registered_count,capacity,fee,organizer_name,playing_fields,match_duration,start_time,turnover_minutes,schedule_slot_minutes,has_lunch_break,lunch_break_start,lunch_break_duration,game_system,qualifiers_per_group,third_place_match")
    .eq("organizer_id", userId)
    .order("event_date", { ascending: false });
  return (await withApplicationCounts((data as TournamentRow[] | null) ?? [],supabase)).map((row) => mapTournament(row, userId));
}

export async function getTournamentBySlug(slug: string) {
  const demo = demoTournaments.find((item) => item.slug === slug);
  const supabase = await createClient();
  const { data } = await supabase.from("tournaments").select("slug,name,sport,category,ranking_rule,withdrawal_rule,forfeit_score,event_date,place,country,region,surface,format_settings,registered_count,capacity,fee,organizer_name,playing_fields,match_duration,start_time,turnover_minutes,schedule_slot_minutes,has_lunch_break,lunch_break_start,lunch_break_duration,game_system,qualifiers_per_group,third_place_match,tournament_invited_teams(team_name)").eq("slug", slug).maybeSingle();
  return data ? mapTournament((await withApplicationCounts([data as TournamentRow],supabase))[0]) : demo ?? null;
}

export async function getTournamentRepeatSource(slug: string): Promise<TournamentRepeatSource | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return null;

  const { data } = await supabase
    .from("tournaments")
    .select("slug,organizer_id,name,sport,category,ranking_rule,withdrawal_rule,forfeit_score,place,country,region,surface,format_settings,preferred_finish,capacity,playing_fields,match_duration,start_time,has_lunch_break,lunch_break_start,lunch_break_duration,game_system,qualifiers_per_group,third_place_match,fee,tournament_type,team_visibility,tournament_invited_teams(club_id,team_name)")
    .eq("slug", slug)
    .eq("organizer_id", userId)
    .maybeSingle();
  if (!data) return null;

  const teams = (data.tournament_invited_teams ?? []) as { club_id: string | null; team_name: string }[];
  const tournamentTypes = { public: "Verejný", invitation: "Pozvánkový", combined: "Kombinovaný" } as const;
  const teamVisibilities = { all: "Zobrazovať všetkým", accepted: "Iba prijatým tímom", hidden: "Nezobrazovať" } as const;
  return {
    rankingRule: data.ranking_rule as RankingRule, withdrawalRule: data.withdrawal_rule as WithdrawalRule, forfeitScore: data.forfeit_score,
    slug: data.slug,
    name: data.name,
    sport: data.sport,
    category: data.category,
    place: data.place,
    country: data.country as TournamentCountry,
    region: data.region,
    surface: data.surface,
    formatSettings: data.format_settings as TournamentRepeatSource["formatSettings"],
    preferredFinish: data.preferred_finish ? String(data.preferred_finish).slice(0, 5) : null,
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

export async function getTournamentEditSource(slug: string): Promise<TournamentEditSource | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return null;
  const { data } = await supabase.from("tournaments").select("id,slug,organizer_id,name,sport,category,ranking_rule,withdrawal_rule,forfeit_score,event_date,place,country,region,surface,format_settings,preferred_finish,capacity,playing_fields,match_duration,start_time,has_lunch_break,lunch_break_start,lunch_break_duration,game_system,qualifiers_per_group,third_place_match,fee,tournament_type,team_visibility,tournament_invited_teams(club_id,team_name)").eq("slug", slug).eq("organizer_id", userId).maybeSingle();
  if (!data) return null;
  const { count } = await supabase.from("tournament_matches").select("id", { count: "exact", head: true }).eq("tournament_id", data.id).eq("status", "finished");
  const { data: incidentRules, error: incidentRulesError } = await supabase.rpc("get_tournament_incidents", { p_slug: slug });
  if (incidentRulesError) throw new Error("Pravidlá turnaja sa nepodarilo načítať.");
  const teams = (data.tournament_invited_teams ?? []) as { club_id: string | null; team_name: string }[];
  const tournamentTypes = { public: "Verejný", invitation: "Pozvánkový", combined: "Kombinovaný" } as const;
  const teamVisibilities = { all: "Zobrazovať všetkým", accepted: "Iba prijatým tímom", hidden: "Nezobrazovať" } as const;
  return { rankingRule: data.ranking_rule as RankingRule, withdrawalRule: data.withdrawal_rule as WithdrawalRule, forfeitScore: data.forfeit_score, slug: data.slug, name: data.name, sport: data.sport, category: data.category, eventDate: data.event_date, place: data.place, country: data.country as TournamentCountry, region: data.region, surface: data.surface, formatSettings: data.format_settings as TournamentRepeatSource["formatSettings"], preferredFinish: data.preferred_finish ? String(data.preferred_finish).slice(0, 5) : null,
    capacity: Number(data.capacity), playingFields: Number(data.playing_fields), matchDuration: Number(data.match_duration), startTime: String(data.start_time ?? "09:00").slice(0, 5),
    lunchBreak: Boolean(data.has_lunch_break), lunchStart: String(data.lunch_break_start ?? "12:00").slice(0, 5), lunchDuration: Number(data.lunch_break_duration ?? 45),
    gameSystem: (data.game_system ?? "groups_playoff") as GameSystem, qualifiersPerGroup: Number(data.qualifiers_per_group ?? 2), thirdPlaceMatch: Boolean(data.third_place_match), fee: Number(data.fee),
    tournamentType: tournamentTypes[data.tournament_type as keyof typeof tournamentTypes], teamVisibility: teamVisibilities[data.team_visibility as keyof typeof teamVisibilities],
    clubIds: teams.flatMap((team) => team.club_id ? [team.club_id] : []), customTeams: teams.flatMap((team) => team.club_id ? [] : [team.team_name]), hasResults: (count ?? 0) > 0, rulesFrozen: Boolean(incidentRules?.rules_frozen) };
}

async function withApplicationCounts(rows: TournamentRow[], supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.rpc("get_tournament_application_counts");
  const counts = new Map(((data ?? []) as { slug: string; reserved: number }[]).map(item => [item.slug,item.reserved]));
  return rows.map(row => ({ ...row, registered_count: counts.get(row.slug) ?? row.registered_count }));
}
