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
const tennis = load("lib/tennis.ts");
const { createResultsPdf } = load("lib/tournament-results-pdf.ts", { "@/lib/tournament-plan-calculations": calculations, "@/lib/tennis": tennis });
const teams = ["MŠK Senec", "ŠK Slovan Bratislava", "FC Spartak Trnava", "Mimoriadne dlhý názov mládežníckeho futbalového klubu Žilina a okolie"];
const groups = Array.from({ length: 3 }, (_, i) => ({ id: String(i), code: String.fromCharCode(65 + i), name: `Skupina ${String.fromCharCode(65 + i)}`, sort_order: i, teams: teams.map((name, j) => ({ id: `${i}-${j}`, group_id: String(i), slot_number: j, team_name: name })) }));
const matches = Array.from({ length: 60 }, (_, i) => ({ id: String(i), group_id: String(i % 3), phase: "group", round_number: i, match_number: i + 1, starts_at: "09:25:00", field_number: i % 3 + 1, home_team_name: teams[i % 4], away_team_name: teams[(i + 1) % 4], home_source: null, away_source: null, resolved_home_name: teams[i % 4], resolved_away_name: teams[(i + 1) % 4], home_score: i === 0 ? 0 : 2, away_score: 0, status: i === 59 ? "scheduled" : "finished" }));
const tournament = { slug: "test-pdf", name: "Žilinský pohár - mládežnícky turnaj s dlhým názvom", displayDate: "26. október 2026", city: "Senec", sport: "Futbal", category: "U12" };
(async () => {
  const bytes = await createResultsPdf(tournament, groups, matches, "https://tournio.sk");
  assert.equal(Buffer.from(bytes).subarray(0, 4).toString(), "%PDF");
  fs.mkdirSync("tmp/pdfs", { recursive: true }); fs.writeFileSync("tmp/pdfs/results-smoke.pdf", bytes);
  const people = ["Ján Novák", "Peter Kováč", "Marek Žitný", "Michal Šťastný"];
  const rename = (name) => people[teams.indexOf(name)] ?? name;
  const tennisGroups = groups.map((g) => ({ ...g, teams: g.teams.map((t) => ({ ...t, team_name: rename(t.team_name) })) }));
  const tennisMatches = matches.map((m) => ({ ...m, sport: "Tenis", tennis_system: "groups_playoff", home_team_name: rename(m.home_team_name), away_team_name: rename(m.away_team_name), resolved_home_name: rename(m.home_team_name), resolved_away_name: rename(m.away_team_name), home_score: m.status === "finished" ? 1 : null, away_score: m.status === "finished" ? 0 : null, tennis_sets: m.status === "finished" ? [{ home: 7, away: 6 }] : null }));
  const tennisBytes = await createResultsPdf({ ...tournament, name: "Tenisový pohár - test dlhého rozpisu", sport: "Tenis" }, tennisGroups, tennisMatches, "https://tournio.sk");
  assert.equal(Buffer.from(tennisBytes).subarray(0, 4).toString(), "%PDF");
  fs.writeFileSync("tmp/pdfs/tennis-smoke.pdf", tennisBytes);
  console.log(`PDF smoke test passed: ${bytes.length} bytes`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
