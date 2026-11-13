/* eslint-disable @typescript-eslint/no-require-imports -- Server rendering regression. */
const assert=require('node:assert/strict'); const fs=require('node:fs'); const path=require('node:path'); const Module=require('node:module'); const ts=require('typescript'); const React=require('react'); const {renderToStaticMarkup}=require('react-dom/server');
async function main(){
 const base={nomination_id:'pending',player_id:'childA',player_name:'Adam',team_name:'U12',title:'Tréning',starts_at:'2030-03-25T16:00:00Z',release_at:'2030-03-24T00:00:00Z',location:'Ihrisko',response:'pending',version:'v1',can_respond:true,changed:false};
 const rows=[base,{...base,nomination_id:'declined',response:'declined'},{...base,nomination_id:'changed',changed:true},{...base,player_id:'childB',player_name:'Boris',nomination_id:'future',can_respond:false}];
 const filename=path.resolve(__dirname,'../app/treningy/page.tsx');const m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));const original=m.require.bind(m);
 const stubs={'next/link':{__esModule:true,default:({children,...p})=>React.createElement('a',p,children)},'next/navigation':{redirect:()=>{throw Error('redirect')}},'@/lib/supabase/server':{createClient:async()=>({auth:{getClaims:async()=>({data:{claims:{sub:'parent'}}})},rpc:async()=>({data:rows})})},'./actions':{respondToPlan:async()=>{}}};m.require=n=>stubs[n]??original(n);m._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,filename);
 const html=renderToStaticMarkup(await m.exports.default({searchParams:Promise.resolve({tyzden:'2030-03-25'})}));
 assert.ok(html.includes('Adam')&&html.includes('Boris'));assert.ok(html.includes('Potvrdiť všetky nezodpovedané tréningy (1)'));assert.ok(html.includes('potvrď tento termín samostatne'));assert.ok(html.includes('Potvrdzovanie sa otvorí'));
 const values=[...html.matchAll(/name="items" value="([^"]*)"/g)].map(x=>JSON.parse(x[1].replaceAll('&quot;','"').replaceAll('&amp;','&')));
 assert.equal(values[0].length,1);assert.equal(values[0][0].nomination_id,'pending');assert.ok(!values.some(a=>a.some(e=>e.nomination_id==='future')));
 console.log('PASS: sibling grouping, bulk excludes declined/changed/unpublished, inline response forms');
}
main().catch(e=>{console.error(e);process.exitCode=1});
