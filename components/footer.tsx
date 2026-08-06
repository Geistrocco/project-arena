import Link from "next/link";
import { TrophyIcon } from "@/components/icons";

export function Footer() {
  return <footer className="border-t border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-10 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between lg:px-8"><Link href="/" className="flex items-center gap-2 font-bold text-ink"><span className="text-arena-600"><TrophyIcon /></span>Arena</Link><p>Miesto, kde sa športové tímy stretávajú.</p><p>© 2026 Project Arena</p></div></footer>;
}
