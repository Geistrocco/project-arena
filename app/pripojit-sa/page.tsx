import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {getAccountContext} from "@/lib/account-context";
import {ParentTeamJoin,FamilyPlayerCreate,FamilyRequests,StaffJoinRequests} from "@/components/family-team-joining";
import {joiningError,type FamilyJoinContext,type JoinTeam} from "@/lib/family-team-joining";
export const metadata={title:"Pridať dieťa do tímu",robots:{index:false,follow:false}};
export default async function JoinTeamPage({searchParams}:{searchParams:Promise<{q?:string;hrac?:string}>}){
 const params=await searchParams;const q=typeof params.q==="string"?params.q.trim().slice(0,100):"";
 const supabase=await createClient();const {data:auth}=await supabase.auth.getClaims();
 if(!auth?.claims?.sub)redirect(`/prihlasenie?next=${encodeURIComponent("/pripojit-sa")}`);
 const [{data,error},search,{mode}]=await Promise.all([supabase.rpc("get_family_join_context"),q.length>=2?supabase.rpc("search_joinable_teams",{p_query:q}):Promise.resolve({data:[],error:null}),getAccountContext()]);
 if(error||!data)return <section className="mx-auto max-w-3xl px-5 py-12"><h1 className="text-3xl font-extrabold">Pridať dieťa do tímu</h1><p role="alert" className="mt-5 text-red-700">{joiningError(error?.message??"")}</p><Link href="/ucet" className="btn-secondary mt-5">Späť na účet</Link></section>;
 const context=data as FamilyJoinContext;const teams=(search.data??[]) as JoinTeam[];
 return <section className="mx-auto max-w-3xl px-5 py-12"><Link href="/ucet#rodina" className="text-sm font-bold text-arena-700">← Moje deti a účet</Link><h1 className="mt-6 text-3xl font-extrabold">Pridať dieťa do tímu</h1><p className="mt-3 text-slate-600">Vyber existujúci profil dieťaťa, klub, kategóriu a sezónu. Žiadosť schváli tréner. Každé dieťa prihlasuješ samostatne.</p>
 <form className="mt-6 space-y-3" action="/pripojit-sa" method="get"><label className="block text-sm font-bold">Nájdi klub alebo mesto<input className="field mt-1" name="q" minLength={2} maxLength={100} required defaultValue={q} placeholder="Napr. Senec"/></label>{typeof params.hrac==="string"&&<input type="hidden" name="hrac" value={params.hrac}/>}<button className="btn-secondary">Vyhľadať tímy</button></form>
 {search.error?<p className="mt-4 text-red-700" role="alert">Tímy sa nepodarilo načítať. Skús vyhľadávanie znova.</p>:q.length>=2&&!teams.length?<p className="mt-4 text-sm text-slate-600">Nenašli sa aktívne tímy. Skús iný názov alebo mesto. Ak klub ešte nie je v Tournio, obráť sa na jeho trénera.</p>:null}
 {!context.players.length&&<p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm">Najskôr pridaj profil svojho dieťaťa nižšie. Ak ho už spravuje druhý rodič, požiadaj ho o rodinnú pozvánku a nevytváraj druhý profil.</p>}
 {teams.length>0&&<ParentTeamJoin key={q} players={context.players} teams={teams} selectedPlayer={typeof params.hrac==="string"?params.hrac:undefined}/>}
 <FamilyPlayerCreate returnTo="/pripojit-sa"/><FamilyRequests requests={context.requests}/>{mode==="coach"&&<StaffJoinRequests requests={context.staff_requests}/>}
 </section>;
}
