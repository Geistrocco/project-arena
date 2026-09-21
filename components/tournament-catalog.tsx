"use client";

import { useMemo, useState } from "react";
import { REGIONS, SURFACES, type TournamentCountry } from "@/lib/tournament-location";
import type { Tournament } from "@/types/tournament";
import { SearchIcon } from "@/components/icons";
import { TournamentCard } from "@/components/tournament-card";

export function TournamentCatalog({ tournaments, sports }: { tournaments: Tournament[]; sports: string[] }) {
  const [sport, setSport] = useState("");
  const [country, setCountry] = useState("");
  const [region, setRegion] = useState("");
  const [category, setCategory] = useState("");
  const [surface, setSurface] = useState("");
  const [query, setQuery] = useState("");

  const countries = useMemo(() => [...new Set(tournaments.map((item) => item.country))], [tournaments]);
  const regions = country ? [...REGIONS[country as TournamentCountry]] : [];
  const categories = useMemo(() => [...new Set(tournaments.filter((item) => !sport || item.sport === sport).map((item) => item.category))].sort((a, b) => a.localeCompare(b, "sk", { numeric: true })), [tournaments, sport]);
  const filtered = useMemo(() => tournaments.filter((item) => {
    const q = query.trim().toLocaleLowerCase("sk");
    return (!sport || item.sport === sport) && (!country || item.country === country)
      && (!region || item.region === region) && (!category || item.category === category)
      && (!surface || item.surface === surface)
      && (!q || item.name.toLocaleLowerCase("sk").includes(q) || item.city.toLocaleLowerCase("sk").includes(q));
  }), [tournaments, sport, country, region, category, surface, query]);
  const reset = () => { setSport(""); setCountry(""); setRegion(""); setCategory(""); setSurface(""); setQuery(""); };

  return <section id="turnaje" className="mx-auto max-w-7xl px-5 pb-24 pt-8 lg:px-8 lg:pt-10">
    <div className="rounded-3xl border bg-white p-4 shadow-card md:p-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Filter label="Šport" value={sport} onChange={(value) => { setSport(value); setCategory(""); setSurface(""); }} options={sports.filter((item) => item !== "Všetky športy")} placeholder="Všetky športy" />
        <Filter label="Krajina" value={country} onChange={(value) => { setCountry(value); setRegion(""); setSurface(""); }} options={countries} placeholder="Všetky krajiny" />
        <Filter label="Kraj" value={region} onChange={setRegion} options={regions} placeholder={country ? "Všetky kraje" : "Najprv vyberte krajinu"} disabled={!country} />
        <Filter label="Kategória" value={category} onChange={setCategory} options={categories} placeholder="Všetky kategórie" />
        <Filter label="Povrch" value={surface} onChange={setSurface} options={[...SURFACES]} placeholder="Všetky povrchy" />
      </div>
      <div className="mt-3">
        <label className="relative"><span className="sr-only">Názov turnaja alebo mesto</span><SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/><input className="field pl-12" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Názov turnaja alebo mesto" /></label>
      </div>
    </div>
    <div className="mb-7 mt-14 flex items-end justify-between"><div><p className="eyebrow">Aktuálna ponuka</p><h2 className="mt-2 text-3xl font-extrabold tracking-tight">Turnaje pre mladé talenty</h2></div><p className="hidden text-sm text-slate-500 sm:block">{filtered.length} turnajov</p></div>
    {filtered.length ? <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">{filtered.map((item) => <TournamentCard key={item.slug} tournament={item}/>)}</div> : <div className="rounded-3xl border border-dashed bg-white py-16 text-center"><p className="text-lg font-bold">Nenašli sme žiadny turnaj</p><p className="mt-2 text-slate-500">Skúste upraviť vyhľadávanie alebo filtre.</p><button className="btn-secondary mt-5" onClick={reset}>Vymazať filtre</button></div>}
  </section>;
}

function Filter({ label, value, onChange, options, placeholder, disabled = false }: { label: string; value: string; onChange: (value: string) => void; options: string[]; placeholder: string; disabled?: boolean }) {
  return <label><span className="mb-1 block text-xs font-bold text-slate-600">{label}</span><select className="field" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}><option value="">{placeholder}</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}
