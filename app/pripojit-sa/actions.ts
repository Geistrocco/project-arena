"use server";
import {randomBytes} from "node:crypto";
import {revalidatePath} from "next/cache";
import {createClient} from "@/lib/supabase/server";
import {joiningError} from "@/lib/family-team-joining";
import {authReturnPath} from "@/lib/auth-return-path";
export type JoinState={error?:string;success?:boolean;url?:string;teamId?:string};
const uuid=(v:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export async function familyTeamAction(_previous:JoinState,form:FormData):Promise<JoinState>{
 const op=String(form.get("operation")??""),team=String(form.get("teamId")??""),player=String(form.get("playerId")??""),request=String(form.get("requestId")??""),link=String(form.get("linkId")??""),token=String(form.get("token")??"");
 const confirmed=form.get("confirmed")==="yes";const reason=String(form.get("reason")??"").trim();
 let rpc:string,params:Record<string,unknown>,rawToken:string|undefined;
 if(op==="request") {if(!uuid(team)||!uuid(player)||!confirmed||reason.length>500)return {error:"Vyber dieťa a tím a potvrď žiadosť."};rpc="request_player_team_join";params={p_team:team,p_player:player,p_message:reason};}
 else if(op==="review") {const decision=String(form.get("decision")??"");if(!uuid(request)||!["approve","reject"].includes(decision)||!confirmed||reason.length>500||(decision==="reject"&&reason.length<5))return {error:"Potvrď rozhodnutie. Pri zamietnutí uveď dôvod aspoň na 5 znakov."};rpc="decide_player_team_join";params={p_request:request,p_accept:decision==="approve",p_reason:reason,p_confirm:true};}
 else if(op==="cancel") {if(!uuid(request)||!confirmed)return {error:"Potvrď zrušenie žiadosti."};rpc="cancel_player_team_join";params={p_request:request};}
 else if(op==="create_link") {if(!uuid(team))return {error:"Vyber platný tím."};rawToken=randomBytes(32).toString("hex");rpc="create_team_join_link";params={p_team:team,p_token:rawToken};}
 else if(op==="revoke_link") {if(!uuid(link)||!confirmed)return {error:"Potvrď zrušenie pozvánky."};rpc="revoke_team_join_link";params={p_link:link};}
 else if(op==="accept_link") {if(!/^[a-f0-9]{64}$/.test(token)||!uuid(player)||!confirmed)return {error:"Vyber správne dieťa a potvrď prijatie do tímu."};rpc="accept_team_join_link";params={p_token:token,p_player:player,p_confirm:true};}
 else if(op==="create_player") {const name=String(form.get("fullName")??"").trim().replace(/\s+/g," ");const birth=String(form.get("birthDate")??"");if(name.length<2||name.length>120||(birth&&!/^\d{4}-\d{2}-\d{2}$/.test(birth)))return {error:"Skontroluj meno a dátum narodenia dieťaťa."};rpc="create_player_for_guardian";params={p_full_name:name,p_birth_date:birth||null};}
 else return {error:"Neplatná požiadavka."};
 try{const supabase=await createClient();const {data,error}=await supabase.rpc(rpc,params);if(error)return {error:error.code==="23505"?"Pozvánka alebo žiadosť už existuje.":joiningError(error.message)};
 for(const p of ["/ucet","/pripojit-sa","/moj-tim","/ziadosti-hracov"])revalidatePath(p);
 if(uuid(team))revalidatePath(`/timy/${team}/prehlad`);
 if(/^[a-f0-9]{64}$/.test(token))revalidatePath(`/pozvanka/${token}`);
 const back=authReturnPath(form.get("returnTo"));if(back!=="/ucet")revalidatePath(back.split("?")[0]);
 if(op==="create_link")return {success:true,url:`${(process.env.NEXT_PUBLIC_SITE_URL??"https://tournio.sk").replace(/\/$/,"")}/pozvanka/${rawToken}`};
 return {success:true,teamId:op==="accept_link"&&typeof data==="string"?data:undefined};
 }catch{return {error:"Operáciu sa nepodarilo dokončiť. Skús to znova."};}
}
