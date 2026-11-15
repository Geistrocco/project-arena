import Link from "next/link";
import {notFound} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {TournamentInvitationResponse} from "@/components/tournament-invitation-response";
export const metadata={title:"Pozvánka na turnaj",robots:{index:false,follow:false},referrer:"no-referrer" as const};
export default async function InvitationPage({params}:{params:Promise<{token:string}>}) {
 const {token}=await params;if(!/^[a-f0-9]{64}$/.test(token))notFound();
 const {data:i,error}=await (await createClient()).rpc("get_tournament_invitation",{p_token:token});if(error||!i)notFound();
 const path=`/turnajova-pozvanka/${token}`;
 return <section className="mx-auto max-w-2xl px-5 py-16"><div className="rounded-3xl border bg-white p-8"><p className="eyebrow">Pozvánka pre konkrétne družstvo</p><h1 className="mt-3 text-3xl font-black">{i.name}</h1><p className="mt-3 font-bold">{i.team}</p><p>{i.category} · sezóna {i.season}</p><p className="mt-4">{i.date} · {i.place} · štartovné {i.fee} €</p>
 <p className="mt-5 font-bold">{i.status==="accepted"?"Účasť potvrdená":i.status==="declined"?"Pozvánka odmietnutá":i.review==="pending"?"Čaká na overenie organizátorom":i.review==="rejected"?"Organizátor nepotvrdil tvoje zastupovanie družstva":"Čaká na odpoveď"}</p>
 {i.closed?<p className="mt-4">Prijímanie odpovedí je uzavreté.</p>:i.status==="pending"&&!i.review&&(i.signed_in?<TournamentInvitationResponse token={token}/>:<div className="mt-6 space-y-4"><p>Na odpoveď sa prihlás alebo vytvor účet cez túto pozvánku. V súkromnom testovaní získaš prístup iba k tejto pozvánke.</p><Link className="btn-primary" href={`/prihlasenie?next=${encodeURIComponent(path)}`}>Prihlásiť sa</Link><Link className="btn-secondary ml-3" href={`${path}/registracia`}>Vytvoriť účet k pozvánke</Link></div>)}
 </div></section>;
}
