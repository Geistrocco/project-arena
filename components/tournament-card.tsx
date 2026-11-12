import Link from "next/link";
import type { Tournament } from "@/types/tournament";
import { ArrowIcon, CalendarIcon, PinIcon, UsersIcon } from "@/components/icons";

const accents = ["from-emerald-100 to-lime-50", "from-sky-100 to-emerald-50", "from-amber-100 to-orange-50"];

export function TournamentCard({ tournament, index = 0 }: { tournament: Tournament; index?: number }) {
  const full = tournament.registered >= tournament.capacity;
  const percent = tournament.capacity ? Math.min(100, Math.round((tournament.registered / tournament.capacity) * 100)) : 0;
  const href = tournament.isOwned ? `/turnaje/${tournament.slug}/administracia` : `/turnaje/${tournament.slug}`;

  return (
    <article className={`tournament-card group ${tournament.isOwned ? "is-owned" : ""}`}>
      <div className={`relative overflow-hidden bg-gradient-to-br ${accents[index % accents.length]} px-5 pb-5 pt-4`}>
        <div className="absolute -right-8 -top-12 h-36 w-36 rounded-full border-[22px] border-white/45" aria-hidden="true" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="flex flex-wrap gap-2"><span className="sport-pill">{tournament.sport}</span>{tournament.isOwned && <span className="owned-pill">Môj turnaj</span>}</div>
          <span className={full ? "status-full" : tournament.status === "Posledné miesta" ? "status-warning" : "status-open"}><span className="h-1.5 w-1.5 rounded-full bg-current" />{tournament.status}</span>
        </div>
        <p className="relative mt-9 text-xs font-black uppercase tracking-[0.18em] text-ink/45">{tournament.city} · {tournament.category}</p>
      </div>

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <h3 className="display-heading text-2xl leading-tight text-ink transition group-hover:text-arena-700">{tournament.name}</h3>
        <div className="mt-5 grid gap-3 text-sm text-slate-600">
          <p className="detail-row"><CalendarIcon />{tournament.displayDate}</p>
          <p className="detail-row"><PinIcon />{tournament.city}{tournament.region ? ` · ${tournament.region}` : ""}, {tournament.country}</p>
          <p className="detail-row"><UsersIcon />{tournament.registered} z {tournament.capacity} {tournament.participantLabel}</p>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-xs font-bold text-slate-500"><span>Obsadenosť</span><span>{percent} %</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full transition-all ${full ? "bg-slate-500" : "bg-arena-500"}`} style={{ width: `${percent}%` }} /></div>
        </div>

        <div className="mt-6 flex items-end justify-between gap-3 border-t border-slate-100 pt-5">
          <div><p className="text-[0.68rem] font-bold uppercase tracking-wider text-slate-400">Štartovné</p><p className="mt-1 text-xl font-black text-ink">{tournament.fee} €</p></div>
          <Link className="card-link" href={href}>{tournament.isOwned ? "Spravovať" : "Detail"} <ArrowIcon className="h-4 w-4 transition group-hover:translate-x-1" /></Link>
        </div>
      </div>
    </article>
  );
}
