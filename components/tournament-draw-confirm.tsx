"use client";
import Link from "next/link";
import {useActionState} from "react";
import {applyDraw} from "@/app/turnaje/[slug]/rozlosovanie/actions";
export function TournamentDrawConfirm({slug,version,names}:{slug:string;version:string;names:string[]}){
 const [state,action,pending]=useActionState(applyDraw,{});
 if(state.success)return <div role="status" className="mt-6 rounded-2xl bg-emerald-50 p-5"><p className="font-bold text-emerald-800">Tímy sú zaradené do rozpisu a prihlášky sú uzavreté.</p><Link className="btn-primary mt-4" href={`/turnaje/${slug}/administracia`}>Otvoriť administráciu turnaja</Link></div>;
 return <form action={action} className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5"><input type="hidden" name="slug" value={slug}/><input type="hidden" name="version" value={version}/><input type="hidden" name="names" value={JSON.stringify(names)}/><label className="flex items-start gap-3 font-bold"><input className="mt-1" type="checkbox" name="confirm" value="yes" required/><span>Skontroloval som účastníkov aj skupiny. Potvrdzujem zaradenie do rozpisu a uzavretie prijímania ďalších tímov.</span></label><p className="mt-3 text-sm text-slate-600">Ručne pridané tímy týmto potvrdzuješ ako účastníkov. Časy zápasov a ihriská zostávajú zachované. Rozpis s výsledkami sa týmto spôsobom nemení.</p>{state.error&&<p role="alert" className="mt-3 text-red-700">{state.error}</p>}<button className="btn-primary mt-4" type="submit" disabled={pending}>{pending?"Ukladám…":"Potvrdiť rozlosovanie a uzavrieť prihlášky"}</button></form>;
}
