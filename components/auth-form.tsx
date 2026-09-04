"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup" | "forgot" | "reset";

const titles: Record<Mode, string> = {
  login: "Prihlásenie",
  signup: "Vytvoriť účet",
  forgot: "Obnova hesla",
  reset: "Nastaviť nové heslo",
};

export function AuthForm({ mode, verificationError = false, suspended = false }: { mode: Mode; verificationError?: boolean; suspended?: boolean }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(
    suspended
      ? "Tento účet je dočasne pozastavený. Ak si myslíte, že ide o omyl, kontaktujte podporu Project Arena."
      : verificationError
        ? "Overovací odkaz už bol použitý alebo vypršal. Ak ste ho otvorili prvýkrát, skúste sa prihlásiť — účet už môže byť potvrdený."
        : "",
  );
  const [error, setError] = useState(verificationError || suspended);
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    setError(false);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim();
    const marketingConsent = form.get("marketingConsent") === "on";
    const supabase = createClient();
    const origin = window.location.origin;
    let result: { error: { message: string } | null };

    if (mode === "signup") {
      result = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
            marketing_consent: marketingConsent,
            privacy_version: "2026-09-04",
          },
          emailRedirectTo: `${origin}/auth/callback`,
        },
      });
      if (!result.error) setMessage("Účet je vytvorený. Skontrolujte e-mail a potvrďte registráciu.");
    } else if (mode === "login") {
      result = await supabase.auth.signInWithPassword({ email, password });
      if (!result.error) {
        const { data: userData } = await supabase.auth.getUser();
        const { data: control } = await supabase
          .from("account_controls")
          .select("status")
          .eq("user_id", userData.user?.id ?? "")
          .maybeSingle();
        if (control?.status === "suspended") {
          await supabase.auth.signOut({ scope: "local" });
          setError(true);
          setMessage("Tento účet je dočasne pozastavený. Ak si myslíte, že ide o omyl, kontaktujte podporu Project Arena.");
          setPending(false);
          return;
        }
        router.push("/ucet");
        router.refresh();
      }
    } else if (mode === "forgot") {
      result = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/auth/callback?next=/nove-heslo`,
      });
      if (!result.error) setMessage("Ak účet existuje, poslali sme vám odkaz na obnovu hesla.");
    } else {
      result = await supabase.auth.updateUser({ password });
      if (!result.error) {
        setMessage("Heslo bolo zmenené.");
        setTimeout(() => router.push("/ucet"), 900);
      }
    }

    if (result.error) {
      setError(true);
      setMessage(
        result.error.message.includes("Invalid login")
          ? "Nesprávny e-mail alebo heslo."
          : result.error.message.includes("Password")
            ? "Heslo musí mať aspoň 8 znakov."
            : "Operáciu sa nepodarilo dokončiť. Skúste to znova.",
      );
    }
    setPending(false);
  }

  return (
    <section className="mx-auto max-w-md px-5 py-16 sm:py-24">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="eyebrow">Project Arena</p>
        <h1 className="mt-2 text-3xl font-extrabold text-ink">{titles[mode]}</h1>
        <form className="mt-8 space-y-5" onSubmit={submit}>
          {mode === "signup" && <Field label="Meno a priezvisko" name="name" autoComplete="name" />}
          {mode !== "reset" && <Field label="E-mail" name="email" type="email" autoComplete="email" />}
          {mode !== "forgot" && (
            <Field label={mode === "reset" ? "Nové heslo" : "Heslo"} name="password" type="password" minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} />
          )}
          {mode === "signup" && (
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <input className="mt-1 h-4 w-4 accent-emerald-700" name="marketingConsent" type="checkbox" />
              <span>
                Chcem dostávať e-mailom novinky, ponuky a zľavy Project Arena. Súhlas je dobrovoľný a môžem ho kedykoľvek odvolať.
              </span>
            </label>
          )}
          {message && <p className={`rounded-xl p-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`} role="status">{message}</p>}
          <button className="btn-primary w-full justify-center" disabled={pending} type="submit">
            {pending ? "Pracujem…" : mode === "login" ? "Prihlásiť sa" : mode === "signup" ? "Vytvoriť účet" : mode === "forgot" ? "Poslať odkaz" : "Uložiť nové heslo"}
          </button>
        </form>
        <div className="mt-6 space-y-2 text-center text-sm text-slate-600">
          {mode === "login" && <><p><Link className="font-semibold text-arena-700 hover:underline" href="/zabudnute-heslo">Zabudli ste heslo?</Link></p><p>Nemáte účet? <Link className="font-semibold text-arena-700 hover:underline" href="/registracia">Zaregistrovať sa</Link></p></>}
          {mode === "signup" && <p>Už máte účet? <Link className="font-semibold text-arena-700 hover:underline" href="/prihlasenie">Prihlásiť sa</Link></p>}
          {(mode === "forgot" || mode === "reset") && <p><Link className="font-semibold text-arena-700 hover:underline" href="/prihlasenie">Späť na prihlásenie</Link></p>}
        </div>
      </div>
    </section>
  );
}

function Field({ label, name, type = "text", autoComplete, minLength }: { label: string; name: string; type?: string; autoComplete: string; minLength?: number }) {
  return <label className="block"><span className="label">{label}</span><input className="field" name={name} type={type} autoComplete={autoComplete} minLength={minLength} required /></label>;
}
