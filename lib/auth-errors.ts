export function authErrorMessage(error: { code?: string; message: string }): string {
  const code = error.code;
  const message = error.message.toLowerCase();
  if (code === "same_password" || message.includes("different from the old password")) return "Toto heslo už používaš. Prihlás sa ním alebo zadaj iné nové heslo.";
  if (code === "email_not_confirmed" || message.includes("email not confirmed")) return "E-mail ešte nie je potvrdený. Otvor najnovší potvrdzovací e-mail alebo si vyžiadaj nový.";
  if (code === "invalid_credentials" || message.includes("invalid login")) return "Nesprávny e-mail alebo heslo.";
  if (code === "weak_password") return "Heslo nespĺňa bezpečnostné požiadavky. Použi dlhšie a silnejšie heslo.";
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || message.includes("rate limit") || message.includes("after") && message.includes("seconds")) return "Príliš veľa pokusov. Chvíľu počkaj a skús to znova.";
  if (code === "otp_expired" || code === "flow_state_expired" || code === "flow_state_not_found") return "Odkaz vypršal alebo už bol použitý. Vyžiadaj si nový a otvor najnovší e-mail.";
  if (code === "session_not_found" || code === "refresh_token_not_found" || message.includes("auth session missing")) return "Obnovenie hesla nemá platnú reláciu. Vyžiadaj si nový odkaz na obnovu hesla.";
  if (message.includes("password") && message.includes("at least")) return "Heslo musí mať aspoň 8 znakov.";
  return "Operáciu sa nepodarilo dokončiť. Skús to znova.";
}
