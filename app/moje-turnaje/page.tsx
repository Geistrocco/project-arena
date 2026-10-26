import Link from "next/link";
import { redirect } from "next/navigation";
import { TournamentCard } from "@/components/tournament-card";
import { getMyTournaments } from "@/lib/tournaments";

export const metadata = { title: "Moje turnaje" };

export default async function MyTournamentsPage() {
  const tournaments = await getMyTournaments();
  if (!tournaments) redirect("/prihlasenie?dovod=turnaje");

  return <section className="mx-auto max-w-7xl px-5 py-12 lg:px-8 lg:py-16">
    <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div><p className="eyebrow">Priestor organizátora</p><h1 className="mt-3 text-4xl font-black tracking-[-0.03em] sm:text-5xl">Moje turnaje</h1><p className="mt-3 text-slate-600">Na jednom mieste vidíte všetky turnaje, ktoré ste vytvorili.</p></div>
      <Link className="btn-primary shrink-0" href="/vytvorit-turnaj">Vytvoriť turnaj</Link>
    </div>
    {tournaments.length > 0
      ? <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">{tournaments.map((tournament) => <TournamentCard key={tournament.slug} tournament={tournament} />)}</div>
      : <div className="mt-10 rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><h2 className="text-xl font-extrabold text-ink">Zatiaľ nemáte vytvorený turnaj</h2><p className="mt-2 text-slate-500">Po vytvorení sa zobrazí práve tu a na hlavnej stránke bude označený ako váš.</p><Link className="btn-primary mt-6" href="/vytvorit-turnaj">Vytvoriť prvý turnaj</Link></div>}
  </section>;
}
