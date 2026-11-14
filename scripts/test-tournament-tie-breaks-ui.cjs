/* eslint-disable @typescript-eslint/no-require-imports -- Rendering regression runner. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
function load(file,stubs={}) {
 const full=path.resolve(file),mod=new Module(full,module);mod.filename=full;mod.paths=Module._nodeModulePaths(path.dirname(full));
 const original=mod.require.bind(mod);mod.require=n=>stubs[n]??original(n);
 mod._compile(ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,full);return mod.exports;
}
const calc=load('lib/tournament-plan-calculations.ts');
const noop=async()=>{};
const {TournamentTieDecisions}=load('components/tournament-tie-decisions.tsx',{'@/components/tennis-tournament-plan':{TennisTournamentPlan:()=>null},'@/lib/tournament-plan-calculations':calc,'@/app/turnaje/[slug]/tie-actions':{decideTie:noop}});
const {TournamentPlan}=load('components/tournament-plan.tsx',{'@/components/tennis-tournament-plan':{TennisTournamentPlan:()=>null},'@/lib/tournament-plan-calculations':calc,'@/lib/tournament-incidents':load('lib/tournament-incidents.ts'),'@/lib/tournament-ranking':load('lib/tournament-ranking.ts'),'@/app/turnaje/[slug]/actions':{saveMatchScore:noop,setMatchStream:noop,swapGroupTeams:noop}});
const group={id:'a',code:'A',name:'Skupina A',sort_order:1,ranking_rule:'head_to_head',ranking_version:'version',teams:['Alpha','Beta'].map((team_name,i)=>({id:String(i),group_id:'a',slot_number:i+1,team_name}))};
const matches=[{id:'m',group_id:'a',phase:'group',round_number:1,match_number:1,starts_at:'09:00',field_number:1,home_team_name:'Alpha',away_team_name:'Beta',resolved_home_name:'Alpha',resolved_away_name:'Beta',home_score:0,away_score:0,status:'finished'}];
const renderPanel=(groups,ms=matches)=>renderToStaticMarkup(React.createElement(TournamentTieDecisions,{slug:'cup',groups,matches:ms,locked:false}));
let html=renderPanel([group]);assert.ok(html.includes('name="reason"'));assert.ok(html.includes('name="confirm"'));assert.ok(html.includes('Uložiť rozhodnutie o poradí'));assert.ok(html.includes('name="version" value="version"'));
html=renderPanel([group],[{...matches[0],status:'scheduled',home_score:null,away_score:null}]);assert.ok(html.includes('Najskôr dokonči'));assert.ok(!html.includes('name="reason"'));
const resolved={...group,tie_reason:'Verejný žreb',standings:calc.calculateStandings(group,matches).reverse().map((r,i)=>({...r,rank:i+1,unresolved:false}))};
assert.equal(renderPanel([resolved]),'');
const renderTable=g=>renderToStaticMarkup(React.createElement(TournamentPlan,{slug:'cup',groups:[g],matches,canManage:false,canScore:false,resultsLocked:true}));
html=renderTable(group);assert.ok(html.includes('nerozhodnuté'));assert.ok(!html.includes('🥇'));assert.ok(!html.includes('name="homeScore"'));
html=renderTable(resolved);assert.ok(html.includes('Rozhodnutie organizátora:'));assert.ok(html.includes('Verejný žreb'));assert.ok(html.includes('🥇'));assert.ok(html.indexOf('1. Beta')<html.indexOf('2. Alpha'));
console.log('PASS: incomplete group, organizer confirmation/reason/version, unresolved ranks without medals, saved public decision and podium');
