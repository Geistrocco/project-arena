import {randomInt} from "node:crypto";
import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {TournamentDrawConfirm} from "@/components/tournament-draw-confirm";
type Context={version:string;capacity:number;participants:{name:string;source:string}[];slots:{id:string;name:string;group:string;group_id:string;slot:number}[];locked:boolean;has_results:boolean;closed:boolean;pending:number};
export default async function DrawPage({params}:{params:Promise<{slug:string}>}){
 const {slug}=await params;const supabase=await createClient();const {data:auth}=await supabase.auth.getClaims();if(!auth?.claims?.sub)redirect("/prihlasenie");
 const {data,error}=await supabase.rpc("get_tournament_draw_context",{p_slug:slug});if(error||!data)notFound();const ctx=data as Context;
 const names=ctx.participants.map(p=>p.name);for(let i=names.length-1;i>0;i--){const j=randomInt(i+1);[names[i],names[j]]=[names[j],names[i]];}
 const mismatch=names.length!==ctx.capacity||ctx.slots.length!==ctx.capacity||new Set(ctx.slots.map(s=>s.name)).size!==ctx.slots.length;
 const blocked=ctx.locked||ctx.has_results||mismatch||names.length<2;
 return <section className="mx-auto max-w-4xl px-5 py-12"><Link className="font-bold text-arena-700" href={`/turnaje/${slug}/administracia`}>← Administrácia turnaja</Link><p className="eyebrow mt-6">Účastníci a rozpis</p><h1 className="mt-3 text-3xl font-extrabold">Náhľad rozlosovania</h1><p className="mt-3 text-slate-600">Prijaté prihlášky a ručne pridaní účastníci. Opakované otvorenie vytvorí nový náhodný náhľad; uloží sa až po potvrdení.</p><p className="mt-4 font-bold">Účastníci: {names.length} / {ctx.capacity} · Čakajúce prihlášky: {ctx.pending}</p>{ctx.closed&&<p className="mt-3 text-arena-700">Prihlášky už sú uzavreté.</p>}<ul className="mt-5 space-y-2">{ctx.participants.map(p=><li key={p.name} className="rounded-xl bg-slate-50 p-3"><strong>{p.name}</strong> · {p.source==="accepted"?"Prijatá prihláška":"Ručne pridaný — potvrdíš pri rozlosovaní"}</li>)}</ul>
 {blocked?<div role="alert" className="mt-6 rounded-2xl bg-amber-50 p-5">{ctx.locked?"Výsledky sú uzamknuté.":ctx.has_results?"Turnaj už má výsledky. Nové rozlosovanie ich nesmie prepísať.":"Počet účastníkov sa musí zhodovať s kapacitou a miestami základného rozpisu. Uprav počet tímov alebo doplň účastníkov; fiktívne tímy nepridávame."}<Link className="mt-3 block font-bold text-arena-700" href={`/turnaje/${slug}/upravit`}>Upraviť nastavenia turnaja →</Link></div>:<><h2 className="mt-8 text-xl font-extrabold">Navrhované skupiny</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{ctx.slots.map((slot,index)=><div className="rounded-xl border p-4" key={slot.id}><p className="text-sm text-slate-500">{slot.group} · miesto {slot.slot}</p><p className="font-bold">{names[index]}</p></div>)}</div><TournamentDrawConfirm slug={slug} version={ctx.version} names={names}/></>}
 </section>;
}
