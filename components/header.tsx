"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CloseIcon, MenuIcon, TrophyIcon } from "@/components/icons";
import { createClient } from "@/lib/supabase/client";

export function Header() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [accountMode, setAccountMode] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    let active = true;
    let generation = 0;
    const refreshMode = async () => {
      const request = ++generation;
      try {
        const response = await fetch("/api/account-mode", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (active && request === generation) setAccountMode(data.mode);
      } catch { /* Keep organizer links hidden until the preference can be loaded. */ }
    };
    const initialGeneration = generation;
    supabase.auth.getUser().then(({ data }) => { if (active && initialGeneration === generation) { setEmail(data.user?.email ?? null); void refreshMode(); } });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => { setEmail(session?.user.email ?? null); setAccountMode(null); void refreshMode(); });
    return () => { active = false; generation++; data.subscription.unsubscribe(); };
  }, [supabase]);

  useEffect(() => {
    if (!email) return;
    const refresh = async () => {
      const { data, error } = await supabase.rpc("get_my_chat_unread_count");
      if (!error) setUnread(Number(data ?? 0));
    };
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 30000);
    return () => window.clearInterval(timer);
  }, [supabase, email]);

  async function signOut() {
    await supabase.auth.signOut();
    setUnread(0);
    setOpen(false);
  }
  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-[#fbfcf8]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between px-5 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5 text-xl font-black uppercase tracking-[-0.03em] text-ink" onClick={() => setOpen(false)}>
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-arena-500 text-ink shadow-[0_7px_20px_rgba(92,215,95,0.28)]"><TrophyIcon /></span>Tournio
        </Link>
        <nav className="hidden items-center gap-5 lg:flex xl:gap-8" aria-label="Hlavná navigácia">
          <Link className="nav-link" href="/">Turnaje</Link>
          {email && accountMode === "coach" && <Link className="nav-link" href="/moje-turnaje">Moje turnaje</Link>}
          {email && <Link className="nav-link" href="/moj-tim">Môj tím{unread > 0 && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-extrabold text-amber-900">{unread}</span>}</Link>}
          {(!email || accountMode === "coach") && <Link className="nav-link" href="/vytvorit-turnaj">Vytvoriť turnaj</Link>}
          {email ? <div className="flex items-center gap-3"><Link className="nav-link max-w-48 truncate" href="/ucet">{email}</Link><button className="btn-secondary" type="button" onClick={signOut}>Odhlásiť sa</button></div> : <Link className="btn-secondary" href="/prihlasenie">Prihlásiť sa</Link>}
        </nav>
        <button className="grid h-10 w-10 place-items-center rounded-xl border border-ink/15 bg-white lg:hidden" onClick={() => setOpen(!open)} aria-label="Otvoriť menu" aria-expanded={open}>{open ? <CloseIcon /> : <MenuIcon />}</button>
      </div>
      {open && <nav className="border-t border-slate-100 bg-white px-5 py-4 lg:hidden"><div className="mx-auto flex max-w-7xl flex-col gap-2"><Link className="mobile-link" href="/" onClick={() => setOpen(false)}>Turnaje</Link>{email && accountMode === "coach" && <Link className="mobile-link" href="/moje-turnaje" onClick={() => setOpen(false)}>Moje turnaje</Link>}{email && <Link className="mobile-link" href="/moj-tim" onClick={() => setOpen(false)}>Môj tím{unread > 0 && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-extrabold text-amber-900">{unread}</span>}</Link>}{(!email || accountMode === "coach") && <Link className="mobile-link" href="/vytvorit-turnaj" onClick={() => setOpen(false)}>Vytvoriť turnaj</Link>}{email ? <><Link className="mobile-link" href="/ucet" onClick={() => setOpen(false)}>Môj účet</Link><button className="mobile-link text-left" onClick={signOut}>Odhlásiť sa</button></> : <Link className="mobile-link" href="/prihlasenie" onClick={() => setOpen(false)}>Prihlásiť sa</Link>}</div></nav>}
    </header>
  );
}
