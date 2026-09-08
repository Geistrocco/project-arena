"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendGuardianInvitationEmail } from "@/lib/email/guardian-invitation";

async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  const email = typeof data?.claims?.email === "string" ? data.claims.email.toLowerCase() : "";
  if (error || !userId) throw new Error("Neautorizovaný prístup.");
  return { supabase, userId, email };
}

export async function createPlayerProfile(formData: FormData) {
  const fullName = String(formData.get("fullName") ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  const birthDateInput = String(formData.get("birthDate") ?? "").trim();
  const birthDate = birthDateInput || null;
  if (fullName.length < 2) throw new Error("Zadajte meno hráča.");
  if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) throw new Error("Zadajte platný dátum narodenia.");

  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("create_player_for_guardian", {
    p_full_name: fullName,
    p_birth_date: birthDate,
  });
  if (error) throw new Error("Profil hráča sa nepodarilo vytvoriť.");
  revalidatePath("/ucet");
}

export async function inviteGuardian(formData: FormData) {
  const playerId = String(formData.get("playerId") ?? "");
  const invitedEmail = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  const relationship = String(formData.get("relationship") ?? "parent");
  if (!/^[0-9a-f-]{36}$/i.test(playerId)) throw new Error("Neplatný profil hráča.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitedEmail)) throw new Error("Zadajte platný e-mail.");
  if (!["parent", "guardian"].includes(relationship)) throw new Error("Neplatný vzťah k hráčovi.");

  const { supabase, userId, email } = await requireUser();
  if (invitedEmail === email) throw new Error("Tento e-mail je už správcom profilu.");

  const [{ data: player }, { data: inviter }] = await Promise.all([
    supabase.from("player_profiles").select("id, full_name").eq("id", playerId).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
  ]);
  if (!player) throw new Error("Profil hráča neexistuje alebo k nemu nemáte prístup.");

  let invitationId: string | null = null;
  const { data: invitation, error: insertError } = await supabase.rpc("invite_player_guardian", {
    p_player_id: playerId,
    p_invited_email: invitedEmail,
    p_relationship: relationship,
  });

  if (insertError?.code === "23505") {
    const { data: existing } = await supabase
      .from("guardian_invitations")
      .select("id")
      .eq("player_id", playerId)
      .eq("invited_email", invitedEmail)
      .eq("status", "pending")
      .maybeSingle();
    invitationId = existing?.id ?? null;
  } else if (insertError) {
    throw new Error("Pozvanie sa nepodarilo vytvoriť.");
  } else {
    invitationId = invitation;
  }

  if (!invitationId) throw new Error("Rovnaké pozvanie už čaká na prijatie.");
  await sendGuardianInvitationEmail({
    to: invitedEmail,
    invitedBy: inviter?.full_name || email,
    playerName: player.full_name,
    invitationId,
  });
  revalidatePath("/ucet");
}

export async function respondToGuardianInvitation(formData: FormData) {
  const invitationId = String(formData.get("invitationId") ?? "");
  const accept = String(formData.get("decision") ?? "") === "accept";
  if (!/^[0-9a-f-]{36}$/i.test(invitationId)) throw new Error("Neplatné pozvanie.");

  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("respond_to_guardian_invitation", {
    p_invitation_id: invitationId,
    p_accept: accept,
  });
  if (error) throw new Error("Pozvanie sa nepodarilo spracovať alebo už nie je platné.");
  revalidatePath("/ucet");
}

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

export async function requestNewTeam(formData: FormData) {
  const clubName = String(formData.get("clubName") ?? "").trim().slice(0, 160);
  const city = String(formData.get("city") ?? "").trim().slice(0, 100);
  const category = String(formData.get("category") ?? "").trim().toUpperCase().slice(0, 30);
  const season = String(formData.get("season") ?? "").trim().slice(0, 20);
  const requestedRole = String(formData.get("requestedRole") ?? "");
  const sourceUrl = String(formData.get("sourceUrl") ?? "").trim().slice(0, 500);
  const message = String(formData.get("message") ?? "").trim().slice(0, 1000);
  if (clubName.length < 2 || city.length < 2 || !category || !/^\d{4}\/\d{2}$/.test(season)) throw new Error("Skontrolujte názov klubu, mesto, kategóriu a sezónu.");
  if (!["coach", "manager", "club_admin"].includes(requestedRole)) throw new Error("Neplatná funkcia.");
  if (sourceUrl) {
    try { const url = new URL(sourceUrl); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); }
    catch { throw new Error("Odkaz musí byť platná webová adresa."); }
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  if (error || !userId) throw new Error("Neautorizovaný prístup.");

  const { error: insertError } = await supabase.from("team_creation_requests").insert({
    user_id: userId, club_name: clubName, city, category, season,
    requested_role: requestedRole, source_url: sourceUrl || null, message: message || null,
  });
  if (insertError?.code === "23505") throw new Error("Rovnaká žiadosť už čaká na schválenie.");
  if (insertError) throw new Error("Žiadosť sa nepodarilo odoslať.");
  revalidatePath("/ucet");
  revalidatePath("/admin/timy");
}
