import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TrainingCalendar, type CalendarEvent } from "./training-calendar";

type CalendarEventData = CalendarEvent & {
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

  const events = (calendarData as CalendarEventData[] | null) ?? [];
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
  const titleMonth = monthName.format(new Date(Date.UTC(year, monthNumber - 1, 1)));

  return <section className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
    <Link className="text-sm font-bold text-arena-700" href={`/timy/${teamId}/prehlad`}>← Späť na prehľad tímu</Link>
    <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="eyebrow">{team.name}</p><h1 className="mt-2 text-3xl font-extrabold text-ink">Tímový kalendár</h1><p className="mt-2 text-slate-600">{team.category} · sezóna {team.season}</p></div>
      <p className="rounded-xl bg-arena-50 px-4 py-3 text-sm font-bold text-arena-800">Klikni na deň a pozri si jeho program</p>
    </div>

    {query.stav === "trening-vytvoreny" && <p className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 font-bold text-emerald-800">Tréning bol pridaný do kalendára. Rodičia už môžu potvrdiť účasť.</p>}

    <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <Link aria-label="Predchádzajúci mesiac" className="btn-secondary px-4" href={`?mesiac=${shiftMonth(month, -1)}`}>←</Link>
        <h2 className="text-xl font-extrabold capitalize text-ink">{titleMonth}</h2>
        <Link aria-label="Nasledujúci mesiac" className="btn-secondary px-4" href={`?mesiac=${shiftMonth(month, 1)}`}>→</Link>
      </div>

      <div className="mt-5"><TrainingCalendar key={month} canManage={canManage} days={days} events={events} month={month} teamId={teamId}/></div>
    </div>

    {canManage && <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7" id="statistiky"><div><p className="eyebrow">Sezóna {team.season}</p><h2 className="mt-2 text-2xl font-extrabold text-ink">Dochádzka na tréningy</h2><p className="mt-2 text-sm text-slate-600">Štatistika počíta iba uskutočnené tréningy, pri ktorých bola dochádzka zaznamenaná trénerom.</p></div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-wide text-slate-500"><th className="px-3 py-3">Hráč</th><th className="px-3 py-3 text-center">Tréningy</th><th className="px-3 py-3 text-center">Bol</th><th className="px-3 py-3 text-center">Chýbal</th><th className="px-3 py-3 text-center">Nezadané</th><th className="px-3 py-3 text-right">Účasť</th></tr></thead><tbody className="divide-y divide-slate-100">{stats.map((stat) => <tr className={stat.player_status === "inactive" ? "text-slate-400" : "text-slate-700"} key={stat.player_id}><td className="px-3 py-3 font-bold">{stat.player_name}{stat.player_status === "inactive" && <span className="ml-2 text-xs font-normal">neaktívny</span>}</td><td className="px-3 py-3 text-center">{stat.training_count}</td><td className="px-3 py-3 text-center font-bold text-emerald-700">{stat.present_count}</td><td className="px-3 py-3 text-center font-bold text-red-700">{stat.absent_count}</td><td className="px-3 py-3 text-center text-slate-500">{stat.unrecorded_count}</td><td className="px-3 py-3 text-right font-extrabold text-ink">{stat.attendance_rate === null ? "—" : `${stat.attendance_rate} %`}</td></tr>)}</tbody></table>{stats.length === 0 && <p className="py-8 text-center text-slate-600">Tím zatiaľ nemá hráčov alebo evidovanú dochádzku.</p>}</div></div>}
  </section>;
}
