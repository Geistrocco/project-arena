"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sendDiscountNotification } from "@/lib/email/discount-notification";

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
  if (!role || !["owner", "admin"].includes(role.role)) throw new Error("Nemáte administrátorské oprávnenie.");
  return { supabase, userId, role: role.role };
}

async function ensureTargetIsNotOwner(supabase: Awaited<ReturnType<typeof createClient>>, targetUserId: string, actorRole: string) {
  const { data: targetRole } = await supabase.from("user_roles").select("role").eq("user_id", targetUserId).maybeSingle();
  if (targetRole?.role === "owner" && actorRole !== "owner") throw new Error("Administrátor nemôže meniť účet vlastníka.");
}

export async function setAccountStatus(formData: FormData) {
  const targetUserId = String(formData.get("userId") ?? "");
  const status = String(formData.get("status") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  if (!uuidPattern.test(targetUserId) || !["active", "suspended"].includes(status)) {
    throw new Error("Neplatné údaje používateľa.");
  }

  const { supabase, userId, role } = await requireAdmin();
  if (targetUserId === userId && status === "suspended") {
    throw new Error("Administrátor nemôže pozastaviť vlastný účet.");
  }
  await ensureTargetIsNotOwner(supabase, targetUserId, role);

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
  if (discountExpiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(discountExpiresAt)) throw new Error("Neplatný dátum platnosti.");

  const { supabase, userId, role } = await requireAdmin();
  await ensureTargetIsNotOwner(supabase, targetUserId, role);
  const [{ data: profile }, { data: previous }] = await Promise.all([
    supabase.from("profiles").select("full_name, email").eq("id", targetUserId).maybeSingle(),
    supabase.from("account_controls").select("discount_percent, discount_note, discount_expires_at").eq("user_id", targetUserId).maybeSingle(),
  ]);
  if (!profile?.email || !previous) throw new Error("Používateľ nemá uložený e-mail alebo účet.");
  const expiresAtDate = discountExpiresAt ? new Date(`${discountExpiresAt}T23:59:59.999Z`) : null;
  if (expiresAtDate && Number.isNaN(expiresAtDate.getTime())) throw new Error("Neplatný dátum platnosti.");
  const expiresAt = expiresAtDate?.toISOString() ?? null;
  const unchanged = previous.discount_percent === discountPercent
    && (previous.discount_note ?? "") === discountNote
    && (previous.discount_expires_at ?? null) === expiresAt;
  if (unchanged) throw new Error("Zľava sa nezmenila, e-mail nebol odoslaný.");

  const { data: updated, error } = await supabase
    .from("account_controls")
    .update({
      discount_percent: discountPercent,
      discount_note: discountNote || null,
      discount_expires_at: expiresAt,
      updated_by: userId,
    })
    .eq("user_id", targetUserId)
    .select("user_id, updated_at")
    .maybeSingle();
  if (error || !updated) throw new Error("Zľavu sa nepodarilo uložiť.");

  try {
    await sendDiscountNotification({
      to: profile.email,
      fullName: profile.full_name,
      previousPercent: previous.discount_percent,
      discountPercent,
      discountNote: discountNote || null,
      discountExpiresAt: expiresAt,
      changeId: `${targetUserId}-${updated.updated_at}`,
    });
    await supabase.from("admin_audit_log").insert({
      actor_user_id: userId,
      target_user_id: targetUserId,
      action: "discount_email_sent",
      details: { discount_percent: discountPercent },
    });
  } catch (mailError) {
    await supabase.from("admin_audit_log").insert({
      actor_user_id: userId,
      target_user_id: targetUserId,
      action: "discount_email_failed",
      details: { discount_percent: discountPercent, error: mailError instanceof Error ? mailError.message.slice(0, 500) : "unknown" },
    });
    revalidatePath("/admin/pouzivatelia");
    redirect("/admin/pouzivatelia?mail=failed");
  }
  revalidatePath("/admin/pouzivatelia");
  redirect("/admin/pouzivatelia?mail=sent");
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

export async function setAdminRole(formData: FormData) {
  const targetUserId = String(formData.get("userId") ?? "");
  const enabled = String(formData.get("enabled") ?? "") === "true";
  if (!uuidPattern.test(targetUserId)) throw new Error("Neplatný používateľ.");

  const { supabase, userId, role } = await requireAdmin();
  if (role !== "owner") throw new Error("Administrátorov môže určovať iba vlastník Tournio.");
  if (targetUserId === userId) throw new Error("Vlastník nemôže meniť vlastné oprávnenie.");

  if (enabled) {
    const { error } = await supabase.from("user_roles").insert({ user_id: targetUserId, role: "admin" });
    if (error) throw new Error("Administrátorské oprávnenie sa nepodarilo pridať.");
  } else {
    const { error } = await supabase.from("user_roles").delete().eq("user_id", targetUserId).eq("role", "admin");
    if (error) throw new Error("Administrátorské oprávnenie sa nepodarilo odobrať.");
  }

  await supabase.from("admin_audit_log").insert({
    actor_user_id: userId,
    target_user_id: targetUserId,
    action: enabled ? "admin_role_granted" : "admin_role_revoked",
    details: {},
  });
  revalidatePath("/admin/pouzivatelia");
  revalidatePath("/ucet");
}
