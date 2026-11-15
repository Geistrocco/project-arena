import Link from "next/link";

export const metadata = {title:"Tournio pripravujeme",robots:{index:false,follow:false}};
export default function PreparingPage() {
  return <section className="grid min-h-screen place-items-center px-5 py-16"><div className="w-full max-w-lg rounded-3xl border border-arena-200 bg-white p-8 text-center shadow-card sm:p-12"><p className="eyebrow">Tournio</p><h1 className="mt-5 text-4xl font-black tracking-tight">Pripravujeme pre vás Tournio</h1><p className="mt-5 text-lg leading-8 text-slate-600">Aplikáciu práve testujeme a vylepšujeme. Pre verejnosť ju otvoríme po dokončení príprav.</p><p className="mt-7 text-sm text-slate-500">Máš už zaregistrovaný testovací účet?</p><Link href="/prihlasenie" className="btn-primary mt-4 inline-flex">Prihlásiť sa do testovania</Link></div></section>;
}
