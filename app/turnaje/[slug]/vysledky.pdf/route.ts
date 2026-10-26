import { getTournamentBySlug } from "@/lib/tournaments";
import { getTournamentPlan } from "@/lib/tournament-plan-data";
import { createResultsPdf } from "@/lib/tournament-results-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return new Response("Turnaj sa nenašiel.", { status: 404 });
  // Both reads use the requesting user's session and existing row-level policies.
  const [tournament, plan] = await Promise.all([getTournamentBySlug(slug), getTournamentPlan(slug, { publicExport: true })]);
  if (!tournament || !plan || !plan.matches.length) return new Response("Výsledky turnaja nie sú dostupné.", { status: 404 });
  const pdf = await createResultsPdf(tournament, plan.groups, plan.matches, process.env.NEXT_PUBLIC_SITE_URL || "https://tournio.sk", plan.lockedAt);
  return new Response(pdf, { headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="tournio-${slug}-vysledky.pdf"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}
