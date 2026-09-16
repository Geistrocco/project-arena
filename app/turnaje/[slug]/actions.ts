"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function saveMatchScore(formData: FormData) {
  const matchId = String(formData.get("matchId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const homeScore = Number(formData.get("homeScore"));
  const awayScore = Number(formData.get("awayScore"));
  if (!uuid.test(matchId) || !Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0) throw new Error("Skontrolujte výsledok zápasu.");
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/prihlasenie");
  const { error } = await supabase.rpc("update_tournament_match_score", { p_match_id: matchId, p_home_score: homeScore, p_away_score: awayScore });
  if (error) throw new Error("Výsledok sa nepodarilo uložiť.");
  revalidatePath(`/turnaje/${slug}`);
}

export async function swapGroupTeams(formData: FormData) {
  const firstId = String(formData.get("firstId") ?? "");
  const secondId = String(formData.get("secondId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  if (![firstId, secondId].every((id) => uuid.test(id)) || firstId === secondId) throw new Error("Vyberte dva rôzne tímy.");
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/prihlasenie");
  const { error } = await supabase.rpc("swap_tournament_group_teams", { p_first_id: firstId, p_second_id: secondId });
  if (error) throw new Error("Tímy sa nepodarilo vymeniť.");
  revalidatePath(`/turnaje/${slug}`);
}

export async function setMatchStream(formData: FormData) {
  const matchId = String(formData.get("matchId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const streamUrl = String(formData.get("streamUrl") ?? "").trim().slice(0, 500);
  const streamStatus = String(formData.get("streamStatus") ?? "");
  const remove = formData.get("remove") === "true";
  if (!uuid.test(matchId) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Neplatný zápas.");
  if (!remove) {
    let parsed: URL;
    try { parsed = new URL(streamUrl); } catch { throw new Error("Zadajte platný odkaz na prenos."); }
    if (parsed.protocol !== "https:" || !["scheduled", "live", "ended"].includes(streamStatus)) throw new Error("Prenos musí používať bezpečný HTTPS odkaz.");
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/prihlasenie");
  const { error } = await supabase.rpc("set_tournament_match_stream", {
    p_match_id: matchId,
    p_stream_url: remove ? null : streamUrl,
    p_stream_status: remove ? null : streamStatus,
  });
  if (error) throw new Error("Prenos sa nepodarilo uložiť.");
  revalidatePath(`/turnaje/${slug}`);
}
