"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { postTeamChatMessage } from "@/app/timy/[teamId]/chat/actions";

type Message = { id: string; body: string; author_name: string; is_announcement: boolean; is_pinned: boolean; created_at: string; edited_at: string | null; deleted_at: string | null; can_edit: boolean; can_moderate: boolean; read_count: number; eligible_readers: number };
const time = new Intl.DateTimeFormat("sk-SK", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Bratislava" });

export function TeamChat({ teamId, nominationId, canManage = false }: { teamId: string; nominationId?: string; canManage?: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [announcement, setAnnouncement] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const supabase = createClient();
  const reload = useCallback(async () => {
    const { data, error: loadError } = await supabase.rpc("get_team_chat_messages", { p_team_id: teamId, p_nomination_id: nominationId ?? null });
    if (loadError) { setError("Správy sa nepodarilo načítať."); return; }
    setMessages(((data ?? []) as Message[]).reverse().sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned)));
    void supabase.rpc("mark_team_chat_read", { p_team_id: teamId, p_nomination_id: nominationId ?? null });
  }, [supabase, teamId, nominationId]);
  useEffect(() => {
    void Promise.resolve().then(reload);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void reload(); }, 12000);
    return () => window.clearInterval(timer);
  }, [reload]);
  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true); setError(""); setNotice("");
    const result = await postTeamChatMessage(teamId, body, nominationId, canManage && !nominationId && announcement);
    setBusy(false);
    if (!result.ok) { setError(result.error ?? "Odoslanie zlyhalo."); return; }
    setBody(""); setAnnouncement(false); setNotice(result.notice ?? "Správa bola odoslaná.");
    await reload();
  }
  async function change(message: Message, action: "edit" | "delete" | "pin") {
    let edited = message.body;
    if (action === "edit") {
      const answer = window.prompt("Upraviť správu", edited);
      if (answer === null) return;
      edited = answer.trim();
      if (!edited || edited.length > 2000) { setError("Správa musí mať 1 až 2000 znakov."); return; }
    }
    if (action === "delete" && !window.confirm("Odstrániť správu?")) return;
    const { error: updateError } = await supabase.rpc("update_team_chat_message", { p_message_id: message.id, p_body: edited, p_delete: action === "delete", p_pinned: action === "pin" ? !message.is_pinned : null });
    if (updateError) { setError("Zmenu sa nepodarilo uložiť."); return; }
    setError(""); await reload();
  }
  return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7" aria-label={nominationId ? "Diskusia k udalosti" : "Tímový chat"}>
    <h2 className="text-xl font-extrabold text-ink">{nominationId ? "Diskusia k udalosti" : "Tímový chat"}</h2>
    <p className="mt-1 text-sm text-slate-600">{nominationId ? "Správy k tejto udalosti vidí celý tím." : "Spoločné správy trénerov a rodičov tímu."}</p>
    {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
    {notice && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{notice}</p>}
    <div className="mt-5 max-h-[32rem] space-y-3 overflow-y-auto" aria-live="polite">
      {messages.length === 0 && <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">Zatiaľ tu nie sú žiadne správy. Napíšte prvú.</p>}
      {messages.map((message) => <article key={message.id} className={`rounded-2xl border p-4 ${message.is_announcement ? "border-amber-200 bg-amber-50" : "border-slate-100 bg-slate-50"}`}>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500"><strong className="text-sm text-ink">{message.author_name}</strong><time dateTime={message.created_at}>{time.format(new Date(message.created_at))}</time>{message.is_announcement && <span className="font-bold text-amber-800">Dôležitý oznam</span>}{message.is_pinned && <span className="font-bold text-amber-800">Pripnuté</span>}{message.edited_at && <span>upravené</span>}</div>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-ink">{message.body}</p>
        {!message.deleted_at && <div className="mt-2 flex flex-wrap gap-4 text-xs"><span className="text-slate-500">{message.is_announcement && message.can_moderate ? `Prečítalo ${message.read_count} z ${message.eligible_readers}` : ""}</span>{message.can_edit && <button className="font-semibold text-arena-700" onClick={() => void change(message, "edit")}>Upraviť</button>}{(message.can_edit || message.can_moderate) && <button className="font-semibold text-red-700" onClick={() => void change(message, "delete")}>Odstrániť</button>}{message.is_announcement && message.can_moderate && <button className="font-semibold text-arena-700" onClick={() => void change(message, "pin")}>{message.is_pinned ? "Odopnúť" : "Pripnúť"}</button>}</div>}
      </article>)}
    </div>
    <form onSubmit={send} className="mt-5 space-y-3"><label className="block text-sm font-bold text-ink">Nová správa<textarea className="field mt-2 min-h-28" maxLength={2000} onChange={(event) => setBody(event.target.value)} placeholder="Napíšte správu tímu..." required value={body}/></label>{canManage && !nominationId && <label className="flex items-center gap-2 text-sm text-slate-700"><input checked={announcement} onChange={(event) => setAnnouncement(event.target.checked)} type="checkbox"/>Dôležitý oznam (pošleme aj e-mail)</label>}<button className="btn-primary" disabled={busy} type="submit">{busy ? "Odosielam..." : "Odoslať správu"}</button></form>
  </section>;
}
