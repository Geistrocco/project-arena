"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function setMarketingConsent(formData: FormData) {
  const granted = String(formData.get("granted") ?? "") === "true";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  if (error || !userId) throw new Error("Neautorizovaný prístup.");

  const { error: insertError } = await supabase.from("marketing_consent_events").insert({
    user_id: userId,
    granted,
    source: "account_settings",
    policy_version: "2026-09-04",
  });
  if (insertError) throw new Error("Nastavenie marketingových správ sa nepodarilo uložiť.");

  revalidatePath("/ucet");
  revalidatePath("/admin/pouzivatelia");
}

export async function requestTeamAccess(formData: FormData) {
  const teamId = String(formData.get("teamId") ?? "");
  const requestedRole = String(formData.get("requestedRole") ?? "");
  const phone = String(formData.get("phone") ?? "").trim().slice(0, 30);
  const message = String(formData.get("message") ?? "").trim().slice(0, 1000);
  if (!/^[0-9a-f-]{36}$/i.test(teamId) || !["coach", "manager", "club_admin"].includes(requestedRole)) {
    throw new Error("Neplatný tím alebo funkcia.");
  }
  if (phone && !/^[+0-9][0-9 ()/-]{6,29}$/.test(phone)) throw new Error("Zadajte platné telefónne číslo.");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  if (error || !userId) throw new Error("Neautorizovaný prístup.");

  const { error: insertError } = await supabase.from("team_claim_requests").insert({
    team_id: teamId,
    user_id: userId,
    requested_role: requestedRole,
    phone: phone || null,
    message: message || null,
  });
  if (insertError?.code === "23505") throw new Error("Žiadosť o tento tím už čaká na schválenie.");
  if (insertError) throw new Error("Žiadosť sa nepodarilo odoslať.");
  revalidatePath("/ucet");
  revalidatePath("/admin/timy");
}
