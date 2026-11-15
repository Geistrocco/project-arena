"use server";
import {randomBytes} from "node:crypto";
import {revalidatePath} from "next/cache";
import {createClient} from "@/lib/supabase/server";
export async function manageTournamentInvitation(slug:string,team:string,action:"create"|"revoke") {
 const client=await createClient();const token=action==="create"?randomBytes(32).toString("hex"):null;
 const {error}=await client.rpc(action==="create"?"create_tournament_invitation":"revoke_tournament_invitation",{p_slug:slug,p_team:team,...(token?{p_token:token}:{})});
 if(error)return {error:"Pozvánku sa nepodarilo zmeniť. Skontroluj oprávnenie, družstvo a uzavretie turnaja."};
 revalidatePath(`/turnaje/${slug}/administracia`);return {token};
}
export async function reviewTournamentInvitation(slug:string,id:string,user:string,approve:boolean) {
 const {error}=await (await createClient()).rpc("review_tournament_invitation",{p_id:id,p_user:user,p_approve:approve});
 if(error)return {error:"Odpoveď už nemožno schváliť. Obnov stránku a skontroluj stav turnaja."};
 revalidatePath(`/turnaje/${slug}/administracia`);return {};
}
