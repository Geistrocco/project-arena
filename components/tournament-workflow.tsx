import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import {getApplicationContext} from "@/lib/tournament-applications";
import {tournamentWorkflow,type TournamentDrawContext} from "@/lib/tournament-workflow";

export async function TournamentWorkflow({slug,date,finished,matchCount,locked}:{slug:string;date:string;finished:number;matchCount:number;locked:boolean}) {
  const supabase=await createClient();
  const [draw,application]=await Promise.all([supabase.rpc("get_tournament_draw_context",{p_slug:slug}),getApplicationContext(slug)]);
  if(draw.error||!draw.data||application.error||!application.tournament||application.user?.id!==application.tournament.organizer_id) {
    return <aside role="alert" className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5"><p className="font-bold">Stav účastníkov sa nepodarilo načítať.</p><p className="mt-1 text-sm">Obnov stránku pred kontrolou kapacity a rozlosovaním.</p><Link className="mt-3 inline-block font-bold underline" href="#prihlaska">Otvoriť prihlášky</Link></aside>;
  }
  const context=draw.data as TournamentDrawContext;
  const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Bratislava",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const next=tournamentWorkflow({slug,context,finished,matchCount,locked,publicationStatus:application.tournament.publication_status,date,today});
  const accepted=context.participants.filter(p=>p.source==="accepted").length;
  const manual=context.participants.filter(p=>p.source==="manual").length;
  const color=next.tone==="amber"?"border-amber-300 bg-amber-50":next.tone==="green"?"border-emerald-200 bg-emerald-50":"border-arena-200 bg-arena-50";
  return <section className={`mt-6 rounded-3xl border p-5 sm:p-6 ${color}`} aria-label="Stav prípravy turnaja">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="eyebrow">Ďalší krok</p><h2 className="mt-2 text-2xl font-extrabold">{next.title}</h2><p className="mt-2 max-w-2xl text-sm text-slate-600">{next.description}</p></div><Link className="btn-primary shrink-0 justify-center" href={next.href}>{next.label}</Link></div>
    <p className="mt-5 font-bold">Obsadenosť: {context.participants.length} / {context.capacity} tímov</p>
    <dl className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4"><Count label="Prijaté prihlášky" value={accepted}/><Count label="Ručne zadané tímy" value={manual}/><Count label="Čakajúce prihlášky" value={context.pending} href="#prihlaska"/><Count label="Voľné miesta" value={Math.max(0,context.capacity-context.participants.length)}/></dl>
    <p className="mt-3 text-xs text-slate-600">{context.closed?"Prihlášky sú uzavreté. Účastníci boli potvrdení pri rozlosovaní.":"Čakajúce prihlášky nezaberajú miesto. Ručne zadané tímy sa potvrdia pri rozlosovaní."}</p>
    {context.pending>0&&next.kind!=="pending"&&<Link className="mt-3 inline-block text-sm font-bold underline" href="#prihlaska">Skontrolovať zostávajúce prihlášky ({context.pending}) →</Link>}
  </section>;
}
function Count({label,value,href}:{label:string;value:number;href?:string}) {
  return <div className="rounded-2xl border border-white bg-white/80 p-4"><dt className="text-xs font-bold text-slate-600">{label}</dt><dd className="mt-1 text-2xl font-extrabold">{href&&value>0?<Link className="underline" href={href}>{value}</Link>:value}</dd></div>;
}
