import Link from "next/link";
import {notFound} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {ParentTeamJoin,FamilyPlayerCreate} from "@/components/family-team-joining";
import {joiningError,teamLabel,type FamilyJoinContext,type JoinTeam} from "@/lib/family-team-joining";
export const metadata={title:"Pozvanie dieťaťa do tímu",robots:{index:false,follow:false},referrer:"no-referrer" as const};
export const dynamic="force-dynamic";
export default async function JoinInvitationPage({params}:{params:Promise<{token:string}>}){
 const {token}=await params;if(!/^[a-f0-9]{64}$/.test(token))notFound();
 const supabase=await createClient();const [{data:info,error},{data:auth}]=await Promise.all([supabase.rpc("get_team_join_link",{p_token:token}),supabase.auth.getClaims()]);
 const back=`/pozvanka/${token}`;
 if(error)return <section className="mx-auto max-w-xl px-5 py-12"><h1 className="text-3xl font-extrabold">Pozvanie do tímu</h1><p role="alert" className="mt-4 text-red-700">Pozvánku sa nepodarilo načítať. Skús otvoriť odkaz znova.</p></section>;
 if(!info)return <section className="mx-auto max-w-xl px-5 py-12"><h1 className="text-3xl font-extrabold">Pozvánka už nie je platná</h1><p className="mt-4 text-slate-600">Bola použitá, zrušená alebo vypršala. Požiadaj trénera o nový odkaz alebo odošli vlastnú žiadosť o prijatie dieťaťa.</p><Link href="/pripojit-sa" className="btn-primary mt-5">Požiadať o prijatie do tímu</Link></section>;
 if(info.accepted)return <section className="mx-auto max-w-xl px-5 py-12"><h1 className="text-3xl font-extrabold">Pozvanie bolo prijaté</h1><p className="mt-4"><strong>{info.player_name}</strong> je priradený k tímu {info.name} · {info.category} · {info.season}.</p><Link className="btn-primary mt-5" href={info.active?`/timy/${info.team_id}/prehlad`:"/ucet#rodina"}>{info.active?"Otvoriť tím":"Moje deti a účet"}</Link><p className="mt-3 text-sm text-slate-500">Pozvánka už bola použitá pre toto dieťa. Pre ďalšie dieťa potrebuješ samostatnú pozvánku alebo žiadosť o prijatie.</p></section>;
 const team:JoinTeam={id:info.team_id,name:info.name,category:info.category,season:info.season};
 let context:FamilyJoinContext|null=null;let contextError="";
 if(auth?.claims?.sub){const r=await supabase.rpc("get_family_join_context");context=r.data as FamilyJoinContext|null;if(r.error)contextError=joiningError(r.error.message);}
 return <section className="mx-auto max-w-xl px-5 py-12"><p className="eyebrow">Pozvanie trénera</p><h1 className="mt-3 text-3xl font-extrabold">Pridaj svoje dieťa do tímu</h1><p className="mt-4 rounded-2xl bg-arena-50 p-4 font-bold">{teamLabel(team)}</p><p className="mt-3 text-sm text-slate-600">Jednorazová pozvánka pre jedno dieťa. Platí do {new Intl.DateTimeFormat("sk-SK",{dateStyle:"medium",timeZone:"Europe/Bratislava"}).format(new Date(info.expires_at))}. Vyber správny existujúci profil; ostatní súrodenci sa automaticky nepridajú.</p>
 {!auth?.claims?.sub?<div className="mt-6 space-y-4"><p>Prihlás sa alebo si vytvor rodičovský účet. Po prihlásení sa vrátiš k tejto pozvánke.</p><div className="flex flex-wrap gap-3"><Link className="btn-primary" href={`/prihlasenie?next=${encodeURIComponent(back)}`} prefetch={false}>Prihlásiť sa</Link><Link className="btn-secondary" href={`/registracia?next=${encodeURIComponent(back)}`} prefetch={false}>Vytvoriť účet</Link></div></div>:contextError?<p className="mt-5 text-red-700" role="alert">{contextError}</p>:context?<><ParentTeamJoin players={context.players} teams={[team]} token={token}/>{!context.players.length&&<p className="mt-4 text-sm">Ak dieťa už eviduje druhý rodič, požiadaj ho o rodinnú pozvánku. Inak môžeš jeho profil vytvoriť nižšie.</p>}<FamilyPlayerCreate returnTo={back}/></>:<p className="mt-5 text-red-700" role="alert">Profily detí sa nepodarilo načítať. Obnov stránku.</p>}
 </section>;
}
