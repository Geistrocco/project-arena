import { getSiteAccess } from "@/lib/site-access";
import { AuthForm } from "@/components/auth-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ chyba?: string; stav?: string; next?:string }> }) {
  const params = await searchParams;
  const access = await getSiteAccess();
  return <AuthForm privateTesting={access.restricted} returnTo={params.next} mode="login" verificationError={params.chyba === "overenie"} suspended={params.stav === "pozastaveny"} />;
}
