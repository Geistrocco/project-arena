type AdminRoleNotification = {
  to: string;
  fullName: string;
  grantedBy: string;
  enabled: boolean;
  changeId: string;
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;",
}[character] ?? character));

export async function sendAdminRoleNotification(notification: AdminRoleNotification) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Vercel nemá nastavený RESEND_API_KEY.");

  const greeting = notification.fullName ? `Dobrý deň, ${notification.fullName},` : "Dobrý deň,";
  const title = notification.enabled ? "Boli ste pridaný ako administrátor Tournio" : "Administrátorský prístup bol odobratý";
  const intro = notification.enabled
    ? `${notification.grantedBy || "Vlastník Tournio"} vám udelil administrátorský prístup do aplikácie Tournio.`
    : `${notification.grantedBy || "Vlastník Tournio"} vám odobral administrátorský prístup do aplikácie Tournio.`;
  const access = [
    "spravovať používateľské účty",
    "nastavovať používateľom zľavy",
    "schvaľovať žiadosti o správu klubov a tímov",
  ];

  const text = notification.enabled
    ? `${greeting}\n\n${intro}\n\nAko administrátor môžete:\n- ${access.join("\n- ")}\n\nDo administrácie sa dostanete po prihlásení do svojho účtu na https://tournio.sk.\n\nĎakujeme, že pomáhate budovať Tournio.\n\nS pozdravom\nTím Tournio`
    : `${greeting}\n\n${intro}\n\nVáš používateľský účet zostáva aktívny.\n\nS pozdravom\nTím Tournio`;
  const body = notification.enabled
    ? `<p style="font-size:16px;line-height:1.65;color:#45534a">${escapeHtml(intro)}</p><p style="font-size:16px;font-weight:700;margin-top:24px">Ako administrátor môžete:</p><ul style="font-size:16px;line-height:1.8;color:#45534a">${access.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><p style="font-size:16px;line-height:1.65;color:#45534a">Do administrácie sa dostanete po prihlásení do svojho účtu na <a href="https://tournio.sk" style="color:#138a4b;font-weight:700">tournio.sk</a>.</p><p style="font-size:16px;line-height:1.65;color:#45534a">Ďakujeme, že pomáhate budovať Tournio.</p>`
    : `<p style="font-size:16px;line-height:1.65;color:#45534a">${escapeHtml(intro)}</p><p style="font-size:16px;line-height:1.65;color:#45534a">Váš používateľský účet zostáva aktívny.</p>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `admin-role-${notification.changeId}`,
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL ?? "Tournio <noreply@tournio.sk>",
      to: [notification.to],
      subject: `${title} | Tournio`,
      text,
      html: `<!doctype html><html lang="sk"><body style="margin:0;background:#f3f6f4;font-family:Arial,sans-serif;color:#17221b"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:32px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:auto;background:#fff;border-radius:18px;overflow:hidden"><tr><td style="background:#138a4b;padding:30px;text-align:center;color:#fff"><div style="font-size:34px">🏆</div><div style="font-size:28px;font-weight:800;margin-top:8px">Tournio</div><div style="font-size:14px;margin-top:6px">Tvoje turnaje. Jeden tím. Jednoducho.</div></td></tr><tr><td style="padding:34px 30px"><p style="margin:0 0 20px">${escapeHtml(greeting)}</p><h1 style="font-size:26px;line-height:1.25;margin:0 0 18px">${escapeHtml(title)}</h1>${body}<p style="font-size:15px;line-height:1.6;margin:26px 0 0;color:#45534a">S pozdravom,<br><strong>Tím Tournio</strong></p></td></tr></table></td></tr></table></body></html>`,
    }),
  });

  if (!response.ok) throw new Error(`Resend odmietol e-mail (${response.status}).`);
}
