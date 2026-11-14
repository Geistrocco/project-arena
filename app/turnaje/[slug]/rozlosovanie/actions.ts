"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
export type DrawState = { error?: string; success?: boolean };
const errors: Record<string,string>={RESULTS_LOCKED:"Výsledky sú uzamknuté.",RESULTS_EXIST:"Turnaj už má výsledky. Rozlosovanie ich nesmie prepísať.",DRAW_CHANGED:"Účastníci alebo rozpis sa zmenili. Obnov náhľad a skontroluj ho znova.",DRAW_SIZE_MISMATCH:"Počet účastníkov nesedí s miestami rozpisu. Uprav počet tímov a systém hry.",DRAW_NAMES_MISMATCH:"Zoznam účastníkov nesedí. Obnov náhľad.",DRAW_CLOSED:"Tento turnaj už nemožno rozlosovať."};
export async function applyDraw(_previous:DrawState,form:FormData):Promise<DrawState>{
 const slug=String(form.get("slug")??"");const version=String(form.get("version")??"");
 if(!/^[a-z0-9-]+$/.test(slug)||!/^[a-f0-9]{32}$/.test(version)||form.get("confirm")!=="yes")return {error:"Potvrď rozlosovanie a uzavretie prihlášok."};
 let names:unknown;try{names=JSON.parse(String(form.get("names")??"[]"));}catch{return {error:"Neplatný náhľad."};}
 if(!Array.isArray(names)||names.length<2||names.length>256||names.some(n=>typeof n!=="string"||n.length>180))return {error:"Neplatný zoznam tímov."};
 try{const supabase=await createClient();const {error}=await supabase.rpc("apply_tournament_draw",{p_slug:slug,p_version:version,p_names:names,p_confirm:true});
 if(error)return {error:errors[error.message]??"Rozlosovanie sa nepodarilo uložiť."};
 revalidatePath(`/turnaje/${slug}`);revalidatePath(`/turnaje/${slug}/administracia`);revalidatePath(`/turnaje/${slug}/rozlosovanie`);return {success:true};
 }catch{return {error:"Rozlosovanie sa nepodarilo uložiť. Skús to znova."};}
}
