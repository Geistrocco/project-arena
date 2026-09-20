"use server";

import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

export async function postTeamChatMessage(teamId: string, body: string, nominationId?: string, announcement = false): Promise<{ ok: boolean; error?: string; notice?: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(teamId) || (nominationId && !/^[0-9a-f-]{36}$/i.test(nominationId)) || !body.trim() || body.trim().length > 2000) {
    return { ok: false, error: "Skontrolujte text správy." };
  }
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) return { ok: false, error: "Prihláste sa a skúste to znovu." };
  const { data: messageId, error } = await supabase.rpc("send_team_chat_message", {
    p_team_id: teamId, p_body: body.trim(), p_nomination_id: nominationId ?? null, p_announcement: announcement,
  });
  if (error) return { ok: false, error: "Správu sa nepodarilo odoslať. Skúste to znovu." };
  if (!announcement) return { ok: true };
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: true, notice: "Oznam je v chate. E-mailové upozornenia nie sú nastavené." };
  const { data: recipients, error: recipientError } = await supabase.rpc("get_chat_announcement_recipients", { p_message_id: messageId });
  if (recipientError) return { ok: true, notice: "Oznam je v chate, e-mailové upozornenia sa nepodarilo pripraviť." };
  const url = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://tournio.sk"}/timy/${teamId}/chat`;
  const addressList = ((recipients ?? []) as { email: string }[]).map((person) => person.email);
  let failures = 0;
  for (let start = 0; start < addressList.length; start += 8) {
    const chunk = addressList.slice(start, start + 8);
    const results = await Promise.allSettled(chunk.map(async (email) => {
      const key = createHash("sha256").update(`${messageId}:${email}`).digest("hex");
      const result = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `chat-${key}` },
        body: JSON.stringify({
          from: process.env.RESEND_FROM_EMAIL ?? "Tournio <noreply@tournio.sk>",
          to: [email], subject: "Nový dôležitý oznam tímu | Tournio",
          text: `Dobrý deň,\n\nvo vašom tímovom chate pribudol dôležitý oznam:\n\n${body.trim()}\n\nOtvoriť tímový chat: ${url}\n\nTím Tournio`,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:28px;color:#19241f"><h1 style="color:#15804c">Tournio · dôležitý oznam</h1><p>Vo vašom tímovom chate pribudol nový oznam.</p><div style="white-space:pre-wrap;background:#f0f8f3;padding:20px;border-radius:12px">${escapeHtml(body.trim())}</div><p><a href="${url}">Otvoriť tímový chat</a></p></div>`,
        }),
      });
      if (!result.ok) throw new Error("Mail was rejected");
    }));
    failures += results.filter((result) => result.status === "rejected").length;
  }
  return { ok: true, notice: failures ? `Oznam je v chate. ${failures} e-mailových upozornení sa nepodarilo odoslať.` : addressList.length ? `Oznam je v chate a e-mailom sme upozornili ${addressList.length} členov.` : "Oznam je v chate. Zatiaľ nemá ďalších príjemcov e-mailu." };
}
