/* eslint-disable @typescript-eslint/no-require-imports -- Search matching and database regression runner. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');const {PGlite}=require('@electric-sql/pglite');
function load(file){const filename=path.resolve(__dirname,'..',file),m=new Module(filename,module);m._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,filename);return m.exports;}
async function main(){
 const {matchesClubSearch:match,normalizeClubSearch:normalize}=load('lib/club-search.ts');
 for(const q of ['hor','HOR','horné','horne','HoRnE','  dubove  hor ','dubové horné'])assert.ok(match(q,'ŠK Horné Dubové','Trnava'),q);
 assert.ok(match('hor','ŠK Horná Dolná'));assert.ok(match('sen u12','MŠK Senec','U12'));assert.ok(match('u12 sen','MŠK Senec','U12'));assert.ok(!match('hor sen','ŠK Horné Dubové','Trnava'));assert.ok(!match('%','Senec'));assert.equal(normalize('ľščťžýáíéôäňďŕĺůřěöü'),'lsctzyaieoandrlureou');
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema private;
 create function private.join_verified_user() returns uuid language plpgsql as $$begin if current_setting('test.verified',true) is distinct from 'yes' then raise exception 'EMAIL_NOT_VERIFIED';end if;return '00000000-0000-0000-0000-000000000001'::uuid;end$$;
 create table clubs(id text primary key,name text,city text,status text default 'active');create table club_teams(id uuid primary key,club_id text references clubs(id),name text,category text,season text,status text default 'active');create table team_memberships(team_id uuid,user_id uuid,role text);
 insert into clubs values('a','ŠK Horná Dolná','Horná Dolná','active'),('b','ŠK Horné Dubové','Horné Dubové','active'),('c','MŠK Senec','Senec','active'),('d','Skrytý klub','Horné Dubové','inactive');
 insert into club_teams select ('00000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,c.id,c.name,v.category,v.season,'active' from (values(1,'a','U12','2026/27'),(2,'b','U12','2026/27'),(3,'b','U10','2026/27'),(4,'c','U12','2026/27'),(5,'d','U12','2026/27')) v(i,club,category,season) join clubs c on c.id=v.club;
 insert into club_teams values('00000000-0000-0000-0000-000000000006','b','Neaktívny tím','U15','2026/27','inactive');`);
 await db.exec(fs.readFileSync('supabase/migrations/20261114163417_live_club_search.sql','utf8'));
 const search=async q=>(await db.query('select public.search_joinable_teams($1) as result',[q])).rows[0].result;
 await assert.rejects(()=>search('hor'),/EMAIL_NOT_VERIFIED/);await db.exec("select set_config('test.verified','yes',false)");
 assert.equal((await search('hor')).length,3);assert.equal((await search('HOR')).length,3);assert.equal((await search('dubove hor')).length,2);assert.equal((await search('horné dubové')).length,2);assert.equal((await search('Horne\u0301 Dubove\u0301')).length,2);assert.equal((await search('u12 dub')).length,1);assert.equal((await search('hor sen')).length,0);
 for(const q of [null,'',' ','h','x'.repeat(101),'%_'])assert.deepEqual(await search(q),[]);
 assert.equal((await search('dolna'))[0].category,'U12');assert.equal((await search('sen u12'))[0].has_staff,false);
 assert.equal((await db.query("select has_function_privilege('anon','public.search_joinable_teams(text)','execute') as allowed")).rows[0].allowed,false);
 assert.equal((await db.query("select has_function_privilege('authenticated','private.normalize_club_search(text)','execute') as allowed")).rows[0].allowed,false);
 await db.exec("insert into club_teams select gen_random_uuid(),'b','Dubové '||i,'U12','2026/27','active' from generate_series(1,45) i");assert.equal((await search('dub')).length,40);
 }finally{await db.close();}
 console.log('PASS: fragments, accents/NFD, unordered words, category/city, inactive exclusion, literal wildcards, length/limit and search permissions');
}main().catch(e=>{console.error(e);process.exitCode=1});
