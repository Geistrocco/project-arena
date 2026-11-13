import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { resolveAccountMode } from "./account-mode";
export const getAccountContext = cache(async () => {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { user: null, mode: "parent" as const };
  const preference: unknown = user.user_metadata?.account_mode;
  if (preference === "parent" || preference === "coach") return { user, mode: preference };
  // Preserve existing organizers, team staff and pending applicants without granting any new role.
  const results = await Promise.all([
    supabase.from("team_memberships").select("team_id", { count: "exact", head: true }).eq("user_id",user.id),
    supabase.from("tournaments").select("id", { count: "exact", head: true }).eq("organizer_id",user.id),
    supabase.from("team_claim_requests").select("id", { count: "exact", head: true }).eq("user_id",user.id),
    supabase.from("team_creation_requests").select("id", { count: "exact", head: true }).eq("user_id",user.id),
    supabase.from("user_roles").select("role").eq("user_id",user.id).maybeSingle(),
  ]);
  if (results.some(result => result.error)) throw new Error("Typ účtu sa nepodarilo načítať.");
  const staff = results.slice(0,4).some(result => (result.count ?? 0) > 0) || ["owner","admin"].includes(String(results[4].data?.role));
  return { user, mode: resolveAccountMode(preference,staff) };
});
