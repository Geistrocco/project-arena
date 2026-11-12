/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS test runner. */
// Run with @electric-sql/pglite installed in the test environment (NODE_PATH).
const { PGlite } = require('@electric-sql/pglite');
const { readFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const { resolve } = require('node:path');

async function main() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema private;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table public.club_teams(id uuid primary key, name text);
    create table public.team_nominations(id uuid primary key, team_id uuid, title text, event_type text,
      starts_at timestamptz, ends_at timestamptz, location text, note text, status text default 'open');
    create table public.team_nomination_players(nomination_id uuid, player_id uuid, response text default 'pending');
    create table public.player_guardians(player_id uuid, guardian_user_id uuid);
    create table public.team_players(player_id uuid, team_id uuid, status text default 'active');
  `);
  await db.exec(readFileSync(resolve(__dirname, '../supabase/migrations/20261112194620_training_in_app_notifications.sql'), 'utf8'));
  const parent = '00000000-0000-0000-0000-000000000001';
  const stranger = '00000000-0000-0000-0000-000000000002';
  const team = '00000000-0000-0000-0000-000000000003';
  const event = '00000000-0000-0000-0000-000000000004';
  const p1 = '00000000-0000-0000-0000-000000000005';
  const p2 = '00000000-0000-0000-0000-000000000006';
  await db.exec(`
    insert into auth.users values ('${parent}'), ('${stranger}');
    insert into club_teams values ('${team}', 'Test tím');
    insert into team_nominations(id, team_id, title, event_type, starts_at)
      values ('${event}', '${team}', 'Tréning', 'training', now() + interval '50 minutes');
    insert into team_nomination_players values ('${event}', '${p1}', 'accepted'), ('${event}', '${p2}', 'pending');
    insert into player_guardians values ('${p1}', '${parent}'), ('${p2}', '${parent}');
    insert into team_players(player_id, team_id) values ('${p1}', '${team}'), ('${p2}', '${team}');
    select set_config('test.uid', '${parent}', false);
  `);
  const notices = async () => (await db.query('select * from get_my_training_notifications()')).rows;
  let rows = await notices();
  assert.equal(rows.length, 1, 'siblings get one reminder');
  assert.equal(rows[0].kind, 'reminder');
  assert.equal((await notices()).length, 1, 'polling is idempotent');
  await db.exec(`select set_config('test.uid', '${stranger}', false); select dismiss_training_notification('${rows[0].id}');`);
  assert.equal((await notices()).length, 0, 'another parent cannot read notices');
  await db.exec(`select set_config('test.uid', '${parent}', false);`);
  assert.equal((await notices()).length, 1, 'another parent cannot dismiss notice');
  await db.exec(`select dismiss_training_notification('${rows[0].id}');`);
  assert.equal((await notices()).length, 0, 'acknowledgement persists');
  await db.exec(`update team_nominations set location = 'Nové ihrisko' where id = '${event}';`);
  rows = await notices();
  assert.equal(rows.length, 1, 'change suppresses duplicate reminder');
  assert.equal(rows[0].kind, 'changed');
  assert.equal(rows[0].location, 'Nové ihrisko');
  await db.exec(`update team_nominations set starts_at = now() + interval '3 hours' where id = '${event}';`);
  rows = await notices();
  assert.equal(rows.length, 1, 'old reminder does not survive reschedule');
  assert.equal(rows[0].kind, 'changed');
  await db.exec(`update team_nominations set status = 'cancelled' where id = '${event}';`);
  rows = await notices();
  assert.equal(rows.length, 1, 'only latest cancellation is shown');
  assert.equal(rows[0].kind, 'cancelled');
  await db.exec(`update team_players set status = 'inactive';`);
  assert.equal((await notices()).length, 0, 'former membership loses access');
  await db.exec(`update team_players set status = 'active'; update team_nomination_players set response = 'declined';
    delete from training_notifications; update team_nominations set status = 'open', starts_at = now() + interval '40 minutes';
    delete from training_notifications;`);
  assert.equal((await notices()).length, 0, 'declined attendance has no reminder');
  await db.exec(`select set_config('test.uid', '', false);`);
  await assert.rejects(notices, /Not authenticated/);
  const acl = (await db.query(`select has_function_privilege('anon', 'public.get_my_training_notifications()', 'execute') as allowed`)).rows;
  assert.equal(acl[0].allowed, false, 'anonymous execution revoked');
  await db.close();
  console.log('PASS: training notifications — reminders, deduplication, changes, cancellation, acknowledgement and authorization');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
