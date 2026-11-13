"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const uuid = /^[0-9a-f-]{36}$/i;
const localDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const localDate = /^\d{4}-\d{2}-\d{2}$/;
const localTime = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function createTrainingSeries(formData: FormData) {
  const teamId = String(formData.get("teamId") ?? "");
  const title = String(formData.get("title") ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  const date = String(formData.get("date") ?? "");
  const startTime = String(formData.get("startTime") ?? "");
  const endTime = String(formData.get("endTime") ?? "");
  const legacyStartsAt = String(formData.get("startsAt") ?? "");
  const legacyEndsAt = String(formData.get("endsAt") ?? "");
  const startsAt = localDate.test(date) && localTime.test(startTime) ? `${date}T${startTime}` : legacyStartsAt;
  const endsAt = localDate.test(date) && localTime.test(endTime) ? `${date}T${endTime}` : legacyEndsAt;
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

export type TrainingManagementState = { error: string };

export async function manageTraining(_previous: TrainingManagementState, formData: FormData): Promise<TrainingManagementState> {
  const id = String(formData.get("nominationId") ?? "");
  const scope = String(formData.get("scope") ?? "one");
  const operation = String(formData.get("operation") ?? "");
  const version = String(formData.get("version") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const startsAt = String(formData.get("startsAt") ?? "");
  const endsAt = String(formData.get("endsAt") ?? "");
  const location = String(formData.get("location") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!uuid.test(id) || !/^[a-f0-9]{32}$/.test(version) || !["one", "following", "all"].includes(scope)
    || !["edit", "cancel"].includes(operation)) return { error: "Neplatná požiadavka. Obnov stránku." };
  if ((scope !== "one" || operation === "cancel") && formData.get("confirm") !== "on") return { error: "Potvrď zvolený rozsah zmeny." };
  if (operation === "edit" && (title.length < 3 || title.length > 120 || location.length > 160 || note.length > 1000
    || !localDateTime.test(startsAt) || !localDateTime.test(endsAt))) return { error: "Skontroluj názov, čas a dĺžku pokynov." };
  if (operation === "cancel" && (reason.length < 2 || reason.length > 500)) return { error: "Napíš dôvod zrušenia (2 až 500 znakov)." };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) return { error: "Prihlás sa znova a zopakuj uloženie." };
  const { data, error } = await supabase.rpc("manage_team_training", {
    p_id: id, p_scope: scope, p_operation: operation, p_version: version,
    p_title: title, p_starts_at: operation === "edit" ? startsAt : null,
    p_ends_at: operation === "edit" ? endsAt : null, p_location: location, p_note: note, p_reason: reason,
  });
  if (error) {
    const messages: Record<string, string> = {
      "Training changed; reload": "Tréning alebo jeho sériu medzitým niekto zmenil. Obnov stránku a skontroluj údaje.",
      "Training is not editable": "Upravovať môžeš iba budúce, otvorené tréningy.",
      "Attendance already recorded": "Aspoň jeden z termínov už má zaznamenanú dochádzku. Vyber menší rozsah; dochádzku nemeníme.",
      "Cannot move training into past": "Zmena by presunula niektorý tréning do minulosti. Uprav dátum alebo rozsah.",
      "Invalid duration": "Tréning musí trvať 15 minút až 6 hodín.",
      "Invalid local time": "Vybraný čas pri zmene letného/zimného času neexistuje. Vyber iný čas.",
      "Not authorized": "Na správu tohto tréningu nemáš oprávnenie.",
    };
    return { error: messages[error.message] ?? "Zmenu sa nepodarilo uložiť. Skús to znova alebo obnov stránku." };
  }
  revalidatePath("/timy/[teamId]/kalendar", "page");
  revalidatePath("/timy/[teamId]/nominacie", "page");
  revalidatePath("/timy/[teamId]/prehlad", "page");
  revalidatePath("/nominacie/[nominationId]", "page");
  revalidatePath("/moj-tim");
  redirect(`/nominacie/${id}?stav=${operation === "cancel" ? "trening-zruseny" : "trening-upraveny"}&pocet=${Number(data) || 1}`);
}
