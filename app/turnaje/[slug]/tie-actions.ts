"use server";
import {revalidatePath} from "next/cache";
import {createClient} from "@/lib/supabase/server";
export type TieState={error?:string;success?:boolean};
const messages:Record<string,string>={RANKING_CHANGED:"Výsledky alebo pravidlá sa zmenili. Obnov stránku a rozhodni podľa aktuálnej tabuľky.",INVALID_TIE_ORDER:"Meniť možno iba poradie úplne zhodných tímov.",GROUP_NOT_COMPLETE:"Najskôr dokonči všetky zápasy skupiny.",DEPENDENT_RESULTS_EXIST:"Nadväzujúce zápasy už majú výsledky. Postupujúcich nemožno zmeniť.",RESULTS_LOCKED:"Výsledky sú uzamknuté.",NO_TIE:"Tabuľka už nemá nerozhodnuté poradie."};
export async function decideTie(_previous:TieState,form:FormData):Promise<TieState>{
 const group=String(form.get("groupId")??"");const slug=String(form.get("slug")??"");const version=String(form.get("version")??"");const reason=String(form.get("reason")??"").trim();
 if(!/^[0-9a-f-]{36}$/i.test(group)||!/^[a-z0-9-]+$/.test(slug)||!/^[a-f0-9]{32}$/.test(version)||reason.length<5||reason.length>1000||form.get("confirm")!=="yes")return {error:"Uveď dôvod a potvrď rozhodnutie."};
 let names:unknown;try{names=JSON.parse(String(form.get("names")??"[]"));}catch{return {error:"Neplatné poradie."};}
 if(!Array.isArray(names)||names.length<2||names.length>256||names.some(n=>typeof n!=="string"))return {error:"Neplatné poradie."};
 try{const supabase=await createClient();const {error}=await supabase.rpc("decide_tournament_tie",{p_group:group,p_version:version,p_names:names,p_reason:reason});if(error)return {error:messages[error.message]??"Rozhodnutie sa nepodarilo uložiť. Rozhoduje iba organizátor."};
 revalidatePath(`/turnaje/${slug}`);revalidatePath(`/turnaje/${slug}/administracia`);revalidatePath(`/turnaje/${slug}/vysledky.pdf`);return {success:true};
 }catch{return {error:"Rozhodnutie sa nepodarilo uložiť. Skús to znova."};}
}
