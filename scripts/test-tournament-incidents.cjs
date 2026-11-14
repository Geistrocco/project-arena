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
await db.exec("create table tournament_result_lock_events(tournament_id uuid,actor_user_id uuid,action text,reason text); alter table tournament_result_locks add column updated_at timestamptz; alter table tournaments add column sport text default 'Futbal'; alter table tournament_matches add column updated_at timestamptz default now(), add column score_updated_by uuid; alter table tournament_score_events add column match_id uuid, add column actor_user_id uuid, add column previous_home_score integer, add column previous_away_score integer, add column previous_status text, add column new_home_score integer, add column new_away_score integer;");
await db.exec(fs.readFileSync(path.resolve(__dirname,'../supabase/migrations/20261114091346_tournament_incidents.sql'),'utf8'));
const scalar=async(sql,p=[])=>Object.values((await db.query(sql,p)).rows[0])[0];
assert.equal(await scalar('select ranking_rule from tournaments where slug=\'old\''),'legacy');
await assert.rejects(()=>db.exec("update tournaments set ranking_rule='head_to_head' where slug='old'"),/RANKING_RULE_FROZEN/);
let seq=100;
async function fixture(rule,names,scores,withdrawalRule="keep"){const tid=id(seq++),gid=id(seq++);await db.query('insert into tournaments(id,organizer_id,slug,ranking_rule,withdrawal_rule) values($1,$2,$3,$4,$5)',[tid,id(1),'cup-'+seq,rule,withdrawalRule]);await db.query("insert into tournament_groups values($1,$2,'A','Group A',1)",[gid,tid]);const teams=[];
for(let i=0;i<names.length;i++){const team={id:id(seq++),group_id:gid,team_name:names[i],slot_number:i+1};teams.push(team);await db.query('insert into tournament_group_teams values($1,$2,$3,$4,$5)',[team.id,gid,tid,team.team_name,team.slot_number]);}
const matches=[];for(let i=0;i<scores.length;i++){const [a,b,hs,as]=scores[i];const m={id:id(seq++),tournament_id:tid,group_id:gid,phase:'group',match_number:i+1,home_team_name:names[a],away_team_name:names[b],home_source:null,away_source:null,home_score:hs,away_score:as,status:hs===null?'scheduled':'finished'};matches.push(m);await db.query('insert into tournament_matches values($1,$2,$3,$4,$5,$6,$7,null,null,$8,$9,$10)',[m.id,tid,gid,'group',i+1,m.home_team_name,m.away_team_name,hs,as,m.status]);}return {tid,gid,group:{id:gid,code:'A',name:'Group A',sort_order:1,teams,ranking_rule:rule},matches};}

const f=await fixture('head_to_head',['Alpha','Beta','Gamma'],[[0,1,2,0],[0,2,null,null],[1,2,null,null]]);
const bracketId=id(seq++),nextId=id(seq++);
await db.query("insert into tournament_matches(id,tournament_id,phase,match_number,home_source,away_team_name,status) values($1,$2,'playoff',10,'3. miesto skupiny A','Guest','scheduled')",[bracketId,f.tid]);
await db.query("insert into tournament_matches(id,tournament_id,phase,match_number,home_source,away_team_name,status) values($1,$2,'playoff',11,'Víťaz zápasu 10','Visitor','scheduled')",[nextId,f.tid]);
const slug=await scalar('select slug from tournaments where id=$1',[f.tid]);
async function preview(action,target,winner=null,reason='Organizator zaznamenal nenastupenie timu') {return scalar('select preview_tournament_incident($1,$2,$3,$4,$5)',[slug,action,target,winner,reason]);}
async function confirm(p){return db.query('select confirm_tournament_incident($1,$2,$3,$4,$5,$6,true)',[slug,p.version,p.action,p.target,p.winner,p.reason]);}
const v0=await scalar('select private.incident_version($1)',[f.tid]);
let p=await preview('forfeit',f.matches[1].id,'away');assert.equal(p.changes.length,1);assert.equal(p.changes[0].away_score,3);assert.equal(await scalar('select private.incident_version($1)',[f.tid]),v0,'preview is fully rolled back');assert.equal(Number(await scalar('select count(*) from tournament_incident_events')),0);
await db.exec(`select set_config('test.uid','${id(2)}',false)`);await assert.rejects(()=>confirm(p),/NOT_ALLOWED/);await db.exec(`select set_config('test.uid','${id(1)}',false)`);
await confirm(p);await assert.rejects(()=>confirm(p),/INCIDENT_CHANGED/);
assert.equal(await scalar('select outcome from tournament_matches where id=$1',[f.matches[1].id]),'forfeit');
await assert.rejects(()=>db.query('select update_tournament_match_score($1,4,0)',[f.matches[1].id]),/SPECIAL_RESULT/);
await confirm(await preview('restore',f.matches[1].id));assert.equal(await scalar('select status from tournament_matches where id=$1',[f.matches[1].id]),'scheduled');
p=await preview('withdraw','Alpha');assert.equal(p.changes.length,1);assert.equal(Number(await scalar('select count(*) from tournament_withdrawals')),0);await confirm(p);
let rows=(await db.query('select * from private.group_ranking($1)',[f.gid])).rows;assert.equal(rows.at(-1).name,'Alpha');assert.equal(rows.at(-1).points,3,'played result preserved');
await assert.rejects(()=>db.query('select update_tournament_match_score($1,4,0)',[f.matches[0].id]),/WITHDRAWN_TEAM/);
const undo=await preview('reinstate','Alpha');await confirm(undo);assert.equal(Number(await scalar('select count(*) from tournament_withdrawals where tournament_id=$1',[f.tid])),0);assert.equal(await scalar('select status from tournament_matches where id=$1',[f.matches[1].id]),'scheduled','safe withdrawal reversal restores original schedule');await confirm(await preview('withdraw','Alpha'));
assert.equal(await scalar('select home_score from tournament_matches where id=$1',[f.matches[1].id]),0);assert.equal(await scalar('select away_score from tournament_matches where id=$1',[f.matches[1].id]),3);
await db.query('select update_tournament_match_score($1,1,0)',[f.matches[2].id]);
assert.equal(await scalar('select outcome from tournament_matches where id=$1',[bracketId]),'forfeit','late qualifier settles automatically');
assert.equal(await scalar('select private.resolve_ranked_source($1,$2)',[f.tid,'Víťaz zápasu 10']),'Guest');
const sqlMatches=(await db.query('select * from tournament_matches where tournament_id=$1 order by match_number',[f.tid])).rows;
const sqlRows=(await db.query('select * from private.group_ranking($1)',[f.gid])).rows;
const resolved=sources.resolveTournamentSources([{...f.group,standings:sqlRows}],sqlMatches);assert.equal(resolved.at(-1).resolved_home_name,'Guest','SQL and client agree on forfeit qualifier');
await db.query('select update_tournament_match_score($1,1,0)',[nextId]);
await assert.rejects(()=>db.query('select update_tournament_match_score($1,2,0)',[f.matches[2].id]),/DEPENDENT_RESULTS_EXIST/);
await assert.rejects(()=>db.query('delete from tournament_group_teams where group_id=$1',[f.gid]),/WITHDRAWAL_ROSTER_LOCKED/);
await assert.rejects(()=>preview('forfeit',f.matches[0].id,'home'),/WITHDRAWN_TEAM|DEPENDENT_RESULTS_EXIST/);
const other=await fixture('overall',['One','Two','Three'],[[0,1,null,null],[0,2,null,null],[1,2,null,null]]);
const voidId=id(seq++),byeId=id(seq++);
await db.query("insert into tournament_matches(id,tournament_id,phase,match_number,home_source,away_source,status) values($1,$2,'playoff',10,'2. miesto skupiny A','3. miesto skupiny A','scheduled')",[voidId,other.tid]);
await db.query("insert into tournament_matches(id,tournament_id,phase,match_number,home_source,away_team_name,status) values($1,$2,'playoff',11,'Víťaz zápasu 10','Visitor','scheduled')",[byeId,other.tid]);
const oslug=await scalar('select slug from tournaments where id=$1',[other.tid]);await db.query("update tournaments set withdrawal_rule='annul' where id=$1",[other.tid]);
// A preview must not permanently freeze settings even when it simulates finished outcomes.
let op=await scalar("select preview_tournament_incident($1,'withdraw','One',null,'Team has withdrawn')",[oslug]);assert.equal(Number(await scalar('select count(*) from tournament_ranking_frozen where tournament_id=$1',[other.tid])),0);
await db.query("update tournaments set forfeit_score=5 where id=$1",[other.tid]);await assert.rejects(()=>db.query('select confirm_tournament_incident($1,$2,$3,$4,$5,$6,true)',[oslug,op.version,op.action,op.target,op.winner,op.reason]),/INCIDENT_CHANGED/);
op=await scalar("select preview_tournament_incident($1,'withdraw','One',null,'Team has withdrawn')",[oslug]);await db.query('select confirm_tournament_incident($1,$2,$3,$4,$5,$6,true)',[oslug,op.version,op.action,op.target,op.winner,op.reason]);
rows=(await db.query('select * from private.group_ranking($1)',[other.gid])).rows;assert.ok(rows.every(r=>Number(r.played)===0));assert.equal(await scalar('select private.group_results_complete($1)',[other.gid]),false);
await assert.rejects(()=>db.query("update tournaments set withdrawal_rule='keep' where id=$1",[other.tid]),/INCIDENT_RULES_FROZEN/);

// Two withdrawn teams produce an excluded match, not a fake 0:0 draw.
op=await scalar("select preview_tournament_incident($1,'withdraw','Two',null,'Team has withdrawn as well')",[oslug]);await db.query('select confirm_tournament_incident($1,$2,$3,$4,$5,$6,true)',[oslug,op.version,op.action,op.target,op.winner,op.reason]);
rows=(await db.query('select * from private.group_ranking($1)',[other.gid])).rows;assert.equal(rows[0].name,'Three');assert.ok(rows.every(r=>Number(r.points)===0));assert.ok(rows.every(r=>!r.unresolved));
assert.equal(await scalar('select outcome from tournament_matches where id=$1',[voidId]),'void');
assert.equal(await scalar('select outcome from tournament_matches where id=$1',[byeId]),'forfeit');assert.equal(await scalar('select away_score from tournament_matches where id=$1',[byeId]),5);
assert.equal(await scalar('select private.resolve_ranked_source($1,$2)',[other.tid,'Víťaz zápasu 11']),'Visitor','absence propagates as bye without fake winner');
const voidGames=(await db.query('select * from tournament_matches where tournament_id=$1 order by match_number',[other.tid])).rows;const voidStandings=(await db.query('select * from private.group_ranking($1)',[other.gid])).rows;const virtualNext={...voidGames.at(-1),id:'virtual',match_number:12,home_source:'Víťaz zápasu 11',away_team_name:'Last opponent',status:'scheduled',home_score:null,away_score:null,outcome:'played'};assert.equal(sources.resolveTournamentSources([{...other.group,standings:voidStandings}],[...voidGames,virtualNext]).at(-1).resolved_home_name,'Visitor','client follows the same bye winner as SQL');
assert.equal(await scalar('select private.group_results_complete($1)',[other.gid]),true);
await assert.rejects(()=>scalar("select preview_tournament_incident($1,'reinstate','One',null,'Correction of decision')",[oslug]),/WITHDRAWAL_CHANGED/);
const snapshot=await scalar('select get_tournament_incidents($1)',[oslug]);assert.ok(snapshot.events.every(e=>!Object.hasOwn(e,'actor_id')&&!Object.hasOwn(e,'before_matches')));assert.ok(snapshot.events.some(e=>e.changes.length));
await db.query('select private.set_tournament_result_lock($1,true,null)',[oslug]);assert.ok(await scalar('select locked_at is not null from tournament_result_locks where tournament_id=$1',[other.tid]));
await assert.rejects(()=>scalar("select preview_tournament_incident($1,'forfeit',$2,'home','Correction of decision')",[oslug,other.matches[2].id]),/RESULTS_LOCKED/);
assert.equal(await scalar("select has_function_privilege('anon','confirm_tournament_incident(text,text,text,text,text,text,boolean)','execute')"),false);
assert.equal(await scalar("select has_table_privilege('authenticated','tournament_withdrawals','insert')"),false);
await db.query("update tournaments set team_visibility='hidden' where id=$1",[other.tid]);await db.exec("select set_config('test.uid','',false)");assert.equal(await scalar('select get_tournament_incidents($1)',[oslug]),null);
for (const fixtureCase of [f,other]) {
 const dbGames=(await db.query('select * from tournament_matches where tournament_id=$1 order by match_number',[fixtureCase.tid])).rows;
 const withdrawn=(await db.query('select team_name from tournament_withdrawals where tournament_id=$1',[fixtureCase.tid])).rows.map(w=>w.team_name);
 const actual=(await db.query('select * from private.group_ranking($1)',[fixtureCase.gid])).rows;
 const local=calculations.calculateStandings({...fixtureCase.group,teams:fixtureCase.group.teams.map(t=>({...t,withdrawn:withdrawn.includes(t.team_name)}))},dbGames);
 assert.equal(calculations.groupResultsComplete(fixtureCase.group,dbGames),await scalar('select private.group_results_complete($1)',[fixtureCase.gid]),'SQL/client completeness parity including void games');assert.deepEqual(local.map(r=>r.name),actual.map(r=>r.name),'SQL/client order parity after incidents');for(let i=0;i<local.length;i++)for(const key of ['played','wins','draws','losses','points','scored','conceded','difference','rank'])assert.equal(Number(actual[i][key]),local[i][key]);
}
await db.exec(`select set_config('test.uid','${id(1)}',false)`);
const annulled=await fixture('head_to_head',['Red','Blue','Green'],[[0,1,2,1],[0,2,null,null],[1,2,null,null]],'annul');
const aslug=await scalar('select slug from tournaments where id=$1',[annulled.tid]);
const ap=await scalar("select preview_tournament_incident($1,'withdraw','Red',null,'Club withdrew before next match')",[aslug]);
await db.query('select confirm_tournament_incident($1,$2,$3,$4,$5,$6,true)',[aslug,ap.version,ap.action,ap.target,ap.winner,ap.reason]);
const original=(await db.query('select home_score,away_score,outcome from tournament_matches where id=$1',[annulled.matches[0].id])).rows[0];assert.deepEqual(original,{home_score:2,away_score:1,outcome:'void'},'annulment retains actual played score');
assert.ok((await db.query('select * from private.group_ranking($1)',[annulled.gid])).rows.every(r=>Number(r.points)===0&&Number(r.played)===0));
await db.close();console.log('PASS: rollback-only preview, stale confirmation, owner authorization, forfeit/restore, keep/annul withdrawal, no fake points, permanent settings freeze and private access');}
main().catch(e=>{console.error(e.message,e.detail||'',e.where||'');process.exitCode=1});
