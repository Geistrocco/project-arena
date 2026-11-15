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
  const teamIds=ids.filter(id=>id.startsWith("team:")).map(id=>id.slice(5));
  if(teamIds.some(id=>!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id))) throw new Error("Skontroluj vybrané kategórie turnaja.");
  const legacyIds=ids.filter(id=>!id.startsWith("team:"));
  const names=new Map<string,string>();
  if(teamIds.length) {
    const {data,error}=await supabase.from("club_teams").select("id,name,clubs!inner(status)").in("id",teamIds).eq("status","active").eq("clubs.status","active");
    if(error)throw new Error("Vybrané kategórie sa nepodarilo overiť. Skús uloženie znova.");
    for(const team of data??[]) names.set(`team:${team.id}`,team.name);
  }
  const {data,error}=legacyIds.length ? await supabase.from("clubs").select("id,name").in("id",legacyIds).eq("status","active") : {data:[],error:null};
  if(error)throw new Error("Vybrané kluby sa nepodarilo overiť. Skús uloženie znova.");
  for(const club of data??[])names.set(club.id,club.name);
  if(ids.some(id=>!names.has(id)))throw new Error("Niektoré vybrané družstvo alebo klub už nie je v aktívnom adresári. Odstráň ho z výberu alebo vyber náhradu.");
  const ordered=ids.map(id=>names.get(id)!);
  if(new Set(ordered.map(name=>name.trim().toLowerCase())).size!==ordered.length) throw new Error("Vybrané družstvá majú rovnaký názov. Vyber iba jednu sezónu každého družstva.");
  return ordered;
}
