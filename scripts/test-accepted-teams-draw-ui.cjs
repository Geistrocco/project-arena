/* eslint-disable @typescript-eslint/no-require-imports -- Server rendering regression runner. */
const assert=require('node:assert/strict');const fs=require('node:fs');const Module=require('node:module');const path=require('node:path');const ts=require('typescript');const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
async function main(){
 let ctx={version:'v1',capacity:2,participants:[{name:'Alpha',source:'accepted'},{name:'Beta',source:'manual'}],slots:[{id:'a',name:'Old 1',group:'A',slot:1},{id:'b',name:'Old 2',group:'A',slot:2}],has_results:false,locked:false,closed:false,pending:1};
 const file=path.resolve(__dirname,'../app/turnaje/[slug]/rozlosovanie/page.tsx');const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));const original=m.require.bind(m);const stubs={'node:crypto':{randomInt:()=>0},'next/link':{__esModule:true,default:({children,...p})=>React.createElement('a',p,children)},'next/navigation':{redirect:()=>{throw Error('redirect')},notFound:()=>{throw Error('not found')}},'@/lib/supabase/server':{createClient:async()=>({auth:{getClaims:async()=>({data:{claims:{sub:'owner'}}})},rpc:async()=>({data:ctx})})},'@/components/tournament-draw-confirm':{TournamentDrawConfirm:({names})=>React.createElement('form',{'data-confirm':true},names.join(' / '))}};
 m.require=n=>stubs[n]??original(n);m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,file);
 const render=async()=>renderToStaticMarkup(await m.exports.default({params:Promise.resolve({slug:'cup'})}));let html=await render();assert.ok(html.includes('Beta / Alpha'));assert.ok(html.includes('Prijatá prihláška'));assert.ok(html.includes('Ručne pridaný'));assert.ok(html.includes('data-confirm'));
 ctx={...ctx,has_results:true};html=await render();assert.ok(html.includes('už má výsledky'));assert.ok(!html.includes('data-confirm'));
 ctx={...ctx,has_results:false,capacity:4};html=await render();assert.ok(html.includes('Počet účastníkov'));assert.ok(!html.includes('data-confirm'));
 ctx={...ctx,locked:true};html=await render();assert.ok(html.includes('uzamknuté'));assert.ok(!html.includes('data-confirm'));
 console.log('PASS: randomized preview, participant sources, pending count and blocked confirmation for results/locks/incomplete roster');
}
main().catch(e=>{console.error(e);process.exitCode=1});
