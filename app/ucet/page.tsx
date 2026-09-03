import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AccountPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) redirect("/prihlasenie");
  const email = typeof data.claims.email === "string" ? data.claims.email : "";
  const metadata = data.claims.user_metadata as { full_name?: string } | undefined;
  return <section className="mx-auto max-w-3xl px-5 py-16 sm:py-24"><div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm"><p className="eyebrow">Môj účet</p><h1 className="mt-2 text-3xl font-extrabold text-ink">Vitajte{metadata?.full_name ? `, ${metadata.full_name}` : ""}</h1><p className="mt-3 text-slate-600">Prihlásený účet: {email}</p><div className="mt-8"><Link className="btn-primary" href="/vytvorit-turnaj">Vytvoriť turnaj</Link></div></div></section>;
}
