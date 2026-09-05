import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requestNewTeam, requestTeamAccess, setMarketingConsent } from "@/app/ucet/actions";

export default async function AccountPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) redirect("/prihlasenie");
  const email = typeof data.claims.email === "string" ? data.claims.email : "";
  const metadata = data.claims.user_metadata as { full_name?: string } | undefined;
  const userId = typeof data.claims.sub === "string" ? data.claims.sub : "";
  const [{ data: role }, { data: consentEvents }, { data: teams }, { data: claims }, { data: memberships }, { data: teamRequests }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
    supabase.from("marketing_consent_events").select("granted").eq("user_id", userId).order("recorded_at", { ascending: false }).limit(1),
    supabase.from("club_teams").select("id, name, category, season").eq("status", "active").order("name"),
    supabase.from("team_claim_requests").select("id, team_id, requested_role, status, created_at").eq("user_id", userId).order("created_at", { ascending: false }),
    supabase.from("team_memberships").select("team_id, role").eq("user_id", userId),
    supabase.from("team_creation_requests").select("id, club_name, category, status").eq("user_id", userId).order("created_at", { ascending: false }),
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
          {role && ["owner", "admin"].includes(role.role) && <Link className="btn-secondary" href="/admin/pouzivatelia">Administrácia</Link>}
        </div>

        <div className="mt-8 border-t border-slate-200 pt-6">
          <h2 className="text-lg font-extrabold text-ink">Môj klubový tím</h2>
          <p className="mt-2 text-sm text-slate-600">Vyberte konkrétny tím a požiadajte o overenie. Prístup nevznikne automaticky.</p>
          <form action={requestTeamAccess} className="mt-4 grid gap-4 sm:grid-cols-2">
            <select className="field sm:col-span-2" name="teamId" required defaultValue=""><option value="" disabled>Vyberte klub a kategóriu</option>{teams?.map((team) => <option key={team.id} value={team.id}>{team.name} · {team.season}</option>)}</select>
            <label><span className="label">Funkcia v tíme</span><select className="field" name="requestedRole" required defaultValue="coach"><option value="coach">Tréner</option><option value="manager">Vedúci tímu</option><option value="club_admin">Administrátor klubu</option></select></label>
            <label><span className="label">Telefónne číslo <span className="font-normal text-slate-500">(voliteľné)</span></span><input className="field" name="phone" maxLength={30} placeholder="+421 900 000 000" type="tel" /></label>
            <label className="sm:col-span-2"><span className="label">Ako môžeme overiť váš vzťah k tímu? <span className="font-normal text-slate-500">(voliteľné)</span></span><textarea className="field min-h-28 resize-y" name="message" maxLength={1000} placeholder="Môžete uviesť napríklad svoju funkciu, klubový kontakt alebo odkaz na verejný profil." /></label>
            <p className="text-xs text-slate-500 sm:col-span-2">Žiadosť posúdime podľa e-mailu vášho účtu. Ak budeme potrebovať ďalšie potvrdenie, ozveme sa vám.</p>
            <button className="btn-primary justify-center sm:col-span-2" type="submit">Požiadať o správu tímu</button>
          </form>
          <details className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <summary className="cursor-pointer font-bold text-arena-700">Nenašli ste svoj tím?</summary>
            <p className="mt-2 text-sm text-slate-600">Navrhnite ho na pridanie. Zverejní sa až po kontrole administrátorom.</p>
            <form action={requestNewTeam} className="mt-4 grid gap-4 sm:grid-cols-2">
              <label><span className="label">Názov klubu</span><input className="field" name="clubName" maxLength={160} required /></label>
              <label><span className="label">Mesto</span><input className="field" name="city" maxLength={100} required /></label>
              <label><span className="label">Kategória</span><input className="field" name="category" maxLength={30} placeholder="U12" required /></label>
              <label><span className="label">Sezóna</span><input className="field" name="season" pattern="[0-9]{4}/[0-9]{2}" defaultValue="2026/27" required /></label>
              <label><span className="label">Vaša funkcia</span><select className="field" name="requestedRole" defaultValue="coach" required><option value="coach">Tréner</option><option value="manager">Vedúci tímu</option><option value="club_admin">Administrátor klubu</option></select></label>
              <label><span className="label">Odkaz <span className="font-normal text-slate-500">(voliteľné)</span></span><input className="field" name="sourceUrl" maxLength={500} placeholder="Sportnet alebo web klubu" type="url" /></label>
              <label className="sm:col-span-2"><span className="label">Poznámka <span className="font-normal text-slate-500">(voliteľné)</span></span><textarea className="field min-h-24" name="message" maxLength={1000} /></label>
              <button className="btn-secondary justify-center sm:col-span-2" type="submit">Odoslať tím na schválenie</button>
            </form>
          </details>
          {(memberships?.length ?? 0) > 0 && <p className="mt-4 text-sm font-semibold text-arena-700">Overené tímy: {memberships?.length}</p>}
          {(claims?.length ?? 0) > 0 && <div className="mt-4 space-y-2">{claims?.map((claim) => <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm" key={claim.id}>Žiadosť: <strong>{claim.status === "pending" ? "čaká na schválenie" : claim.status === "approved" ? "schválená" : "zamietnutá"}</strong></p>)}</div>}
          {(teamRequests?.length ?? 0) > 0 && <div className="mt-4 space-y-2">{teamRequests?.map((request) => <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm" key={request.id}>{request.club_name} {request.category}: <strong>{request.status === "pending" ? "čaká na schválenie" : request.status === "approved" ? "schválený" : "zamietnutý"}</strong></p>)}</div>}
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
