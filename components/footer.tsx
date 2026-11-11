import Link from "next/link";
import { TrophyIcon } from "@/components/icons";

export function Footer() {
  return <footer className="border-t border-ink/10 bg-[#fbfcf8]"><div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-10 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between lg:px-8"><Link href="/" className="flex items-center gap-2 font-black uppercase tracking-tight text-ink"><span className="text-arena-600"><TrophyIcon /></span>Tournio</Link><p>Turnaje, tímy a výsledky na jednom mieste.</p><p>© 2026 Tournio</p></div></footer>;
}
