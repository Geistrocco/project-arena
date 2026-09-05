type DiscountNotification = {
  to: string;
  fullName: string;
  previousPercent: number;
  discountPercent: number;
  discountNote: string | null;
  discountExpiresAt: string | null;
  changeId: string;
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;",
}[character] ?? character));

export async function sendDiscountNotification(notification: DiscountNotification) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Vercel nemá nastavený RESEND_API_KEY.");

  const removed = notification.discountPercent === 0;
  const created = notification.previousPercent === 0 && !removed;
  const title = removed
    ? "Vaša zľava bola zrušená"
    : created
      ? `Získali ste zľavu ${notification.discountPercent} %`
      : `Vaša zľava bola upravená na ${notification.discountPercent} %`;
  const subject = `${title} | Tournio`;
  const greeting = notification.fullName ? `Dobrý deň, ${notification.fullName},` : "Dobrý deň,";
  const validity = notification.discountExpiresAt
    ? new Intl.DateTimeFormat("sk-SK", { dateStyle: "long", timeZone: "Europe/Bratislava" }).format(new Date(notification.discountExpiresAt))
    : null;
  const message = removed
    ? "Nastavenie zľavy na vašom účte Tournio bolo zrušené."
    : `Na vašom účte Tournio sme nastavili zľavu ${notification.discountPercent} %. Zľava je evidovaná pri vašom účte a zohľadní sa pri budúcich platených službách Tournio.`;
  const details = [
    removed ? null : `Výška zľavy: ${notification.discountPercent} %`,
    removed ? null : validity ? `Platnosť do: ${validity}` : "Platnosť: bez časového obmedzenia",
    removed ? null : notification.discountNote ? `Poznámka: ${notification.discountNote}` : null,
  ].filter(Boolean) as string[];

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `discount-${notification.changeId}`,
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL ?? "Tournio <noreply@tournio.sk>",
      to: [notification.to],
      subject,
      text: `${greeting}\n\n${message}${details.length ? `\n\n${details.join("\n")}` : ""}\n\nS pozdravom\nTím Tournio`,
      html: `<!doctype html><html lang="sk"><body style="margin:0;background:#f3f6f4;font-family:Arial,sans-serif;color:#17221b"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:32px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:auto;background:#fff;border-radius:18px;overflow:hidden"><tr><td style="background:#138a4b;padding:30px;text-align:center;color:#fff"><div style="font-size:34px">🏆</div><div style="font-size:28px;font-weight:800;margin-top:8px">Tournio</div><div style="font-size:14px;margin-top:6px">Tvoje turnaje. Jeden tím. Jednoducho.</div></td></tr><tr><td style="padding:34px 30px"><p style="margin:0 0 20px">${escapeHtml(greeting)}</p><h1 style="font-size:26px;line-height:1.25;margin:0 0 18px">${escapeHtml(title)}</h1><p style="font-size:16px;line-height:1.65;margin:0 0 22px;color:#45534a">${escapeHtml(message)}</p>${details.length ? `<div style="background:#eef8f1;border-radius:12px;padding:18px 20px">${details.map((detail) => `<p style="margin:6px 0;font-size:15px"><strong>${escapeHtml(detail)}</strong></p>`).join("")}</div>` : ""}<p style="font-size:15px;line-height:1.6;margin:26px 0 0;color:#45534a">S pozdravom,<br><strong>Tím Tournio</strong></p></td></tr></table></td></tr></table></body></html>`,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend odmietol e-mail (${response.status}): ${body.slice(0, 300)}`);
  }
}
