import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type RosterPlayer = { player_id: string; full_name: string; joined_at: string; status: "active" | "inactive" };
const date = new Intl.DateTimeFormat("sk-SK", { dateStyle: "medium", timeZone: "Europe/Bratislava" });

export default async function TeamRosterPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(teamId)) notFound();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/prihlasenie");
  const [{ data: team }, { data: roster, error }] = await Promise.all([
    supabase.from("club_teams").select("id, name, category, season").eq("id", teamId).maybeSingle(),
    supabase.rpc("get_visible_team_roster", { p_team_id: teamId }),
  ]);
  if (!team) notFound();
  if (error) redirect("/ucet");
  const players = (roster as RosterPlayer[] | null) ?? [];

  return <section className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
    <Link className="text-sm font-bold text-arena-700" href="/ucet">← Späť na účet</Link>
    <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="eyebrow">Tímová súpiska</p><h1 className="mt-2 text-3xl font-extrabold text-ink">{team.name}</h1><p className="mt-2 text-slate-600">{team.category} · sezóna {team.season} · {players.filter((player) => player.status === "active").length} aktívnych hráčov</p></div><Link className="btn-primary" href={`/timy/${teamId}/nominacie`}>Nominácie</Link></div>
      <div className="mt-7 overflow-hidden rounded-2xl border border-slate-200">{players.length > 0 ? <ol className="divide-y divide-slate-100">{players.map((player, index) => <li className="flex items-center gap-4 px-5 py-4" key={player.player_id}><span className="flex h-8 w-8 items-center justify-center rounded-full bg-arena-50 text-sm font-extrabold text-arena-700">{index + 1}</span><div className="flex-1"><p className="font-bold text-ink">{player.full_name}</p><p className="text-xs text-slate-500">Členom od {date.format(new Date(player.joined_at))}</p></div><span className={player.status === "active" ? "status-open" : "rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500"}>{player.status === "active" ? "Aktívny" : "Neaktívny"}</span></li>)}</ol> : <p className="p-8 text-center text-slate-600">Tím zatiaľ nemá žiadnych hráčov.</p>}</div>
    </div>
  </section>;
}
