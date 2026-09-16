"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const uuid = /^[0-9a-f-]{36}$/i;
const localDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export async function createTrainingSeries(formData: FormData) {
  const teamId = String(formData.get("teamId") ?? "");
  const title = String(formData.get("title") ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  const startsAt = String(formData.get("startsAt") ?? "");
  const endsAt = String(formData.get("endsAt") ?? "");
  const location = String(formData.get("location") ?? "").trim().slice(0, 160);
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000);
  const repeatWeeks = Number.parseInt(String(formData.get("repeatWeeks") ?? "1"), 10);

  if (!uuid.test(teamId) || title.length < 3) throw new Error("Skontrolujte názov tréningu.");
  if (!localDateTime.test(startsAt) || !localDateTime.test(endsAt)) throw new Error("Zadajte začiatok aj koniec tréningu.");
  if (!Number.isInteger(repeatWeeks) || repeatWeeks < 1 || repeatWeeks > 52) throw new Error("Počet opakovaní musí byť od 1 do 52.");

  const duration = new Date(endsAt).getTime() - new Date(startsAt).getTime();
  if (!Number.isFinite(duration) || duration < 15 * 60_000 || duration > 6 * 60 * 60_000) {
    throw new Error("Tréning musí trvať 15 minút až 6 hodín.");
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/prihlasenie");

  const { error } = await supabase.rpc("create_team_training_series", {
    p_team_id: teamId,
    p_title: title,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_location: location,
    p_note: note,
    p_repeat_weeks: repeatWeeks,
  });
  if (error) throw new Error("Tréningy sa nepodarilo vytvoriť. Skontrolujte, či tím má aktívnych hráčov.");

  const month = startsAt.slice(0, 7);
  revalidatePath(`/timy/${teamId}/kalendar`);
  revalidatePath(`/timy/${teamId}/nominacie`);
  redirect(`/timy/${teamId}/kalendar?mesiac=${month}&stav=trening-vytvoreny`);
}
