type ScorekeeperNotification = {
  to: string;
  fullName: string;
  tournamentName: string;
  tournamentSlug: string;
  enabled: boolean;
  changeId: string;
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
}[character] ?? character));

export async function sendTournamentScorekeeperNotification(notification: ScorekeeperNotification) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Vercel nemá nastavený RESEND_API_KEY.");

  const greeting = notification.fullName ? `Dobrý deň, ${notification.fullName},` : "Dobrý deň,";
  const tournamentUrl = `https://tournio.sk/turnaje/${encodeURIComponent(notification.tournamentSlug)}`;
  const title = notification.enabled ? "Môžete zadávať výsledky turnaja" : "Prístup k výsledkom bol odobratý";
  const intro = notification.enabled
    ? `Organizátor vás poveril zadávaním výsledkov turnaja ${notification.tournamentName}.`
    : `Organizátor vám odobral oprávnenie zadávať výsledky turnaja ${notification.tournamentName}.`;
  const text = notification.enabled
    ? `${greeting}\n\n${intro}\n\nPo prihlásení týmto e-mailom môžete zapisovať a opravovať výsledky zápasov. Nastavenia turnaja, tímy ani harmonogram meniť nemôžete.\n\nOtvoriť turnaj: ${tournamentUrl}\n\nS pozdravom\nTím Tournio`
    : `${greeting}\n\n${intro}\n\nVáš používateľský účet zostáva aktívny.\n\nS pozdravom\nTím Tournio`;
  const body = notification.enabled
    ? `<p style="font-size:16px;line-height:1.65;color:#45534a">${escapeHtml(intro)}</p><p style="font-size:16px;line-height:1.65;color:#45534a">Po prihlásení týmto e-mailom môžete zapisovať a opravovať výsledky zápasov. Nastavenia turnaja, tímy ani harmonogram meniť nemôžete.</p><p style="margin:26px 0"><a href="${tournamentUrl}" style="display:inline-block;background:#138a4b;color:#fff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:10px">Otvoriť turnaj</a></p>`
    : `<p style="font-size:16px;line-height:1.65;color:#45534a">${escapeHtml(intro)}</p><p style="font-size:16px;line-height:1.65;color:#45534a">Váš používateľský účet zostáva aktívny.</p>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `scorekeeper-${notification.changeId}` },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL ?? "Tournio <noreply@tournio.sk>",
      to: [notification.to],
      subject: `${title} | Tournio`,
      text,
      html: `<!doctype html><html lang="sk"><body style="margin:0;background:#f3f6f4;font-family:Arial,sans-serif;color:#17221b"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:32px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:auto;background:#fff;border-radius:18px;overflow:hidden"><tr><td style="background:#138a4b;padding:30px;text-align:center;color:#fff"><div style="font-size:34px">🏆</div><div style="font-size:28px;font-weight:800;margin-top:8px">Tournio</div></td></tr><tr><td style="padding:34px 30px"><p style="margin:0 0 20px">${escapeHtml(greeting)}</p><h1 style="font-size:26px;line-height:1.25;margin:0 0 18px">${escapeHtml(title)}</h1>${body}<p style="font-size:15px;line-height:1.6;margin:26px 0 0;color:#45534a">S pozdravom,<br><strong>Tím Tournio</strong></p></td></tr></table></td></tr></table></body></html>`,
    }),
  });
  if (!response.ok) throw new Error(`Resend odmietol e-mail (${response.status}).`);
}
