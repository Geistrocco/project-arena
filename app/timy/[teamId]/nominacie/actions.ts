"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const uuid = /^[0-9a-f-]{36}$/i;

export async function createNomination(formData: FormData) {
  const teamId = String(formData.get("teamId") ?? "");
  const title = String(formData.get("title") ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  const eventType = String(formData.get("eventType") ?? "");
  const startsAt = String(formData.get("startsAt") ?? "");
  const location = String(formData.get("location") ?? "").trim().slice(0, 160);
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000);
  const playerIds = formData.getAll("playerIds").map(String).filter((id) => uuid.test(id));
  if (!uuid.test(teamId) || title.length < 3 || !["match", "tournament", "training", "other"].includes(eventType)) throw new Error("Skontrolujte údaje nominácie.");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(startsAt)) throw new Error("Zadajte dátum a čas udalosti.");
  if (playerIds.length === 0) throw new Error("Vyberte aspoň jedného hráča.");

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/prihlasenie");
  const { data: nominationId, error } = await supabase.rpc("create_team_nomination", {
    p_team_id: teamId, p_title: title, p_event_type: eventType, p_starts_at: startsAt,
    p_location: location, p_note: note, p_player_ids: playerIds,
  });
  if (error || !nominationId) throw new Error("Nomináciu sa nepodarilo vytvoriť.");
  revalidatePath(`/timy/${teamId}/nominacie`);
  redirect(`/nominacie/${nominationId}?stav=vytvorena`);
}

export async function respondToNomination(formData: FormData) {
  const nominationId = String(formData.get("nominationId") ?? "");
  const teamId = String(formData.get("teamId") ?? "");
  const playerId = String(formData.get("playerId") ?? "");
  const response = String(formData.get("response") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  if (![nominationId, teamId, playerId].every((id) => uuid.test(id)) || !["accepted", "declined"].includes(response)) throw new Error("Neplatná odpoveď.");
  if (response === "declined" && !reason) throw new Error("Pri odmietnutí uveďte dôvod.");

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/prihlasenie");
  const { error } = await supabase.rpc("respond_to_team_nomination", {
    p_nomination_id: nominationId, p_player_id: playerId,
    p_response: response, p_decline_reason: response === "declined" ? reason : null,
  });
  if (error) throw new Error("Odpoveď sa nepodarilo uložiť.");
  revalidatePath(`/nominacie/${nominationId}`);
  revalidatePath(`/timy/${teamId}/nominacie`);
  redirect(`/nominacie/${nominationId}?stav=odpoved-ulozena`);
}
