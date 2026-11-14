import "server-only";
import { createClient } from "@/lib/supabase/server";
export type Application = { id: string; team_id: string; team_name: string; status: "pending" | "accepted" | "rejected"; contact_name: string; contact_email: string; phone: string; note: string; decision_reason: string | null; created_at: string };
export async function getApplicationContext(slug: string) {
  const supabase = await createClient();
  const [{ data: { user } }, { data: tournament }] = await Promise.all([supabase.auth.getUser(), supabase.from("tournaments").select("id,organizer_id,category,publication_status,tournament_type,registration_closed_at").eq("slug",slug).maybeSingle()]);
  if (!tournament) return { user, tournament: null, teams: [], applications: [] as Application[], error: false };
  if (!user) return { user, tournament, teams: [], applications: [] as Application[], error: false };
  const [{ data: applications, error }, { data: memberships }] = await Promise.all([
    supabase.from("tournament_applications").select("id,team_id,team_name,status,contact_name,contact_email,phone,note,decision_reason,created_at").eq("tournament_id",tournament.id).order("created_at"),
    supabase.from("team_memberships").select("team_id").eq("user_id",user.id).in("role",["coach","manager","club_admin"]),
  ]);
  const ids = (memberships ?? []).map(m => m.team_id);
  const { data: teams } = ids.length ? await supabase.from("club_teams").select("id,name,category,season").in("id",ids).eq("status","active").order("name") : { data: [] };
  return { user, tournament, teams: teams ?? [], applications: (applications ?? []) as Application[], error: Boolean(error) };
}
