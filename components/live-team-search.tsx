"use client";

import {useEffect,useState} from "react";
import {createClient} from "@/lib/supabase/client";
import {normalizeClubSearch} from "@/lib/club-search";
import {joiningError,teamLabel,type FamilyPlayer,type JoinTeam} from "@/lib/family-team-joining";
import {ParentTeamJoin} from "@/components/family-team-joining";

type Result={query:string;teams:JoinTeam[];error?:string};
export function LiveTeamSearch({players,selectedPlayer,initialQuery=""}: {players:FamilyPlayer[];selectedPlayer?:string;initialQuery?:string}) {
  const [query,setQuery]=useState(initialQuery);
  const [result,setResult]=useState<Result|null>(null);
  const [selected,setSelected]=useState<JoinTeam|null>(null);
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
  return <div className="mt-6">
    <label className="block text-sm font-bold">Nájdi klub alebo mesto<input className="field mt-1" type="search" autoComplete="off" maxLength={100} value={query} onChange={e=>{setQuery(e.target.value);setSelected(null);}} placeholder="Napr. hor alebo dubove U12" aria-describedby="team-search-help"/></label>
    <p className="mt-2 text-xs text-slate-500" id="team-search-help">Napíš aspoň 2 znaky. Možnosti sa zobrazujú počas písania, aj bez diakritiky. Viac slov môžeš zadať v ľubovoľnom poradí.</p>
    <div className="mt-3" aria-live="polite" aria-busy={ready&&!current}>
      {ready&&!current&&<p className="text-sm text-slate-500" role="status">Hľadám tímy…</p>}
      {ready&&current?.error&&<p role="alert" className="text-sm text-red-700">{current.error}</p>}
      {ready&&current&&!current.error&&(current.teams.length ? <><p className="mb-2 text-xs text-slate-500">Vyber konkrétny tím. {current.teams.length===40&&"Zobrazuje sa prvých 40 možností. Spresni názov, mesto alebo kategóriu."}</p><ul className="max-h-80 overflow-y-auto rounded-2xl border border-slate-200 bg-white">{current.teams.map(team=><li key={team.id} className="border-b last:border-0"><button type="button" className={`w-full px-4 py-3 text-left hover:bg-arena-50 focus-visible:outline-arena-600 ${selected?.id===team.id?"bg-arena-50":""}`} aria-pressed={selected?.id===team.id} onClick={()=>setSelected(team)}><span className="block text-sm font-bold">{teamLabel(team)}</span><span className="mt-1 block text-xs text-slate-500">{team.city}{team.has_staff===false?" · čaká na trénera":""}</span></button></li>)}</ul></> : <p className="text-sm text-slate-600">Nenašli sa aktívne tímy. Skús inú časť názvu alebo mesto. Ak klub ešte nie je v Tournio, obráť sa na jeho trénera.</p>)}
    </div>
    {selected&&<div className="mt-5 rounded-2xl border border-arena-200 p-4"><h2 className="font-extrabold">Prihlásiť dieťa: {teamLabel(selected)}</h2><ParentTeamJoin key={selected.id} players={players} teams={[selected]} selectedTeam={selected.id} selectedPlayer={selectedPlayer}/></div>}
  </div>;
}
