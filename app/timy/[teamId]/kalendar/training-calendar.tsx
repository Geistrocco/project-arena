"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarIcon, CloseIcon } from "@/components/icons";
import { createTrainingSeries } from "./actions";

export type CalendarEvent = {
  nomination_id: string;
  title: string;
  event_type: "match" | "tournament" | "training" | "other";
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  note: string | null;
};

type Draft = {
  date: string;
  title: string;
  location: string;
  startTime: string;
  endTime: string;
  note: string;
  repeatWeeks: string;
  copiedFrom?: string;
};

const eventNames = { match: "Zápas", tournament: "Turnaj", training: "Tréning", other: "Iná udalosť" } as const;
const eventClasses = {
  match: "border-blue-200 bg-blue-50 text-blue-800",
  tournament: "border-violet-200 bg-violet-50 text-violet-800",
  training: "border-emerald-200 bg-emerald-50 text-emerald-800",
  other: "border-slate-200 bg-slate-50 text-slate-700",
} as const;
const timeFormatter = new Intl.DateTimeFormat("sk-SK", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Bratislava" });
const dateTimeFormatter = new Intl.DateTimeFormat("sk-SK", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Bratislava" });

function localDateKey(value: string) {
  const parts = new Intl.DateTimeFormat("en", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Bratislava" }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function emptyDraft(date: string): Draft {
  return { date, title: "Tímový tréning", location: "", startTime: "17:00", endTime: "18:30", note: "", repeatWeeks: "1" };
}

function copyDraft(event: CalendarEvent, date: string): Draft {
  const startTime = timeFormatter.format(new Date(event.starts_at));
  const endTime = event.ends_at ? timeFormatter.format(new Date(event.ends_at)) : startTime;
  return {
    date,
    title: event.title,
    location: event.location ?? "",
    startTime,
    endTime,
    note: event.note ?? "",
    repeatWeeks: "1",
    copiedFrom: event.title,
  };
}

export function TrainingCalendar({ teamId, month, days, events, canManage }: { teamId: string; month: string; days: Array<number | null>; events: CalendarEvent[]; canManage: boolean }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [copySource, setCopySource] = useState<CalendarEvent | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const agendaDialog = useRef<HTMLDialogElement>(null);
  const selectedEvents = events.filter(event => localDateKey(event.starts_at) === selectedDate)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const byDay = useMemo(() => {
    const result = new Map<number, CalendarEvent[]>();
    for (const event of events) {
      const day = Number(localDateKey(event.starts_at).slice(-2));
      result.set(day, [...(result.get(day) ?? []), event]);
    }
    return result;
  }, [events]);

  useEffect(() => {
    if (!draft) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setDraft(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [draft]);

  useEffect(() => {
    if (selectedDate && !agendaDialog.current?.open) agendaDialog.current?.showModal();
    if (!selectedDate && agendaDialog.current?.open) agendaDialog.current.close();
  }, [selectedDate]);

  const chooseDay = (day: number) => {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    if (copySource && canManage) {
      setSelectedDate(null);
      setDraft(copyDraft(copySource, date));
      setCopySource(null);
    } else {
      setSelectedDate(date);
    }
  };

  const startCopy = (event: CalendarEvent) => {
    setCopySource(event);
    setDraft(null);
    setSelectedDate(null);
  };

  return <>
    {copySource && <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between"><p><strong>Kopíruješ „{copySource.title}“.</strong> Klikni na deň, do ktorého ho chceš pridať.</p><button className="font-extrabold underline underline-offset-4" onClick={() => setCopySource(null)} type="button">Zrušiť kopírovanie</button></div>}

    <div className="hidden grid-cols-7 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 md:grid">
      {["Po", "Ut", "St", "Št", "Pi", "So", "Ne"].map((day) => <div className="bg-slate-50 px-3 py-2 text-center text-xs font-extrabold uppercase text-slate-500" key={day}>{day}</div>)}
      {days.map((day, index) => <div className="relative min-h-32 bg-white p-2" key={`${month}-${index}`}>
        {day && <><button aria-label={`Program dňa ${day}. ${month}`} className="absolute inset-0 rounded-sm transition hover:bg-arena-50/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-arena-600" onClick={() => chooseDay(day)} type="button"/><div className="pointer-events-none relative flex items-center justify-between"><p className="text-sm font-extrabold text-slate-500">{day}</p><span className="text-[0.6rem] font-bold text-arena-700">Program</span></div><div className="pointer-events-none relative mt-2 space-y-1.5">{(byDay.get(day) ?? []).map((event) => <div className={`pointer-events-auto rounded-lg border px-2 py-1.5 text-xs ${eventClasses[event.event_type]}`} key={event.nomination_id}><Link className="block font-bold transition hover:brightness-95" href={`/nominacie/${event.nomination_id}`}><span className="block">{timeFormatter.format(new Date(event.starts_at))} · {eventNames[event.event_type]}</span><span className="mt-0.5 block truncate font-semibold">{event.title}</span></Link>{canManage && event.event_type === "training" && <button className="mt-1.5 font-extrabold underline decoration-current/40 underline-offset-2" onClick={() => startCopy(event)} type="button">Kopírovať</button>}</div>)}</div></>}
      </div>)}
    </div>

    <div className="md:hidden">
      <div className="grid grid-cols-7 gap-1">
        {["Po", "Ut", "St", "Št", "Pi", "So", "Ne"].map((day) => <div className="py-1 text-center text-[0.65rem] font-black uppercase text-slate-400" key={day}>{day}</div>)}
        {days.map((day, index) => <button aria-label={day ? `Program dňa ${day}. ${month}` : undefined} className={`relative aspect-square rounded-xl border text-sm font-extrabold ${day ? "border-slate-200 bg-white text-ink active:bg-arena-100" : "border-transparent"}`} disabled={!day} key={`${month}-mobile-${index}`} onClick={() => day && chooseDay(day)} type="button">{day}{day && (byDay.get(day)?.length ?? 0) > 0 && <span className="absolute bottom-1.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-arena-500" />}</button>)}
      </div>
      <div className="mt-5 space-y-3">{events.map((event) => <div className="rounded-2xl border border-slate-200 p-4" key={event.nomination_id}><Link className="block" href={`/nominacie/${event.nomination_id}`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-wide text-arena-700">{eventNames[event.event_type]}</p><p className="mt-1 font-extrabold text-ink">{event.title}</p><p className="mt-1 text-sm text-slate-600">{dateTimeFormatter.format(new Date(event.starts_at))}{event.location ? ` · ${event.location}` : ""}</p></div><span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${eventClasses[event.event_type]}`}>Detail</span></div></Link>{canManage && event.event_type === "training" && <button className="mt-3 text-sm font-extrabold text-arena-700" onClick={() => startCopy(event)} type="button">Kopírovať na iný deň →</button>}</div>)}{events.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-600">V tomto mesiaci zatiaľ nie je žiadna udalosť.</p>}</div>
    </div>

    <dialog ref={agendaDialog} aria-labelledby="day-agenda-title" className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl backdrop:bg-ink/55 sm:p-7" onCancel={() => setSelectedDate(null)} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setSelectedDate(null); } }}>
      {selectedDate && <>
        <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Program dňa</p><h3 id="day-agenda-title" className="mt-2 text-2xl font-extrabold text-ink">{new Date(`${selectedDate}T12:00:00Z`).toLocaleDateString("sk-SK", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</h3></div><button autoFocus aria-label="Zavrieť program dňa" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 text-slate-600" onClick={() => setSelectedDate(null)} type="button"><CloseIcon className="h-5 w-5" /></button></div>
        <div className="mt-6 space-y-3">{selectedEvents.length ? selectedEvents.map(event => <div className={`rounded-2xl border p-4 ${eventClasses[event.event_type]}`} key={event.nomination_id}>
          <Link className="block rounded-lg focus-visible:outline focus-visible:outline-2" href={`/nominacie/${event.nomination_id}`} onClick={() => setSelectedDate(null)}><p className="text-xs font-extrabold uppercase tracking-wide">{timeFormatter.format(new Date(event.starts_at))}{event.ends_at ? ` – ${timeFormatter.format(new Date(event.ends_at))}` : ""} · {eventNames[event.event_type]}</p><p className="mt-1 text-lg font-extrabold">{event.title}</p>{event.location && <p className="mt-2 text-sm">{event.location}</p>}<p className="mt-3 text-sm font-extrabold">Detail a účasť →</p></Link>
          {canManage && event.event_type === "training" && <button className="mt-3 text-sm font-extrabold underline underline-offset-4" onClick={() => startCopy(event)} type="button">Kopírovať na iný deň</button>}
        </div>) : <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-slate-600">Na tento deň nie je nič naplánované.</p>}</div>
        {canManage && <div className="mt-6 border-t border-slate-100 pt-5"><button className="btn-primary w-full justify-center" onClick={() => { setDraft(emptyDraft(selectedDate)); setSelectedDate(null); }} type="button">+ Pridať udalosť</button><p className="mt-3 text-center text-xs text-slate-500">Otvorí nový tréning. <Link className="font-bold text-arena-700 underline" href={`/timy/${teamId}/nominacie#nova-nominacia`} onClick={() => setSelectedDate(null)}>Zápas alebo turnaj pridáš cez nominácie.</Link></p></div>}
      </>}
    </dialog>

    {draft && <div aria-modal="true" className="fixed inset-0 z-50 flex items-end justify-center bg-ink/55 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" onMouseDown={(event) => { if (event.target === event.currentTarget) setDraft(null); }}>
      <div className="max-h-[94vh] w-full overflow-y-auto rounded-t-[2rem] bg-white p-5 shadow-2xl sm:max-w-2xl sm:rounded-[2rem] sm:p-7">
        <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">{draft.copiedFrom ? "Kópia tréningu" : "Nový tréning"}</p><h3 className="mt-2 text-2xl font-extrabold text-ink">{new Date(`${draft.date}T12:00:00`).toLocaleDateString("sk-SK", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h3>{draft.copiedFrom && <p className="mt-2 text-sm text-slate-600">Údaje sme skopírovali. Pred uložením ich môžeš ľubovoľne upraviť.</p>}</div><button aria-label="Zavrieť" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 text-slate-600" onClick={() => setDraft(null)} type="button"><CloseIcon className="h-5 w-5" /></button></div>
        <form action={createTrainingSeries} className="mt-6 space-y-5">
          <input name="teamId" type="hidden" value={teamId}/><input name="date" type="hidden" value={draft.date}/>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="font-bold text-ink sm:col-span-2">Názov<input className="field mt-2" maxLength={120} name="title" onChange={(event) => setDraft({ ...draft, title: event.target.value })} required value={draft.title}/></label>
            <label className="font-bold text-ink">Čas od<input className="field mt-2" name="startTime" onChange={(event) => setDraft({ ...draft, startTime: event.target.value })} required type="time" value={draft.startTime}/></label>
            <label className="font-bold text-ink">Čas do<input className="field mt-2" name="endTime" onChange={(event) => setDraft({ ...draft, endTime: event.target.value })} required type="time" value={draft.endTime}/></label>
            <label className="font-bold text-ink sm:col-span-2">Miesto<input className="field mt-2" maxLength={160} name="location" onChange={(event) => setDraft({ ...draft, location: event.target.value })} placeholder="Ihrisko alebo adresa" value={draft.location}/></label>
            <label className="font-bold text-ink sm:col-span-2">Opakovanie<select className="field mt-2" name="repeatWeeks" onChange={(event) => setDraft({ ...draft, repeatWeeks: event.target.value })} value={draft.repeatWeeks}><option value="1">Iba tento tréning</option><option value="4">Každý týždeň · 4 týždne</option><option value="8">Každý týždeň · 8 týždňov</option><option value="12">Každý týždeň · 12 týždňov</option><option value="26">Každý týždeň · pol sezóny</option><option value="40">Každý týždeň · celá sezóna</option></select></label>
          </div>
          <label className="block font-bold text-ink">Informácie pre rodičov<textarea className="field mt-2 min-h-24" maxLength={1000} name="note" onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="Čas zrazu, výstroj alebo ďalšie pokyny" value={draft.note}/></label>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button className="btn-secondary justify-center" onClick={() => setDraft(null)} type="button">Zrušiť</button><button className="btn-primary justify-center" type="submit"><CalendarIcon className="mr-2 h-4 w-4" /> Uložiť tréning</button></div>
        </form>
      </div>
    </div>}
  </>;
}
