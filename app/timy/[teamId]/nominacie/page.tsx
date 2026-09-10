import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createNomination } from "./actions";
import { SubmitNominationButton } from "@/components/submit-nomination-button";

type Nomination = { nomination_id: string; title: string; event_type: string; starts_at: string; location: string | null; status: string; nominated_count: number; accepted_count: number; declined_count: number; pending_count: number; can_manage: boolean };
type Player = { player_id: string; full_name: string; status: string };
const eventNames: Record<string, string> = { match: "Zápas", tournament: "Turnaj", training: "Tréning", other: "Iná udalosť" };
const dateTime = new Intl.DateTimeFormat("sk-SK", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Bratislava" });

export default async function TeamNominationsPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(teamId)) notFound();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = typeof auth?.claims?.sub === "string" ? auth.claims.sub : null;
  if (!userId) redirect("/prihlasenie");
  const [{ data: team }, { data, error }, { data: membership }, { data: role }] = await Promise.all([
    supabase.from("club_teams").select("id, name, category, season").eq("id", teamId).maybeSingle(),
    supabase.rpc("get_team_nominations", { p_team_id: teamId }),
    supabase.from("team_memberships").select("role").eq("team_id", teamId).eq("user_id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
  ]);
  if (!team) notFound();
  if (error) redirect(`/timy/${teamId}`);
  const nominations = (data as Nomination[] | null) ?? [];
  const canManage = Boolean(membership && ["coach", "manager", "club_admin"].includes(membership.role)) || Boolean(role && ["owner", "admin"].includes(role.role));
  let players: Player[] = [];
  if (canManage) {
    const { data: roster } = await supabase.rpc("get_visible_team_roster", { p_team_id: teamId });
    players = ((roster as Player[] | null) ?? []).filter((player) => player.status === "active");
  }

  return <section className="mx-auto max-w-4xl px-5 py-12 sm:py-16">
    <Link className="text-sm font-bold text-arena-700" href={`/timy/${teamId}`}>← Späť na tím</Link>
    <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">{team.name}</p><h1 className="mt-2 text-3xl font-extrabold text-ink">Nominácie</h1><p className="mt-2 text-slate-600">{team.category} · sezóna {team.season}</p></div>{canManage && <a className="btn-primary" href="#nova-nominacia">Vytvoriť nomináciu</a>}</div>

    {canManage && <details className="mt-8 rounded-3xl border border-arena-200 bg-arena-50 p-5 sm:p-7" id="nova-nominacia"><summary className="cursor-pointer text-lg font-extrabold text-ink">Nová nominácia</summary>
      <form action={createNomination} className="mt-6 space-y-5"><input name="teamId" type="hidden" value={teamId}/><div className="grid gap-4 sm:grid-cols-2"><label className="font-bold text-ink">Názov<input className="input mt-2" maxLength={120} name="title" placeholder="Napr. MŠK Senec – Spartak Trnava" required/></label><label className="font-bold text-ink">Typ<select className="input mt-2" name="eventType" defaultValue="match"><option value="match">Zápas</option><option value="tournament">Turnaj</option><option value="training">Tréning</option><option value="other">Iná udalosť</option></select></label><label className="font-bold text-ink">Dátum a čas<input className="input mt-2" name="startsAt" type="datetime-local" required/><span className="mt-1 block text-xs font-normal text-slate-500">Slovenský čas</span></label><label className="font-bold text-ink">Miesto<input className="input mt-2" maxLength={160} name="location" placeholder="Štadión alebo adresa"/></label></div><label className="block font-bold text-ink">Správa pre rodičov<textarea className="input mt-2 min-h-24" maxLength={1000} name="note" placeholder="Čas zrazu, výstroj alebo ďalšie pokyny"/></label>
        <fieldset><legend className="font-extrabold text-ink">Nominovaní hráči</legend><p className="mt-1 text-sm text-slate-600">Označení sú predvolene všetci aktívni hráči. Môžete niekoho odobrať.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{players.map((player) => <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 font-semibold" key={player.player_id}><input defaultChecked name="playerIds" type="checkbox" value={player.player_id}/>{player.full_name}</label>)}</div>{players.length === 0 && <p className="mt-3 rounded-xl bg-white p-4 text-slate-600">Tím nemá aktívnych hráčov.</p>}</fieldset>
        <SubmitNominationButton disabled={players.length === 0}/></form>
    </details>}

    <div className="mt-8 space-y-4">{nominations.map((item) => <Link className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-arena-300 hover:shadow-md" href={`/nominacie/${item.nomination_id}`} key={item.nomination_id}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-wider text-arena-700">{eventNames[item.event_type] ?? "Udalosť"}</p><h2 className="mt-1 text-lg font-extrabold text-ink">{item.title}</h2><p className="mt-1 text-sm text-slate-600">{dateTime.format(new Date(item.starts_at))}{item.location ? ` · ${item.location}` : ""}</p></div><span className="status-open">{item.status === "open" ? "Otvorená" : item.status}</span></div><div className="mt-4 flex flex-wrap gap-2 text-sm font-bold"><span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">Potvrdení: {item.accepted_count}</span><span className="rounded-full bg-red-50 px-3 py-1 text-red-700">Neprídu: {item.declined_count}</span><span className="rounded-full bg-amber-50 px-3 py-1 text-amber-800">Čaká: {item.pending_count}</span></div></Link>)}{nominations.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-600">Zatiaľ nebola vytvorená žiadna nominácia.</p>}</div>
  </section>;
}
