import { parseSiteAccess } from "@/lib/site-access-state";
import { publicTestingRoute } from "@/lib/site-access-routes";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );
  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;

  const {data: accessData,error: accessError} = await supabase.rpc("get_site_access");
  const access = parseSiteAccess(accessData,accessError);
  const protectResponse = (target: NextResponse) => {
    if (request.nextUrl.pathname.startsWith("/turnajova-pozvanka/")) target.headers.set("Referrer-Policy","no-referrer");
    if (access.restricted) {
      target.headers.set("Cache-Control", "private, no-store, max-age=0");
      target.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    }
    return target;
  };
  if ((!access.allowed || (access.restricted && request.nextUrl.pathname === "/registracia")) && !publicTestingRoute(request.nextUrl.pathname,request.method)) {
    const target = request.nextUrl.clone();
    target.pathname = "/pripravujeme";
    target.search = "";
    const blocked = request.method !== "GET" && request.method !== "HEAD" || request.nextUrl.pathname.startsWith("/api/")
      ? NextResponse.json({error:"Stránka je v súkromnom testovaní."},{status:403})
      : NextResponse.redirect(target);
    response.cookies.getAll().forEach(cookie=>blocked.cookies.set(cookie));
    return protectResponse(blocked);
  }

  if (userId && access.allowed) {
    const { data: control } = await supabase
      .from("account_controls")
      .select("status")
      .eq("user_id", userId)
      .maybeSingle();

    if (control?.status === "suspended") {
      await supabase.auth.signOut({ scope: "local" });
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/prihlasenie";
      loginUrl.search = "";
      loginUrl.searchParams.set("stav", "pozastaveny");
      const redirectResponse = NextResponse.redirect(loginUrl);
      response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
      return protectResponse(redirectResponse);
    }
  }
  return protectResponse(response);
}
