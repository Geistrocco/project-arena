import Link from "next/link";
import { redirect } from "next/navigation";
import { reviewTeamClaim, reviewTeamCreationRequest } from "@/app/admin/actions";
import { createClient } from "@/lib/supabase/server";

type Claim = { id: string; team_id: string; user_id: string; requested_role: string; phone: string | null; message: string | null; created_at: string };
type TeamRequest = { id: string; user_id: string; club_name: string; city: string; category: string; season: string; requested_role: string; source_url: string | null; message: string | null };

export default async function AdminTeamsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const adminId = typeof auth?.claims?.sub === "string" ? auth.claims.sub : null;
  if (!adminId) redirect("/prihlasenie");
  const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", adminId).maybeSingle();
  if (!role || !["owner", "admin"].includes(role.role)) redirect("/ucet");

  const { data: claims } = await supabase.from("team_claim_requests").select("id, team_id, user_id, requested_role, phone, message, created_at").eq("status", "pending").order("created_at");
  const { data: newTeamRequests } = await supabase.from("team_creation_requests").select("id, user_id, club_name, city, category, season, requested_role, source_url, message").eq("status", "pending").order("created_at");
  const rows = (claims as Claim[] | null) ?? [];
  const proposedTeams = (newTeamRequests as TeamRequest[] | null) ?? [];
  const teamIds = [...new Set(rows.map((item) => item.team_id))];
  const userIds = [...new Set([...rows.map((item) => item.user_id), ...proposedTeams.map((item) => item.user_id)])];
  const [{ data: teams }, { data: profiles }] = await Promise.all([
    teamIds.length ? supabase.from("club_teams").select("id, name, season").in("id", teamIds) : Promise.resolve({ data: [] }),
    userIds.length ? supabase.from("profiles").select("id, full_name, email").in("id", userIds) : Promise.resolve({ data: [] }),
  ]);
  const teamById = new Map(teams?.map((item) => [item.id, item]));
  const profileById = new Map(profiles?.map((item) => [item.id, item]));

  return <section className="mx-auto max-w-5xl px-5 py-12 lg:px-8 lg:py-16">
    <div className="flex items-end justify-between"><div><p className="eyebrow">Administrácia</p><h1 className="mt-2 text-3xl font-extrabold">Žiadosti o tímy</h1><p className="mt-2 text-slate-600">Schválením potvrdíte, že používateľ môže zastupovať konkrétny tím.</p></div><Link className="btn-secondary" href="/admin/pouzivatelia">Používatelia</Link></div>
    <div className="mt-8 space-y-4">{rows.map((claim) => { const team = teamById.get(claim.team_id); const profile = profileById.get(claim.user_id); return <article className="rounded-2xl border bg-white p-5 shadow-sm" key={claim.id}><h2 className="text-lg font-extrabold">{team?.name ?? "Neznámy tím"}</h2><p className="mt-1 text-sm text-slate-600">{profile?.full_name || "Bez mena"} · {profile?.email || "bez e-mailu"} · {roleLabel[claim.requested_role] ?? claim.requested_role}</p><dl className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2"><div><dt className="font-semibold text-slate-500">Telefón</dt><dd className="mt-1 font-medium">{claim.phone || "Neuvedený"}</dd></div>{claim.message && <div><dt className="font-semibold text-slate-500">Doplňujúce informácie</dt><dd className="mt-1 whitespace-pre-wrap">{claim.message}</dd></div>}</dl><form action={reviewTeamClaim} className="mt-4 flex gap-3"><input type="hidden" name="claimId" value={claim.id}/><button className="btn-primary" name="decision" value="approved">Schváliť</button><button className="btn-secondary" name="decision" value="rejected">Zamietnuť</button></form></article>; })}{rows.length === 0 && <p className="rounded-2xl border bg-white p-8 text-center text-slate-600">Momentálne nie sú žiadne čakajúce žiadosti.</p>}</div>
    <h2 className="mt-12 text-2xl font-extrabold">Nové kluby a tímy</h2>
    <p className="mt-2 text-sm text-slate-600">Pred schválením skontrolujte názov, mesto a prípadný odkaz, aby nevznikla duplicita.</p>
    <div className="mt-5 space-y-4">{proposedTeams.map((request) => { const profile = profileById.get(request.user_id); return <article className="rounded-2xl border bg-white p-5 shadow-sm" key={request.id}><h3 className="text-lg font-extrabold">{request.club_name} · {request.category}</h3><p className="mt-1 text-sm text-slate-600">{request.city} · sezóna {request.season} · {roleLabel[request.requested_role] ?? request.requested_role}</p><p className="mt-1 text-sm text-slate-600">Žiadateľ: {profile?.full_name || "Bez mena"} · {profile?.email || "bez e-mailu"}</p>{request.source_url && <a className="mt-3 inline-block text-sm font-bold text-arena-700 underline" href={request.source_url} target="_blank" rel="noreferrer">Overiť odkaz</a>}{request.message && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">{request.message}</p>}<form action={reviewTeamCreationRequest} className="mt-4 flex gap-3"><input name="requestId" type="hidden" value={request.id}/><button className="btn-primary" name="decision" value="approved">Schváliť a vytvoriť</button><button className="btn-secondary" name="decision" value="rejected">Zamietnuť</button></form></article>; })}{proposedTeams.length === 0 && <p className="rounded-2xl border bg-white p-8 text-center text-slate-600">Žiadne návrhy nových tímov.</p>}</div>
  </section>;
}

const roleLabel: Record<string, string> = { coach: "Tréner", manager: "Vedúci tímu", club_admin: "Administrátor klubu" };
