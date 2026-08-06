import { CreateTournamentForm } from "@/components/create-tournament-form";
export const metadata = { title: "Vytvoriť turnaj" };
export default function Page() { return <div className="mx-auto max-w-4xl px-5 py-12 lg:px-8 lg:py-16"><p className="eyebrow">Pre organizátorov</p><h1 className="mt-4 text-4xl font-black tracking-[-0.03em] sm:text-5xl">Vytvorte nový turnaj</h1><p className="mb-9 mt-4 text-lg text-slate-600">Vyplňte základné informácie. Turnaj môžete neskôr upraviť.</p><CreateTournamentForm/></div>; }
