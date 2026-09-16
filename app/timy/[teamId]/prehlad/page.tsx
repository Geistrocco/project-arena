import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowIcon, CalendarIcon, TrophyIcon, UsersIcon } from "@/components/icons";
import { getMyTeams } from "@/lib/my-teams";
import { createClient } from "@/lib/supabase/server";

type Nomination = {
  nomination_id: string;
  title: string;
  event_type: "match" | "tournament" | "training" | "other";
  starts_at: string;
  location: string | null;
  status: string;
  pending_count: number;
};

const staffRoleNames = { coach: "Tréner", manager: "Vedúci tímu", club_admin: "Administrátor klubu" } as const;
const eventNames = { match: "Zápas", tournament: "Turnaj", training: "Tréning", other: "Iná udalosť" } as const;
const dateTime = new Intl.DateTimeFormat("sk-SK", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Bratislava" });

export default async function TeamDashboardPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(teamId)) notFound();
  const { userId, teams } = await getMyTeams();
  if (!userId) redirect("/prihlasenie");
  const team = teams.find((item) => item.id === teamId);
  if (!team) redirect("/moj-tim");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_team_nominations", { p_team_id: teamId });
  if (error) throw new Error("Tímový prehľad sa nepodarilo načítať.");
  const nominations = (data as Nomination[] | null) ?? [];
  const now = new Date().getTime();
  const upcoming = nominations
    .filter((item) => item.status === "open" && new Date(item.starts_at).getTime() >= now)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  const nextEvent = upcoming[0];
  const canManage = team.staffRole !== null;

  return <section className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
    {teams.length > 1 && <Link className="text-sm font-bold text-arena-700" href="/moj-tim">← Všetky moje tímy</Link>}
    <div className={`${teams.length > 1 ? "mt-5" : ""} flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between`}><div><p className="eyebrow">{team.staffRole ? staffRoleNames[team.staffRole] : "Rodičovský prístup"}</p><h1 className="mt-2 text-3xl font-extrabold text-ink sm:text-4xl">{team.name}</h1><p className="mt-2 text-slate-600">{team.category} · sezóna {team.season}</p>{team.ownPlayerNames.length > 0 && <p className="mt-2 text-sm font-semibold text-arena-800">Moje {team.ownPlayerNames.length === 1 ? "dieťa" : "deti"}: {team.ownPlayerNames.join(", ")}</p>}</div>{canManage && <div className="flex flex-wrap gap-3"><Link className="btn-secondary" href={`/timy/${teamId}/nominacie#nova-nominacia`}>Nová nominácia</Link><Link className="btn-primary" href={`/timy/${teamId}/kalendar#novy-trening`}>Pridať tréning</Link></div>}</div>

    <div className="mt-8 rounded-3xl bg-ink p-6 text-white shadow-sm sm:p-8">{nextEvent ? <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-extrabold uppercase tracking-[0.18em] text-arena-400">Najbližšie · {eventNames[nextEvent.event_type]}</p><h2 className="mt-3 text-2xl font-extrabold">{nextEvent.title}</h2><p className="mt-2 text-slate-300">{dateTime.format(new Date(nextEvent.starts_at))}{nextEvent.location ? ` · ${nextEvent.location}` : ""}</p><p className="mt-3 text-sm font-bold text-amber-300">{nextEvent.pending_count} {nextEvent.pending_count === 1 ? "odpoveď čaká" : "odpovedí čaká"}</p></div><Link className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-extrabold text-ink transition hover:bg-slate-100" href={`/nominacie/${nextEvent.nomination_id}`}>Otvoriť detail <ArrowIcon className="h-4 w-4" /></Link></div> : <div><p className="text-xs font-extrabold uppercase tracking-[0.18em] text-arena-400">Najbližšia udalosť</p><h2 className="mt-3 text-2xl font-extrabold">Kalendár je zatiaľ voľný</h2><p className="mt-2 text-slate-300">Nové tréningy, zápasy a turnaje sa zobrazia práve tu.</p></div>}</div>

    <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      <DashboardCard href={`/timy/${teamId}/kalendar`} icon={<CalendarIcon />} title="Kalendár" text={nextEvent ? `Najbližšie ${dateTime.format(new Date(nextEvent.starts_at))}` : "Tréningy, zápasy a turnaje"} />
      <DashboardCard href={`/timy/${teamId}/nominacie`} icon={<TrophyIcon />} title="Nominácie" text={upcoming.length > 0 ? `${upcoming.length} ${upcoming.length === 1 ? "otvorená udalosť" : "otvorené udalosti"}` : "Prehľad nominácií tímu"} badge={upcoming.reduce((sum, item) => sum + Number(item.pending_count), 0)} />
      <DashboardCard href={`/timy/${teamId}`} icon={<UsersIcon />} title="Hráči" text={`${team.activePlayerCount} aktívnych hráčov`} />
      <DashboardCard href={canManage ? `/timy/${teamId}/kalendar#statistiky` : `/timy/${teamId}/kalendar`} icon={<ArrowIcon />} title={canManage ? "Dochádzka" : "Účasť"} text={canManage ? "Sezónne štatistiky hráčov" : "Potvrďte účasť svojho dieťaťa"} />
    </div>

    {!canManage && <div className="mt-6 rounded-2xl border border-arena-100 bg-arena-50 p-5"><p className="font-extrabold text-ink">Prehľad pre rodiča</p><p className="mt-1 text-sm text-slate-600">Vidíte kalendár, súpisku aj celú nomináciu tímu. Potvrdiť alebo odmietnuť môžete iba účasť svojho dieťaťa.</p></div>}
  </section>;
}

function DashboardCard({ href, icon, title, text, badge }: { href: string; icon: React.ReactNode; title: string; text: string; badge?: number }) {
  return <Link className="group relative rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-arena-300 hover:shadow-md" href={href}><span className="grid h-11 w-11 place-items-center rounded-2xl bg-arena-50 text-arena-700">{icon}</span>{badge !== undefined && badge > 0 && <span className="absolute right-5 top-5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-extrabold text-amber-900">{badge} čaká</span>}<h2 className="mt-5 text-lg font-extrabold text-ink">{title}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{text}</p><span className="mt-4 inline-flex items-center gap-2 text-sm font-extrabold text-arena-700">Otvoriť <ArrowIcon className="h-4 w-4 transition group-hover:translate-x-1" /></span></Link>;
}
