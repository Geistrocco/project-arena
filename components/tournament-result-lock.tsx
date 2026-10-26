"use client";

import { useActionState } from "react";
import { setTournamentResultLock } from "@/app/turnaje/[slug]/actions";

export function TournamentResultLock({ slug, lockedAt, unfinished, matchCount }: { slug: string; lockedAt: string | null; unfinished: number; matchCount: number }) {
  const [state, action, pending] = useActionState(setTournamentResultLock, {});
  const locked = Boolean(lockedAt);
  return <section className="mt-8 rounded-3xl border border-arena-200 bg-white p-6 sm:p-8">
    <h2 className="text-2xl font-extrabold">{locked ? "Výsledky sú potvrdené a uzamknuté" : "Ukončenie turnaja"}</h2>
    <p className="mt-2 text-sm text-slate-600">{locked ? "Výsledky, tímy a rozpis sa nedajú meniť. Prenosy môžete doplniť aj naďalej. Odomknutie zruší označenie potvrdených výsledkov." : "Po kontrole výsledkov potvrďte ukončenie. Zmeny výsledkov, tímov a formátu budú zablokované aj pre zapisovateľov."}</p>
    {!locked && (unfinished > 0 || matchCount === 0) && <p className="mt-4 rounded-xl bg-amber-50 p-4 font-bold text-amber-900">{matchCount === 0 ? "Turnaj zatiaľ nemá zápasy." : `Chýba výsledok ${unfinished} zápasov. Najprv ich doplňte.`}</p>}
    <form key={locked ? "unlock" : "lock"} action={action} className="mt-5 max-w-2xl space-y-4">
      <input name="slug" type="hidden" value={slug} /><input name="decision" type="hidden" value={locked ? "unlock" : "lock"} />
      {locked && <label className="block text-sm font-bold">Dôvod odomknutia<textarea className="field mt-2 min-h-24" name="reason" required minLength={5} maxLength={1000} placeholder="Napríklad oprava nesprávne zadaného výsledku finále." /></label>}
      <label className="flex items-start gap-3 text-sm text-slate-700"><input className="mt-1" type="checkbox" name="confirmed" value="yes" required /><span>{locked ? "Potvrdzujem odomknutie výsledkov na opravu. Dôvod bude uložený v histórii." : "Skontroloval som výsledky a potvrdzujem ich ako konečné."}</span></label>
      <button className="btn-primary" disabled={pending || (!locked && (unfinished > 0 || matchCount === 0))} type="submit">{pending ? "Ukladám…" : locked ? "Odomknúť na opravu" : "Ukončiť turnaj a uzamknúť výsledky"}</button>
    </form>
    {state.message && <p role="status" className={`mt-4 text-sm font-bold ${state.success ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>}
  </section>;
}
