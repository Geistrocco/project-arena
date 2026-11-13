/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS integration runner. */
// Install @electric-sql/pglite in the test environment and expose via NODE_PATH.
const { PGlite } = require('@electric-sql/pglite');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const uuid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
async function main() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create schema auth; create schema private;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create function private.is_platform_admin(p_id uuid) returns boolean language sql as $$ select false $$;
    create table club_teams(id uuid primary key, name text);
    create table team_memberships(team_id uuid, user_id uuid, role text);
    create table team_nominations(id uuid primary key, team_id uuid, title text, event_type text,
      starts_at timestamptz, ends_at timestamptz, location text, note text, status text default 'open', series_id uuid, updated_at timestamptz);
    create table team_nomination_players(nomination_id uuid, player_id uuid, response text default 'pending',
      attendance_status text, decline_reason text, responded_by uuid, responded_at timestamptz);
    create table player_guardians(player_id uuid, guardian_user_id uuid);
    create table team_players(player_id uuid, team_id uuid, status text default 'active');
    create function get_nomination_roster_v3(p_id uuid) returns table(player_id uuid) language plpgsql set search_path = public as $$
    begin
      if not exists(select 1 from team_nominations n join team_memberships m on m.team_id=n.team_id where n.id=p_id and m.user_id=auth.uid())
      and not exists(select 1 from team_nomination_players np join player_guardians pg on pg.player_id=np.player_id where np.nomination_id=p_id and pg.guardian_user_id=auth.uid()) then raise exception 'Not authorized'; end if;
      return query select np.player_id from team_nomination_players np where np.nomination_id=p_id;
    end $$;
  `);
  const migration = name => readFileSync(resolve(__dirname, '../supabase/migrations', name), 'utf8');
  await db.exec(migration('20261112194620_training_in_app_notifications.sql'));
  await db.exec(migration('20261112210519_training_series_management.sql'));
  await db.exec(`insert into auth.users values ('${uuid(1)}'), ('${uuid(2)}');
    insert into club_teams values ('${uuid(3)}', 'Tím');
    insert into team_memberships values ('${uuid(3)}','${uuid(1)}','coach');
    insert into player_guardians values ('${uuid(4)}','${uuid(2)}');
    insert into team_players(player_id,team_id) values ('${uuid(4)}','${uuid(3)}');
    select set_config('test.uid','${uuid(1)}',false);`);
  for (let i = 0; i < 4; i++) {
    await db.query(`insert into team_nominations values ($1,$2,'Tréning','training',date_trunc('minute',now())+($3 || ' days')::interval,
      date_trunc('minute',now())+($3 || ' days')::interval+interval '90 minutes','Ihrisko','Pôvodné pokyny','open',$4,now(),null)`, [uuid(10+i),uuid(3),String(i===0?-7:i*7),uuid(5)]);
    await db.query(`insert into team_nomination_players(nomination_id,player_id,response) values ($1,$2,'accepted')`,[uuid(10+i),uuid(4)]);
  }
  await db.exec(`update team_nomination_players set attendance_status='present' where nomination_id='${uuid(10)}';`);
  const info = async id => (await db.query('select get_training_management($1) as info',[uuid(id)])).rows[0].info;
  const event = async id => (await db.query(`select *, to_char(starts_at at time zone 'Europe/Bratislava','YYYY-MM-DD"T"HH24:MI') as local_start,
    to_char(ends_at at time zone 'Europe/Bratislava','YYYY-MM-DD"T"HH24:MI') as local_end from team_nominations where id=$1`,[uuid(id)])).rows[0];
  const manage = async (id,scope,op,overrides={}) => {
    const n=await event(id), metadata=await info(id);
    const args={title:n.title,start:n.local_start,end:n.local_end,location:n.location,note:n.note,reason:'Počasie',version:metadata.version,...overrides};
    return (await db.query('select manage_team_training($1,$2,$3,$4,$5,$6::timestamp,$7::timestamp,$8,$9,$10) as count',
      [uuid(id),scope,op,args.version,args.title,args.start,args.end,args.location,args.note,args.reason])).rows[0].count;
  };
  const metadata=await info(12);
  assert.equal(metadata.all_count,3); assert.equal(metadata.following_count,2);
  const oldVersion=metadata.version;
  assert.equal(await manage(12,'following','edit',{note:'Nové pokyny'}),2);
  assert.equal((await event(11)).note,'Pôvodné pokyny');
  assert.equal((await event(13)).note,'Nové pokyny');
  assert.equal((await db.query(`select response from team_nomination_players where nomination_id=$1`,[uuid(12)])).rows[0].response,'accepted','note preserves response');
  await assert.rejects(()=>manage(12,'one','edit',{version:oldVersion}),/Training changed/);
  const original=await event(12);
  const shifted=(await db.query(`select to_char($1::timestamp + interval '1 day 1 hour','YYYY-MM-DD"T"HH24:MI') as start,
    to_char($2::timestamp + interval '1 day 1 hour','YYYY-MM-DD"T"HH24:MI') as "end"`,[original.local_start,original.local_end])).rows[0];
  assert.equal(await manage(12,'all','edit',{start:shifted.start,end:shifted.end,location:'Hala'}),3);
  assert.equal((await event(11)).location,'Hala');
  assert.equal((await event(10)).location,'Ihrisko','history preserved');
  assert.equal((await db.query(`select response from team_nomination_players where nomination_id=$1`,[uuid(11)])).rows[0].response,'pending');
  await db.exec(`update team_nomination_players set attendance_status='present' where nomination_id='${uuid(13)}';`);
  await assert.rejects(()=>manage(12,'following','cancel'),/Attendance already recorded/);
  assert.equal((await event(12)).status,'open','batch rolled back');
  await db.exec(`update team_nomination_players set attendance_status=null where nomination_id='${uuid(13)}';`);
  await assert.rejects(()=>manage(12,'one','cancel',{reason:''}),/Cancellation reason required/);
  assert.equal(await manage(12,'one','cancel'),1);
  assert.equal((await event(12)).cancellation_reason,'Počasie');
  assert.equal((await event(12)).note,'Nové pokyny','original instructions preserved');
  assert.equal((await event(13)).status,'open','one affects only one');
  const unchanged=await event(11);
  const tomorrow=(await db.query(`select to_char(date_trunc('minute',now()) at time zone 'Europe/Bratislava' + interval '1 day','YYYY-MM-DD"T"HH24:MI') as start,
    to_char(date_trunc('minute',now()) at time zone 'Europe/Bratislava' + interval '1 day 90 minutes','YYYY-MM-DD"T"HH24:MI') as "end"`)).rows[0];
  await assert.rejects(()=>manage(13,'all','edit',tomorrow),/Cannot move training into past/);
  assert.equal(new Date((await event(11)).starts_at).getTime(),new Date(unchanged.starts_at).getTime(),'invalid bulk move is atomic');
  for (const [id,date] of [[21,'2030-03-24'],[22,'2030-03-31']]) await db.query(`insert into team_nominations
    values ($1,$2,'Letný čas','training',($3 || ' 17:00')::timestamp at time zone 'Europe/Bratislava',
    ($3 || ' 18:30')::timestamp at time zone 'Europe/Bratislava','Ihrisko','Pokyny','open',$4,now(),null)`,[uuid(id),uuid(3),date,uuid(30)]);
  await manage(21,'all','edit',{start:'2030-03-24T18:00',end:'2030-03-24T19:30'});
  assert.equal((await event(22)).local_start,'2030-03-31T18:00','weekly local time survives DST change');
  await assert.rejects(()=>manage(12,'one','edit'),/Training is not editable/);
  await assert.rejects(()=>manage(10,'one','cancel'),/Training is not editable/);
  await db.exec(`select set_config('test.uid','${uuid(2)}',false);`);
  await assert.rejects(()=>info(11),/Not authorized/);
  assert.equal((await db.query('select get_training_cancellation_reason($1) as reason',[uuid(12)])).rows[0].reason,'Počasie');
  const alerts=(await db.query('select * from get_my_training_notifications()')).rows;
  assert.ok(alerts.some(n=>n.nomination_id===uuid(12)&&n.kind==='cancelled'),'parent cancellation alert');
  assert.equal((await db.query(`select has_function_privilege('anon','public.get_training_management(uuid)','execute') as allowed`)).rows[0].allowed,false);
  await db.exec(`select set_config('test.uid','',false);`);
  await assert.rejects(()=>info(11),/Not authenticated/);
  await db.close();
  console.log('PASS: scopes, history, recorded attendance, reconfirmation, stale edits, cancellation reason, parent alerts and authorization');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
