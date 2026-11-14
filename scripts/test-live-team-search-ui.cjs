/* eslint-disable @typescript-eslint/no-require-imports -- Live search interaction and stale-response regression runner. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const rendererPath=require.resolve('react-test-renderer'),toolRequire=Module.createRequire(rendererPath),React=toolRequire('react'),{act,create}=require(rendererPath);global.IS_REACT_ACT_ENVIRONMENT=true;
function load(file,stubs={}){const filename=path.resolve(__dirname,'..',file),m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));const orig=m.require.bind(m);m.require=n=>n==='react'?React:n==='react/jsx-runtime'?toolRequire(n):Object.hasOwn(stubs,n)?stubs[n]:orig(n);m._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);return m.exports;}
const wait=()=>new Promise(resolve=>setTimeout(resolve,210));
async function main(){
 const search=load('lib/club-search.ts'),family=load('lib/family-team-joining.ts'),requests=[];
 const LiveTeamSearch=load('components/live-team-search.tsx',{'@/lib/club-search':search,'@/lib/family-team-joining':family,'@/lib/supabase/client':{createClient:()=>({rpc:(_name,args)=>({abortSignal:signal=>new Promise(resolve=>requests.push({query:args.p_query,signal,resolve}))})})},'@/components/family-team-joining':{ParentTeamJoin:props=>React.createElement('form',{'data-team':props.selectedTeam,'data-child':props.selectedPlayer})}}).LiveTeamSearch;
 let view;await act(async()=>{view=create(React.createElement(LiveTeamSearch,{players:[],selectedPlayer:'son-b'}));});
 const type=async value=>act(async()=>{view.root.findByType('input').props.onChange({target:{value}});});
 await type('h');await act(wait);assert.equal(requests.length,0);
 await type('hor');await act(wait);assert.equal(requests.length,1);
 await type('dub');await act(wait);assert.equal(requests.length,2);assert.ok(requests[0].signal.aborted);
 const team={id:'b',name:'ŠK Horné Dubové',category:'U12',season:'2026/27',city:'Horné Dubové'};
 await act(async()=>{requests[1].resolve({data:[team],error:null});});assert.ok(JSON.stringify(view.toJSON()).includes('Horné Dubové'));
 await act(async()=>{requests[0].resolve({data:[{...team,id:'a',name:'STARÁ ODPOVEĎ'}],error:null});});assert.ok(!JSON.stringify(view.toJSON()).includes('STARÁ ODPOVEĎ'));
 assert.equal(view.root.findAllByType('form').length,0,'no team is selected automatically');await act(async()=>{view.root.findByType('button').props.onClick();});assert.equal(view.root.findByType('form').props['data-team'],'b');assert.equal(view.root.findByType('form').props['data-child'],'son-b');
 await type('s');assert.equal(view.root.findAllByType('form').length,0);assert.equal(view.root.findAllByType('li').length,0,'changing search hides old selectable results and confirmation');
 await type('  HORNÉ  ');await act(wait);assert.equal(requests[2].query,'horne');await act(async()=>{requests[2].resolve({data:null,error:{message:'EMAIL_NOT_VERIFIED'}});});assert.equal(view.root.findAllByProps({role:'alert'}).length,1);
 await type('zz');await act(wait);await act(async()=>{requests[3].resolve({data:[],error:null});});assert.ok(JSON.stringify(view.toJSON()).includes('Nenašli sa aktívne tímy'));
 await act(async()=>view.unmount());
 const Picker=load('components/team-access-picker.tsx',{'@/lib/club-search':search,'@/lib/family-team-joining':family}).TeamAccessPicker;
 await act(async()=>{view=create(React.createElement(Picker,{teams:[team,{...team,id:'c',name:'MŠK Senec',city:'Senec'}]}));});
 await act(async()=>view.root.findByType('input').props.onChange({target:{value:'dubove hor'}}));assert.equal(view.root.findAllByType('option').length,2);await act(async()=>view.root.findByType('select').props.onChange({target:{value:'b'}}));assert.equal(view.root.findByType('select').props.value,'b');await act(async()=>view.root.findByType('input').props.onChange({target:{value:'sen'}}));assert.equal(view.root.findByType('select').props.value,'');assert.ok(view.root.findByType('select').props.required);await act(async()=>view.unmount());
 console.log('PASS: live results, debounce, accents, stale response/abort protection, explicit team selection, child preservation, cleared confirmation, errors/empty state and coach filtering');
}main().catch(e=>{console.error(e);process.exitCode=1});
