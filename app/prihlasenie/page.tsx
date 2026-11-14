import { AuthForm } from "@/components/auth-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ chyba?: string; stav?: string; next?:string }> }) {
  const params = await searchParams;
  return <AuthForm returnTo={params.next} mode="login" verificationError={params.chyba === "overenie"} suspended={params.stav === "pozastaveny"} />;
}
