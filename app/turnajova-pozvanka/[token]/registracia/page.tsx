import {notFound} from "next/navigation";
import {AuthForm} from "@/components/auth-form";
import {createClient} from "@/lib/supabase/server";
export const metadata={title:"Účet k turnajovej pozvánke",referrer:"no-referrer" as const};
export default async function Page({params}:{params:Promise<{token:string}>}) {
 const {token}=await params;if(!/^[a-f0-9]{64}$/.test(token))notFound();
 const {data,error}=await (await createClient()).rpc("get_tournament_invitation",{p_token:token});if(error||!data||data.closed||data.status!=="pending")notFound();
 return <><p className="mx-auto mt-8 max-w-md px-5 text-sm">Účet na odpoveď za {data.team}. Registrácia nezaručuje oprávnenie zastupovať družstvo; to musí overiť organizátor.</p><AuthForm mode="signup" returnTo={`/turnajova-pozvanka/${token}`}/></>;
}
