/* eslint-disable @typescript-eslint/no-require-imports -- Standalone SQL integration runner. */
const {PGlite}=require('@electric-sql/pglite');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
async function main(){const db=new PGlite();await db.exec(`
create role anon;create role authenticated;create schema auth;create schema private;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create table clubs(id text primary key,sport text);
create table club_teams(id uuid primary key,club_id text,name text,category text,status text default 'active');
create table team_memberships(team_id uuid,user_id uuid,role text);
create table tournaments(id uuid primary key,organizer_id uuid,slug text,sport text,category text,capacity integer,registered_count integer default 0,publication_status text default 'published',tournament_type text default 'public',team_visibility text default 'all',event_date date);
create table tournament_invited_teams(tournament_id uuid,team_name text);
create table tournament_result_locks(tournament_id uuid,locked_at timestamptz);
grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
grant select on tournaments,team_memberships to authenticated;
`);
await db.exec(fs.readFileSync(path.resolve(__dirname,'../supabase/migrations/20261114053300_tournament_applications.sql'),'utf8'));
await db.exec(`insert into auth.users values('${id(1)}','coach@example.test',now()),('${id(2)}','organizer@example.test',now()),('${id(3)}','other@example.test',now());
insert into clubs values('club','Futbal');
insert into club_teams values('${id(10)}','club','Team A','U12','active'),('${id(11)}','club','Team B','U12','active'),('${id(12)}','club','Team C','U10','active');
insert into team_memberships values('${id(10)}','${id(1)}','coach'),('${id(11)}','${id(1)}','coach'),('${id(12)}','${id(1)}','coach');
insert into tournaments(id,organizer_id,slug,sport,category,capacity,event_date) values('${id(20)}','${id(2)}','cup','Futbal','U12',1,current_date+30),('${id(21)}','${id(2)}','private','Futbal','U12',2,current_date+30);
update tournaments set publication_status='private' where slug='private';
select set_config('test.uid','${id(1)}',false);`);
const scalar=async(sql,p=[])=>Object.values((await db.query(sql,p)).rows[0])[0];
const submit=team=>scalar("select submit_tournament_application('cup',$1,'Coach','0900123456','Note')",[id(team)]);
const first=await submit(10);const second=await submit(11);
await assert.rejects(()=>submit(10),/APPLICATION_EXISTS/);await assert.rejects(()=>submit(12),/CATEGORY_MISMATCH/);
await assert.rejects(()=>db.query("select decide_tournament_application($1,'accepted','')",[first]),/Not authorized/);
await db.exec(`select set_config('test.uid','${id(3)}',false)`);await assert.rejects(()=>submit(10),/Not authorized/);
await db.exec(`select set_config('test.uid','${id(2)}',false)`);
await db.query("select decide_tournament_application($1,'accepted','Welcome')",[first]);
assert.equal((await scalar("select get_tournament_application_summary('cup')")).reserved,1);
await assert.rejects(()=>db.query("select decide_tournament_application($1,'accepted','')",[second]),/CAPACITY_FULL/);
await assert.rejects(()=>db.query("select decide_tournament_application($1,'accepted','')",[first]),/ALREADY_DECIDED/);
await db.query("select decide_tournament_application($1,'rejected','Full')",[second]);
await assert.rejects(()=>db.exec("insert into tournament_invited_teams values('"+id(20)+"','Extra')"),/CAPACITY_FULL/);
await db.exec("insert into tournament_invited_teams values('"+id(20)+"','Team A')");assert.equal((await scalar("select get_tournament_application_summary('cup')")).reserved,1,'manual accepted name is not counted twice');
await assert.rejects(()=>db.exec("update tournaments set capacity=0 where slug='cup'"),/CAPACITY_FULL/);
// Actual RLS read checks, no privileged-role shortcuts.
await db.exec(`select set_config('test.uid','${id(3)}',false);set role authenticated;`);
assert.equal(Number(await scalar('select count(*) from tournament_applications')),0,'stranger cannot read contacts');await db.exec('reset role');
await db.exec(`select set_config('test.uid','${id(1)}',false);set role authenticated;`);assert.equal(Number(await scalar('select count(*) from tournament_applications')),2,'applicant sees statuses');await db.exec('reset role');
await db.exec("select set_config('test.uid','',false)");assert.equal(await scalar("select get_tournament_application_summary('private')"),null,'private summary not public');
await assert.rejects(()=>submit(10),/Not authenticated/);
const summary=await scalar("select get_tournament_application_summary('cup')");assert.deepEqual(summary.accepted,['Team A']);assert.ok(!JSON.stringify(summary).includes('example.test'));
assert.equal(await scalar("select has_function_privilege('anon','submit_tournament_application(text,uuid,text,text,text)','execute')"),false);
await db.close();console.log('PASS: persistent applications, authorization/RLS/privacy, category, duplicate, capacity, idempotence, rejection, manual reservations and public summary');}
main().catch(e=>{console.error(e);process.exitCode=1});
