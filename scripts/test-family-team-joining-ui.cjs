/* eslint-disable @typescript-eslint/no-require-imports -- Joining and authentication rendering regressions. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),React=require('react');const {renderToStaticMarkup:render}=require('react-dom/server');
function load(file,stubs={}){const filename=path.resolve(__dirname,'..',file);const m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));const orig=m.require.bind(m);m.require=n=>Object.hasOwn(stubs,n)?stubs[n]:orig(n);m._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);return m.exports;}

async function main(){
 const helper=load('lib/family-team-joining.ts'),authPaths=load('lib/auth-return-path.ts'),token='a'.repeat(64),back='/pozvanka/'+token;
 for(const value of ['https://evil.example','//evil.example','/\\evil.example','/admin','/pozvanka/'+token+'?next=https://evil.example',null])assert.equal(authPaths.authReturnPath(value),'/ucet');assert.equal(authPaths.authReturnPath(back),back);
 const link={__esModule:true,default:({children,...props})=>{delete props.prefetch;return React.createElement('a',props,children)}};
 const components=load('components/family-team-joining.tsx',{'next/link':link,'@/app/pripojit-sa/actions':{familyTeamAction:async()=>({})},'@/lib/family-team-joining':helper});
 const players=[{id:'son-a',name:'Syn A',birth_date:'2014-01-01'},{id:'son-b',name:'Syn B',birth_date:'2016-01-01'}],teams=[{id:'team',name:'Senec',category:'U12',season:'2026/27'}];
 let html=render(React.createElement(components.ParentTeamJoin,{players,teams}));assert.ok(html.includes('Syn A · ročník 2014'));assert.ok(html.includes('Syn B · ročník 2016'));assert.match(html,/<option[^>]*selected=""[^>]*>Vyber správne dieťa<\/option>/);assert.ok(html.includes('name="confirmed"'));assert.ok(!html.includes('checked=""'));assert.ok(html.includes('až po schválení'));
 html=render(React.createElement(components.ParentTeamJoin,{players,teams,token,selectedPlayer:'son-b'}));assert.ok(html.includes('value="son-b" selected=""'));assert.ok(html.includes('Potvrdzujem, že Syn B'));assert.ok(html.includes('U12 · sezóna 2026/27'));
 const AuthForm=load('components/auth-form.tsx',{'next/link':link,'next/navigation':{useRouter:()=>({})},'@/lib/supabase/client':{createClient:()=>({})},'@/lib/auth-errors':{authErrorMessage:()=>''},'@/lib/auth-return-path':authPaths}).AuthForm;
 html=render(React.createElement(AuthForm,{mode:'login',returnTo:back}));assert.ok(html.includes('/registracia?next=%2Fpozvanka%2F'+token));assert.ok(html.includes('/zabudnute-heslo?next=%2Fpozvanka%2F'+token));
 let info={team_id:'team',name:'Senec',category:'U12',season:'2026/27',expires_at:'2026-12-01'},signed=false;
 const client={auth:{getClaims:async()=>({data:signed?{claims:{sub:'parent'}}:null})},rpc:async(name)=>({data:name==='get_team_join_link'?info:{players,requests:[],staff_requests:[]},error:null})};
 const page=load('app/pozvanka/[token]/page.tsx',{'next/link':link,'next/navigation':{notFound:()=>{throw Error('404')}},'@/lib/supabase/server':{createClient:async()=>client},'@/components/family-team-joining':components,'@/lib/family-team-joining':helper}).default;
 const view=async()=>render(await page({params:Promise.resolve({token})}));
 html=await view();assert.ok(html.includes('/prihlasenie?next=%2Fpozvanka%2F'+token));assert.ok(!html.includes('Syn A'));
 signed=true;html=await view();assert.ok(html.includes('Syn A'));assert.ok(html.includes('Syn B'));
 info={...info,accepted:true,player_name:'Syn B',active:true};html=await view();assert.ok(html.includes('Pozvanie bolo prijaté'));assert.ok(html.includes('Syn B'));assert.ok(!html.includes('name="playerId"'));
 info=null;html=await view();assert.ok(html.includes('Pozvánka už nie je platná'));assert.ok(!html.includes('Syn B'));
 console.log('PASS: explicit sibling and team selection, confirmation, safe authentication return, anonymous privacy and accepted/invalid invitation states');
}main().catch(e=>{console.error(e);process.exitCode=1});
