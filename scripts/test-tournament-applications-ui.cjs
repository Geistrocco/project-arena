/* eslint-disable @typescript-eslint/no-require-imports -- Server rendering regression runner. */
const fs=require('node:fs');const path=require('node:path');const Module=require('node:module');const ts=require('typescript');const assert=require('node:assert/strict');const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
function load(file,stubs={}){const f=path.resolve(__dirname,'..',file);const m=new Module(f,module);m.filename=f;m.paths=Module._nodeModulePaths(path.dirname(f));const original=m.require.bind(m);m.require=n=>stubs[n]??original(n);m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);return m.exports;}
async function main(){
let context={user:{id:'coach',user_metadata:{full_name:'Coach'}},tournament:{organizer_id:'organizer',category:'U12',publication_status:'published',tournament_type:'public'},teams:[{id:'a',name:'Team A',category:'U12',season:'2026/27'},{id:'b',name:'Wrong category',category:'U10',season:'2026/27'}],applications:[{id:'application',team_id:'c',team_name:'Submitted team',status:'pending',contact_name:'Coach',contact_email:'private@example.test',phone:'0900',note:'Private note'}],error:false};
const link={__esModule:true,default:({children,...p})=>React.createElement('a',p,children)};
const forms=load('components/tournament-application-forms.tsx',{'@/app/turnaje/[slug]/application-actions':{submitApplication:async()=>({success:true}),decideApplication:async()=>({success:true})}});
const component=load('components/tournament-applications.tsx',{'next/link':link,'@/lib/tournament-applications':{getApplicationContext:async()=>context},'./tournament-application-forms':forms}).TournamentApplications;
const render=async admin=>renderToStaticMarkup(await component({slug:'cup',admin}));
let html=await render(false);assert.ok(html.includes('Team A'));assert.ok(!html.includes('Wrong category'));assert.ok(html.includes('Čaká na schválenie'));assert.ok(!html.includes('private@example.test'));assert.ok(!html.includes('bola uložená'));
context={...context,user:{id:'organizer',user_metadata:{}}};html=await render(true);assert.ok(html.includes('private@example.test'));assert.ok(html.includes('Prijať'));assert.ok(html.includes('Odmietnuť'));assert.ok(html.includes('Rozpis sa schválením nemení'));
context={...context,user:null};html=await render(false);assert.ok(html.includes('Prihlásiť sa ako tréner'));assert.ok(!html.includes('private@example.test'));
context={...context,error:true,user:{id:'coach',user_metadata:{}}};html=await render(false);assert.ok(html.includes('nepodarilo načítať'));assert.ok(!html.includes('Odoslať prihlášku'));
console.log('PASS: suitable team selection, real action forms without premature success, private contacts, decisions, sign-in and load failure');
}
main().catch(e=>{console.error(e);process.exitCode=1});
