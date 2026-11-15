/* eslint-disable @typescript-eslint/no-require-imports -- Club suggestion interactions without external requests. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');const rendererPath=require.resolve('react-test-renderer'),toolRequire=Module.createRequire(rendererPath),React=toolRequire('react'),{act,create}=require(rendererPath);global.IS_REACT_ACT_ENVIRONMENT=true;
function load(file,stubs={}){const filename=path.resolve(__dirname,'..',file),m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));const orig=m.require.bind(m);m.require=n=>n==='react'?React:n==='react/jsx-runtime'?toolRequire(n):Object.hasOwn(stubs,n)?stubs[n]:orig(n);m._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);return m.exports;}
async function main(){
 const match=load('lib/club-search.ts'),icons=new Proxy({}, {get:()=>()=>null});const Picker=load('components/club-picker.tsx',{'@/lib/club-search':match,'@/components/icons':icons}).ClubPicker;

 const base={shortName:'',sport:'Futbal',country:'Slovensko',city:'',logoPlaceholder:'FK'};
 const squad=(id,name,category,season='2026/27')=>({id,name,category,season});
 const clubs=[{...base,id:'senec',name:'MŠK Senec',teams:[squad('a','MŠK Senec U12 A','U12'),squad('b','MŠK Senec U12 B','U12 B'),squad('c','MŠK Senec U13 A','U13')]},{...base,id:'none',name:'Horná bez kategórií'},...Array.from({length:51},(_,i)=>({...base,id:'hor-'+i,name:'ŠK Horná Dolná '+i,teams:[squad('hor-'+i,'Horná U12 '+i,'U12')]})),{...base,id:'hockey',sport:'Hokej',name:'MŠK Senec hokej',teams:[squad('h','MŠK Senec U12 hokej','U12')]}];
 function Harness({initial=[]}){const [selected,setSelected]=React.useState(initial);return React.createElement(Picker,{clubs,sport:'Futbal',selected,onChange:setSelected});}
 let view;await act(async()=>{view=create(React.createElement(Harness));});
 const input=()=>view.root.findByProps({type:'search'}),type=async value=>act(async()=>input().props.onChange({target:{value}})),json=()=>JSON.stringify(view.toJSON());
 await type('h');assert.equal(view.root.findAllByType('ul').length,0);
 await type('hor');assert.equal(view.root.findByType('ul').findAllByType('li').length,40);
 const more=view.root.findAllByType('button').find(b=>Array.isArray(b.props.children)&&b.props.children[0]==='Zobraziť ďalšie družstvá (');await act(async()=>more.props.onClick());assert.equal(view.root.findByType('ul').findAllByType('li').length,52);
 assert.ok(view.root.findByType('ul').findAllByType('button').some(b=>b.props.disabled),'clubs without categories cannot be invited');
 await type('senec');assert.equal(view.root.findByType('ul').findAllByType('li').length,3,'sport filter excludes hockey');assert.ok(json().includes('2026/27'));
 await act(async()=>view.root.findByType('ul').findAllByType('button')[0].props.onClick());
 assert.equal(view.root.findByProps({name:'clubIds'}).props.value,'team:a');
 assert.equal(view.root.findByType('ul').findAllByType('li').length,2,'same club still offers its other squads');
 await act(async()=>view.root.findByType('ul').findAllByType('button')[0].props.onClick());
 assert.deepEqual(view.root.findAllByProps({name:'clubIds'}).map(i=>i.props.value),['team:a','team:b']);
 await type('B U12 senec');assert.equal(view.root.findAllByType('ul').length,0);assert.ok(!json().includes('+ Pridať'));
 await type('HORNA DOL');assert.equal(view.root.findByType('ul').findAllByType('li').length,40);
 await act(async()=>view.root.findByProps({'aria-label':'Odstrániť MŠK Senec U12 A'}).props.onClick());assert.equal(view.root.findAllByProps({name:'clubIds'}).length,1);
 await act(async()=>view.update(React.createElement(Harness,{key:'old',initial:['senec','team:missing']})));
 assert.deepEqual(view.root.findAllByProps({name:'clubIds'}).map(i=>i.props.value),['senec','team:missing']);assert.ok(json().includes('Starší výber bez kategórie'));assert.ok(json().includes('Nedostupné družstvo'));
 let prevented=false;input().props.onKeyDown({key:'Enter',preventDefault:()=>{prevented=true;}});assert.ok(prevented);
 await act(async()=>view.unmount());console.log('PASS: category/season/A-B selection, multiple squads per club, live search, sport, paging, disabled club-only entries and retained legacy/unavailable selections');
}main().catch(e=>{console.error(e);process.exitCode=1});
