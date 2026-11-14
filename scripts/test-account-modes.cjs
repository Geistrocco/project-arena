/* eslint-disable @typescript-eslint/no-require-imports -- Server-rendering regression runner. */
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const Module=require('node:module');const ts=require('typescript');const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
function load(file,stubs={}){const filename=path.resolve(__dirname,'..',file);const m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));const orig=m.require.bind(m);m.require=n=>Object.hasOwn(stubs,n)?stubs[n]:orig(n);m._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);return m.exports;}
async function main(){
 const {resolveAccountMode}=load('lib/account-mode.ts');assert.equal(resolveAccountMode('parent',true),'parent');assert.equal(resolveAccountMode('coach',false),'coach');assert.equal(resolveAccountMode(undefined,true),'coach');assert.equal(resolveAccountMode(undefined,false),'parent');assert.equal(resolveAccountMode('admin',false),'parent');
 const actions=new Proxy({}, {get:()=>async()=>{}});
 const client={auth:{getClaims:async()=>({data:{claims:{sub:'user',email:'parent@example.com'}}})},rpc:async()=>({data:[]}),from:()=>{const q={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,maybeSingle:async()=>({data:null}),then:resolve=>Promise.resolve({data:[],count:0}).then(resolve)};return q;}};
 let mode='parent';const stubs={'next/link':{__esModule:true,default:({children,...props})=>React.createElement('a',props,children)},'next/navigation':{redirect:()=>{throw Error('redirect')},useRouter:()=>({push:()=>{},refresh:()=>{}})},'@/lib/supabase/server':{createClient:async()=>client},'@/app/ucet/actions':actions,'@/lib/account-context':{getAccountContext:async()=>({mode})}};
 stubs['@/components/family-team-joining']={StaffJoinRequests:()=>null,TeamJoinLinkManager:()=>null};stubs['@/lib/family-team-joining']=load('lib/family-team-joining.ts');
 stubs['@/components/player-request-alert']={PlayerRequestAlert:()=>null};
 stubs['@/components/team-access-picker']={TeamAccessPicker:()=>null};
 const page=load('app/ucet/page.tsx',stubs).default;
 const render=async()=>renderToStaticMarkup(await page({searchParams:Promise.resolve({})}));
 let html=await render();assert.ok(html.includes('Pridať hráča'));assert.ok(html.includes('Tréningy mojich detí'));assert.ok(!html.includes('Požiadať o správu tímu'));assert.ok(!html.includes('Odoslať tím na schválenie'));assert.ok(!html.includes('Vytvoriť turnaj'));assert.ok(html.includes('Nastavenia účtu'));
 mode='coach';html=await render();assert.ok(html.includes('Pridať hráča'));assert.ok(html.includes('Vytvorte profil svojho dieťaťa'));assert.ok(html.includes('Požiadať o správu tímu'));assert.ok(html.includes('Vytvoriť turnaj'));assert.ok(!html.includes('>Administrátor klubu</option>'));
 const auth=load('components/auth-form.tsx',{'next/link':stubs['next/link'],'next/navigation':stubs['next/navigation'],'@/lib/supabase/client':{createClient:()=>({})},'@/lib/auth-errors':{authErrorMessage:()=>''},'@/lib/auth-return-path':load('lib/auth-return-path.ts')}).AuthForm;
 html=renderToStaticMarkup(React.createElement(auth,{mode:'signup'}));assert.ok(html.includes('name="accountMode"'));assert.ok(html.includes('value="parent"'));assert.ok(html.includes('value="coach"'));assert.ok(!html.includes('checked=""'));assert.ok(html.includes('pridania vlastného dieťaťa'));
 console.log('PASS: parent UI hides staff tools, coach retains own-child creation, explicit signup modes, legacy fallback and preferences');
}
main().catch(e=>{console.error(e);process.exitCode=1});
