/* eslint-disable @typescript-eslint/no-require-imports -- SQL/TypeScript parity and authorization regression runner. */
const {PGlite}=require('@electric-sql/pglite');const fs=require('node:fs');const path=require('node:path');const Module=require('node:module');const ts=require('typescript');const assert=require('node:assert/strict');
function load(file,stubs={}){const f=path.resolve(__dirname,'..',file);const m=new Module(f,module);m.filename=f;m.paths=Module._nodeModulePaths(path.dirname(f));const orig=m.require.bind(m);m.require=n=>stubs[n]??orig(n);m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,f);return m.exports;}
const calculations=load('lib/tournament-plan-calculations.ts');
const sources=load('lib/tournament-plan-data.ts',{'@/lib/supabase/server':{},'@/lib/tournament-plan-calculations':calculations});
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
async function main(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
create table tournaments(id uuid primary key,organizer_id uuid,slug text,publication_status text default 'published',tournament_type text default 'public',team_visibility text default 'all',country text,region text,surface text,updated_at timestamptz);
create table tournament_groups(id uuid primary key,tournament_id uuid,code text,name text,sort_order integer);
create table tournament_group_teams(id uuid primary key,group_id uuid,tournament_id uuid,team_name text,slot_number integer);
create table tournament_matches(id uuid primary key,tournament_id uuid,group_id uuid,phase text,match_number integer,home_team_name text,away_team_name text,home_source text,away_source text,home_score integer,away_score integer,status text);
create table tournament_score_events(tournament_id uuid);
create table tournament_result_locks(tournament_id uuid primary key,locked_at timestamptz);
create function private.can_score_tournament(p_uid uuid,p_tid uuid) returns boolean language sql as $$select exists(select 1 from public.tournaments where id=p_tid and organizer_id=p_uid)$$;
insert into auth.users values('${id(1)}'),('${id(2)}');select set_config('test.uid','${id(1)}',false);
insert into tournaments(id,organizer_id,slug) values('${id(90)}','${id(1)}','old');
insert into tournament_matches(id,tournament_id,phase,match_number,status,home_score,away_score) values('${id(91)}','${id(90)}','group',1,'finished',1,0);
`);
await db.exec(fs.readFileSync(path.resolve(__dirname,'../supabase/migrations/20261114065403_tournament_tie_breaks.sql'),'utf8'));
const scalar=async(sql,p=[])=>Object.values((await db.query(sql,p)).rows[0])[0];
assert.equal(await scalar('select ranking_rule from tournaments where slug=\'old\''),'legacy');
await assert.rejects(()=>db.exec("update tournaments set ranking_rule='head_to_head' where slug='old'"),/RANKING_RULE_FROZEN/);
let seq=100;
async function fixture(rule,names,scores){const tid=id(seq++),gid=id(seq++);await db.query('insert into tournaments(id,organizer_id,slug,ranking_rule) values($1,$2,$3,$4)',[tid,id(1),'cup-'+seq,rule]);await db.query("insert into tournament_groups values($1,$2,'A','Group A',1)",[gid,tid]);const teams=[];
for(let i=0;i<names.length;i++){const team={id:id(seq++),group_id:gid,team_name:names[i],slot_number:i+1};teams.push(team);await db.query('insert into tournament_group_teams values($1,$2,$3,$4,$5)',[team.id,gid,tid,team.team_name,team.slot_number]);}
const matches=[];for(let i=0;i<scores.length;i++){const [a,b,hs,as]=scores[i];const m={id:id(seq++),tournament_id:tid,group_id:gid,phase:'group',match_number:i+1,home_team_name:names[a],away_team_name:names[b],home_source:null,away_source:null,home_score:hs,away_score:as,status:hs===null?'scheduled':'finished'};matches.push(m);await db.query('insert into tournament_matches values($1,$2,$3,$4,$5,$6,$7,null,null,$8,$9,$10)',[m.id,tid,gid,'group',i+1,m.home_team_name,m.away_team_name,hs,as,m.status]);}return {tid,gid,group:{id:gid,code:'A',name:'Group A',sort_order:1,teams,ranking_rule:rule},matches};}
const scores=[[0,1,1,0],[0,2,0,2],[0,3,5,0],[1,2,3,0],[1,3,10,0],[2,3,0,1]];
for(const rule of ['head_to_head','overall']){const f=await fixture(rule,['Alpha','Beta','Gamma','Delta'],scores);const sql=(await db.query('select * from private.group_ranking($1)',[f.gid])).rows;const js=calculations.calculateStandings(f.group,f.matches);assert.deepEqual(sql.map(r=>r.name),js.map(r=>r.name));assert.equal(js[0].name,rule==='head_to_head'?'Alpha':'Beta');for(let i=0;i<js.length;i++)for(const key of ['played','wins','draws','losses','scored','conceded','difference','points','rank'])assert.equal(Number(sql[i][key]),js[i][key]);}
const f=await fixture('head_to_head',['Alpha','Beta','Gamma'],[[0,1,1,0],[1,2,1,0],[2,0,1,0]]);
let rows=(await db.query('select * from private.group_ranking($1)',[f.gid])).rows;assert.ok(rows.every(r=>r.unresolved));assert.ok(rows.every(r=>Number(r.rank)===1));
const bracket={id:id(seq++),tournament_id:f.tid,group_id:null,phase:'playoff',match_number:10,home_team_name:null,away_team_name:'Other group winner',home_source:'1. miesto skupiny A',away_source:null,home_score:null,away_score:null,status:'scheduled'};
await db.query("insert into tournament_matches values($1,$2,null,'playoff',10,null,$3,$4,null,null,null,'scheduled')",[bracket.id,f.tid,bracket.away_team_name,bracket.home_source]);
assert.equal(sources.resolveTournamentSources([f.group],[...f.matches,bracket]).at(-1).resolved_home_name,null,'TS never advances tied name');assert.equal(await scalar('select private.resolve_ranked_source($1,$2)',[f.tid,bracket.home_source]),null);
await assert.rejects(()=>db.query("update tournament_matches set status='finished',home_score=1,away_score=0 where id=$1",[bracket.id]),/UNRESOLVED_QUALIFIER/);
await assert.rejects(()=>db.query('insert into tournament_result_locks values($1,now())',[f.tid]),/UNRESOLVED_TIE/);
const version=await scalar('select private.group_ranking_version($1)',[f.gid]);
await db.exec(`select set_config('test.uid','${id(2)}',false)`);await assert.rejects(()=>db.query("select decide_tournament_tie($1,$2,$3,'Public draw')",[f.gid,version,['Gamma','Alpha','Beta']]),/Not authorized/);await db.exec(`select set_config('test.uid','${id(1)}',false)`);
await assert.rejects(()=>db.query("select decide_tournament_tie($1,'old',$2,'Public draw')",[f.gid,['Gamma','Alpha','Beta']]),/RANKING_CHANGED/);
await db.query("select decide_tournament_tie($1,$2,$3,'Public draw in front of coaches')",[f.gid,version,['Gamma','Alpha','Beta']]);
rows=(await db.query('select * from private.group_ranking($1)',[f.gid])).rows;assert.deepEqual(rows.map(r=>r.name),['Gamma','Alpha','Beta']);assert.ok(rows.every(r=>!r.unresolved));assert.equal(await scalar('select private.resolve_ranked_source($1,$2)',[f.tid,bracket.home_source]),'Gamma');
assert.equal(sources.resolveTournamentSources([{...f.group,standings:rows}],[...f.matches,bracket]).at(-1).resolved_home_name,'Gamma');
await db.query("update tournament_matches set status='finished',home_score=1,away_score=0 where id=$1",[bracket.id]);
await assert.rejects(()=>db.query("select decide_tournament_tie($1,$2,$3,'Another public draw')",[f.gid,version,['Alpha','Beta','Gamma']]),/DEPENDENT_RESULTS_EXIST/);
await assert.rejects(()=>db.query('update tournament_matches set home_score=2 where id=$1',[f.matches[0].id]),/DEPENDENT_RESULTS_EXIST/);
const partial=await fixture('overall',['Leader','Beta','Gamma'],[[0,1,1,0],[0,2,1,0],[1,2,0,0]]);const pv=await scalar('select private.group_ranking_version($1)',[partial.gid]);
await assert.rejects(()=>db.query("select decide_tournament_tie($1,$2,$3,'Public draw')",[partial.gid,pv,['Beta','Leader','Gamma']]),/INVALID_TIE_ORDER/);
await db.query("select decide_tournament_tie($1,$2,$3,'Public draw')",[partial.gid,pv,['Leader','Gamma','Beta']]);
await db.query('update tournament_matches set home_score=1,away_score=1 where id=$1',[partial.matches[2].id]);assert.ok((await db.query('select * from private.group_ranking($1)',[partial.gid])).rows.some(r=>r.unresolved),'score correction invalidates prior manual decision');
await db.query("update tournament_matches set status='scheduled',home_score=null,away_score=null where tournament_id=$1",[partial.tid]);await assert.rejects(()=>db.query("update tournaments set ranking_rule='head_to_head' where id=$1",[partial.tid]),/RANKING_RULE_FROZEN/);
await db.exec("select set_config('test.uid','',false)");await assert.rejects(()=>db.query("select decide_tournament_tie($1,$2,$3,'Public draw')",[f.gid,version,['Gamma','Alpha','Beta']]),/Not authenticated/);
assert.equal(await scalar("select has_function_privilege('anon','decide_tournament_tie(uuid,text,text[],text)','execute')"),false);
assert.equal(calculations.groupResultsComplete({...f.group,teams:f.group.teams},[]),false);
const slug=await scalar('select slug from tournaments where id=$1',[f.tid]);
let snapshot=await scalar('select get_tournament_rankings($1)',[slug]);assert.equal(snapshot[f.gid].reason,'Public draw in front of coaches');
await db.query("update tournaments set team_visibility='hidden' where id=$1",[f.tid]);assert.equal(await scalar('select get_tournament_rankings($1)',[slug]),null,'anonymous cannot read hidden tables');
await db.exec(`select set_config('test.uid','${id(1)}',false)`);snapshot=await scalar('select get_tournament_rankings($1)',[slug]);assert.equal(snapshot[f.gid].rows[0].name,'Gamma','owner sees private authoritative decision');
assert.equal(await scalar("select has_table_privilege('authenticated','tournament_tie_decisions','insert')"),false);
await db.close();console.log('PASS: SQL/TS parity for both rules, historical preservation, 2/3-team mini-tables, unresolved advancement/finalization, owner decision, stale guard, tied-only order, downstream protection and permanent rule freeze');}
main().catch(e=>{console.error(e.message, e.detail || "");process.exitCode=1});
