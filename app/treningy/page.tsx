import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { respondToPlan } from "./actions";

type Entry = { nomination_id: string; player_id: string; player_name: string; team_name: string; title: string; starts_at: string; location: string | null; response: "pending" | "accepted" | "declined"; release_at: string; can_respond: boolean; version: string; changed: boolean };
const dateTime = new Intl.DateTimeFormat("sk-SK", { timeZone: "Europe/Bratislava", dateStyle: "medium", timeStyle: "short" });
const names = { pending: "Čaká na odpoveď", accepted: "Zúčastní sa", declined: "Nezúčastní sa" };
function shift(day: string, days: number) { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function currentWeek() {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Europe/Bratislava", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const day = ["year", "month", "day"].map(name => parts.find(p => p.type === name)?.value).join("-");
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return shift(day, weekday === 0 ? 1 : 1 - weekday);
}
const selection = (entries: Entry[]) => JSON.stringify(entries.map(e => ({ nomination_id: e.nomination_id, player_id: e.player_id, version: e.version })));
export default async function TrainingPlan({ searchParams }: { searchParams: Promise<{ tyzden?: string; stav?: string; ulozene?: string }> }) {
  const query = await searchParams;
  const candidate = query.tyzden ?? "";
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? new Date(`${candidate}T12:00:00Z`) : null;
  const week = parsed && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === candidate && parsed.getUTCDay() === 1 ? candidate : currentWeek();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/prihlasenie");
  const { data, error } = await supabase.rpc("get_my_training_plan", { p_week: week });
  const entries = (data as Entry[] | null) ?? [];
  const players = [...new Set(entries.map(e => e.player_id))];
  return <section className="mx-auto max-w-4xl px-5 py-12">
    <Link className="text-sm font-bold text-arena-700" href="/moj-tim">← Moje tímy</Link>
    <p className="eyebrow mt-6">Rodinný program</p><h1 className="mt-2 text-3xl font-extrabold text-ink">Tréningy na tento týždeň</h1>
    <p className="mt-3 text-slate-600">Potvrď účasť za každé dieťa. Hromadné potvrdenie zachová odmietnuté termíny; zmenené údaje musíš najprv skontrolovať.</p>
    <nav aria-label="Výber týždňa" className="mt-6 flex items-center justify-between gap-3"><Link className="btn-secondary" href={`?tyzden=${shift(week,-7)}`}>← Predošlý</Link><p className="font-bold">{week.split("-").reverse().join(".")} – {shift(week,6).split("-").reverse().join(".")}</p><Link className="btn-secondary" href={`?tyzden=${shift(week,7)}`}>Ďalší →</Link></nav>
    {query.stav === "obnovit" && <p role="alert" className="mt-5 rounded-xl bg-amber-50 p-4">Odpoveď sa neuložila. Skontroluj aktuálne údaje a skús znova.</p>}
    {query.ulozene !== undefined && <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-4">Uložené odpovede: {Number(query.ulozene) || 0}. Ostatné termíny zostali bez zmeny.</p>}
    {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4">Program sa nepodarilo načítať. Obnov stránku.</p>}
    {!error && entries.length === 0 && <p className="mt-8 rounded-2xl border border-dashed p-8 text-center text-slate-600">Tvoje deti nemajú v tomto týždni žiadne tréningy.</p>}
    {players.map(id => { const rows = entries.filter(e => e.player_id === id); const pending = rows.filter(e => e.can_respond && e.response === "pending" && !e.changed); return <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-5 sm:p-7" key={id}>
      <h2 className="text-2xl font-extrabold text-ink">{rows[0].player_name}</h2>
      {pending.length > 0 && <form action={respondToPlan} className="mt-4"><input type="hidden" name="week" value={week}/><input type="hidden" name="items" value={selection(pending)}/><input type="hidden" name="response" value="accepted"/><input type="hidden" name="bulk" value="true"/><button className="btn-primary" type="submit">Potvrdiť všetky nezodpovedané tréningy ({pending.length})</button></form>}
      <div className="mt-5 space-y-4">{rows.map(e => <article className="rounded-2xl border border-slate-200 p-4" key={e.nomination_id}><p className="text-xs font-bold text-arena-700">{e.team_name}</p><h3 className="mt-1 text-lg font-extrabold">{e.title}</h3><p className="mt-1 text-slate-600">{dateTime.format(new Date(e.starts_at))}{e.location ? ` · ${e.location}` : ""}</p>
        {e.changed && e.response === "pending" && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm font-bold text-amber-900">Nové alebo zmenené údaje. Skontroluj čas a miesto a potvrď tento termín samostatne.</p>}
        <p className={`mt-3 font-bold ${e.response === "accepted" ? "text-emerald-700" : e.response === "declined" ? "text-red-700" : "text-amber-800"}`}>{names[e.response]}</p>
        {e.can_respond ? <div className="mt-4 flex flex-col gap-3"><form action={respondToPlan}><input name="week" type="hidden" value={week}/><input name="items" type="hidden" value={selection([e])}/><input name="response" type="hidden" value="accepted"/><button className="btn-primary" type="submit">Zúčastní sa</button></form><form action={respondToPlan} className="flex flex-wrap items-end gap-3"><input name="week" type="hidden" value={week}/><input name="items" type="hidden" value={selection([e])}/><input name="response" type="hidden" value="declined"/><label className="flex-1 text-sm font-bold">Dôvod neprítomnosti<input className="input mt-1" name="reason" minLength={2} maxLength={500} required/></label><button className="btn-secondary" type="submit">Nezúčastní sa</button></form></div> : <p className="mt-3 text-sm text-slate-500">{Date.parse(e.starts_at) <= new Date().getTime() ? "Odpovedanie je uzavreté." : `Potvrdzovanie sa otvorí ${dateTime.format(new Date(e.release_at))}.`}</p>}
        <Link className="mt-3 inline-block text-sm font-bold text-arena-700" href={`/nominacie/${e.nomination_id}`}>Detail tréningu →</Link>
      </article>)}</div>
    </section>; })}
  </section>;
}
