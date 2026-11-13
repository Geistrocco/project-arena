/* eslint-disable @typescript-eslint/no-require-imports -- Standalone SQL integration runner. */
const { PGlite } = require('@electric-sql/pglite');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const uuid = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
async function main() {
 const db = new PGlite();
 await db.exec(`create role anon; create role authenticated; create schema auth; create schema private;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
 create function private.is_platform_admin(id uuid) returns boolean language sql as $$ select false $$;
 create table club_teams(id uuid primary key,name text);
 create table team_memberships(team_id uuid,user_id uuid,role text);
 create table player_profiles(id uuid primary key,full_name text,status text default 'active');
 create table team_players(team_id uuid,player_id uuid,status text default 'active',primary key(team_id,player_id));
 create table player_guardians(player_id uuid,guardian_user_id uuid);
 `);
 const migration = name => readFileSync(resolve(__dirname,'../supabase/migrations',name),'utf8');
 for (const name of ['20260909203439_add_team_nominations.sql','20260916143045_team_calendar_and_attendance.sql','20260916170244_share_full_team_nomination_status.sql','20261112194620_training_in_app_notifications.sql','20261112210519_training_series_management.sql','20261113165701_weekly_training_attendance.sql']) await db.exec(migration(name));
 await db.exec(`insert into auth.users values('${uuid(1)}'),('${uuid(2)}'),('${uuid(3)}');
 insert into club_teams values('${uuid(10)}','U12'),('${uuid(11)}','Other');
 insert into team_memberships values('${uuid(10)}','${uuid(1)}','coach');
 insert into player_profiles values('${uuid(20)}','Player A','active'),('${uuid(21)}','Player B','active'),('${uuid(22)}','Inactive','inactive');
 insert into team_players values('${uuid(10)}','${uuid(20)}','active'),('${uuid(10)}','${uuid(21)}','active'),('${uuid(10)}','${uuid(22)}','active');
 insert into player_guardians values('${uuid(20)}','${uuid(2)}'),('${uuid(21)}','${uuid(2)}');
 select set_config('test.uid','${uuid(1)}',false);`);
 const scalar = async (sql, params=[]) => Object.values((await db.query(sql,params)).rows[0])[0];
 // Boundary tests include both DST weekends and a year boundary.
 for(const [day,expected] of [['2026-03-30 17:00+02','2026-03-28T23:00:00.000Z'],['2026-10-26 17:00+01','2026-10-24T22:00:00.000Z'],['2027-01-03 17:00+01','2026-12-26T23:00:00.000Z']])
  assert.equal(new Date(await scalar('select private.training_release_at($1::timestamptz)',[day])).toISOString(),expected);
 const upcoming = await scalar(`select create_team_nomination($1,'Training','training',(now()+interval '2 hours') at time zone 'Europe/Bratislava','Pitch','',array[]::uuid[])`,[uuid(10)]);
 assert.equal(await scalar('select count(*)::int from team_nomination_players where nomination_id=$1',[upcoming]),2,'all active profiles automatically nominated');
 const match = await scalar(`select create_team_nomination($1,'Match','match',(now()+interval '2 hours') at time zone 'Europe/Bratislava','Pitch','',array[$2::uuid])`,[uuid(10),uuid(20)]);
 assert.equal(await scalar('select count(*)::int from team_nomination_players where nomination_id=$1',[match]),1,'match nomination remains selected');
 const far = await scalar(`select create_team_nomination($1,'Far training','training',(now()+interval '30 days') at time zone 'Europe/Bratislava','Pitch','',array[]::uuid[])`,[uuid(10)]);
 await db.exec(`select set_config('test.uid','${uuid(2)}',false)`);
 await assert.rejects(()=>db.query('select respond_to_team_nomination($1,$2,\'accepted\')',[far,uuid(20)]),/window closed/);
 await db.query('select respond_to_team_nomination($1,$2,\'accepted\')',[upcoming,uuid(20)]);
 let notices=(await db.query('select * from get_my_training_notifications_v2()')).rows;
 assert.equal(notices.filter(n=>n.kind==='weekly').length,1,'one digest for two children');
 assert.ok(!notices.some(n=>n.nomination_id===far),'no far future popup');
 const digest=notices.find(n=>n.kind==='weekly');
 await db.query('select dismiss_training_notification($1)',[digest.id]);
 assert.equal((await db.query('select * from get_my_training_notifications_v2()')).rows.filter(n=>n.kind==='weekly').length,0,'dismissed across requests');
 await db.exec(`select set_config('test.uid','${uuid(1)}',false)`);
 await assert.rejects(()=>db.query('select record_training_attendance($1,$2,\'present\')',[upcoming,uuid(20)]),/Training not found/);
 const added = await scalar(`select create_team_nomination($1,'Added training','training',(now()+interval '3 hours') at time zone 'Europe/Bratislava','Pitch','',array[]::uuid[])`,[uuid(10)]);
 await db.exec(`select set_config('test.uid','${uuid(2)}',false)`);
 assert.ok((await db.query('select * from get_my_training_notifications_v2()')).rows.some(n=>n.nomination_id===added && n.kind==='changed'),'late addition immediate');
 // Ended training cases. Seed historical responses directly, never mutate real data.
 for (const [i,response,override,status] of [[0,'accepted',null,'open'],[1,'declined',null,'open'],[2,'pending',null,'open'],[3,'accepted','absent','open'],[4,'declined','present','open'],[5,'accepted',null,'cancelled']]) {
  await db.query(`insert into team_nominations(id,team_id,created_by,title,event_type,starts_at,ends_at,status) values($1,$2,$3,'Past training','training',now()-interval '3 hours',now()-interval '2 hours',$4)`,[uuid(100+i),uuid(10),uuid(1),status]);
  await db.query('insert into team_nomination_players(nomination_id,player_id,response,attendance_status) values($1,$2,$3,$4)',[uuid(100+i),uuid(20),response,override]);
 }
 await assert.rejects(()=>db.query('select respond_to_team_nomination($1,$2,\'accepted\')',[uuid(100),uuid(20)]),/window closed/);
 await assert.rejects(()=>db.query(`select * from get_team_training_stats_v2($1,current_date-2,current_date+40)`,[uuid(10)]),/Not authorized/);
 await db.exec(`select set_config('test.uid','${uuid(1)}',false)`);
 const stats=(await db.query('select * from get_team_training_stats_v2($1,current_date-2,current_date+40)',[uuid(10)])).rows;
 const p=stats.find(p=>p.player_id===uuid(20));
 assert.equal(Number(p.training_count),5); assert.equal(Number(p.present_count),2);assert.equal(Number(p.excused_count),1);assert.equal(Number(p.unexcused_count),1);assert.equal(Number(p.unconfirmed_count),1);assert.equal(Number(p.attendance_rate),40);
 await db.query('select record_training_attendance($1,$2,\'unmarked\')',[uuid(103),uuid(20)]);
 assert.equal(await scalar('select attendance_status from team_nomination_players where nomination_id=$1',[uuid(103)]),null,'reset restores parental basis');
 await assert.rejects(()=>db.query('select record_training_attendance($1,$2,\'present\')',[uuid(105),uuid(20)]),/Training not found/);
 await db.exec(`select set_config('test.uid','${uuid(3)}',false)`);
 assert.equal((await db.query('select * from get_my_training_notifications_v2()')).rows.length,0,'other user sees nothing');
 await db.exec(`select set_config('test.uid','',false)`);
 await assert.rejects(()=>db.query('select * from get_my_training_notifications_v2()'),/Not authenticated/);
 for(const fn of ['get_team_training_stats_v2(uuid,date,date)','get_my_training_notifications_v2()']) assert.equal(await scalar('select has_function_privilege(\'anon\',$1,\'execute\')',[fn]),false);
 await db.close();
 console.log('PASS: weekly release/DST, auto roster, digest dedup/late addition, attendance precedence, future/cancelled exclusion, freeze, permissions, sport regression');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
