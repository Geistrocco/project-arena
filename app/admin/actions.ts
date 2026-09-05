"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requireAdmin() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  if (error || !userId) throw new Error("Neautorizovaný prístup.");

  const { data: role } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (role?.role !== "admin") throw new Error("Nemáte administrátorské oprávnenie.");
  return { supabase, userId };
}

export async function setAccountStatus(formData: FormData) {
  const targetUserId = String(formData.get("userId") ?? "");
  const status = String(formData.get("status") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  if (!uuidPattern.test(targetUserId) || !["active", "suspended"].includes(status)) {
    throw new Error("Neplatné údaje používateľa.");
  }

  const { supabase, userId } = await requireAdmin();
  if (targetUserId === userId && status === "suspended") {
    throw new Error("Administrátor nemôže pozastaviť vlastný účet.");
  }

  const { data: updated, error } = await supabase
    .from("account_controls")
    .update({
      status,
      suspension_reason: status === "suspended" ? reason || "Porušenie pravidiel" : null,
      suspended_at: status === "suspended" ? new Date().toISOString() : null,
      updated_by: userId,
    })
    .eq("user_id", targetUserId)
    .select("user_id")
    .maybeSingle();
  if (error || !updated) throw new Error("Stav účtu sa nepodarilo zmeniť.");
  revalidatePath("/admin/pouzivatelia");
}

export async function saveDiscount(formData: FormData) {
  const targetUserId = String(formData.get("userId") ?? "");
  const discountPercent = Number(formData.get("discountPercent") ?? 0);
  const discountNote = String(formData.get("discountNote") ?? "").trim().slice(0, 300);
  const discountExpiresAt = String(formData.get("discountExpiresAt") ?? "");
  if (!uuidPattern.test(targetUserId) || !Number.isInteger(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    throw new Error("Neplatná zľava.");
  }

  const { supabase, userId } = await requireAdmin();
  const { data: updated, error } = await supabase
    .from("account_controls")
    .update({
      discount_percent: discountPercent,
      discount_note: discountNote || null,
      discount_expires_at: discountExpiresAt ? new Date(`${discountExpiresAt}T23:59:59.999Z`).toISOString() : null,
      updated_by: userId,
    })
    .eq("user_id", targetUserId)
    .select("user_id")
    .maybeSingle();
  if (error || !updated) throw new Error("Zľavu sa nepodarilo uložiť.");
  revalidatePath("/admin/pouzivatelia");
}

export async function reviewTeamClaim(formData: FormData) {
  const claimId = String(formData.get("claimId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!uuidPattern.test(claimId) || !["approved", "rejected"].includes(decision)) throw new Error("Neplatná žiadosť.");
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("review_team_claim", { p_claim_id: claimId, p_decision: decision });
  if (error) throw new Error("Žiadosť sa nepodarilo spracovať.");
  revalidatePath("/admin/timy");
  revalidatePath("/ucet");
}
