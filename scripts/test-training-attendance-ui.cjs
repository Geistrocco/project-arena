/* eslint-disable @typescript-eslint/no-require-imports -- Standalone server rendering regression runner. */
const assert=require('node:assert/strict');
const fs=require('node:fs'); const path=require('node:path'); const Module=require('node:module'); const ts=require('typescript');
const {renderToStaticMarkup}=require('react-dom/server');
function load(relative,stubs={}) {
 const filename=path.resolve(__dirname,'..',relative); const m=new Module(filename,module); m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));
 const original=m.require.bind(m);m.require=name=>Object.hasOwn(stubs,name)?stubs[name]:original(name);
 m._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,filename); return m.exports;
}
async function main(){
 const helpers=load('lib/training-attendance.ts');
 let event={nomination_id:'00000000-0000-0000-0000-000000000001',team_id:'team',team_name:'U12',title:'Training',event_type:'training',starts_at:new Date(Date.now()-10800000).toISOString(),ends_at:new Date(Date.now()-7200000).toISOString(),nomination_status:'open',player_id:'player',player_name:'Player',is_nominated:true,response:'accepted',attendance_status:'unexcused',can_manage:true,can_respond:true};
 const noop=async()=>{};
 const stubs={
 'next/link':{__esModule:true,default:({children,...props})=>require('react').createElement('a',props,children)},
 'next/navigation':{notFound:()=>{throw Error('not found')},redirect:()=>{throw Error('redirect')}},
 '@/lib/supabase/server':{createClient:async()=>({auth:{getClaims:async()=>({data:{claims:{sub:'coach'}}})},rpc:async name=>({data:name==='get_nomination_roster_v3'?[event]:name==='get_training_management'?{editable:false}:name==='get_training_publication_info'?{release_at:new Date(Date.parse(event.starts_at)-86400000).toISOString()}:[]})})},
 '@/components/team-chat':{TeamChat:()=>null},'@/components/training-management':{TrainingManagement:()=>null},
 '@/app/timy/[teamId]/nominacie/actions':{recordTrainingAttendance:noop,respondToNomination:noop,setNominationStream:noop},
 '@/lib/training-attendance':helpers};
 const page=load('app/nominacie/[nominationId]/page.tsx',stubs).default;
 const render=async()=>renderToStaticMarkup(await page({params:Promise.resolve({nominationId:event.nomination_id}),searchParams:Promise.resolve({})}));
 let html=await render();assert.ok(html.includes('Neospravedlnená neúčasť'));assert.ok(html.includes('oprava trénera'));assert.ok(html.includes('Opraviť výnimku'));assert.ok(!html.includes('name="response"'),'past parent plans frozen');
 event={...event,response:'pending',attendance_status:null};html=await render();assert.ok(html.includes('Nepotvrdené'));assert.ok(!html.includes('Bol na tréningu'));
 event={...event,starts_at:new Date(Date.now()+30*86400000).toISOString(),ends_at:new Date(Date.now()+30*86400000+7200000).toISOString()};
 html=await render();assert.ok(html.includes('Potvrdzovanie účasti sa otvorí'));assert.ok(!html.includes('name="response"'));assert.ok(!html.includes('Opraviť výnimku'));
 event={...event,nomination_status:'cancelled'};html=await render();assert.ok(html.includes('Tréning je zrušený'));assert.ok(!html.includes('Opraviť výnimku'));assert.ok(!html.includes('Dochádzka:'));
 console.log('PASS: release boundary UI/DST, coach exception precedence, unconfirmed display, future response gate, cancelled controls');
}
main().catch(e=>{console.error(e);process.exitCode=1});
