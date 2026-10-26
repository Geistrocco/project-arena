"use client";
import { useActionState } from "react";
import { saveTennisMatchScore } from "@/app/turnaje/[slug]/actions";
import { tennisScoreLabel } from "@/lib/tennis";
import type { PlanMatch } from "@/lib/tournament-plan-calculations";

export function TennisMatchResult({ slug, match, canScore }: { slug: string; match: PlanMatch; canScore: boolean }) {
  const [state, action, pending] = useActionState(saveTennisMatchScore, {});
  if (!canScore) return <span className="font-bold">{match.status === "finished" ? tennisScoreLabel(match.tennis_sets) : "– : –"}</span>;
  if (!match.resolved_home_name || !match.resolved_away_name) return <span className="text-xs text-slate-500">Čaká na postupujúcich</span>;
  return <form action={action} className="min-w-48 space-y-2"><input type="hidden" name="slug" value={slug} /><input type="hidden" name="matchId" value={match.id} />
    {Array.from({ length: match.tennis_scoring === "match_tiebreak" ? 3 : 1 }, (_, i) => <div key={i} className="flex items-center gap-2"><span className="w-14 text-xs">{i === 2 ? "TB 10" : `${i + 1}. set`}</span><input aria-label={`${i + 1}. set domáci`} className="h-9 w-14 rounded-lg border text-center" type="number" min={0} max={99} name={`home${i}`} defaultValue={match.tennis_sets?.[i]?.home ?? ""} required={i < (match.tennis_scoring === "match_tiebreak" ? 2 : 1)} /><span>:</span><input aria-label={`${i + 1}. set hostia`} className="h-9 w-14 rounded-lg border text-center" type="number" min={0} max={99} name={`away${i}`} defaultValue={match.tennis_sets?.[i]?.away ?? ""} required={i < (match.tennis_scoring === "match_tiebreak" ? 2 : 1)} /></div>)}
    <button className="rounded-lg bg-arena-600 px-3 py-2 text-xs font-bold text-white" disabled={pending}>{pending ? "Ukladám…" : "Uložiť sety"}</button>{state.message && <p role="status" className={`text-xs ${state.success ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>}
  </form>;
}
