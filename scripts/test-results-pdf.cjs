/* eslint-disable @typescript-eslint/no-require-imports */
// Smoke-test the server PDF renderer without a database or private user data.
const ts = require("typescript");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const assert = require("node:assert/strict");
function load(file, replacements = {}) {
  const source = fs.readFileSync(path.resolve(file), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const mod = new Module(path.resolve(file)); mod.filename = path.resolve(file); mod.paths = module.paths;
  const original = mod.require.bind(mod); mod.require = (name) => replacements[name] ?? original(name);
  mod._compile(compiled, path.resolve(file)); return mod.exports;
}
const calculations = load("lib/tournament-plan-calculations.ts");
const { createResultsPdf } = load("lib/tournament-results-pdf.ts", { "@/lib/tournament-plan-calculations": calculations, "@/lib/tennis": load("lib/tennis.ts"), "@/lib/tournament-incidents": load("lib/tournament-incidents.ts"), "@/lib/tournament-ranking": load("lib/tournament-ranking.ts") });
const teams = ["MŠK Senec", "ŠK Slovan Bratislava", "FC Spartak Trnava", "Mimoriadne dlhý názov mládežníckeho futbalového klubu Žilina a okolie"];
const groups = Array.from({ length: 3 }, (_, i) => ({ id: String(i), code: String.fromCharCode(65 + i), name: `Skupina ${String.fromCharCode(65 + i)}`, sort_order: i, teams: teams.map((name, j) => ({ id: `${i}-${j}`, group_id: String(i), slot_number: j, team_name: name })) }));
const matches = Array.from({ length: 60 }, (_, i) => ({ id: String(i), group_id: String(i % 3), phase: "group", round_number: i, match_number: i + 1, starts_at: "09:25:00", field_number: i % 3 + 1, home_team_name: teams[i % 4], away_team_name: teams[(i + 1) % 4], home_source: null, away_source: null, resolved_home_name: teams[i % 4], resolved_away_name: teams[(i + 1) % 4], home_score: i === 0 ? 0 : 2, away_score: 0, status: i === 59 ? "scheduled" : "finished" }));
const tournament = { slug: "test-pdf", name: "Žilinský pohár - mládežnícky turnaj s dlhým názvom", displayDate: "26. október 2026", city: "Senec", sport: "Futbal", category: "U12" };
(async () => {
  const bytes = await createResultsPdf(tournament, groups, matches, "https://tournio.sk");
  assert.equal(Buffer.from(bytes).subarray(0, 4).toString(), "%PDF");
  fs.mkdirSync("tmp/pdfs", { recursive: true }); fs.writeFileSync("tmp/pdfs/results-smoke.pdf", bytes);
  const specialMatches = matches.slice(0,2).map((m,i)=>({...m,status:"finished",outcome:i===0?"forfeit":"void",outcome_reason:i===0?"Tím nenastúpil v stanovenom čase.":"Odstúpenie tímu; výsledok sa vylučuje z tabuľky.",home_score:3,away_score:0}));
  const incidents = {withdrawal_rule:"annul",forfeit_score:3,withdrawals:[{name:teams[1],reason:"Odstúpenie zo zdravotných dôvodov."}],events:[{action:"withdraw",target:teams[1],reason:"Odstúpenie zo zdravotných dôvodov.",created_at:"2026-11-14T09:00:00Z",changes:[{number:2,home:teams[1],away:teams[2],before_home:2,before_away:1,home_score:2,away_score:1,outcome:"void"}]}]};
  const specialBytes = await createResultsPdf(tournament, groups, specialMatches, "https://tournio.sk", null, incidents);
  assert.equal(Buffer.from(specialBytes).subarray(0,4).toString(),"%PDF");fs.writeFileSync("tmp/pdfs/incidents-smoke.pdf",specialBytes);
  const tennisNames=["Ján Novák","Peter Kováč","Martin Šimko","Mimoriadne dlhé meno hráča alebo štvorhrovej dvojice" ];
  const tennisGroup={id:"tennis",code:"A",name:"Skupina A",sort_order:1,teams:tennisNames.map((team_name,i)=>({id:`t${i}`,group_id:"tennis",slot_number:i+1,team_name}))};
  const tennisMatches=[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]].map(([a,b],i)=>({...matches[0],id:`tennis-${i}`,group_id:"tennis",sport:"Tenis",tennis_scoring:"match_tiebreak",tennis_system:"round_robin",match_number:i+1,home_team_name:tennisNames[a],away_team_name:tennisNames[b],resolved_home_name:tennisNames[a],resolved_away_name:tennisNames[b],home_score:i===0?0:i===1?1:2,away_score:i===0||i===1?0:i===3?1:0,status:"finished",tennis_result:i===0?"wo":i===1?"retired":"played",tennis_winner:i<2?"away":null,tennis_sets:i===0?[]:i===1?[{home:6,away:4},{home:3,away:2}]:i===3?[{home:6,away:0},{home:0,away:6},{home:12,away:10}]:[{home:6,away:0},{home:6,away:0}],outcome_reason:i===0?"Hráč nenastúpil.":i===1?"Hráč skrečoval počas druhého setu.":null}));
  const tennisBytes=await createResultsPdf({...tournament,sport:"Tenis",name:"Tenisový pohár – W.O. a skreč"},[tennisGroup],tennisMatches,"https://tournio.sk");assert.equal(Buffer.from(tennisBytes).subarray(0,4).toString(),"%PDF");fs.writeFileSync("tmp/pdfs/tennis-completion-smoke.pdf",tennisBytes);
  console.log(`PDF smoke test passed: ${bytes.length} bytes`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
