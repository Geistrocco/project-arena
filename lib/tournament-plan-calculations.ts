import type { RankingRule } from "./tournament-ranking";
export type PlanTeam = { id: string; group_id: string; slot_number: number; team_name: string; withdrawn?: boolean };
export type PlanMatch = { sport?: string; tennis_scoring?: import("@/lib/tennis").TennisScoring; tennis_system?: import("@/lib/tennis").TennisSystem; tennis_sets?: {home:number;away:number}[] | null; tennis_result?: "played"|"wo"|"retired"; tennis_winner?: "home"|"away"|null; outcome?: "played" | "forfeit" | "void"; outcome_reason?: string | null; id: string; group_id: string | null; phase: "group" | "final_group" | "placement" | "playoff"; round_number: number; match_number: number; starts_at: string; field_number: number; home_team_name: string | null; away_team_name: string | null; home_source: string | null; away_source: string | null; home_score: number | null; away_score: number | null; status: "scheduled" | "finished"; live_stream_url: string | null; live_stream_status: "scheduled" | "live" | "ended" | null; resolved_home_name?: string | null; resolved_away_name?: string | null };
export type PlanGroup = { id: string; code: string; name: string; sort_order: number; teams: PlanTeam[]; ranking_rule?: RankingRule; standings?: Standing[]; ranking_version?: string; tie_reason?: string | null };
export type Standing = { withdrawn?: boolean; name: string; played: number; wins: number; draws: number; losses: number; scored: number; conceded: number; difference: number; points: number; rank?: number; unresolved?: boolean };

export function calculateStandings(group: PlanGroup, matches: PlanMatch[]): Standing[] {
  if (group.standings) return group.standings;
  const rows = new Map(group.teams.map((team) => [team.team_name, { name: team.team_name, withdrawn: Boolean(team.withdrawn), played: 0, wins: 0, draws: 0, losses: 0, scored: 0, conceded: 0, difference: 0, points: 0 }]));
  matches.filter((match) => match.group_id === group.id && (match.phase === "group" || match.phase === "final_group") && match.outcome !== "void" && match.status === "finished" && match.home_score !== null && match.away_score !== null && match.home_team_name && match.away_team_name).forEach((match) => {
    const home = rows.get(match.home_team_name!); const away = rows.get(match.away_team_name!); if (!home || !away) return;
    const hs = Number(match.home_score); const as = Number(match.away_score); home.played += 1; away.played += 1; home.scored += hs; home.conceded += as; away.scored += as; away.conceded += hs;
    if (hs > as) { home.wins += 1; home.points += 3; away.losses += 1; } else if (hs < as) { away.wins += 1; away.points += 3; home.losses += 1; } else { home.draws += 1; away.draws += 1; home.points += 1; away.points += 1; }
  });
  const totals = [...rows.values()].map(row=>({...row,difference:row.scored-row.conceded}));
  const rule = group.ranking_rule ?? "legacy";
  if (rule === "legacy") return totals.sort((a,b)=>Number(a.withdrawn)-Number(b.withdrawn)||b.points-a.points||b.difference-a.difference||b.scored-a.scored||a.name.localeCompare(b.name,"sk")).map((row,i)=>({...row,rank:i+1,unresolved:false}));
  const mini = new Map(totals.map(r=>[r.name,{points:0,difference:0,scored:0}]));
  for (const m of matches) {
    if(m.group_id!==group.id||!["group","final_group"].includes(m.phase)||m.outcome==="void"||m.status!=="finished"||m.home_score===null||m.away_score===null)continue;
    const h=rows.get(m.home_team_name??""),a=rows.get(m.away_team_name??"");if(!h||!a||h.points!==a.points||h.withdrawn!==a.withdrawn)continue;
    const x=mini.get(h.name)!,y=mini.get(a.name)!;x.scored+=m.home_score;y.scored+=m.away_score;x.difference+=m.home_score-m.away_score;y.difference+=m.away_score-m.home_score;
    x.points+=m.home_score>m.away_score?3:m.home_score===m.away_score?1:0;y.points+=m.away_score>m.home_score?3:m.home_score===m.away_score?1:0;
  }
  const keys=(r:typeof totals[number])=>{const m=mini.get(r.name)!;return rule==="head_to_head"?[-Number(r.withdrawn),r.points,m.points,m.difference,m.scored,r.difference,r.scored]:[-Number(r.withdrawn),r.points,r.difference,r.scored,m.points,m.difference,m.scored];};
  const compare=(a:typeof totals[number],b:typeof totals[number])=>{const x=keys(a),y=keys(b);for(let i=0;i<x.length;i++)if(x[i]!==y[i])return y[i]-x[i];return a.withdrawn && b.withdrawn ? a.name.localeCompare(b.name,"sk") : 0;};
  const sorted=totals.sort(compare);
  return sorted.map((r,i)=>{const first=sorted.findIndex(x=>compare(x,r)===0);return {...r,rank:first+1,unresolved:sorted.some((x,j)=>j!==i&&compare(x,r)===0)};});
}

export function groupResultsComplete(group: PlanGroup,matches: PlanMatch[]): boolean {
 const games=matches.filter(m=>m.group_id===group.id&&(m.phase==="group"||m.phase==="final_group"));
 if(group.teams.length<2||games.length===0||games.some(m=>m.status!=="finished"||m.home_score===null||m.away_score===null))return false;
 return group.teams.every((a,i)=>group.teams.slice(i+1).every(b=>games.some(m=>(m.home_team_name===a.team_name&&m.away_team_name===b.team_name)||(m.home_team_name===b.team_name&&m.away_team_name===a.team_name))));
}

export type TennisStanding = Standing & {gamesWon:number; gamesLost:number};
export function calculateTennisStandings(group: PlanGroup, matches: PlanMatch[]): TennisStanding[] {
 const played=matches.filter(m=>m.group_id===group.id && ["group","final_group"].includes(m.phase) && m.status==="finished" && m.outcome!=="void");
 const rows=group.teams.map(t=>{let wins=0,losses=0,scored=0,conceded=0,gamesWon=0,gamesLost=0;
 for(const m of played){const home=(m.resolved_home_name??m.home_team_name)===t.team_name;if(!home&&(m.resolved_away_name??m.away_team_name)!==t.team_name)continue;
 const won=m.tennis_winner ? (m.tennis_winner==="home")===home : (home?Number(m.home_score)>Number(m.away_score):Number(m.away_score)>Number(m.home_score));
 if(won)wins++;else losses++;scored+=Number(home?m.home_score:m.away_score);conceded+=Number(home?m.away_score:m.home_score);
 for(const [i,set] of (m.tennis_sets??[]).entries())if(i!==2){gamesWon+=home?set.home:set.away;gamesLost+=home?set.away:set.home;}}
 return {name:t.team_name,played:wins+losses,wins,losses,draws:0,scored,conceded,difference:scored-conceded,points:wins,gamesWon,gamesLost};});
 if(group.standings)return group.standings.map(r=>({...rows.find(x=>x.name===r.name)!,...r}));
 const key=(r:typeof rows[number])=>{const tied=rows.filter(x=>x.wins===r.wins);const rival=tied.length===2?tied.find(x=>x.name!==r.name):null;
 const head=rival?played.filter(m=>[m.home_team_name,m.away_team_name].includes(r.name)&&[m.home_team_name,m.away_team_name].includes(rival.name)).reduce((n,m)=>n+((m.tennis_winner ? (m.tennis_winner==="home"?m.home_team_name:m.away_team_name) : Number(m.home_score)>Number(m.away_score)?m.home_team_name:m.away_team_name)===r.name?1:0),0):0;
 return [r.wins,head,r.scored/Math.max(1,r.scored+r.conceded),r.gamesWon/Math.max(1,r.gamesWon+r.gamesLost)];};
 const cmp=(a:typeof rows[number],b:typeof rows[number])=>{const x=key(a),y=key(b);for(let i=0;i<x.length;i++)if(x[i]!==y[i])return y[i]-x[i];return 0;};
 rows.sort(cmp);return rows.map((r,i)=>({...r,rank:rows.findIndex(x=>cmp(x,r)===0)+1,unresolved:rows.some((x,j)=>i!==j&&cmp(x,r)===0)}));
}
