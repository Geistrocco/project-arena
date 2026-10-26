export function TournamentResultStatus({ lockedAt, finished }: { lockedAt: string | null; finished: boolean }) {
  return <div role="status" className={`rounded-2xl border px-5 py-4 text-sm font-bold ${lockedAt ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
    {lockedAt ? `Potvrdené konečné výsledky · uzamknuté ${new Intl.DateTimeFormat("sk-SK", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Bratislava" }).format(new Date(lockedAt))}` : finished ? "Všetky zápasy sú odohrané. Výsledky čakajú na potvrdenie organizátorom." : "Priebežné výsledky · turnaj zatiaľ nie je ukončený"}
  </div>;
}
