import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createTrainingSeries } from "./actions";

type CalendarEvent = {
  nomination_id: string;
  title: string;
  event_type: "match" | "tournament" | "training" | "other";
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  status: string;
  nominated_count: number;
  accepted_count: number;
  declined_count: number;
  pending_count: number;
  present_count: number;
  absent_count: number;
  attendance_unmarked_count: number;
  can_manage: boolean;
};

type TrainingStat = {
  player_id: string;
  player_name: string;
  player_status: string;
  training_count: number;
  present_count: number;
  absent_count: number;
  unrecorded_count: number;
  attendance_rate: number | null;
};

const monthName = new Intl.DateTimeFormat("sk-SK", { month: "long", year: "numeric", timeZone: "UTC" });
const dateTime = new Intl.DateTimeFormat("sk-SK", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Bratislava" });
const time = new Intl.DateTimeFormat("sk-SK", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Bratislava" });
const eventNames = { match: "Zápas", tournament: "Turnaj", training: "Tréning", other: "Iná udalosť" } as const;
const eventClasses = {
  match: "border-blue-200 bg-blue-50 text-blue-800",
  tournament: "border-violet-200 bg-violet-50 text-violet-800",
  training: "border-emerald-200 bg-emerald-50 text-emerald-800",
  other: "border-slate-200 bg-slate-50 text-slate-700",
} as const;

function currentMonth() {
  const parts = new Intl.DateTimeFormat("en", { year: "numeric", month: "2-digit", timeZone: "Europe/Bratislava" }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

function normalizeMonth(value?: string) {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return currentMonth();
  return value;
}

function shiftMonth(month: string, difference: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + difference, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function localDateKey(value: string) {
  const parts = new Intl.DateTimeFormat("en", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Bratislava" }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function seasonRange(season: string) {
  const match = season.match(/^(\d{4})\s*\/\s*(\d{2}|\d{4})$/);
  if (match) {
    const startYear = Number(match[1]);
    const endYear = match[2].length === 2 ? Math.floor(startYear / 100) * 100 + Number(match[2]) : Number(match[2]);
    return { from: `${startYear}-07-01`, to: `${endYear}-06-30` };
  }
  const now = new Date();
  const year = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return { from: `${year}-07-01`, to: `${year + 1}-06-30` };
}

export default async function TeamCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ mesiac?: string; stav?: string }>;
}) {
  const { teamId } = await params;
  const query = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(teamId)) notFound();
  const month = normalizeMonth(query.mesiac);
  const [year, monthNumber] = month.split("-").map(Number);
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = typeof auth?.claims?.sub === "string" ? auth.claims.sub : null;
  if (!userId) redirect("/prihlasenie");

  const [{ data: team }, { data: calendarData, error }, { data: membership }, { data: role }] = await Promise.all([
    supabase.from("club_teams").select("id, name, category, season").eq("id", teamId).maybeSingle(),
    supabase.rpc("get_team_calendar_events", { p_team_id: teamId, p_month: `${month}-01` }),
    supabase.from("team_memberships").select("role").eq("team_id", teamId).eq("user_id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
  ]);
  if (!team) notFound();
  if (error) redirect(`/timy/${teamId}`);

  const events = (calendarData as CalendarEvent[] | null) ?? [];
  const canManage = Boolean(membership && ["coach", "manager", "club_admin"].includes(membership.role)) || Boolean(role && ["owner", "admin"].includes(role.role));
  const range = seasonRange(team.season);
  let stats: TrainingStat[] = [];
  if (canManage) {
    const { data } = await supabase.rpc("get_team_training_stats", { p_team_id: teamId, p_from: range.from, p_to: range.to });
    stats = (data as TrainingStat[] | null) ?? [];
  }

  const firstWeekday = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const days = Array.from({ length: firstWeekday + daysInMonth }, (_, index) => index < firstWeekday ? null : index - firstWeekday + 1);
  const byDay = new Map<number, CalendarEvent[]>();
  for (const event of events) {
    const day = Number(localDateKey(event.starts_at).slice(-2));
    byDay.set(day, [...(byDay.get(day) ?? []), event]);
  }
  const titleMonth = monthName.format(new Date(Date.UTC(year, monthNumber - 1, 1)));

  return <section className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
    <Link className="text-sm font-bold text-arena-700" href={`/timy/${teamId}`}>← Späť na tím</Link>
    <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="eyebrow">{team.name}</p><h1 className="mt-2 text-3xl font-extrabold text-ink">Tímový kalendár</h1><p className="mt-2 text-slate-600">{team.category} · sezóna {team.season}</p></div>
      {canManage && <a className="btn-primary" href="#novy-trening">Pridať tréning</a>}
    </div>

    {query.stav === "trening-vytvoreny" && <p className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 font-bold text-emerald-800">Tréning bol pridaný do kalendára. Rodičia už môžu potvrdiť účasť.</p>}

    <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <Link aria-label="Predchádzajúci mesiac" className="btn-secondary px-4" href={`?mesiac=${shiftMonth(month, -1)}`}>←</Link>
        <h2 className="text-xl font-extrabold capitalize text-ink">{titleMonth}</h2>
        <Link aria-label="Nasledujúci mesiac" className="btn-secondary px-4" href={`?mesiac=${shiftMonth(month, 1)}`}>→</Link>
      </div>

      <div className="mt-5 hidden grid-cols-7 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 md:grid">
        {["Po", "Ut", "St", "Št", "Pi", "So", "Ne"].map((day) => <div className="bg-slate-50 px-3 py-2 text-center text-xs font-extrabold uppercase text-slate-500" key={day}>{day}</div>)}
        {days.map((day, index) => <div className="min-h-32 bg-white p-2" key={`${month}-${index}`}>
          {day && <><p className="text-sm font-extrabold text-slate-500">{day}</p><div className="mt-2 space-y-1.5">{(byDay.get(day) ?? []).map((event) => <Link className={`block rounded-lg border px-2 py-1.5 text-xs font-bold transition hover:brightness-95 ${eventClasses[event.event_type]}`} href={`/nominacie/${event.nomination_id}`} key={event.nomination_id}><span className="block">{time.format(new Date(event.starts_at))} · {eventNames[event.event_type]}</span><span className="mt-0.5 block truncate font-semibold">{event.title}</span></Link>)}</div></>}
        </div>)}
      </div>

      <div className="mt-5 space-y-3 md:hidden">{events.map((event) => <Link className="block rounded-2xl border border-slate-200 p-4" href={`/nominacie/${event.nomination_id}`} key={event.nomination_id}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-wide text-arena-700">{eventNames[event.event_type]}</p><p className="mt-1 font-extrabold text-ink">{event.title}</p><p className="mt-1 text-sm text-slate-600">{dateTime.format(new Date(event.starts_at))}{event.location ? ` · ${event.location}` : ""}</p></div><span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${eventClasses[event.event_type]}`}>Detail</span></div></Link>)}{events.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-600">V tomto mesiaci zatiaľ nie je žiadna udalosť.</p>}</div>
    </div>

    {canManage && <details className="mt-8 rounded-3xl border border-arena-200 bg-arena-50 p-5 sm:p-7" id="novy-trening"><summary className="cursor-pointer text-lg font-extrabold text-ink">Nový tréning alebo séria tréningov</summary><p className="mt-2 text-sm text-slate-600">Automaticky sa pridajú všetci aktívni hráči tímu. Pri opakovaní vznikne tréning v rovnaký deň a čas každý týždeň.</p>
      <form action={createTrainingSeries} className="mt-6 space-y-5"><input name="teamId" type="hidden" value={teamId}/><div className="grid gap-4 sm:grid-cols-2"><label className="font-bold text-ink">Názov<input className="field mt-2" defaultValue="Tímový tréning" maxLength={120} name="title" required/></label><label className="font-bold text-ink">Miesto<input className="field mt-2" maxLength={160} name="location" placeholder="Ihrisko alebo adresa"/></label><label className="font-bold text-ink">Začiatok<input className="field mt-2" name="startsAt" type="datetime-local" required/><span className="mt-1 block text-xs font-normal text-slate-500">Slovenský čas</span></label><label className="font-bold text-ink">Koniec<input className="field mt-2" name="endsAt" type="datetime-local" required/></label><label className="font-bold text-ink">Počet týždňov<select className="field mt-2" defaultValue="1" name="repeatWeeks"><option value="1">Iba tento tréning</option><option value="4">4 týždne</option><option value="8">8 týždňov</option><option value="12">12 týždňov</option><option value="26">Pol sezóny (26 týždňov)</option><option value="40">Celá sezóna (40 týždňov)</option></select></label></div><label className="block font-bold text-ink">Pokyny pre rodičov<textarea className="field mt-2 min-h-24" maxLength={1000} name="note" placeholder="Čas zrazu, výstroj alebo ďalšie pokyny"/></label><button className="btn-primary" type="submit">Pridať do kalendára</button></form>
    </details>}

    {canManage && <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><div><p className="eyebrow">Sezóna {team.season}</p><h2 className="mt-2 text-2xl font-extrabold text-ink">Dochádzka na tréningy</h2><p className="mt-2 text-sm text-slate-600">Štatistika počíta iba uskutočnené tréningy, pri ktorých bola dochádzka zaznamenaná trénerom.</p></div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-wide text-slate-500"><th className="px-3 py-3">Hráč</th><th className="px-3 py-3 text-center">Tréningy</th><th className="px-3 py-3 text-center">Bol</th><th className="px-3 py-3 text-center">Chýbal</th><th className="px-3 py-3 text-center">Nezadané</th><th className="px-3 py-3 text-right">Účasť</th></tr></thead><tbody className="divide-y divide-slate-100">{stats.map((stat) => <tr className={stat.player_status === "inactive" ? "text-slate-400" : "text-slate-700"} key={stat.player_id}><td className="px-3 py-3 font-bold">{stat.player_name}{stat.player_status === "inactive" && <span className="ml-2 text-xs font-normal">neaktívny</span>}</td><td className="px-3 py-3 text-center">{stat.training_count}</td><td className="px-3 py-3 text-center font-bold text-emerald-700">{stat.present_count}</td><td className="px-3 py-3 text-center font-bold text-red-700">{stat.absent_count}</td><td className="px-3 py-3 text-center text-slate-500">{stat.unrecorded_count}</td><td className="px-3 py-3 text-right font-extrabold text-ink">{stat.attendance_rate === null ? "—" : `${stat.attendance_rate} %`}</td></tr>)}</tbody></table>{stats.length === 0 && <p className="py-8 text-center text-slate-600">Tím zatiaľ nemá hráčov alebo evidovanú dochádzku.</p>}</div></div>}
  </section>;
}
