"use client";

import Link from "next/link";
import { useState } from "react";
import { CloseIcon, MenuIcon, TrophyIcon } from "@/components/icons";

export function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight text-ink" onClick={() => setOpen(false)}>
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-arena-600 text-white"><TrophyIcon /></span>Arena
        </Link>
        <nav className="hidden items-center gap-8 md:flex" aria-label="Hlavná navigácia">
          <Link className="nav-link" href="/">Turnaje</Link>
          <Link className="nav-link" href="/vytvorit-turnaj">Vytvoriť turnaj</Link>
          <button className="btn-secondary" type="button" onClick={() => alert("Prihlasovanie bude dostupné v ďalšej verzii.")}>Prihlásiť sa</button>
        </nav>
        <button className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 md:hidden" onClick={() => setOpen(!open)} aria-label="Otvoriť menu" aria-expanded={open}>{open ? <CloseIcon /> : <MenuIcon />}</button>
      </div>
      {open && <nav className="border-t border-slate-100 bg-white px-5 py-4 md:hidden"><div className="mx-auto flex max-w-7xl flex-col gap-2"><Link className="mobile-link" href="/" onClick={() => setOpen(false)}>Turnaje</Link><Link className="mobile-link" href="/vytvorit-turnaj" onClick={() => setOpen(false)}>Vytvoriť turnaj</Link><button className="mobile-link text-left" onClick={() => alert("Prihlasovanie bude dostupné v ďalšej verzii.")}>Prihlásiť sa</button></div></nav>}
    </header>
  );
}
