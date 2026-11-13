"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CalendarIcon } from "@/components/icons";

type Notice = {
  id: string;
  nomination_id: string;
  kind: "reminder" | "changed" | "cancelled" | "weekly";
  title: string;
  team_name: string;
  team_id: string;
  starts_at: string;
  location: string | null;
  note: string | null;
};
const dateTime = new Intl.DateTimeFormat("sk-SK", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Bratislava" });

function trainingMonth(value: string) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Europe/Bratislava", year: "numeric", month: "2-digit" }).formatToParts(new Date(value));
  return `${parts.find(p => p.type === "year")?.value}-${parts.find(p => p.type === "month")?.value}`;
}

export function TrainingNotifications() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(0);
  const [cancellation, setCancellation] = useState<{ id: string; reason: string } | null>(null);
  const hidden = useRef(new Set<string>());
  const dialog = useRef<HTMLDialogElement>(null);
  const current = notices[0];

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    let busy = false;
    let generation = 0;
    const check = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      const requestGeneration = generation;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { if (active) setNotices([]); return; }
        const { data, error } = await supabase.rpc("get_my_training_notifications_v2");
        if (active && generation === requestGeneration && !error) {
          setNow(Date.now());
          setNotices(((data ?? []) as Notice[]).filter(item => !hidden.current.has(item.id)));
        }
      } catch { /* A network failure must not interrupt the application. */ }
      finally { busy = false; }
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT") return;
      generation += 1;
      hidden.current.clear();
      setNotices([]);
    });
    void check();
    const timer = window.setInterval(() => void check(), 30_000);
    const wake = () => void check();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    return () => { active = false; subscription.unsubscribe(); clearInterval(timer); document.removeEventListener("visibilitychange", wake); window.removeEventListener("focus", wake); };
  }, []);

  useEffect(() => {
    if (current && !dialog.current?.open) dialog.current?.showModal();
    if (!current && dialog.current?.open) dialog.current.close();
  }, [current]);

  useEffect(() => {
    if (current?.kind !== "cancelled") return;
    let active = true;
    void createClient().rpc("get_training_cancellation_reason", { p_id: current.nomination_id }).then(({ data }) => {
      if (active && typeof data === "string") setCancellation({ id: current.id, reason: data });
    }, () => { /* Keep the cancellation alert usable if the reason cannot be loaded. */ });
    return () => { active = false; };
  }, [current?.id, current?.kind, current?.nomination_id]);

  async function dismiss() {
    if (!current || saving) return;
    setSaving(true);
    setError(false);
    try {
      const { error } = await createClient().rpc("dismiss_training_notification", { p_id: current.id });
      if (error) throw error;
      hidden.current.add(current.id);
      setNotices(items => items.filter(item => item.id !== current.id));
    } catch { setError(true); }
    finally { setSaving(false); }
  }

  const minutes = current ? Math.max(1, Math.ceil((new Date(current.starts_at).getTime() - now) / 60_000)) : 0;
  return <dialog ref={dialog} aria-labelledby="training-notice-title" className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl backdrop:bg-black/50 sm:p-8" onCancel={event => { event.preventDefault(); void dismiss(); }}>
    {current && <><div className="mb-5 inline-flex rounded-2xl bg-arena-50 p-3 text-arena-700"><CalendarIcon className="h-7 w-7" /></div>
      <p className="eyebrow">{current.team_name}</p>
      <h2 id="training-notice-title" className="mt-2 text-2xl font-extrabold text-ink">{current.kind === "weekly" ? "Tréningy na tento týždeň" : current.kind === "cancelled" ? "Tréning bol zrušený" : current.kind === "changed" ? "Pozor, zmena tréningu" : minutes >= 59 ? "O hodinu máme tréning!" : `Tréning začína o ${minutes} min.`}</h2>
      <p className="mt-4 font-bold text-ink">{current.title}</p>
      <p className="mt-2 text-slate-600">{dateTime.format(new Date(current.starts_at))}</p>
      {current.location && <p className="mt-1 text-slate-600">{current.location}</p>}
      {current.kind === "cancelled" && cancellation?.id === current.id && <p className="mt-4 whitespace-pre-wrap rounded-xl bg-red-50 p-4 text-sm font-bold text-red-800">Dôvod zrušenia: {cancellation.reason}</p>}
      {current.note && <p className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm text-slate-700">{current.note}</p>}
      {current.kind === "changed" && <p className="mt-3 text-sm text-slate-500">Toto sú aktuálne údaje tréningu. Skontroluj čas, miesto a pokyny trénera.</p>}
      {error && <p role="alert" className="mt-4 text-sm text-red-700">Potvrdenie sa nepodarilo uložiť. Skús to znova.</p>}
      <div className="mt-6 flex flex-wrap gap-3"><Link className="btn-secondary" href={current.kind === "weekly" ? `/timy/${current.team_id}/kalendar?mesiac=${trainingMonth(current.starts_at)}` : `/nominacie/${current.nomination_id}`} onClick={() => void dismiss()}>{current.kind === "weekly" ? "Pozrieť program" : "Detail tréningu"}</Link><button autoFocus className="btn-primary" disabled={saving} onClick={() => void dismiss()} type="button">{saving ? "Ukladám…" : "Rozumiem"}</button></div>
      {notices.length > 1 && <p className="mt-4 text-xs text-slate-500">Ďalšie upozornenia: {notices.length - 1}</p>}
    </>}
  </dialog>;
}
