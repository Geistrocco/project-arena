import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { respondToNomination } from "@/app/timy/[teamId]/nominacie/actions";

type Row = { nomination_id: string; team_id: string; team_name: string; title: string; event_type: string; starts_at: string; location: string | null; note: string | null; nomination_status: string; player_id: string; player_name: string; response: "pending" | "accepted" | "declined"; responded_at: string | null; can_respond: boolean; decline_reason: string | null; can_manage: boolean };
const eventNames: Record<string, string> = { match: "Zápas", tournament: "Turnaj", training: "Tréning", other: "Iná udalosť" };
const responseNames = { pending: "Čaká na odpoveď", accepted: "Zúčastní sa", declined: "Nezúčastní sa" };
const responseClass = { pending: "bg-amber-50 text-amber-800", accepted: "bg-emerald-50 text-emerald-700", declined: "bg-red-50 text-red-700" };
const dateTime = new Intl.DateTimeFormat("sk-SK", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Bratislava" });

export default async function NominationPage({ params, searchParams }: { params: Promise<{ nominationId: string }>; searchParams: Promise<{ stav?: string }> }) {
  const { nominationId } = await params;
  const query = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(nominationId)) notFound();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/prihlasenie");
  const { data, error } = await supabase.rpc("get_nomination_roster", { p_nomination_id: nominationId });
  if (error) redirect("/ucet");
  const rows = (data as Row[] | null) ?? [];
  if (rows.length === 0) notFound();
  const event = rows[0];
  const counts = rows.reduce((all, row) => ({ ...all, [row.response]: all[row.response] + 1 }), { pending: 0, accepted: 0, declined: 0 });

  return <section className="mx-auto max-w-4xl px-5 py-12 sm:py-16"><Link className="text-sm font-bold text-arena-700" href={`/timy/${event.team_id}/nominacie`}>← Všetky nominácie</Link>
    {query.stav === "vytvorena" && <p className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 font-bold text-emerald-800">Nominácia bola vytvorená a je viditeľná pre tím.</p>}{query.stav === "odpoved-ulozena" && <p className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 font-bold text-emerald-800">Odpoveď bola uložená.</p>}
    <header className="mt-5 rounded-3xl bg-ink p-6 text-white sm:p-8"><p className="text-xs font-extrabold uppercase tracking-widest text-arena-300">{eventNames[event.event_type] ?? "Udalosť"} · {event.team_name}</p><h1 className="mt-2 text-3xl font-extrabold">{event.title}</h1><p className="mt-3 text-slate-200">{dateTime.format(new Date(event.starts_at))}{event.location ? ` · ${event.location}` : ""}</p>{event.note && <p className="mt-5 rounded-2xl bg-white/10 p-4 text-sm leading-6 text-slate-100">{event.note}</p>}<div className="mt-5 flex flex-wrap gap-2 text-sm font-bold"><span className="rounded-full bg-emerald-400/20 px-3 py-1 text-emerald-200">Potvrdení: {counts.accepted}</span><span className="rounded-full bg-red-400/20 px-3 py-1 text-red-200">Neprídu: {counts.declined}</span><span className="rounded-full bg-amber-300/20 px-3 py-1 text-amber-100">Čaká: {counts.pending}</span></div></header>
    <div className="mt-7 overflow-hidden rounded-2xl border border-slate-200 bg-white"><ul className="divide-y divide-slate-100">{rows.map((player) => <li className="p-5" key={player.player_id}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-extrabold text-ink">{player.player_name}</p>{player.decline_reason && <p className="mt-1 text-sm text-slate-600">Dôvod: {player.decline_reason}</p>}</div><span className={`rounded-full px-3 py-1 text-xs font-bold ${responseClass[player.response]}`}>{responseNames[player.response]}</span></div>
      {player.can_respond && event.nomination_status === "open" && <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-[auto_1fr]"><form action={respondToNomination}><input name="nominationId" type="hidden" value={nominationId}/><input name="teamId" type="hidden" value={event.team_id}/><input name="playerId" type="hidden" value={player.player_id}/><input name="response" type="hidden" value="accepted"/><button className="h-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white" type="submit">Zúčastní sa</button></form><form action={respondToNomination} className="flex flex-col gap-3 sm:flex-row sm:items-end"><input name="nominationId" type="hidden" value={nominationId}/><input name="teamId" type="hidden" value={event.team_id}/><input name="playerId" type="hidden" value={player.player_id}/><input name="response" type="hidden" value="declined"/><label className="flex-1 text-xs font-bold text-slate-600">Dôvod neprítomnosti<input className="input mt-1" maxLength={500} minLength={2} name="reason" placeholder="Napíšte dôvod" required/></label><button className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-700" type="submit">Nezúčastní sa</button></form></div>}
    </li>)}</ul></div>
  </section>;
}
