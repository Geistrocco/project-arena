import Link from "next/link";
import { notFound } from "next/navigation";
import { TournamentPlan } from "@/components/tournament-plan";
import { TournamentScorekeepers } from "@/components/tournament-scorekeepers";
import { getTournamentPlan } from "@/lib/tournament-plan-data";
import { getTournamentBySlug } from "@/lib/tournaments";
import { TournamentResultLock } from "@/components/tournament-result-lock";
import { TournamentResultStatus } from "@/components/tournament-result-status";

export const metadata = { title: "Administrácia turnaja" };

export default async function TournamentAdministration({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ stav?: string }> }) {
  const { slug } = await params;
  const query = await searchParams;
  const [tournament, plan] = await Promise.all([getTournamentBySlug(slug), getTournamentPlan(slug)]);
  if (!tournament || !plan?.canScore) notFound();
  const finished = plan.matches.filter((match) => match.status === "finished").length;
  const teams = new Set(plan.groups.flatMap((group) => group.teams.map((team) => team.team_name))).size;
  const dateTime = new Intl.DateTimeFormat("sk-SK", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Bratislava" });

  return <section className="mx-auto max-w-7xl px-5 py-10 lg:px-8 lg:py-14">
    {query.stav === "upraveny" && <p className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 font-bold text-emerald-800" role="status">Zmeny turnaja boli uložené a harmonogram bol aktualizovaný.</p>}
    <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
      <div><Link className="text-sm font-bold text-slate-500 hover:text-arena-700" href="/moje-turnaje">← Moje turnaje</Link><p className="eyebrow mt-6">{plan.canManage ? "Administrácia turnaja" : "Zadávanie výsledkov"}</p><h1 className="mt-3 text-4xl font-black tracking-[-0.03em] sm:text-5xl">{tournament.name}</h1><p className="mt-3 text-slate-600">{tournament.displayDate} · {tournament.city}</p></div>
      <div className="flex flex-wrap gap-3"><Link className="btn-secondary" href={`/turnaje/${slug}`}>Verejná stránka</Link>{plan.canManage && !plan.lockedAt && <Link className="btn-primary" href={`/turnaje/${slug}/upravit`}>Upraviť turnaj</Link>}</div>
    </div>

    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="Tímy" value={String(teams)} />
      <Stat label="Zápasy" value={String(plan.matches.length)} />
      <Stat label="Odohrané" value={`${finished}/${plan.matches.length}`} />
      <Stat label="Poverené osoby" value={String(plan.scorekeepers.length)} />
    </div>

    <div className="mt-8"><TournamentResultStatus lockedAt={plan.lockedAt} finished={plan.matches.length > 0 && finished === plan.matches.length} /></div>
    {plan.canManage && <TournamentResultLock slug={slug} lockedAt={plan.lockedAt} unfinished={plan.matches.filter((m) => m.status !== "finished" || m.home_score === null || m.away_score === null).length} matchCount={plan.matches.length} />}
    <div className="mt-10"><TournamentPlan embedded slug={slug} groups={plan.groups} matches={plan.matches} canManage={plan.canManage} canScore={plan.canScore && !plan.lockedAt} resultsLocked={Boolean(plan.lockedAt)} /></div>

    {plan.canManage && <div className="mt-10 grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
      <TournamentScorekeepers embedded slug={slug} scorekeepers={plan.scorekeepers} />
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card sm:p-8"><p className="eyebrow">Kontrola</p><h2 className="mt-2 text-2xl font-extrabold">História zmien</h2><p className="mt-2 text-sm text-slate-600">Posledné zmeny výsledkov a oprávnení.</p><div className="mt-6 space-y-4">{plan.auditEvents.map((event) => <div className="border-b border-slate-100 pb-4 last:border-0 last:pb-0" key={event.id}><div className="flex items-start justify-between gap-3"><p className="font-bold text-ink">{event.title}</p><time className="shrink-0 text-xs text-slate-400">{dateTime.format(new Date(event.createdAt))}</time></div><p className="mt-1 text-sm text-slate-600">{event.detail}</p></div>)}{plan.auditEvents.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Zatiaľ nebola zaznamenaná žiadna zmena.</p>}</div></section>
    </div>}
  </section>;
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">{label}</p><p className="mt-2 text-3xl font-black text-ink">{value}</p></div>; }
