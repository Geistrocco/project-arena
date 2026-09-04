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
