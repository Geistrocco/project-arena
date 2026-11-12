import Link from "next/link";
import { ArrowIcon, CheckIcon, SearchIcon, TrophyIcon } from "@/components/icons";
import { TournamentCatalog } from "@/components/tournament-catalog";
import { getPublicTournaments } from "@/lib/tournaments";

export default async function Home() {
  const tournaments = await getPublicTournaments();
  const sports = ["Všetky športy", ...Array.from(new Set(tournaments.map((item) => item.sport)))];
  const cities = new Set(tournaments.map((item) => item.city)).size;
  const activeSports = new Set(tournaments.map((item) => item.sport)).size;

  return (
    <>
      <section className="hero-shell">
        <div className="hero-grid" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:py-20 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-16 lg:px-8 lg:py-24">
          <div>
            <p className="eyebrow text-arena-700">Turnajová platforma pre tímy a organizátorov</p>
            <h1 className="display-title mt-5 max-w-4xl text-5xl leading-[0.94] sm:text-6xl lg:text-[5.5rem]">
              Turnaje bez chaosu. <span className="text-arena-600">Hra môže začať.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
              Nájdi vhodný turnaj pre svoj tím alebo ho zorganizuj od prihlášok až po potvrdené výsledky na jednom mieste.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="#turnaje" className="btn-primary justify-center">
                <SearchIcon className="mr-2 h-4 w-4" /> Nájsť turnaj
              </Link>
              <Link href="/vytvorit-turnaj" className="btn-secondary justify-center">
                Vytvoriť turnaj <ArrowIcon className="ml-2 h-4 w-4" />
              </Link>
            </div>
            <dl className="mt-11 grid max-w-2xl grid-cols-3 border-y border-ink/10 py-5">
              <Metric value={tournaments.length} label="verejných turnajov" />
              <Metric value={activeSports} label="športov v ponuke" />
              <Metric value={cities} label="miest a obcí" />
            </dl>
          </div>

          <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
            <div className="absolute -inset-5 rotate-2 rounded-[2.5rem] bg-arena-200/70" aria-hidden="true" />
            <div className="relative overflow-hidden rounded-[2rem] border border-ink/10 bg-ink p-6 text-white shadow-[0_30px_80px_rgba(18,32,24,0.18)] sm:p-8">
              <div className="flex items-center justify-between border-b border-white/15 pb-5">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-arena-300">Tournio v praxi</p>
                  <h2 className="display-heading mt-2 text-3xl text-white">Jedno miesto. Celý turnaj.</h2>
                </div>
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-arena-500 text-ink"><TrophyIcon className="h-6 w-6" /></span>
              </div>
              <ol className="mt-4 space-y-1">
                <HeroStep number="01" title="Tímy sa prihlásia" text="Kapacita, kategória a podmienky sú jasné ešte pred turnajom." />
                <HeroStep number="02" title="Rozpis vznikne automaticky" text="Skupiny, ihriská, prestávky a systém hry bez ručného prepisovania." />
                <HeroStep number="03" title="Výsledky sú ihneď online" text="Živý harmonogram, tabuľky, play-off a export do PDF." />
              </ol>
              <div className="mt-6 flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 text-sm text-slate-200">
                <CheckIcon className="h-5 w-5 shrink-0 text-arena-300" />
                Zadarmo počas úvodnej fázy Tournio
              </div>
            </div>
          </div>
        </div>
      </section>

      <TournamentCatalog tournaments={tournaments} sports={sports} />

      <section className="px-5 pb-20 lg:px-8">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-ink px-6 py-10 text-white sm:px-10 lg:flex lg:items-center lg:justify-between lg:gap-12 lg:px-14 lg:py-12">
          <div>
            <p className="eyebrow text-arena-300">Pre organizátorov</p>
            <h2 className="display-heading mt-3 text-4xl text-white sm:text-5xl">Vytvor turnaj, nie tabuľkový chaos.</h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">Tournio pripraví skupiny, harmonogram aj priebežné tabuľky. Ty zostávaš organizátorom a rozhoduješ o konečnom nastavení.</p>
          </div>
          <Link href="/vytvorit-turnaj" className="btn-primary mt-8 shrink-0 justify-center lg:mt-0">
            Vytvoriť turnaj <ArrowIcon className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </section>
    </>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return <div className="pr-3 first:pr-5 [&+&]:border-l [&+&]:border-ink/10 [&+&]:pl-5"><dt className="display-heading text-2xl sm:text-3xl">{value}</dt><dd className="mt-1 text-xs font-semibold leading-4 text-slate-500 sm:text-sm">{label}</dd></div>;
}

function HeroStep({ number, title, text }: { number: string; title: string; text: string }) {
  return <li className="grid grid-cols-[2.5rem_1fr] gap-3 rounded-2xl px-2 py-4 transition hover:bg-white/5"><span className="pt-0.5 text-xs font-black tracking-[0.15em] text-arena-300">{number}</span><div><h3 className="text-base font-extrabold">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-300">{text}</p></div></li>;
}
