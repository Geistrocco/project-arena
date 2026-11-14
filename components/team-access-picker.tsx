"use client";

import {useState} from "react";
import {matchesClubSearch} from "@/lib/club-search";
import {teamLabel, type JoinTeam} from "@/lib/family-team-joining";

export function TeamAccessPicker({teams}: {teams: JoinTeam[]}) {
  const [query,setQuery]=useState("");
  const [selected,setSelected]=useState("");
  const matches=teams.filter(t=>matchesClubSearch(query,t.name,t.category,t.season,t.city));
  return <div className="space-y-3 sm:col-span-2">
    <label className="block text-sm font-bold">Nájdi klub alebo kategóriu<input className="field mt-1" type="search" autoComplete="off" value={query} maxLength={100} placeholder="Napr. hor alebo dubove U12" onChange={e=>{setQuery(e.target.value);setSelected("");}}/></label>
    <p className="text-xs text-slate-500" role="status">{matches.length ? `${matches.length} možností. Vyber konkrétny tím, kategóriu a sezónu.` : "Nenašiel sa žiadny tím. Skús kratšiu časť názvu alebo navrhni tím nižšie."}</p>
    <label className="block text-sm font-bold">Klub, kategória a sezóna<select className="field mt-1 min-h-36" name="teamId" size={5} required value={selected} onChange={e=>setSelected(e.target.value)}><option value="" disabled>Vyber klub a kategóriu</option>{matches.map(t=><option key={t.id} value={t.id}>{teamLabel(t)}</option>)}</select></label>
  </div>;
}
