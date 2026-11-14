import { authReturnPath } from "@/lib/auth-return-path";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const requestedNext = searchParams.get("next");
  const target = authReturnPath(requestedNext);
  const next = target === "/nove-heslo" ? `${target}?next=${encodeURIComponent(authReturnPath(searchParams.get("returnTo")))}` : target;
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/prihlasenie?chyba=overenie&next=${encodeURIComponent(authReturnPath(searchParams.get("returnTo") ?? target))}`);
}
