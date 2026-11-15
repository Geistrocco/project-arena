"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/client";
export function TournamentInvitationResponse({token}:{token:string}) {
 const [message,setMessage]=useState("");const [pending,setPending]=useState(false);const router=useRouter();
 return <form className="mt-6 space-y-4" onSubmit={async e=>{e.preventDefault();if(pending)return;setPending(true);setMessage("");const f=new FormData(e.currentTarget);try{const {data,error}=await createClient().rpc("respond_tournament_invitation",{p_token:token,p_decision:f.get("decision"),p_contact:f.get("contact"),p_phone:f.get("phone"),p_note:f.get("note")});if(error){setMessage("Odpoveď sa nepodarilo uložiť. Over potvrdenie e-mailu a platnosť pozvánky; prípadne obnov stránku.");}else{setMessage(data==="review"?"Odpoveď je uložená. Organizátor ešte overí, že zastupuješ toto družstvo.":"Odpoveď bola uložená.");router.refresh();}}catch{setMessage("Spojenie zlyhalo. Skús to znova.");}finally{setPending(false);}}}>
 <label className="block"><span className="label">Meno a priezvisko</span><input className="field" name="contact" required minLength={2} maxLength={120} autoComplete="name"/></label>
 <label className="block"><span className="label">Telefón na overenie organizátorom</span><input className="field" name="phone" type="tel" required minLength={3} maxLength={40} autoComplete="tel"/></label>
 <label className="block"><span className="label">Poznámka</span><textarea className="field" name="note" maxLength={1000}/></label>
 <label className="block"><span className="label">Odpoveď</span><select className="field" name="decision"><option value="accepted">Potvrdiť účasť</option><option value="declined">Odmietnuť pozvánku</option></select></label>
 <p className="text-sm text-slate-600">Ak ešte nemáš oprávnenie na toto družstvo, odpoveď musí overiť organizátor. Tým nezískaš prístup k súpiske ani právam trénera.</p>
 {message&&<p role="status">{message}</p>}<button disabled={pending} className="btn-primary">{pending?"Ukladám…":"Odoslať odpoveď"}</button></form>;
}
