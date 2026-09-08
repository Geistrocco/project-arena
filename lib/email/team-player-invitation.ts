type TeamPlayerInvitation = { to: string; teamName: string; invitationId: string };

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
}[character] ?? character));

export async function sendTeamPlayerInvitationEmail(invitation: TeamPlayerInvitation) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Vercel nemá nastavený RESEND_API_KEY.");
  const accountUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://tournio.sk"}/ucet#timove-pozvania`;
  const message = `Tréner tímu ${invitation.teamName} vás pozýva pridať jedného z vašich hráčov do tímu.`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `team-player-${invitation.invitationId}` },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL ?? "Tournio <noreply@tournio.sk>", to: [invitation.to],
      subject: `Pozvanie do tímu ${invitation.teamName} | Tournio`,
      text: `Dobrý deň,\n\n${message}\n\nPrihláste sa rovnakým e-mailom, vyberte hráča a pozvanie potvrďte:\n${accountUrl}\n\nPozvanie platí 14 dní.\n\nTím Tournio`,
      html: `<!doctype html><html lang="sk"><body style="margin:0;background:#f3f6f4;font-family:Arial,sans-serif;color:#17221b"><div style="max-width:600px;margin:32px auto;background:#fff;border-radius:18px;overflow:hidden"><div style="background:#138a4b;padding:30px;text-align:center;color:#fff"><div style="font-size:28px;font-weight:800">🏆 Tournio</div></div><div style="padding:34px 30px"><h1 style="font-size:25px">Pozvanie hráča do tímu</h1><p style="line-height:1.65;color:#45534a">${escapeHtml(message)}</p><p style="line-height:1.65;color:#45534a">Prihláste sa rovnakou e-mailovou adresou, vyberte správneho hráča a pozvanie potvrďte.</p><p style="margin:28px 0"><a href="${escapeHtml(accountUrl)}" style="background:#138a4b;color:#fff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:12px">Vybrať hráča</a></p><p style="font-size:14px;color:#647067">Pozvanie platí 14 dní.</p></div></div></body></html>`,
    }),
  });
  if (!response.ok) throw new Error(`Resend odmietol e-mail (${response.status}).`);
}
