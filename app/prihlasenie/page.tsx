import { AuthForm } from "@/components/auth-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ chyba?: string; stav?: string }> }) {
  const params = await searchParams;
  return <AuthForm mode="login" verificationError={params.chyba === "overenie"} suspended={params.stav === "pozastaveny"} />;
}
