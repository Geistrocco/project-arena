import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {StaffJoinRequests} from "@/components/family-team-joining";
import {joiningError,type StaffJoinRequestPage,type TeamJoinSummary} from "@/lib/family-team-joining";

export const metadata={title:"Žiadosti hráčov",robots:{index:false,follow:false}};
export default async function PlayerRequestsPage({searchParams}:{searchParams:Promise<{tim?:string;strana?:string}>}) {
  const params=await searchParams;
  const team=typeof params.tim==="string"?params.tim:null;
  if(team&&!/^[0-9a-f-]{36}$/i.test(team))notFound();
  const page=typeof params.strana==="string"&&/^\d+$/.test(params.strana)?Number(params.strana):1;
  if(!Number.isSafeInteger(page)||page<1||page>20001)notFound();
  const supabase=await createClient();const {data:auth}=await supabase.auth.getClaims();
  if(!auth?.claims?.sub)redirect("/prihlasenie?next=%2Fziadosti-hracov");
  const [queue,summary]=await Promise.all([
    supabase.rpc("get_staff_join_requests",{p_team:team,p_offset:(page-1)*50}),
    supabase.rpc("get_my_team_join_summary"),
  ]);
  const data=queue.data as StaffJoinRequestPage|null;
  const counts=summary.data as TeamJoinSummary|null;
  const url=(n:number)=>`/ziadosti-hracov?${team?`tim=${team}&`:""}strana=${n}`;
  return <section className="mx-auto max-w-4xl px-5 py-12">
    <Link className="text-sm font-bold text-arena-700" href="/moj-tim">← Moje tímy</Link>
    <h1 className="mt-5 text-3xl font-extrabold">Žiadosti hráčov</h1>
    <p className="mt-3 text-slate-600">Tu schvaľuješ prijatie detí do tímov, ktoré môžeš spravovať. Môžeš byť zároveň trénerom aj rodičom vlastných detí.</p>
    {queue.error||!data?<p role="alert" className="mt-5 text-red-700">{joiningError(queue.error?.message??"")}</p>:<>
      {counts&&counts.teams.length>0&&<nav className="mt-5 flex flex-wrap gap-2" aria-label="Filtrovať žiadosti podľa tímu"><Link className="btn-secondary" href="/ziadosti-hracov" aria-current={!team?"page":undefined}>Všetky tímy ({counts.total})</Link>{counts.teams.map(t=><Link className="btn-secondary" key={t.team_id} href={`/ziadosti-hracov?tim=${t.team_id}`} aria-current={team===t.team_id?"page":undefined}>{t.name} · {t.category} · {t.season} ({t.pending_count})</Link>)}</nav>}
      <p className="mt-5 text-sm font-bold" role="status">Čakajúce žiadosti: {data.total}{data.total>50?` · zobrazené ${Math.min((page-1)*50+1,data.total)}–${Math.min(page*50,data.total)}`:""}</p>
      <StaffJoinRequests requests={data.requests}/>
      <nav className="mt-5 flex flex-wrap gap-3" aria-label="Stránky žiadostí">{page>1&&<Link className="btn-secondary" href={url(page-1)}>← Predchádzajúce</Link>}{page*50<data.total&&<Link className="btn-secondary" href={url(page+1)}>Ďalšie →</Link>}</nav>
    </>}
  </section>;
}
