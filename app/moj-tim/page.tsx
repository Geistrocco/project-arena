import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowIcon, UsersIcon } from "@/components/icons";
import { getMyTeams } from "@/lib/my-teams";

const staffRoleNames = { coach: "Tréner", manager: "Vedúci tímu", club_admin: "Administrátor klubu" } as const;

export const metadata = { title: "Môj tím" };

export default async function MyTeamPage() {
  const { userId, teams } = await getMyTeams();
  if (!userId) redirect("/prihlasenie");
  if (teams.length === 1) redirect(`/timy/${teams[0].id}/prehlad`);

  return <section className="mx-auto max-w-5xl px-5 py-12 sm:py-16">
    <div><p className="eyebrow">Moje tímy</p><h1 className="mt-2 text-3xl font-extrabold text-ink">Môj tím</h1><p className="mt-2 max-w-2xl text-slate-600">Kalendár, nominácie, hráči a všetky dôležité tímové informácie na jednom mieste.</p></div>

    {teams.length > 1 && <div className="mt-8 grid gap-5 sm:grid-cols-2">{teams.map((team) => <Link className="group rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-arena-300 hover:shadow-md" href={`/timy/${team.id}/prehlad`} key={team.id}>
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-extrabold uppercase tracking-wider text-arena-700">{team.staffRole ? staffRoleNames[team.staffRole] : "Rodič"}</p><h2 className="mt-2 text-xl font-extrabold text-ink">{team.name}</h2><p className="mt-1 text-sm text-slate-600">{team.category} · sezóna {team.season}</p></div><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-arena-50 text-arena-700"><UsersIcon /></span></div>
      <p className="mt-5 text-sm text-slate-600">{team.activePlayerCount} aktívnych hráčov{team.ownPlayerNames.length > 0 ? ` · ${team.ownPlayerNames.join(", ")}` : ""}</p>
      <span className="mt-5 inline-flex items-center gap-2 text-sm font-extrabold text-arena-700">Otvoriť tím <ArrowIcon className="h-4 w-4 transition group-hover:translate-x-1" /></span>
    </Link>)}</div>}

    {teams.length === 0 && <div className="mt-8 rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center sm:p-12"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-arena-50 text-arena-700"><UsersIcon className="h-7 w-7" /></span><h2 className="mt-5 text-xl font-extrabold text-ink">Zatiaľ tu nemáte žiadny tím</h2><p className="mx-auto mt-2 max-w-lg text-slate-600">Rodič tu uvidí tím po prijatí hráča. Tréner alebo vedúci môže požiadať o správu existujúceho tímu.</p><Link className="btn-primary mt-6" href="/ucet#klubovy-tim">Pridať alebo nájsť tím</Link></div>}
  </section>;
}
