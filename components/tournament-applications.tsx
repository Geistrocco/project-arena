import Link from "next/link";
import { getApplicationContext } from "@/lib/tournament-applications";
import { TournamentApplicationForm, ApplicationDecision } from "./tournament-application-forms";
const states = {pending:"Čaká na schválenie",accepted:"Prijatý tím",rejected:"Prihláška odmietnutá"};
export async function TournamentApplications({slug,admin=false}:{slug:string;admin?:boolean}) {
 const context=await getApplicationContext(slug);
 if(!context.tournament)return <div id="prihlaska" className="rounded-2xl border p-6"><p>Na ukážkový turnaj sa nedá prihlásiť tím.</p></div>;
 const isOwner=context.user?.id===context.tournament.organizer_id;
 if(admin&&!isOwner)return null;
 const applications=admin?[...context.applications].sort((a,b)=>Number(b.status==="pending")-Number(a.status==="pending")||a.created_at.localeCompare(b.created_at)):context.applications;
 const teams=context.teams.filter(t=>t.category.trim().toUpperCase()===context.tournament?.category.trim().toUpperCase()&&!context.applications.some(a=>a.team_id===t.id));
 return <section id="prihlaska" className="scroll-mt-40 rounded-3xl border border-slate-200 bg-white p-6"><h2 className="text-2xl font-extrabold">{admin?"Prihlášky tímov":"Prihlásenie tímu a stav prihlášok"}</h2>
 {context.error?<p role="alert" className="mt-4 text-red-700">Prihlášky sa nepodarilo načítať. Obnov stránku.</p>:<>
 {!context.user?<Link className="btn-primary mt-4" href="/prihlasenie">Prihlásiť sa ako tréner</Link>:<div className="mt-4 space-y-4">{applications.map(a=><article key={a.id} className="rounded-2xl border border-slate-200 p-4"><h3 className="font-extrabold">{a.team_name}</h3><p className="mt-1 font-bold text-arena-700">{states[a.status]}</p>{a.decision_reason&&<p className="mt-2 text-sm">Správa organizátora: {a.decision_reason}</p>}{admin&&<><p className="mt-2 text-sm">{a.contact_name} · {a.contact_email} · {a.phone}</p>{a.note&&<p className="mt-2 text-sm">{a.note}</p>}{a.status==="pending"&&<ApplicationDecision id={a.id} slug={slug} closed={Boolean(context.tournament?.registration_closed_at)}/>}</>}</article>)}</div>}
 {context.tournament.registration_closed_at&&admin&&<p className="mt-4 font-bold text-arena-700">Prihlášky sú uzavreté. Čakajúce tímy už nemožno prijať.</p>}
 {admin?<p className="mt-4 text-sm text-slate-600">Prijaté tímy sú potvrdenými účastníkmi. Po vybavení prihlášok otvor náhľad rozlosovania a potvrď účastníkov. Rozpis sa schválením nemení.</p>:context.user&&<>{context.tournament.registration_closed_at ? <p className="mt-4 font-bold text-arena-700">Účastníci boli potvrdení a prihlasovanie je uzavreté.</p> : context.tournament.publication_status !== "published" || !["public","combined"].includes(context.tournament.tournament_type) ? <p className="mt-4 text-slate-600">Verejné prihlasovanie na tento turnaj nie je otvorené.</p> : teams.length>0?<TournamentApplicationForm slug={slug} teams={teams} name={String(context.user.user_metadata?.full_name??"")}/>:<p className="mt-4 text-slate-600">Nemáš ďalší overený tím vhodnej kategórie. Tímy s podanou prihláškou sú uvedené vyššie.</p>}</>}
 </>}
 </section>;
}
