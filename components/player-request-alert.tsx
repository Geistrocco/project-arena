import Link from "next/link";

export function PlayerRequestAlert({count,href="/ziadosti-hracov",teamOnly=false}:{count:number;href?:string;teamOnly?:boolean}) {
  if(count<=0)return null;
  return <aside className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-sm" aria-label="Žiadosti hráčov čakajúce na schválenie">
    <p className="font-extrabold">{teamOnly?(count===1?"1 hráč čaká na schválenie":count<5?`${count} hráči čakajú na schválenie`:`${count} hráčov čaká na schválenie`):(count===1?"1 žiadosť čaká na schválenie":count<5?`${count} žiadosti čakajú na schválenie`:`${count} žiadostí čaká na schválenie`)}</p>
    <p className="mt-1 text-sm">Rodič požiadal o prijatie dieťaťa do tímu.</p>
    <Link className="mt-2 inline-flex min-h-10 items-center font-extrabold underline" href={href}>Skontrolovať žiadosti →</Link>
  </aside>;
}
