"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
export async function respondToPlan(form: FormData) {
  const week = String(form.get("week") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) throw new Error("Neplatný týždeň.");
  let items: unknown;
  try { items = JSON.parse(String(form.get("items") ?? "[]")); } catch { throw new Error("Neplatný výber."); }
  if (!Array.isArray(items) || items.length < 1 || items.length > 100) throw new Error("Neplatný výber.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("respond_to_training_plan", { p_items: items, p_response: String(form.get("response") ?? ""), p_reason: String(form.get("reason") ?? "").trim(), p_pending_only: form.get("bulk") === "true" });
  revalidatePath("/treningy");
  revalidatePath("/nominacie/[nominationId]", "page");
  revalidatePath("/timy/[teamId]/kalendar", "page");
  revalidatePath("/timy/[teamId]/nominacie", "page");
  redirect(`/treningy?tyzden=${week}&${error ? "stav=obnovit" : `ulozene=${Number(data) || 0}`}`);
}
