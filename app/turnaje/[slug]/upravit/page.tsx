import { notFound } from "next/navigation";
import { CreateTournamentForm } from "@/components/create-tournament-form";
import { getActiveClubs } from "@/lib/clubs";
import { getTournamentEditSource } from "@/lib/tournaments";

export const metadata = { title: "Upraviť turnaj" };
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [clubs, editSource] = await Promise.all([getActiveClubs(), getTournamentEditSource(slug)]);
  if (!editSource) notFound();
  return <div className="mx-auto max-w-4xl px-5 py-12 lg:px-8 lg:py-16"><p className="eyebrow">Pre organizátora</p><h1 className="mt-4 text-4xl font-black tracking-[-0.03em] sm:text-5xl">Upraviť turnaj</h1><p className="mb-9 mt-4 text-lg text-slate-600">Zmeny formátu automaticky vytvoria nový harmonogram.</p><CreateTournamentForm clubs={clubs} editSource={editSource}/></div>;
}
