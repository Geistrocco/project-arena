import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { saveDiscount, setAccountStatus, setAdminRole } from "@/app/admin/actions";

type Profile = { id: string; full_name: string; email: string | null; created_at: string };
type Control = {
  user_id: string;
  status: "active" | "suspended";
  suspension_reason: string | null;
  discount_percent: number;
  discount_note: string | null;
  discount_expires_at: string | null;
};
type Consent = { user_id: string; granted: boolean; recorded_at: string };
type UserRole = { user_id: string; role: "owner" | "admin" };

const date = new Intl.DateTimeFormat("sk-SK", { dateStyle: "medium", timeStyle: "short" });

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; stav?: string; mail?: string; roleMail?: string }> }) {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const adminId = typeof claimsData?.claims?.sub === "string" ? claimsData.claims.sub : null;
  if (claimsError || !adminId) redirect("/prihlasenie");

  const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", adminId).maybeSingle();
  if (!role || !["owner", "admin"].includes(role.role)) redirect("/ucet");

  const [{ data: profiles }, { data: controls }, { data: consents }, { data: userRoles }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, created_at").order("created_at", { ascending: false }),
    supabase.from("account_controls").select("user_id, status, suspension_reason, discount_percent, discount_note, discount_expires_at"),
    supabase.from("marketing_consent_events").select("user_id, granted, recorded_at").order("recorded_at", { ascending: false }),
    supabase.from("user_roles").select("user_id, role"),
  ]);

  const controlByUser = new Map((controls as Control[] | null)?.map((item) => [item.user_id, item]));
  const latestConsent = new Map<string, Consent>();
  const roleByUser = new Map((userRoles as UserRole[] | null)?.map((item) => [item.user_id, item.role]));
  for (const consent of (consents as Consent[] | null) ?? []) {
    if (!latestConsent.has(consent.user_id)) latestConsent.set(consent.user_id, consent);
  }

  const params = await searchParams;
  const query = (params.q ?? "").trim().toLocaleLowerCase("sk");
  const statusFilter = params.stav === "active" || params.stav === "suspended" ? params.stav : "all";
  const allProfiles = (profiles as Profile[] | null) ?? [];
  const users = allProfiles.filter((profile) => {
    const control = controlByUser.get(profile.id);
    const matchesText = !query || profile.full_name.toLocaleLowerCase("sk").includes(query) || (profile.email ?? "").toLocaleLowerCase("sk").includes(query);
    const matchesStatus = statusFilter === "all" || (control?.status ?? "active") === statusFilter;
    return matchesText && matchesStatus;
  });
  const active = allProfiles.filter((profile) => controlByUser.get(profile.id)?.status !== "suspended").length;
  const suspended = allProfiles.length - active;
  const marketing = allProfiles.filter((profile) => latestConsent.get(profile.id)?.granted === true).length;

  return (
    <section className="mx-auto max-w-7xl px-5 py-12 lg:px-8 lg:py-16">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="eyebrow">Administrácia</p><h1 className="mt-2 text-3xl font-extrabold text-ink sm:text-4xl">Používatelia</h1><p className="mt-2 text-slate-600">Registrácie, prístupy, marketingové súhlasy a zľavy.</p></div>
        <div className="flex gap-3"><Link className="btn-secondary" href="/admin/timy">Žiadosti o tímy</Link><Link className="btn-secondary" href="/ucet">Späť na účet</Link></div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Registrovaní" value={allProfiles.length} />
        <Stat label="Aktívni / pozastavení" value={`${active} / ${suspended}`} />
        <Stat label="Marketingový súhlas" value={marketing} />
      </div>

      {params.mail === "sent" && <p className="mt-6 rounded-2xl border border-green-200 bg-green-50 px-5 py-4 font-semibold text-green-800">Zľava bola uložená a používateľovi sme poslali e-mail.</p>}
      {params.mail === "failed" && <p className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 font-semibold text-amber-900">Zľava bola uložená, ale e-mail sa nepodarilo odoslať. Skontrolujte nastavenie Resend.</p>}
      {params.roleMail === "sent" && <p className="mt-6 rounded-2xl border border-green-200 bg-green-50 px-5 py-4 font-semibold text-green-800">Administrátorské oprávnenie bolo zmenené a používateľovi sme poslali e-mail.</p>}
      {params.roleMail === "failed" && <p className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 font-semibold text-amber-900">Oprávnenie bolo zmenené, ale e-mail sa nepodarilo odoslať.</p>}

      <form className="mt-8 grid gap-3 rounded-2xl border bg-white p-4 shadow-sm sm:grid-cols-[1fr_200px_auto]" method="get">
        <input className="field" defaultValue={params.q} name="q" placeholder="Hľadať meno alebo e-mail" />
        <select className="field" defaultValue={statusFilter} name="stav">
          <option value="all">Všetky stavy</option><option value="active">Aktívni</option><option value="suspended">Pozastavení</option>
        </select>
        <button className="btn-primary justify-center" type="submit">Filtrovať</button>
      </form>

      <div className="mt-6 space-y-4">
        {users.map((profile) => {
          const control = controlByUser.get(profile.id);
          const isSuspended = control?.status === "suspended";
          const consent = latestConsent.get(profile.id)?.granted === true;
          const userRole = roleByUser.get(profile.id);
          const isOwner = userRole === "owner";
          const protectedFromAdmin = isOwner && role.role !== "owner";
          return (
            <article className="rounded-2xl border bg-white p-5 shadow-sm" key={profile.id}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-extrabold text-ink">{profile.full_name || "Bez mena"}</h2>
                    <span className={isSuspended ? "status-full" : "status-open"}>{isSuspended ? "Pozastavený" : "Aktívny"}</span>
                    {isOwner && <span className="sport-pill">Vlastník</span>}
                    {userRole === "admin" && <span className="sport-pill">Administrátor</span>}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{profile.email || "E-mail nie je uložený"}</p>
                  <p className="mt-1 text-xs text-slate-500">Registrácia: {date.format(new Date(profile.created_at))} · Marketing: {consent ? "áno" : "nie"}</p>
                  {isSuspended && control?.suspension_reason && <p className="mt-2 text-sm font-medium text-red-700">Dôvod: {control.suspension_reason}</p>}
                </div>

                <form action={setAccountStatus} className="flex w-full max-w-xl flex-col gap-2 sm:flex-row">
                  <input name="userId" type="hidden" value={profile.id} />
                  <input name="status" type="hidden" value={isSuspended ? "active" : "suspended"} />
                  {!isSuspended && <input className="field" name="reason" placeholder="Dôvod pozastavenia" required />}
                  <button className={isSuspended ? "btn-secondary justify-center" : "inline-flex min-h-11 items-center justify-center rounded-xl bg-red-700 px-5 text-sm font-bold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-slate-300"} disabled={(profile.id === adminId && !isSuspended) || protectedFromAdmin} type="submit">
                    {isSuspended ? "Obnoviť účet" : "Pozastaviť"}
                  </button>
                </form>
              </div>

              <form action={saveDiscount} className="mt-5 grid gap-3 border-t pt-5 sm:grid-cols-[120px_1fr_180px_auto]">
                <input name="userId" type="hidden" value={profile.id} />
                <label><span className="label">Zľava %</span><input className="field" defaultValue={control?.discount_percent ?? 0} max="100" min="0" name="discountPercent" type="number" /></label>
                <label><span className="label">Poznámka</span><input className="field" defaultValue={control?.discount_note ?? ""} name="discountNote" placeholder="Napr. partnerský klub" /></label>
                <label><span className="label">Platí do</span><input className="field" defaultValue={control?.discount_expires_at?.slice(0, 10) ?? ""} name="discountExpiresAt" type="date" /></label>
                <button className="btn-secondary self-end justify-center" disabled={protectedFromAdmin} type="submit">Uložiť a poslať e-mail</button>
              </form>
              {role.role === "owner" && !isOwner && <form action={setAdminRole} className="mt-4 flex justify-end border-t pt-4"><input name="userId" type="hidden" value={profile.id} /><input name="enabled" type="hidden" value={userRole === "admin" ? "false" : "true"} /><button className="btn-secondary" type="submit">{userRole === "admin" ? "Odobrať administrátora" : "Pridať administrátora"}</button></form>}
            </article>
          );
        })}
        {users.length === 0 && <p className="rounded-2xl border bg-white p-8 text-center text-slate-600">Žiadni používatelia nezodpovedajú filtru.</p>}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-sm font-semibold text-slate-500">{label}</p><p className="mt-2 text-3xl font-extrabold text-ink">{value}</p></div>;
}
