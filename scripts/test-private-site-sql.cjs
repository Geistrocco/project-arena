/* eslint-disable @typescript-eslint/no-require-imports -- Verify private testing enrollment and Data API enforcement. */
const {PGlite}=require('@electric-sql/pglite'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
async function main(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role;create role authenticator;create schema private;create schema auth;create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
insert into auth.users values('${id(1)}'),('${id(2)}'),('${id(3)}');`);
await db.exec(fs.readFileSync(path.resolve(__dirname,'../supabase/migrations/20261115090813_private_site_testing.sql'),'utf8'));
await db.exec(fs.readFileSync(path.resolve(__dirname,'../supabase/migrations/20261115091409_private_site_hook_invoker.sql'),'utf8'));
const scalar=async(q,p=[])=>Object.values((await db.query(q,p)).rows[0])[0];
assert.equal(Number(await scalar('select count(*) from private.site_testers')),3,'all existing users enrolled, regardless of role');
await db.exec("select set_config('request.path','/tournaments',false)");await db.query('select enforce_private_site()');assert.deepEqual(await scalar('select get_site_access()'),{restricted:false,allowed:true},'staged rollout remains open');
await db.exec('update private.site_access_settings set restricted=true');
assert.deepEqual(await scalar('select get_site_access()'),{restricted:true,allowed:false});
await assert.rejects(()=>db.query('select enforce_private_site()'),/PRIVATE_TESTING_ONLY/);
for(const path of ['/rpc/get_tournament_application_counts','/rpc/get_tournament_incidents','/rpc/graphql','/clubs','/club_teams','/']){await db.query("select set_config('request.path',$1,false)",[path]);await assert.rejects(()=>db.query('select enforce_private_site()'),/PRIVATE_TESTING_ONLY/);}
for(const path of ['/rpc/get_site_access','rpc/get_site_access']){await db.query("select set_config('request.path',$1,false)",[path]);await db.query('select enforce_private_site()');}
await db.exec("select set_config('request.path','/tournaments',false)");
for(let i=1;i<=3;i++){await db.query("select set_config('test.uid',$1,false)",[id(i)]);assert.equal((await scalar('select get_site_access()')).allowed,true);await db.query('select enforce_private_site()');}
await db.exec(`insert into auth.users values('${id(4)}');select set_config('test.uid','${id(4)}',false)`);assert.equal((await scalar('select get_site_access()')).allowed,false,'new account is not automatically enrolled');await assert.rejects(()=>db.query('select enforce_private_site()'),/PRIVATE_TESTING_ONLY/);
await db.exec("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)");await db.query('select enforce_private_site()');await db.exec("select set_config('request.jwt.claims','',false)");
await db.exec("set role authenticated");await assert.rejects(()=>db.query('select enforce_private_site()'),/PRIVATE_TESTING_ONLY/);await assert.rejects(()=>db.query('select * from private.site_testers'),/permission denied/);await assert.rejects(()=>db.query("insert into private.site_testers(user_id) values($1)",[id(4)]),/permission denied/);await db.exec('reset role');
assert.equal(await scalar("select exists(select 1 from pg_roles r,unnest(r.rolconfig) c where r.rolname='authenticator' and c='pgrst.db_pre_request=public.enforce_private_site')"),true);
await db.exec('update private.site_access_settings set restricted=false');await db.query('select enforce_private_site()');
await db.close();console.log('PASS: all existing accounts, anonymous/new-account denial, RPC/table/GraphQL guard, private enrollment, staged activation and reopening');}
main().catch(e=>{console.error(e);process.exitCode=1});
