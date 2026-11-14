"use client";

import { useActionState, useState } from "react";
import { tournamentIncidentAction } from "@/app/turnaje/[slug]/incident-actions";
import { withdrawalLabels, type IncidentPreview, type TournamentIncidents } from "@/lib/tournament-incidents";
import type { PlanGroup, PlanMatch } from "@/lib/tournament-plan-calculations";

export function TournamentIncidentsPanel({slug,groups,matches,incidents,locked,sport}:{slug:string;groups:PlanGroup[];matches:PlanMatch[];incidents:TournamentIncidents|null;locked:boolean;sport:string}) {
  const [action,setAction] = useState("forfeit");
  const [state,formAction,pending] = useActionState(tournamentIncidentAction,{});
  const withdrawn = new Set(incidents?.withdrawals.map(w=>w.name) ?? []);
  const teamAction = action === "withdraw" || action === "reinstate";
  const teams = [...new Set(groups.flatMap(g=>g.teams.map(t=>t.team_name)))].filter(n=>action === "reinstate" ? withdrawn.has(n) : !withdrawn.has(n));
  const selectable = matches.filter(m=>m.resolved_home_name && m.resolved_away_name && !withdrawn.has(m.resolved_home_name) && !withdrawn.has(m.resolved_away_name) && (action === "restore" ? m.outcome === "forfeit" : m.outcome !== "void"));
  return <section className="mt-8 rounded-3xl border border-amber-200 bg-white p-6 sm:p-8">
    <h2 className="text-2xl font-extrabold">Mimoriadne situácie</h2>
    {sport !== "Tenis" && <p className="mt-3 text-sm text-slate-600">Kontumácia {incidents?.forfeit_score ?? 3}:0. {withdrawalLabels[incidents?.withdrawal_rule ?? "keep"]}. Odstúpený tím zostane na konci tabuľky. Pri anulovaní sa zachová história pôvodného skóre.</p>}
    {locked ? <p className="mt-4 font-bold">Výsledky sú uzamknuté.</p> : sport === "Tenis" ? <p className="mt-4">Tenisové kontumácie budú doplnené spolu so setovým bodovaním.</p> : <>
      <form action={formAction} className="mt-5 space-y-4">
        <input type="hidden" name="slug" value={slug}/><input type="hidden" name="stage" value="preview"/>
        <label className="block font-bold">Čo potrebuješ vyriešiť?<select className="field mt-2" name="action" value={action} onChange={e=>setAction(e.target.value)}><option value="forfeit">Kontumovať zápas</option><option value="withdraw">Zaznamenať odstúpenie tímu</option><option value="reinstate">Zrušiť odstúpenie a obnoviť účasť</option><option value="restore">Zrušiť samostatnú kontumáciu</option></select></label>
        <label className="block font-bold">{teamAction ? "Tím" : "Zápas"}<select className="field mt-2" key={action} name="target" required defaultValue=""><option value="" disabled>Vyber…</option>{teamAction ? teams.map(n=><option key={n}>{n}</option>) : selectable.map(m=><option key={m.id} value={m.id}>#{m.match_number} · {m.resolved_home_name} – {m.resolved_away_name}</option>)}</select></label>
        {action === "forfeit" && <label className="block font-bold">Kontumačný víťaz<select className="field mt-2" name="winner" required><option value="home">Domáci – prvý tím v dvojici</option><option value="away">Hostia – druhý tím v dvojici</option></select></label>}
        <label className="block font-bold">Verejný dôvod<textarea className="field mt-2" name="reason" required minLength={5} maxLength={1000} placeholder="Napr. tím nenastúpil na zápas v stanovenom čase."/></label>
        <p className="text-sm text-slate-600">Najskôr zobrazíme náhľad. Zmeny, ktoré by ovplyvnili účastníkov už odohraných nadväzujúcich zápasov, sú zablokované.</p>
        <button className="btn-secondary" disabled={pending}>{pending ? "Pripravujem…" : "Zobraziť dopad zmeny"}</button>
      </form>
      {state.error && <p className="mt-4 text-red-700" role="alert">{state.error}</p>}
      {state.preview && <IncidentConfirmation key={`${state.preview.version}:${state.preview.action}:${state.preview.target}:${state.preview.winner}:${state.preview.reason}`} slug={slug} groups={groups} preview={state.preview}/>}
    </>}
  </section>;
}

function IncidentConfirmation({slug,groups,preview}:{slug:string;groups:PlanGroup[];preview:IncidentPreview}) {
  const [state,action,pending] = useActionState(tournamentIncidentAction,{});
  return <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
    <h3 className="text-xl font-extrabold">Náhľad – zatiaľ nič nie je uložené</h3>
    <p className="mt-3 font-bold">{preview.action === "reinstate" ? `Obnovenie účasti: ${preview.target}` : preview.action === "withdraw" ? `Odstúpenie: ${preview.target}` : preview.action === "restore" ? "Zrušenie kontumácie a obnovenie pôvodného výsledku" : "Kontumácia zápasu"}</p>
    <p className="mt-2 text-sm">Dôvod: {preview.reason}</p>
    <ul className="mt-4 space-y-2 text-sm">{preview.changes.map(m=><li className="rounded-xl bg-white p-3" key={m.number}>#{m.number} · {m.home ?? "Bez postupujúceho"} – {m.away ?? "Bez postupujúceho"}<br/>{m.before_home ?? "–"}:{m.before_away ?? "–"} → {m.outcome === "void" ? "anulované, bez bodov" : `${m.home_score ?? "–"}:${m.away_score ?? "–"}${m.outcome === "forfeit" ? " (kontumácia)" : ""}`}</li>)}</ul>
    {!preview.changes.length && <p className="mt-3 text-sm">Skóre sa nemení. Odstúpenie sa zaznamená a ovplyvní poradie tímu a jeho ďalšie zápasy.</p>}
    <div className="mt-4 grid gap-4 sm:grid-cols-2">{groups.map(g=><div key={g.id}><h4 className="font-bold">{g.name} po zmene</h4><ol className="mt-2 space-y-1 text-sm">{preview.rankings[g.id]?.rows.map((r,i)=><li key={r.name}>{r.rank ?? i+1}. {r.name} · {r.points} b. · {r.scored}:{r.conceded}{r.withdrawn ? " · odstúpil" : r.unresolved ? " · nerozhodnuté" : ""}</li>)}</ol></div>)}</div>
    <p className="mt-4 text-sm">Budúce zápasy odstúpeného tímu sa vyriešia automaticky, keď budú známi ich účastníci. Obaja chýbajúci účastníci znamenajú anulovaný zápas bez bodov a bez víťaza.</p>
    <form action={action} className="mt-4 space-y-4">
      <input type="hidden" name="slug" value={slug}/><input type="hidden" name="stage" value="confirm"/>
      {(["version","action","target","winner","reason"] as const).map(k=><input key={k} type="hidden" name={k} value={preview[k] ?? ""}/>)}
      <label className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" name="confirmed" value="yes" required disabled={state.success}/>Potvrdzujem zobrazenú zmenu, dopad na tabuľky a verejné uvedenie dôvodu.</label>
      {state.error && <p className="text-red-700" role="alert">{state.error}</p>}
      {state.success && <p className="font-bold text-emerald-800" role="status">Zmena bola uložená aj do histórie.</p>}
      <button className="btn-primary" disabled={pending || state.success}>{pending ? "Ukladám…" : "Potvrdiť a uložiť zmenu"}</button>
    </form>
  </div>;
}
