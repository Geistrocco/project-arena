"use client";
import {useEffect,useState} from "react";
import {createClient} from "@/lib/supabase/client";
import Link from "next/link";

export function PlayerRequestNotice({userId}:{userId:string|null}) {
  const [result,setResult]=useState<{userId:string;count:number}|null>(null);
  useEffect(()=>{
    if(!userId)return;
    let active=true,generation=0;
    const refresh=async()=>{
      const request=++generation;
      try {
        const {data,error}=await createClient().rpc("get_my_team_join_summary");
        if(active&&request===generation&&!error)setResult({userId,count:Math.max(0,Number(data?.total??0))});
      }catch{/* A temporary failure keeps the last count for the same account. */}
    };
    const visibleRefresh=()=>{if(document.visibilityState==="visible")void refresh();};
    void refresh();
    const timer=window.setInterval(visibleRefresh,30000);
    window.addEventListener("focus",visibleRefresh);
    window.addEventListener("tournio:join-requests-updated",visibleRefresh);
    document.addEventListener("visibilitychange",visibleRefresh);
    return ()=>{active=false;generation++;window.clearInterval(timer);window.removeEventListener("focus",visibleRefresh);window.removeEventListener("tournio:join-requests-updated",visibleRefresh);document.removeEventListener("visibilitychange",visibleRefresh);};
  },[userId]);
  const count=result?.userId===userId?result?.count??0:0;
  return count>0?<div className="border-t border-amber-200 bg-amber-50"><Link className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm font-extrabold text-amber-950 lg:px-8" href="/ziadosti-hracov"><span>Žiadosti hráčov čakajú na schválenie <span className="rounded-full bg-amber-200 px-2 py-1">{count}</span></span><span className="underline">Skontrolovať žiadosti →</span></Link></div>:null;
}
