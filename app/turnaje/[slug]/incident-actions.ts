"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { IncidentPreview } from "@/lib/tournament-incidents";

export type IncidentState = { error?: string; success?: boolean; preview?: IncidentPreview };
const errors: Record<string,string> = {
  DEPENDENT_RESULTS_EXIST: "Nadväzujúce zápasy už majú výsledky. Zmena by mohla prepísať ich účastníkov, preto je zablokovaná.",
  RESULTS_LOCKED: "Výsledky sú uzamknuté. Najskôr ich odomkni s uvedením dôvodu.",
  INCIDENT_CHANGED: "Medzitým sa zmenili výsledky, účastníci alebo pravidlá. Vytvor nový náhľad.",
  UNRESOLVED_QUALIFIER: "Najskôr dokonči skupiny a rozhodni o nerozhodnutých postupujúcich.",
  WITHDRAWAL_CHANGED: "Odstúpenie už ovplyvnili ďalšie rozhodnutia alebo odstúpilo viac tímov. Automatické obnovenie účasti nie je bezpečné.",
  NOT_WITHDRAWN: "Tento tím nemá zaznamenané odstúpenie.",
  ALREADY_WITHDRAWN: "Tento tím už odstúpil.",
  WITHDRAWN_TEAM: "Zápas odstúpeného tímu riadi pravidlo odstúpenia. Nemožno ho upraviť ako samostatnú kontumáciu.",
  CANNOT_RESTORE: "Pôvodný výsledok tejto kontumácie nie je možné obnoviť.",
  NOT_A_FORFEIT: "Tento zápas nemá samostatnú kontumáciu na zrušenie.",
  TENNIS_NOT_SUPPORTED: "Tenisové kontumácie budú doplnené spolu so setovým bodovaním.",
};
export async function tournamentIncidentAction(_previous: IncidentState, form: FormData): Promise<IncidentState> {
  const slug = String(form.get("slug") ?? "");
  const action = String(form.get("action") ?? "");
  const target = String(form.get("target") ?? "");
  const winner = String(form.get("winner") ?? "") || null;
  const reason = String(form.get("reason") ?? "").trim();
  const confirm = form.get("stage") === "confirm";
  const version = String(form.get("version") ?? "");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !["withdraw","reinstate","forfeit","restore"].includes(action) || !target || target.length > 180 || reason.length < 5 || reason.length > 1000) return {error:"Vyber tím alebo zápas a uveď verejný dôvod (5 až 1 000 znakov)."};
  if (confirm && (!/^[a-f0-9]{32}$/.test(version) || form.get("confirmed") !== "yes")) return {error:"Potvrď zobrazený dopad zmeny."};
  try {
    const supabase = await createClient();
    const params = {p_slug:slug,p_action:action,p_target:target,p_winner:winner,p_reason:reason};
    if (!confirm) {
      const {data,error} = await supabase.rpc("preview_tournament_incident",params);
      if (error) return {error:errors[error.message] ?? "Náhľad sa nepodarilo vytvoriť. Mimoriadne situácie spravuje organizátor turnaja."};
      if (!data) return {error:"Náhľad sa nepodarilo načítať."};
      return {preview:data as IncidentPreview};
    }
    const {error} = await supabase.rpc("confirm_tournament_incident",{...params,p_version:version,p_confirm:true});
    if (error) return {error:errors[error.message] ?? "Zmenu sa nepodarilo uložiť. Vytvor nový náhľad."};
    for (const path of [`/turnaje/${slug}`,`/turnaje/${slug}/administracia`,`/turnaje/${slug}/upravit`,`/turnaje/${slug}/vysledky.pdf`]) revalidatePath(path);
    return {success:true};
  } catch {return {error:"Zmenu sa nepodarilo spracovať. Skús to znova."};}
}
