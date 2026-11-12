"use client";

import { useActionState, useState } from "react";
import { manageTraining } from "@/app/timy/[teamId]/kalendar/actions";

export type TrainingManagementInfo = { version: string; series: boolean; editable: boolean; all_count: number; following_count: number };
type Training = { nomination_id: string; title: string; starts_at: string; ends_at: string | null; location: string | null; note: string | null };

function localTime(value: string) {
  const parts = new Intl.DateTimeFormat("en", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Bratislava" }).formatToParts(new Date(value));
  const part = (key: string) => parts.find(item => item.type === key)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function TrainingManagement({ event, info }: { event: Training; info: TrainingManagementInfo }) {
  const [mode, setMode] = useState<"edit" | "cancel" | null>(null);
  const [scope, setScope] = useState("one");
  const [state, action, pending] = useActionState(manageTraining, { error: "" });
  const count = scope === "all" ? info.all_count : scope === "following" ? info.following_count : 1;
  return <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
    <h2 className="text-lg font-extrabold text-ink">Správa tréningu</h2>
    {!mode ? <div className="mt-4 flex flex-wrap gap-3"><button className="btn-secondary" onClick={() => setMode("edit")} type="button">Upraviť tréning</button><button className="btn-secondary text-red-700" onClick={() => setMode("cancel")} type="button">Zrušiť tréning</button></div> : <form action={action} className="mt-4 space-y-5">
      <input name="nominationId" type="hidden" value={event.nomination_id}/><input name="version" type="hidden" value={info.version}/><input name="operation" type="hidden" value={mode}/>
      <label className="block font-bold">Rozsah zmeny<select className="field mt-2" name="scope" onChange={e => setScope(e.target.value)} value={scope}><option value="one">Iba tento tréning</option>{info.series && <><option value="following">Tento a nasledujúce ({info.following_count})</option><option value="all">Celá séria – budúce termíny ({info.all_count})</option></>}</select></label>
      <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">Počet dotknutých tréningov: <strong>{count}</strong>. Minulé, zrušené a uzavreté termíny sa nemenia. Ak niektorý už má dochádzku, uloženie sa zastaví.</p>
      {mode === "edit" ? <><div className="grid gap-4 sm:grid-cols-2"><label className="font-bold sm:col-span-2">Názov<input className="field mt-2" defaultValue={event.title} maxLength={120} minLength={3} name="title" required/></label><label className="font-bold">Začiatok<input className="field mt-2" defaultValue={localTime(event.starts_at)} name="startsAt" required type="datetime-local"/></label><label className="font-bold">Koniec<input className="field mt-2" defaultValue={event.ends_at ? localTime(event.ends_at) : ""} name="endsAt" required type="datetime-local"/></label><label className="font-bold sm:col-span-2">Miesto<input className="field mt-2" defaultValue={event.location ?? ""} maxLength={160} name="location"/></label></div><label className="block font-bold">Pokyny pre rodičov<textarea className="field mt-2 min-h-24" defaultValue={event.note ?? ""} maxLength={1000} name="note"/></label><p className="text-sm text-slate-600">Časy sú v časovom pásme Slovenska. Pri sérii sa dátum a čas ostatných tréningov posunú o rovnaký rozdiel. Názov, miesto, dĺžka a pokyny sa použijú pre všetky vybrané termíny. Zmena času alebo miesta vyžiada nové potvrdenie účasti.</p></> : <label className="block font-bold text-red-800">Dôvod zrušenia<textarea className="field mt-2 min-h-24" maxLength={500} minLength={2} name="reason" placeholder="Napr. nepriaznivé počasie alebo zatvorené ihrisko" required/><span className="mt-2 block text-sm font-normal text-slate-600">Rodičia uvidia dôvod pri tréningu aj v upozornení. Tréningy nevymažeme.</span></label>}
      {(scope !== "one" || mode === "cancel") && <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold"><input className="mt-0.5 h-4 w-4" key={`${mode}-${scope}`} name="confirm" required type="checkbox"/>Potvrdzujem {mode === "cancel" ? "zrušenie" : "hromadnú úpravu"} vybraných tréningov ({count}).</label>}
      {state.error && <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800" role="alert">{state.error}</p>}
      <div className="flex flex-wrap gap-3"><button className={mode === "cancel" ? "btn-primary bg-red-700 hover:bg-red-800" : "btn-primary"} disabled={pending} type="submit">{pending ? "Ukladám…" : mode === "cancel" ? "Potvrdiť zrušenie" : "Uložiť zmeny"}</button><button className="btn-secondary" disabled={pending} onClick={() => setMode(null)} type="button">Späť bez uloženia</button></div>
    </form>}
  </section>;
}
