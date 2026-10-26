"use client";

import { useActionState } from "react";
import { grantTournamentScorekeeper, revokeTournamentScorekeeper, type ScorekeeperActionState } from "@/app/turnaje/[slug]/actions";

type Scorekeeper = { id: string; invited_email: string; display_name: string; granted_at: string };
const initialState: ScorekeeperActionState = {};

export function TournamentScorekeepers({ slug, scorekeepers, embedded = false }: { slug: string; scorekeepers: Scorekeeper[]; embedded?: boolean }) {
  const [state, action, pending] = useActionState(grantTournamentScorekeeper, initialState);
  return <section className={embedded ? "" : "mx-auto mt-6 max-w-7xl px-5 lg:px-8"}>
    <div className="rounded-3xl border border-arena-100 bg-white p-6 shadow-card sm:p-8">
      <p className="eyebrow">Administrácia výsledkov</p>
      <h2 className="mt-2 text-2xl font-extrabold">Poverené osoby</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Poverte registrovaného používateľa zadaním jeho e-mailu. Bude môcť iba zapisovať a opravovať výsledky tohto turnaja.</p>
      <form action={action} className="mt-5 flex max-w-2xl flex-col gap-3 sm:flex-row">
        <input name="slug" type="hidden" value={slug}/>
        <label className="sr-only" htmlFor="scorekeeper-email">E-mail používateľa</label>
        <input className="field min-w-0 flex-1" id="scorekeeper-email" name="email" placeholder="meno@klub.sk" required type="email"/>
        <button className="btn-primary whitespace-nowrap" disabled={pending} type="submit">{pending ? "Posielam…" : "Poveriť a poslať e-mail"}</button>
      </form>
      {state.message && <p className={`mt-3 text-sm font-semibold ${state.success ? "text-emerald-700" : "text-red-700"}`} role="status">{state.message}</p>}
      <div className="mt-6 space-y-3">
        {scorekeepers.map((person) => <div className="flex flex-col gap-3 rounded-2xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between" key={person.id}>
          <div><p className="font-bold text-ink">{person.display_name || person.invited_email}</p>{person.display_name && <p className="text-sm text-slate-600">{person.invited_email}</p>}</div>
          <form action={revokeTournamentScorekeeper}><input name="assignmentId" type="hidden" value={person.id}/><input name="slug" type="hidden" value={slug}/><button className="text-sm font-bold text-red-700" type="submit">Odobrať oprávnenie</button></form>
        </div>)}
        {scorekeepers.length === 0 && <p className="text-sm text-slate-500">Výsledky zatiaľ zadáva iba organizátor.</p>}
      </div>
    </div>
  </section>;
}
