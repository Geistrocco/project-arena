import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";

export function tournamentClubIds(form:FormData):string[] {
  const values=form.getAll("clubIds");
  if(values.length>256||values.some(id=>typeof id!=="string"||!/^[a-z0-9][a-z0-9:._-]{0,255}$/i.test(id))) {
    throw new Error("Skontroluj vybrané kluby turnaja.");
  }
  return [...new Set(values as string[])];
}

export async function tournamentClubNames(supabase:SupabaseClient,ids:string[]):Promise<string[]> {
  if(!ids.length)return [];
  const {data,error}=await supabase.from("clubs").select("id,name").in("id",ids).eq("status","active");
  if(error)throw new Error("Vybrané kluby sa nepodarilo overiť. Skús uloženie znova.");
  const names=new Map<string,string>((data??[]).map(club=>[club.id,club.name]));
  if(ids.some(id=>!names.has(id)))throw new Error("Niektorý vybraný klub už nie je v aktívnom adresári. Odstráň ho z výberu alebo vyber náhradu.");
  return ids.map(id=>names.get(id)!);
}
