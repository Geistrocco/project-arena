"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sendTournamentScorekeeperNotification } from "@/lib/email/tournament-scorekeeper-notification";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type ScorekeeperActionState = { success?: boolean; message?: string };

export async function saveTennisMatchScore(_previous: ScorekeeperActionState, formData: FormData): Promise<ScorekeeperActionState> {
  const slug = String(formData.get("slug") ?? ""); const id = String(formData.get("matchId") ?? "");
  if (!slugPattern.test(slug) || !uuid.test(id)) return { message: "Neplatný zápas." };
  const sets: { home: number; away: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const h = String(formData.get(`home${i}`) ?? ""); const a = String(formData.get(`away${i}`) ?? "");
    if (!h && !a) continue;
    if (!/^\d{1,2}$/.test(h) || !/^\d{1,2}$/.test(a) || (i > 0 && sets.length !== i)) return { message: "Vyplňte oba výsledky setu postupne." };
    sets.push({ home: Number(h), away: Number(a) });
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_tennis_match_score", { p_match_id: id, p_sets: sets });
  if (error?.message.includes("RESULTS_LOCKED")) return { message: "Výsledky sú uzamknuté. Organizátor ich musí odomknúť." };
  if (error) return { message: "Výsledok sa nepodarilo uložiť. Skontrolujte dohrané sety a zvolené bodovanie; tretí set je match-tiebreak do 10." };
  revalidatePath(`/turnaje/${slug}`); revalidatePath(`/turnaje/${slug}/administracia`);
  return { success: true, message: "Výsledok bol uložený." };
}

export async function setTournamentResultLock(_previous: ScorekeeperActionState, formData: FormData): Promise<ScorekeeperActionState> {
  const slug = String(formData.get("slug") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!slugPattern.test(slug) || !["lock", "unlock"].includes(decision)) return { message: "Neplatná požiadavka." };
  if (formData.get("confirmed") !== "yes") return { message: "Potvrďte zmenu stavu výsledkov." };
  if (decision === "unlock" && (reason.length < 5 || reason.length > 1000)) return { message: "Uveďte dôvod odomknutia (5 až 1 000 znakov)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_tournament_result_lock", { p_slug: slug, p_locked: decision === "lock", p_reason: reason || null });
  if (error?.message.includes("UNFINISHED_MATCHES")) return { message: "Turnaj nemožno ukončiť. Doplňte výsledky všetkých zápasov." };
  if (error?.message.includes("LOCK_STATE_CHANGED")) return { message: "Stav sa medzičasom zmenil. Obnovte stránku." };
  if (error) return { message: "Zmenu sa nepodarilo uložiť. Uzamknutie spravuje iba organizátor turnaja." };
  revalidatePath(`/turnaje/${slug}`);
  revalidatePath(`/turnaje/${slug}/administracia`);
  revalidatePath(`/turnaje/${slug}/upravit`);
  revalidatePath(`/turnaje/${slug}/vysledky.pdf`);
  return { success: true, message: decision === "lock" ? "Turnaj bol ukončený a výsledky sú potvrdené a uzamknuté." : "Výsledky boli odomknuté na opravu. Po úprave ich znovu potvrďte." };
}

export async function grantTournamentScorekeeper(_previous: ScorekeeperActionState, formData: FormData): Promise<ScorekeeperActionState> {
  const slug = String(formData.get("slug") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!slugPattern.test(slug) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { message: "Zadajte platný e-mail." };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/prihlasenie");
  const { data, error } = await supabase.rpc("grant_tournament_scorekeeper", { p_slug: slug, p_email: email });
  if (error?.message.includes("USER_NOT_FOUND")) return { message: "Používateľ s týmto potvrdeným e-mailom nie je zaregistrovaný alebo je jeho účet pozastavený." };
  if (error?.message.includes("ALREADY_ORGANIZER")) return { message: "Tento používateľ je organizátorom turnaja a oprávnenie už má." };
  if (error || !data?.[0]) return { message: "Oprávnenie sa nepodarilo udeliť." };
  const result = data[0];
  revalidatePath(`/turnaje/${slug}`);
  revalidatePath(`/turnaje/${slug}/administracia`);
  try {
    await sendTournamentScorekeeperNotification({ to: result.assigned_email, fullName: result.assigned_name, tournamentName: result.tournament_name, tournamentSlug: slug, enabled: true, changeId: result.change_id });
    return { success: true, message: "Oprávnenie bolo udelené a e-mail odoslaný." };
  } catch {
    return { success: true, message: "Oprávnenie bolo udelené, ale e-mail sa nepodarilo odoslať. Skontrolujte nastavenie odosielania." };
  }
}

export async function revokeTournamentScorekeeper(formData: FormData) {
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  if (!uuid.test(assignmentId) || !slugPattern.test(slug)) throw new Error("Neplatná požiadavka.");
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/prihlasenie");
  const { data, error } = await supabase.rpc("revoke_tournament_scorekeeper", { p_assignment_id: assignmentId });
  if (error || !data?.[0]) throw new Error("Oprávnenie sa nepodarilo odobrať.");
  const result = data[0];
  revalidatePath(`/turnaje/${slug}`);
  revalidatePath(`/turnaje/${slug}/administracia`);
  try { await sendTournamentScorekeeperNotification({ to: result.assigned_email, fullName: result.assigned_name, tournamentName: result.tournament_name, tournamentSlug: result.tournament_slug, enabled: false, changeId: result.change_id }); } catch { /* Oprávnenie musí zostať odobraté aj pri výpadku e-mailu. */ }
}

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
  if (error?.message.includes("RESULTS_LOCKED")) throw new Error("Výsledky sú uzamknuté. Organizátor ich musí pred opravou odomknúť.");
  if (error?.message.includes("Playoff matches need a winner")) throw new Error("Zápas play-off musí mať víťaza. Zadajte konečný výsledok po rozhodnutí zápasu.");
  if (error) throw new Error("Výsledok sa nepodarilo uložiť.");
  revalidatePath(`/turnaje/${slug}`);
  revalidatePath(`/turnaje/${slug}/administracia`);
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
  revalidatePath(`/turnaje/${slug}/administracia`);
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
  revalidatePath(`/turnaje/${slug}/administracia`);
}
