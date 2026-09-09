import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type TeamOverview = { team_id: string; team_name: string; category: string; season: string; city: string; team_status: string; active_players: number; staff_members: number };

export default async function AdminTeamOverviewPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = typeof auth?.claims?.sub === "string" ? auth.claims.sub : null;
  if (!userId) redirect("/prihlasenie");
  const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
  if (!role || !["owner", "admin"].includes(role.role)) redirect("/ucet");
  const { data, error } = await supabase.rpc("get_admin_team_overview");
  if (error) throw new Error("Zoznam tímov sa nepodarilo načítať.");
  const teams = (data as TeamOverview[] | null) ?? [];

  return <section className="mx-auto max-w-6xl px-5 py-12 lg:px-8 lg:py-16">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">Administrácia</p><h1 className="mt-2 text-3xl font-extrabold text-ink">Registrované tímy</h1><p className="mt-2 text-slate-600">{teams.length} tímov v databáze Tournio.</p></div><div className="flex gap-3"><Link className="btn-secondary" href="/admin/timy">Žiadosti</Link><Link className="btn-secondary" href="/admin/pouzivatelia">Používatelia</Link></div></div>
    <div className="mt-8 grid gap-4 md:grid-cols-2">{teams.map((team) => <Link className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-arena-300 hover:shadow-md" href={`/timy/${team.team_id}`} key={team.team_id}>
      <div className="flex items-start justify-between gap-3"><div><h2 className="font-extrabold text-ink">{team.team_name}</h2><p className="mt-1 text-sm text-slate-600">{team.city} · {team.category} · {team.season}</p></div><span className={team.team_status === "active" ? "status-open" : "rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500"}>{team.team_status === "active" ? "Aktívny" : "Neaktívny"}</span></div>
      <div className="mt-4 flex gap-4 text-sm font-semibold text-slate-700"><span>{team.active_players} hráčov</span><span>{team.staff_members} členov realizačného tímu</span></div>
    </Link>)}{teams.length === 0 && <p className="rounded-2xl border bg-white p-8 text-center text-slate-600">Nie sú evidované žiadne tímy.</p>}</div>
  </section>;
}
