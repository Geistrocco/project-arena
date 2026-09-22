"use client";

import { useMemo, useState } from "react";
import { saveMatchScore, setMatchStream, swapGroupTeams } from "@/app/turnaje/[slug]/actions";
import { calculateStandings, type PlanGroup, type PlanMatch, type PlanTeam } from "@/lib/tournament-plan-calculations";

export function TournamentPlan({ slug, groups, matches, canManage }: { slug: string; groups: PlanGroup[]; matches: PlanMatch[]; canManage: boolean }) {
  const teamNames = useMemo(() => [...new Set(groups.flatMap((group) => group.teams.map((team) => team.team_name)))].sort((a, b) => a.localeCompare(b, "sk")), [groups]);
  const [selectedTeam, setSelectedTeam] = useState("");
  if (!groups.length || !matches.length) return null;
  const includesSelectedTeam = (match: PlanMatch) => !selectedTeam || match.resolved_home_name === selectedTeam || match.resolved_away_name === selectedTeam;
  const groupMatches = matches.filter((match) => match.phase === "group");
  const finalGroupMatches = matches.filter((match) => match.phase === "final_group");
  const finalMatches = matches.filter((match) => match.phase === "placement" || match.phase === "playoff");
  const visibleGroupMatches = groupMatches.filter(includesSelectedTeam);
  const visibleFinalGroupMatches = finalGroupMatches.filter(includesSelectedTeam);
  const visibleFinalMatches = finalMatches.filter(includesSelectedTeam);
  const basicGroups = groups.filter((group) => group.code !== "GOLD" && group.code !== "SILVER");
  const finalGroups = groups.filter((group) => group.code === "GOLD" || group.code === "SILVER");
  const visibleBasicGroups = selectedTeam ? basicGroups.filter((group) => group.teams.some((team) => team.team_name === selectedTeam)) : basicGroups;
  const visibleFinalGroups = selectedTeam ? finalGroups.filter((group) => group.teams.some((team) => team.team_name === selectedTeam)) : finalGroups;
  const hasSingleFinalTable = basicGroups.length === 1 && finalGroups.length === 0 && finalMatches.length === 0;
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));
  const allTeams = groups.flatMap((group) => group.teams.map((team) => ({ ...team, groupName: group.name })));
  return <section className="mx-auto max-w-7xl px-5 pt-10 lg:px-8">
    <div className="min-w-0 overflow-hidden rounded-3xl border bg-white p-5 shadow-card sm:p-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="eyebrow">Harmonogram turnaja</p><h2 className="mt-3 text-3xl font-black">Zápasy a priebežné tabuľky</h2><p className="mt-2 text-sm text-slate-500">Po uložení výsledku sa tabuľka automaticky prepočíta.</p></div></div>
      {teamNames.length > 1 && <label className="mt-6 block max-w-md rounded-2xl border border-arena-200 bg-arena-50 p-4 text-sm font-extrabold text-ink">
        Sledovať tím
        <select className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-semibold" value={selectedTeam} onChange={(event) => {
          setSelectedTeam(event.target.value);
        }}>
          <option value="">Všetky tímy</option>
          {teamNames.map((team) => <option key={team} value={team}>{team}</option>)}
        </select>
        {selectedTeam && <span className="mt-2 block font-normal text-slate-600">Zobrazujeme iba zápasy a tabuľky tímu {selectedTeam}.</span>}
      </label>}
      {canManage && allTeams.length > 1 && <form action={swapGroupTeams} className="mt-6 grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <input type="hidden" name="slug" value={slug}/><TeamSelect name="firstId" label="Vymeniť tím" teams={allTeams}/><TeamSelect name="secondId" label="Za tím" teams={allTeams}/><button className="rounded-xl bg-ink px-5 py-3 text-sm font-bold text-white">Vymeniť</button>
      </form>}
      <div className="mt-8 grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="min-w-0"><h3 className="text-xl font-extrabold">Skupinové zápasy</h3><div className="mt-4"><MatchTable slug={slug} matches={visibleGroupMatches} canManage={canManage} groupNames={groupNames}/></div></div>
        <div className="min-w-0 space-y-6">{visibleBasicGroups.map((group) => <StandingsTable key={group.id} group={group} matches={groupMatches} selectedTeam={selectedTeam} showPodium={hasSingleFinalTable}/>)}</div>
      </div>
      {finalGroupMatches.length > 0 && (!selectedTeam || visibleFinalGroupMatches.length > 0) && <div className="mt-10 min-w-0 border-t pt-8"><div><p className="eyebrow">Nadstavbová časť</p><h3 className="mt-2 text-2xl font-extrabold">Zlatá a strieborná skupina</h3><p className="mt-2 text-sm text-slate-500">Výsledky zo základných skupín sa neprenášajú. V oboch skupinách hrá každý s každým.</p></div><div className="mt-6 grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]"><div className="min-w-0"><MatchTable slug={slug} matches={visibleFinalGroupMatches} canManage={canManage} groupNames={groupNames}/></div><div className="min-w-0 space-y-6">{visibleFinalGroups.map((group) => <StandingsTable key={group.id} group={group} matches={finalGroupMatches} selectedTeam={selectedTeam} showPodium={group.code === "GOLD"}/>)}</div></div></div>}
      {finalMatches.length > 0 && (!selectedTeam || visibleFinalMatches.length > 0) && <div className="mt-10 min-w-0 border-t pt-8"><h3 className="text-xl font-extrabold">Zápasy o umiestnenie</h3><div className="mt-4"><MatchTable slug={slug} matches={visibleFinalMatches} canManage={canManage} groupNames={groupNames}/></div></div>}
    </div>
  </section>;
}

function TeamSelect({ name, label, teams }: { name: string; label: string; teams: (PlanTeam & { groupName: string })[] }) { return <label className="text-sm font-bold text-slate-700">{label}<select name={name} required className="mt-1 w-full rounded-xl border bg-white px-3 py-3 font-normal">{teams.map((team) => <option key={team.id} value={team.id}>{team.team_name} · {team.groupName}</option>)}</select></label>; }

function MatchTable({ slug, matches, canManage, groupNames }: { slug: string; matches: PlanMatch[]; canManage: boolean; groupNames: Map<string, string> }) {
  if (!matches.length) return <p className="rounded-2xl border border-dashed bg-slate-50 p-5 text-sm text-slate-600">Pre vybraný tím zatiaľ nie sú dostupné žiadne zápasy v tejto fáze.</p>;
  return <div className="min-w-0 max-w-full">
    <div className="space-y-3 md:hidden">{matches.map((match) => { const home = match.resolved_home_name ?? match.home_source; const away = match.resolved_away_name ?? match.away_source; return <article key={match.id} className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs"><span className="font-black text-slate-400">#{match.match_number}</span><span className="rounded-lg bg-ink px-2.5 py-1 font-black text-white">{match.starts_at.slice(0, 5)}</span><span className="font-bold text-arena-700">{match.group_id ? groupNames.get(match.group_id) : "—"}</span><span className="ml-auto text-slate-500">Ihrisko {match.field_number}</span></div>
      <div className="mt-4 grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2"><span className="font-bold">{home}</span><span className="text-slate-400">domáci</span><span className="font-bold">{away}</span><span className="text-slate-400">hostia</span></div>
      <div className="mt-4 border-t pt-4"><MatchResult slug={slug} match={match} canManage={canManage}/><MatchStream slug={slug} match={match} canManage={canManage} home={home} away={away}/></div>
    </article>; })}</div>
    <div className="hidden max-w-full overflow-x-auto md:block"><table className="w-full min-w-[820px] text-left text-sm"><thead className="border-y bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-3">#</th><th className="px-3 py-3">Čas</th><th className="px-3 py-3">Skupina</th><th className="px-3 py-3">Ihrisko</th><th className="px-3 py-3">Zápas</th><th className="px-3 py-3">Výsledok</th><th className="px-3 py-3">Prenos</th></tr></thead><tbody>{matches.map((match) => { const home = match.resolved_home_name ?? match.home_source; const away = match.resolved_away_name ?? match.away_source; return <tr key={match.id} className="border-b align-top"><td className="px-3 py-3 text-slate-400">{match.match_number}</td><td className="whitespace-nowrap px-3 py-3 font-bold">{match.starts_at.slice(0, 5)}</td><td className="whitespace-nowrap px-3 py-3 text-xs font-bold text-arena-700">{match.group_id ? groupNames.get(match.group_id) : "—"}</td><td className="px-3 py-3">{match.field_number}</td><td className="px-3 py-3"><span className="font-semibold">{home}</span><span className="mx-2 text-slate-400">—</span><span className="font-semibold">{away}</span></td><td className="px-3 py-2"><MatchResult slug={slug} match={match} canManage={canManage}/></td><td className="min-w-44 px-3 py-2"><MatchStream slug={slug} match={match} canManage={canManage} home={home} away={away}/></td></tr>; })}</tbody></table></div>
  </div>;
}

function MatchResult({ slug, match, canManage }: { slug: string; match: PlanMatch; canManage: boolean }) { return canManage && match.resolved_home_name && match.resolved_away_name ? <form action={saveMatchScore} className="flex flex-wrap items-center gap-2"><input type="hidden" name="matchId" value={match.id}/><input type="hidden" name="slug" value={slug}/><Score name="homeScore" value={match.home_score}/><span>:</span><Score name="awayScore" value={match.away_score}/><button className="rounded-lg bg-arena-600 px-3 py-2 text-xs font-bold text-white">Uložiť</button></form> : <span className="font-black">{match.status === "finished" ? `${match.home_score} : ${match.away_score}` : canManage && match.phase !== "group" ? "Čaká na postupujúcich" : "– : –"}</span>; }

function MatchStream({ slug, match, canManage, home, away }: { slug: string; match: PlanMatch; canManage: boolean; home: string | null; away: string | null }) { return <div className="mt-3 md:mt-0">{match.live_stream_url && <a aria-label={`Otvoriť prenos zápasu ${home ?? "domáci"} – ${away ?? "hostia"}`} className={match.live_stream_status === "live" ? "inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-extrabold text-white" : "inline-flex items-center rounded-lg bg-blue-50 px-3 py-2 text-xs font-extrabold text-blue-800"} href={match.live_stream_url} rel="noopener noreferrer" target="_blank">{match.live_stream_status === "live" && <span className="h-2 w-2 animate-pulse rounded-full bg-white"/>}{match.live_stream_status === "live" ? "Naživo ↗" : match.live_stream_status === "ended" ? "Záznam ↗" : "Prenos ↗"}</a>}{canManage && <details className="mt-2"><summary className="cursor-pointer text-xs font-bold text-arena-700">{match.live_stream_url ? "Upraviť" : "Pridať prenos"}</summary><form action={setMatchStream} className="mt-2 grid gap-2"><input name="matchId" type="hidden" value={match.id}/><input name="slug" type="hidden" value={slug}/><input className="h-9 min-w-0 rounded-lg border px-3 text-xs" defaultValue={match.live_stream_url ?? ""} maxLength={500} name="streamUrl" placeholder="https://..." required type="url"/><select className="h-9 rounded-lg border bg-white px-2 text-xs" defaultValue={match.live_stream_status ?? "scheduled"} name="streamStatus"><option value="scheduled">Pripravený</option><option value="live">Naživo</option><option value="ended">Ukončený</option></select><button className="rounded-lg bg-ink px-3 py-2 text-xs font-bold text-white" type="submit">Uložiť</button></form>{match.live_stream_url && <form action={setMatchStream} className="mt-2"><input name="matchId" type="hidden" value={match.id}/><input name="slug" type="hidden" value={slug}/><input name="remove" type="hidden" value="true"/><button className="text-xs font-bold text-red-700" type="submit">Odstrániť</button></form>}</details>}</div>; }
function Score({ name, value }: { name: string; value: number | null }) { return <input className="h-9 w-12 rounded-lg border text-center font-bold" name={name} type="number" min="0" max="999" required defaultValue={value ?? ""}/>; }
function StandingsTable({ group, matches, selectedTeam = "", showPodium = false }: { group: PlanGroup; matches: PlanMatch[]; selectedTeam?: string; showPodium?: boolean }) { const standings = calculateStandings(group, matches); const medals = ["🥇", "🥈", "🥉"]; return <div className="min-w-0"><h3 className="text-xl font-extrabold">{group.name}</h3><div className="mt-3 max-w-full overflow-x-auto rounded-2xl border"><table className="w-full min-w-[380px] text-xs sm:text-sm"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500 sm:text-xs"><tr><th className="px-2 py-3 text-left sm:px-3"># Tím</th><th>Z</th><th>V</th><th>R</th><th>P</th><th>Skóre</th><th className="pr-2 sm:pr-3">Body</th></tr></thead><tbody>{standings.map((row, index) => <tr className={`border-t ${row.name === selectedTeam ? "bg-arena-50 text-arena-900" : ""}`} key={row.name}><td className="px-2 py-3 font-semibold sm:px-3"><span className="inline-flex items-center gap-1.5">{showPodium && index < 3 && <span aria-label={`${index + 1}. miesto`} className="text-base leading-none" role="img">{medals[index]}</span>}<span>{index + 1}. {row.name}</span></span></td><td className="text-center">{row.played}</td><td className="text-center">{row.wins}</td><td className="text-center">{row.draws}</td><td className="text-center">{row.losses}</td><td className="whitespace-nowrap text-center">{row.scored}:{row.conceded}</td><td className="pr-2 text-center font-black sm:pr-3">{row.points}</td></tr>)}</tbody></table></div></div>; }
