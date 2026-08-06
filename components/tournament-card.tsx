import Link from "next/link";
import type { Tournament } from "@/types/tournament";
import { ArrowIcon, CalendarIcon, PinIcon, UsersIcon } from "@/components/icons";

export function TournamentCard({ tournament }: { tournament: Tournament }) {
  const full = tournament.registered >= tournament.capacity;
  const percent = Math.min(100, Math.round((tournament.registered / tournament.capacity) * 100));
  return (
    <article className="group flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-card transition duration-300 hover:-translate-y-1 hover:border-arena-100 hover:shadow-xl">
      <div className="mb-5 flex items-start justify-between gap-3"><span className="sport-pill">{tournament.sport}</span><span className={full ? "status-full" : tournament.status === "Posledné miesta" ? "status-warning" : "status-open"}><span className="h-1.5 w-1.5 rounded-full bg-current" />{tournament.status}</span></div>
      <h2 className="text-xl font-bold tracking-tight text-ink group-hover:text-arena-700">{tournament.name}</h2>
      <p className="mt-1 text-sm font-semibold text-slate-500">Kategória {tournament.category}</p>
      <div className="mt-6 space-y-3 text-sm text-slate-600"><p className="detail-row"><CalendarIcon />{tournament.displayDate}</p><p className="detail-row"><PinIcon />{tournament.city}, {tournament.country}</p><p className="detail-row"><UsersIcon />{tournament.registered} z {tournament.capacity} {tournament.participantLabel}</p></div>
      <div className="mt-5"><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${full ? "bg-slate-500" : "bg-arena-500"}`} style={{ width: `${percent}%` }} /></div></div>
      <div className="mt-auto flex items-end justify-between gap-3 pt-6"><div><p className="text-xs text-slate-400">Štartovné</p><p className="mt-0.5 text-lg font-bold text-ink">{tournament.fee} €</p></div><Link className="inline-flex items-center gap-2 font-bold text-arena-700 hover:text-arena-600" href={`/turnaje/${tournament.slug}`}>Detail turnaja <ArrowIcon className="h-4 w-4 transition group-hover:translate-x-1" /></Link></div>
    </article>
  );
}
