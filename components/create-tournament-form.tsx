"use client";
import { useState } from "react";
import { ClubPicker } from "@/components/club-picker";
import type { Club } from "@/types/club";
import { createTournament } from "@/app/vytvorit-turnaj/actions";

export function CreateTournamentForm({ clubs }: { clubs: Club[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  return <form action={createTournament} className="rounded-3xl border bg-white p-6 shadow-card sm:p-10">
    <Section n="01" title="Základné informácie"><div className="sm:col-span-2"><Field label="Názov turnaja" name="name" placeholder="Napr. Summer Cup 2027"/></div><Select label="Šport" name="sport" options={["Futbal","Hokej","Florbal","Tenis","Basketbal"]}/><Field label="Veková kategória" name="category" placeholder="Napr. U11"/><Field label="Dátum" name="date" type="date"/><Field label="Miesto" name="place" placeholder="Mesto a športový areál"/></Section>
    <Section n="02" title="Formát turnaja"><Field label="Počet tímov" name="teams" type="number" min={2}/><Field label="Počet ihrísk alebo plôch" name="fields" type="number" min={1}/><Field label="Dĺžka zápasu (min)" name="duration" type="number" min={1}/><Field label="Štartovné (€)" name="fee" type="number" min={0}/></Section>
    <ChoiceSection/><div className="mt-9 border-t pt-9"><ClubPicker clubs={clubs} selected={selected} onChange={setSelected}/></div><div className="mt-10 flex justify-end border-t pt-8"><button className="btn-primary w-full justify-center sm:w-auto" type="submit">Uložiť a zverejniť turnaj</button></div>
  </form>;
}
function Section({ n,title,children }:{n:string;title:string;children:React.ReactNode}) { return <fieldset className="mb-9 grid gap-5 border-b pb-9 sm:grid-cols-2"><legend className="mb-6 flex gap-3 text-xl font-extrabold"><span className="text-xs text-arena-600">{n}</span>{title}</legend>{children}</fieldset>; }
function Field({label,name,type="text",placeholder,min}:{label:string;name:string;type?:string;placeholder?:string;min?:number}) { return <label><span className="label">{label} *</span><input className="field" name={name} type={type} placeholder={placeholder} min={min} required/></label>; }
function Select({label,name,options}:{label:string;name:string;options:string[]}) { return <label><span className="label">{label} *</span><select className="field" name={name}>{options.map(x=><option key={x}>{x}</option>)}</select></label>; }
function ChoiceSection() { return <><fieldset className="border-b pb-9"><legend className="mb-6 flex gap-3 text-xl font-extrabold"><span className="text-xs text-arena-600">03</span>Typ turnaja</legend><div className="grid gap-3">{[["Verejný","Turnaj sa zobrazí v katalógu a tímy môžu posielať prihlášky."],["Pozvánkový","Turnaj je dostupný iba cez pozvánku."],["Kombinovaný","Pozvánky aj verejné prihlášky."]].map(([v,d],i)=><Radio key={v} name="type" value={v} desc={d} checked={i===0}/>)}</div></fieldset><fieldset className="mt-9 border-b pb-9"><legend className="mb-6 flex gap-3 text-xl font-extrabold"><span className="text-xs text-arena-600">04</span>Zobrazenie prihlásených tímov</legend><div className="grid gap-3 sm:grid-cols-3">{["Zobrazovať všetkým","Iba prijatým tímom","Nezobrazovať"].map((v,i)=><Radio key={v} name="visibility" value={v} checked={i===0}/>)}</div></fieldset></>; }
function Radio({name,value,desc,checked}:{name:string;value:string;desc?:string;checked?:boolean}) { return <label className="flex cursor-pointer gap-3 rounded-2xl border p-4 hover:border-arena-500 has-[:checked]:border-arena-500 has-[:checked]:bg-arena-50"><input className="mt-1 accent-arena-600" type="radio" name={name} value={value} defaultChecked={checked}/><span><b className="block text-sm">{value}</b>{desc&&<span className="text-xs text-slate-500">{desc}</span>}</span></label>; }
