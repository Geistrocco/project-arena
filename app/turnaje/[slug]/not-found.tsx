import Link from "next/link";
export default function NotFound() { return <div className="mx-auto max-w-xl px-5 py-28 text-center"><p className="eyebrow">404</p><h1 className="mt-4 text-4xl font-black">Turnaj sa nenašiel</h1><p className="mt-4 text-slate-600">Odkaz už nemusí byť aktuálny.</p><Link href="/" className="btn-primary mt-8">Späť na turnaje</Link></div>; }
