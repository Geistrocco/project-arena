import Link from "next/link";
export function SignupModal({slug,disabled=false}:{slug:string;disabled?:boolean}) {
 return <Link className="btn-primary w-full justify-center sm:w-auto" href={`/turnaje/${slug}#prihlaska`}>{disabled?"Prihlášky a stav účasti":"Prihlásiť tím"}</Link>;
}
