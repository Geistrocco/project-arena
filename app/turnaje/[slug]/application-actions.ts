"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
export type ApplicationState = { error?: string; success?: boolean };
const messages: Record<string,string> = { SPORT_MISMATCH: "Šport klubu nezodpovedá turnaju.", APPLICATION_EXISTS: "Tento tím už má prihlášku na turnaj.",CAPACITY_FULL:"Kapacita turnaja je už naplnená.",CATEGORY_MISMATCH:"Kategória tímu nezodpovedá turnaju.",REGISTRATION_CLOSED:"Prihlasovanie na turnaj je uzavreté.",TEAM_INACTIVE:"Tím už nie je aktívny alebo nemá vhodnú kategóriu.",ALREADY_DECIDED:"Prihláška už bola vybavená. Obnov stránku.",EMAIL_UNCONFIRMED:"Najskôr potvrď e-mail svojho účtu.","Not authorized":"Nemáš oprávnenie vykonať túto akciu." };
export async function submitApplication(_state: ApplicationState, form: FormData): Promise<ApplicationState> {
  const slug=String(form.get("slug")??"");const team=String(form.get("teamId")??"");
  if (!/^[a-z0-9-]+$/.test(slug)||!/^[0-9a-f-]{36}$/i.test(team)) return {error:"Vyber svoj overený tím."};
  try {
    const supabase=await createClient();const {error}=await supabase.rpc("submit_tournament_application",{p_slug:slug,p_team_id:team,p_contact:String(form.get("contact")??"").trim(),p_phone:String(form.get("phone")??"").trim(),p_note:String(form.get("note")??"").trim()});
    if(error)return {error:messages[error.message]??"Prihlášku sa nepodarilo uložiť. Skontroluj údaje a prihlásenie."};
    revalidatePath(`/turnaje/${slug}`);revalidatePath(`/turnaje/${slug}/administracia`);return {success:true};
  }catch{return {error:"Prihlášku sa nepodarilo uložiť. Skús to znova."};}
}
export async function decideApplication(_state: ApplicationState, form: FormData): Promise<ApplicationState> {
 const slug=String(form.get("slug")??"");const id=String(form.get("id")??"");const decision=String(form.get("decision")??"");
 if(!/^[a-z0-9-]+$/.test(slug)||!/^[0-9a-f-]{36}$/i.test(id)||!["accepted","rejected"].includes(decision)) return {error:"Neplatná požiadavka."};
 try {const supabase=await createClient();const {error}=await supabase.rpc("decide_tournament_application",{p_id:id,p_decision:decision,p_reason:String(form.get("reason")??"").trim()});if(error)return {error:messages[error.message]??"Rozhodnutie sa nepodarilo uložiť."};
 revalidatePath(`/turnaje/${slug}`);revalidatePath(`/turnaje/${slug}/administracia`);revalidatePath("/");return {success:true};
 }catch{return {error:"Rozhodnutie sa nepodarilo uložiť. Skús to znova."};}
}
