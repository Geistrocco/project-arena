"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const types: Record<string, string> = { "Verejný": "public", "Pozvánkový": "invitation", "Kombinovaný": "combined" };
const visibilities: Record<string, string> = { "Zobrazovať všetkým": "all", "Iba prijatým tímom": "accepted", "Nezobrazovať": "hidden" };

export async function createTournament(formData: FormData) {
  const text = (name: string, max: number) => String(formData.get(name) ?? "").trim().replace(/\s+/g, " ").slice(0, max);
  const number = (name: string) => Number(formData.get(name));
  const name = text("name", 140); const sport = text("sport", 40); const category = text("category", 30).toUpperCase();
  const date = text("date", 10); const place = text("place", 180); const capacity = number("teams");
  const fields = number("fields"); const duration = number("duration"); const fee = number("fee");
  const startTime = text("startTime", 5); const lunchBreak = formData.get("lunchBreak") === "on";
  const lunchStart = lunchBreak ? text("lunchStart", 5) : null; const lunchDuration = lunchBreak ? number("lunchDuration") : null;
  const tournamentType = types[text("type", 30)]; const visibility = visibilities[text("visibility", 40)];
  const clubIds = formData.getAll("clubIds").map(String).filter((id) => /^[a-z0-9][a-z0-9-]{0,99}$/i.test(id));
  const customTeams = formData.getAll("customTeams").map((item) => String(item).trim().slice(0, 180)).filter((item) => item.length >= 2);
  if (name.length < 3 || sport.length < 2 || !category || place.length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Skontrolujte základné údaje turnaja.");
  if (!Number.isInteger(capacity) || capacity < 2 || capacity > 256 || !Number.isInteger(fields) || fields < 1 || fields > 32 || !Number.isInteger(duration) || duration < 1 || duration > 240 || !Number.isFinite(fee) || fee < 0 || fee > 100000) throw new Error("Skontrolujte formát turnaja.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || (lunchBreak && (!lunchStart || !/^([01]\d|2[0-3]):[0-5]\d$/.test(lunchStart) || lunchDuration === null || !Number.isInteger(lunchDuration) || lunchDuration < 15 || lunchDuration > 180))) throw new Error("Skontrolujte časový plán turnaja.");
  if (!tournamentType || !visibility) throw new Error("Skontrolujte typ a viditeľnosť turnaja.");

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/prihlasenie?dovod=turnaj");
  const { data: slug, error } = await supabase.rpc("create_tournament_with_schedule", {
    p_name: name, p_sport: sport, p_category: category, p_event_date: date, p_place: place,
    p_capacity: capacity, p_playing_fields: fields, p_match_duration: duration, p_fee: fee,
    p_tournament_type: tournamentType, p_team_visibility: visibility,
    p_start_time: startTime, p_turnover_minutes: 3, p_schedule_slot_minutes: Math.ceil((duration + 3) / 5) * 5,
    p_has_lunch_break: lunchBreak, p_lunch_break_start: lunchStart, p_lunch_break_duration: lunchDuration,
    p_club_ids: clubIds, p_custom_teams: customTeams,
  });
  if (error || !slug) throw new Error("Turnaj sa nepodarilo uložiť.");
  revalidatePath("/"); revalidatePath("/ucet");
  redirect(`/turnaje/${slug}?stav=vytvoreny`);
}
