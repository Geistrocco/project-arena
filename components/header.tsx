"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CloseIcon, MenuIcon, TrophyIcon } from "@/components/icons";
import { createClient } from "@/lib/supabase/client";

export function Header() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setEmail(session?.user.email ?? null));
    return () => data.subscription.unsubscribe();
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
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight text-ink" onClick={() => setOpen(false)}>
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-arena-600 text-white"><TrophyIcon /></span>Tournio
        </Link>
        <nav className="hidden items-center gap-8 md:flex" aria-label="Hlavná navigácia">
          <Link className="nav-link" href="/">Turnaje</Link>
          {email && <Link className="nav-link" href="/moj-tim">Môj tím{unread > 0 && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-extrabold text-amber-900">{unread}</span>}</Link>}
          <Link className="nav-link" href="/vytvorit-turnaj">Vytvoriť turnaj</Link>
          {email ? <div className="flex items-center gap-3"><Link className="nav-link max-w-48 truncate" href="/ucet">{email}</Link><button className="btn-secondary" type="button" onClick={signOut}>Odhlásiť sa</button></div> : <Link className="btn-secondary" href="/prihlasenie">Prihlásiť sa</Link>}
        </nav>
        <button className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 md:hidden" onClick={() => setOpen(!open)} aria-label="Otvoriť menu" aria-expanded={open}>{open ? <CloseIcon /> : <MenuIcon />}</button>
      </div>
      {open && <nav className="border-t border-slate-100 bg-white px-5 py-4 md:hidden"><div className="mx-auto flex max-w-7xl flex-col gap-2"><Link className="mobile-link" href="/" onClick={() => setOpen(false)}>Turnaje</Link>{email && <Link className="mobile-link" href="/moj-tim" onClick={() => setOpen(false)}>Môj tím{unread > 0 && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-extrabold text-amber-900">{unread}</span>}</Link>}<Link className="mobile-link" href="/vytvorit-turnaj" onClick={() => setOpen(false)}>Vytvoriť turnaj</Link>{email ? <><Link className="mobile-link" href="/ucet" onClick={() => setOpen(false)}>Môj účet</Link><button className="mobile-link text-left" onClick={signOut}>Odhlásiť sa</button></> : <Link className="mobile-link" href="/prihlasenie" onClick={() => setOpen(false)}>Prihlásiť sa</Link>}</div></nav>}
    </header>
  );
}
