import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { setMarketingConsent } from "@/app/ucet/actions";

export default async function AccountPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) redirect("/prihlasenie");
  const email = typeof data.claims.email === "string" ? data.claims.email : "";
  const metadata = data.claims.user_metadata as { full_name?: string } | undefined;
  const userId = typeof data.claims.sub === "string" ? data.claims.sub : "";
  const [{ data: role }, { data: consentEvents }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
    supabase.from("marketing_consent_events").select("granted").eq("user_id", userId).order("recorded_at", { ascending: false }).limit(1),
  ]);
  const marketingConsent = consentEvents?.[0]?.granted === true;

  return (
    <section className="mx-auto max-w-3xl px-5 py-16 sm:py-24">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="eyebrow">Môj účet</p>
        <h1 className="mt-2 text-3xl font-extrabold text-ink">Vitajte{metadata?.full_name ? `, ${metadata.full_name}` : ""}</h1>
        <p className="mt-3 text-slate-600">Prihlásený účet: {email}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link className="btn-primary" href="/vytvorit-turnaj">Vytvoriť turnaj</Link>
          {role?.role === "admin" && <Link className="btn-secondary" href="/admin/pouzivatelia">Administrácia</Link>}
        </div>

        <div className="mt-8 border-t border-slate-200 pt-6">
          <h2 className="text-lg font-extrabold text-ink">E-mailové novinky a ponuky</h2>
          <p className="mt-2 text-sm text-slate-600">
            Aktuálne nastavenie: <strong>{marketingConsent ? "súhlas udelený" : "bez súhlasu"}</strong>. Nastavenie môžete kedykoľvek zmeniť.
          </p>
          <form action={setMarketingConsent} className="mt-4">
            <input name="granted" type="hidden" value={marketingConsent ? "false" : "true"} />
            <button className="btn-secondary" type="submit">
              {marketingConsent ? "Odvolať súhlas" : "Povoliť novinky a ponuky"}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
