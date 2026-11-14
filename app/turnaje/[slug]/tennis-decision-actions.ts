"use server";
import {revalidatePath} from "next/cache";
import {createClient} from "@/lib/supabase/server";
import type {TennisSet} from "@/lib/tennis";
import type {Standing} from "@/lib/tournament-plan-calculations";
export type TennisPreview={after?: {status:string;tennis_result?:string;tennis_winner?:string|null;tennis_sets?:TennisSet[]|null};version:string;match:string;kind:string;winner:string|null;sets:TennisSet[];reason:string;home:string;away:string;rankings:Record<string,{rows:Standing[]}>};
export type TennisDecisionState={error?:string;success?:boolean;preview?:TennisPreview};
export async function tennisDecisionAction(_previous:TennisDecisionState,form:FormData):Promise<TennisDecisionState>{
 const slug=String(form.get("slug")??""),match=String(form.get("match")??""),kind=String(form.get("kind")??""),winner=String(form.get("winner")??"")||null,reason=String(form.get("reason")??"").trim(),version=String(form.get("version")??"");
 const confirm=form.get("stage")==="confirm";
 if(!/^[a-z0-9-]+$/.test(slug)||!/^[0-9a-f-]{36}$/.test(match)||!["wo","retired","played","restore"].includes(kind)||reason.length<5||reason.length>1000)return {error:"Vyber spôsob rozhodnutia a uveď verejný dôvod."};
 let sets:TennisSet[]=[];
 try{if(confirm)sets=JSON.parse(String(form.get("sets")??"null"));else if(kind!=="wo" && kind!=="restore")for(let i=0;i<3;i++){const h=String(form.get(`home${i}`)??""),a=String(form.get(`away${i}`)??"");if(!h&&!a)continue;if(!/^\d{1,2}$/.test(h)||!/^\d{1,2}$/.test(a)||sets.length!==i)throw Error();sets.push({home:Number(h),away:Number(a)});}
 if(!Array.isArray(sets)||sets.length>3)throw Error();}catch{return {error:"Vyplň oba výsledky setu postupne, vrátane rozohraného setu pri skreči."};}
 if(confirm&&(!/^[a-f0-9]{32}$/.test(version)||form.get("confirmed")!=="yes"))return {error:"Potvrď zobrazené rozhodnutie."};
 const errors:Record<string,string>={TENNIS_RESULT_CHANGED:"Výsledok sa po poslednom rozhodnutí zmenil alebo chýba predchádzajúci stav. Automatická obnova nie je bezpečná.",RESULTS_LOCKED:"Najskôr odomkni výsledky s uvedením dôvodu.",DEPENDENT_RESULTS_EXIST:"Nadväzujúci zápas už má výsledok. Jeho účastníkov nemožno prepísať.",INCIDENT_CHANGED:"Výsledky alebo poradie sa zmenili. Vytvor nový náhľad.",UNRESOLVED_QUALIFIER:"Najskôr urči postupujúcich vrátane rozhodnutia pri úplnej zhode.",INVALID_TENNIS_SCORE:"Sety nezodpovedajú zvolenému bodovaniu alebo zápas nie je dohraný.",INVALID_RETIREMENT:"Pri skreči zadaj odohrané sety a posledný rozohraný set. Dohraný zápas sa zapisuje ako bežný výsledok.",WO_HAS_SCORE:"W.O. sa zapisuje bez setov a gemov."};
 try{const supabase=await createClient();const params={p_slug:slug,p_match:match,p_kind:kind,p_winner:winner,p_sets:sets,p_reason:reason};
 if(!confirm){const {data,error}=await supabase.rpc("preview_tennis_result",params);return error?{error:errors[error.message]??"Rozhodnutie spravuje iba organizátor. Skontroluj vstupy."}:{preview:data as TennisPreview};}
 const {error}=await supabase.rpc("confirm_tennis_result",{...params,p_version:version,p_confirm:true});if(error)return {error:errors[error.message]??"Rozhodnutie sa nepodarilo uložiť. Vytvor nový náhľad."};
 for(const suffix of ["","/administracia","/upravit","/vysledky.pdf"])revalidatePath(`/turnaje/${slug}${suffix}`);return {success:true};
 }catch{return {error:"Rozhodnutie sa nepodarilo spracovať. Skús to znova."};}
}
