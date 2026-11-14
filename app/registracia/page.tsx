import { AuthForm } from "@/components/auth-form";

export default async function SignupPage({searchParams}:{searchParams:Promise<{next?:string}>}) {
  const params=await searchParams;
  return <AuthForm returnTo={params.next} mode="signup" />;
}
