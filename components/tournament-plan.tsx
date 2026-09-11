import { saveMatchScore, swapGroupTeams } from "@/app/turnaje/[slug]/actions";
import { calculateStandings, type PlanGroup, type PlanMatch } from "@/lib/tournament-plan-data";

export function TournamentPlan({ slug, groups, matches, canManage }: { slug: string; groups: PlanGroup[]; matches: PlanMatch[]; canManage: boolean }) {
  if (!groups.length || !matches.length) return null;
  const groupMatches = matches.filter((match) => match.phase === "group");
  const finalMatches = matches.filter((match) => match.phase !== "group");
  const allTeams = groups.flatMap((group) => group.teams.map((team) => ({ ...team, groupName: group.name })));
  return <section className="mx-auto max-w-7xl px-5 pt-10 lg:px-8">
    <div className="rounded-3xl border bg-white p-5 shadow-card sm:p-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="eyebrow">Harmonogram turnaja</p><h2 className="mt-3 text-3xl font-black">Zápasy a priebežné tabuľky</h2><p className="mt-2 text-sm text-slate-500">Po uložení výsledku sa tabuľka automaticky prepočíta.</p></div></div>
      {canManage && allTeams.length > 1 && <form action={swapGroupTeams} className="mt-6 grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <input type="hidden" name="slug" value={slug}/><TeamSelect name="firstId" label="Vymeniť tím" teams={allTeams}/><TeamSelect name="secondId" label="Za tím" teams={allTeams}/><button className="rounded-xl bg-ink px-5 py-3 text-sm font-bold text-white">Vymeniť</button>
      </form>}
      <div className="mt-8 grid gap-8 xl:grid-cols-[1.35fr_1fr]">
        <div><h3 className="text-xl font-extrabold">Skupinové zápasy</h3><div className="mt-4 overflow-x-auto"><MatchTable slug={slug} matches={groupMatches} canManage={canManage}/></div></div>
        <div className="space-y-6">{groups.map((group) => <StandingsTable key={group.id} group={group} matches={groupMatches}/>)}</div>
      </div>
      {finalMatches.length > 0 && <div className="mt-10 border-t pt-8"><h3 className="text-xl font-extrabold">Zápasy o umiestnenie</h3><div className="mt-4 overflow-x-auto"><MatchTable slug={slug} matches={finalMatches} canManage={canManage}/></div></div>}
    </div>
  </section>;
}

function TeamSelect({ name, label, teams }: { name: string; label: string; teams: (import("@/lib/tournament-plan-data").PlanTeam & { groupName: string })[] }) { return <label className="text-sm font-bold text-slate-700">{label}<select name={name} required className="mt-1 w-full rounded-xl border bg-white px-3 py-3 font-normal">{teams.map((team) => <option key={team.id} value={team.id}>{team.team_name} · {team.groupName}</option>)}</select></label>; }

function MatchTable({ slug, matches, canManage }: { slug: string; matches: PlanMatch[]; canManage: boolean }) { return <table className="w-full min-w-[620px] text-left text-sm"><thead className="border-y bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-3">Čas</th><th className="px-3 py-3">Ihrisko</th><th className="px-3 py-3">Zápas</th><th className="px-3 py-3">Výsledok</th></tr></thead><tbody>{matches.map((match) => { const home = match.home_team_name ?? match.home_source; const away = match.away_team_name ?? match.away_source; return <tr key={match.id} className="border-b"><td className="whitespace-nowrap px-3 py-3 font-bold">{match.starts_at.slice(0, 5)}</td><td className="px-3 py-3">{match.field_number}</td><td className="px-3 py-3"><span className="font-semibold">{home}</span><span className="mx-2 text-slate-400">—</span><span className="font-semibold">{away}</span></td><td className="px-3 py-2">{canManage ? <form action={saveMatchScore} className="flex items-center gap-2"><input type="hidden" name="matchId" value={match.id}/><input type="hidden" name="slug" value={slug}/><Score name="homeScore" value={match.home_score}/><span>:</span><Score name="awayScore" value={match.away_score}/><button className="rounded-lg bg-arena-600 px-3 py-2 text-xs font-bold text-white">Uložiť</button></form> : <span className="font-black">{match.status === "finished" ? `${match.home_score} : ${match.away_score}` : "– : –"}</span>}</td></tr>; })}</tbody></table>; }
function Score({ name, value }: { name: string; value: number | null }) { return <input className="h-9 w-12 rounded-lg border text-center font-bold" name={name} type="number" min="0" max="999" required defaultValue={value ?? ""}/>; }
function StandingsTable({ group, matches }: { group: PlanGroup; matches: PlanMatch[] }) { const standings = calculateStandings(group, matches); return <div><h3 className="text-xl font-extrabold">{group.name}</h3><div className="mt-3 overflow-x-auto rounded-2xl border"><table className="w-full min-w-[440px] text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-3 text-left"># Tím</th><th>Z</th><th>V</th><th>R</th><th>P</th><th>Skóre</th><th className="pr-3">Body</th></tr></thead><tbody>{standings.map((row, index) => <tr className="border-t" key={row.name}><td className="px-3 py-3 font-semibold">{index + 1}. {row.name}</td><td className="text-center">{row.played}</td><td className="text-center">{row.wins}</td><td className="text-center">{row.draws}</td><td className="text-center">{row.losses}</td><td className="whitespace-nowrap text-center">{row.scored}:{row.conceded}</td><td className="pr-3 text-center font-black">{row.points}</td></tr>)}</tbody></table></div></div>; }
