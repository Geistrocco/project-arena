type GuardianInvitation = {
  to: string;
  invitedBy: string;
  playerName: string;
  invitationId: string;
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;",
}[character] ?? character));

export async function sendGuardianInvitationEmail(invitation: GuardianInvitation) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Vercel nemá nastavený RESEND_API_KEY.");

  const accountUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://tournio.sk"}/ucet#rodina`;
  const invitedBy = invitation.invitedBy || "Používateľ Tournio";
  const subject = `${invitedBy} vás pozýva spravovať profil hráča | Tournio`;
  const message = `${invitedBy} vás pozýva ako ďalšieho rodiča alebo opatrovníka k profilu hráča ${invitation.playerName}.`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `guardian-invitation-${invitation.invitationId}`,
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL ?? "Tournio <noreply@tournio.sk>",
      to: [invitation.to],
      subject,
      text: `Dobrý deň,\n\n${message}\n\nPozvanie je viazané na túto e-mailovú adresu. Prihláste sa alebo sa zaregistrujte rovnakým e-mailom a v časti Rodina pozvanie prijmite.\n\n${accountUrl}\n\nPozvanie platí 14 dní.\n\nS pozdravom\nTím Tournio`,
      html: `<!doctype html><html lang="sk"><body style="margin:0;background:#f3f6f4;font-family:Arial,sans-serif;color:#17221b"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:32px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:auto;background:#fff;border-radius:18px;overflow:hidden"><tr><td style="background:#138a4b;padding:30px;text-align:center;color:#fff"><div style="font-size:34px">🏆</div><div style="font-size:28px;font-weight:800;margin-top:8px">Tournio</div><div style="font-size:14px;margin-top:6px">Tvoje turnaje. Jeden tím. Jednoducho.</div></td></tr><tr><td style="padding:34px 30px"><p style="margin:0 0 20px">Dobrý deň,</p><h1 style="font-size:26px;line-height:1.25;margin:0 0 18px">Pozvanie k profilu hráča</h1><p style="font-size:16px;line-height:1.65;color:#45534a">${escapeHtml(message)}</p><p style="font-size:16px;line-height:1.65;color:#45534a">Pozvanie je viazané na túto e-mailovú adresu. Prihláste sa alebo sa zaregistrujte rovnakým e-mailom a pozvanie prijmite v časti <strong>Rodina</strong>.</p><p style="margin:28px 0"><a href="${escapeHtml(accountUrl)}" style="display:inline-block;background:#138a4b;color:#fff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:12px">Otvoriť môj účet</a></p><p style="font-size:14px;color:#647067">Pozvanie platí 14 dní. Ak ho nepoznáte, nemusíte nič robiť.</p><p style="font-size:15px;line-height:1.6;margin:26px 0 0;color:#45534a">S pozdravom,<br><strong>Tím Tournio</strong></p></td></tr></table></td></tr></table></body></html>`,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend odmietol e-mail (${response.status}): ${body.slice(0, 300)}`);
  }
}
