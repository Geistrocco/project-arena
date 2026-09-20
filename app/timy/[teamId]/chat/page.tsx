import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TeamChat } from "@/components/team-chat";
import { getMyTeams } from "@/lib/my-teams";

export default async function ChatPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(teamId)) notFound();
  const { userId, teams } = await getMyTeams();
  if (!userId) redirect("/prihlasenie");
  const team = teams.find((item) => item.id === teamId);
  if (!team) notFound();
  return <main className="mx-auto max-w-4xl px-5 py-12"><Link className="text-sm font-bold text-arena-700" href={`/timy/${teamId}/prehlad`}>← Prehľad tímu</Link><h1 className="mt-5 text-3xl font-extrabold text-ink">Chat · {team.name}</h1><p className="mb-6 mt-2 text-slate-600">Správy tímu a dôležité oznamy na jednom mieste.</p><TeamChat canManage={team.staffRole !== null} teamId={teamId}/></main>;
}
