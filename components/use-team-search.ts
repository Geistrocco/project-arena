"use client";
import {useEffect,useState} from "react";
import {createClient} from "@/lib/supabase/client";
import {normalizeClubSearch} from "@/lib/club-search";
import {joiningError,type JoinTeam} from "@/lib/family-team-joining";

type Result={query:string;teams:JoinTeam[];error?:string};
export function useTeamSearch(query:string) {
  const [result,setResult]=useState<Result|null>(null);
  const search=normalizeClubSearch(query);
  const ready=search.length>=2;
  const current=result?.query===search?result:null;
  useEffect(()=>{
    if(!ready)return;
    let cancelled=false;
    const controller=new AbortController();
    const timer=setTimeout(async()=>{
      try {
        const {data,error}=await createClient().rpc("search_joinable_teams",{p_query:search}).abortSignal(controller.signal);
        if(!cancelled)setResult({query:search,teams:error?[]:(data??[]) as JoinTeam[],error:error?joiningError(error.message):undefined});
      } catch {
        if(!cancelled)setResult({query:search,teams:[],error:"Tímy sa nepodarilo načítať. Skús napísať názov znova."});
      }
    },180);
    return ()=>{cancelled=true;clearTimeout(timer);controller.abort();};
  },[search,ready]);
  return {current,ready};
}
