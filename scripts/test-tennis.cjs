/* eslint-disable @typescript-eslint/no-require-imports */
const ts = require("typescript"); const fs = require("node:fs"); const path = require("node:path"); const Module = require("node:module"); const assert = require("node:assert/strict");
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const mod = new Module(path.resolve(file)); mod.filename = path.resolve(file); mod.paths = module.paths;
  const original = mod.require.bind(mod);
  mod.require = (name) => name === "@/lib/supabase/server" ? { createClient() { throw Error("No live DB in unit tests"); } } : name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : original(name);
  mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, path.resolve(file));
  cache.set(file, mod.exports); return mod.exports;
}
const { createTennisPlan } = load("lib/tennis-plan.ts");
const { validateTennisScore } = load("lib/tennis.ts");
const { calculateTennisStandings } = load("lib/tournament-plan-calculations.ts");
const { resolveTournamentFormat } = load("lib/tournament-format.ts");
const { resolveTournamentSources } = load("lib/tournament-plan-data.ts");
const input = { teamCount: 8, teamNames: [], fieldCount: 4, matchMinutes: 20, startTime: "08:00", lunchBreak: false, gameSystem: "round_robin" };
const settings = { system: "round_robin", scoring: "set6", discipline: "singles", noAd: false, groupSizes: [8], qualifiers: 2 };
for (const [count, expected] of [[4, 6], [8, 28]]) assert.equal(createTennisPlan({ ...input, teamCount: count }, { ...settings, groupSizes: [count] }).matches.length, expected);
for (const count of [4, 5, 8, 12, 16, 32, 64]) assert.equal(createTennisPlan({ ...input, teamCount: count, matchMinutes: 5, fieldCount: 16 }, { ...settings, system: "knockout" }).matches.length, count - 1);
for (const count of [4, 8, 16, 32]) {
  const p = createTennisPlan({ ...input, teamCount: count, matchMinutes: 5, fieldCount: 8 }, { ...settings, system: "consolation" });
  assert.equal(p.matches.length, count - 1 + count / 2 - 1);
  assert.equal(p.matches.filter((m) => m.phase === "placement").length, count / 2 - 1);
  assert.ok(p.groups.every((g) => /^[A-Z][A-Z0-9]{0,4}$/.test(g.code)));
}
assert.throws(() => createTennisPlan({ ...input, teamCount: 12 }, { ...settings, system: "consolation" }), /plný pavúk/);
for (const [scoring, sets, result] of [["set6", [{ home: 6, away: 4 }], [1, 0]], ["set6", [{ home: 6, away: 7 }], [0, 1]], ["short4", [{ home: 5, away: 4 }], [1, 0]], ["match_tiebreak", [{ home: 6, away: 4 }, { home: 3, away: 6 }, { home: 12, away: 10 }], [2, 1]]]) {
  const r = validateTennisScore(sets, scoring); assert.deepEqual([r.home, r.away], result);
}
for (const [scoring, sets] of [["set6", []], ["set6", [{ home: 5, away: 4 }]], ["short4", [{ home: 6, away: 2 }]], ["match_tiebreak", [{ home: 6, away: 0 }, { home: 6, away: 1 }, { home: 10, away: 0 }]], ["match_tiebreak", [{ home: 6, away: 4 }, { home: 3, away: 6 }, { home: 10, away: 9 }]]]) assert.throws(() => validateTennisScore(sets, scoring));
const group = { id: "g", code: "A", teams: [{ team_name: "A", slot_number: 1 }, { team_name: "B", slot_number: 2 }] };
const rows = calculateTennisStandings(group, [{ id: "1", group_id: "g", phase: "group", status: "finished", home_team_name: "A", away_team_name: "B", home_score: 1, away_score: 0, tennis_sets: [{ home: 7, away: 6 }] }]);
assert.equal(rows[0].name, "A"); assert.equal(rows[0].points, 1); assert.equal(rows[0].gamesWon, 7);
const form = new FormData(); form.set("preferredEnd", "18:00"); form.set("formatChoice", "tennis_groups_playoff"); form.set("tennisScoring", "set6"); form.set("tennisDiscipline", "singles");
const format = resolveTournamentFormat(form, { ...input, sport: "Tenis", teamCount: 12 }); assert.deepEqual(format.groupSizes, [4,4,4]); assert.equal(format.summary.matchCount, 23);
assert.throws(() => resolveTournamentFormat(form, { ...input, sport: "Futbal" }));
form.set("formatChoice", "groups_placement"); assert.throws(() => resolveTournamentFormat(form, { ...input, sport: "Tenis" }));
const bracket = createTennisPlan({ ...input, teamCount: 4 }, { ...settings, system: "consolation" });
const fixture = bracket.matches.map((m) => ({ ...m, id: String(m.match_number), group_id: null, status: m.match_number <= 2 ? "finished" : "scheduled", home_score: m.match_number <= 2 ? 1 : null, away_score: m.match_number <= 2 ? 0 : null, tennis_sets: m.match_number <= 2 ? [{ home: 6, away: 0 }] : null }));
const resolved = resolveTournamentSources([], fixture, true); assert.equal(resolved[2].resolved_home_name, fixture[0].home_team_name); assert.equal(resolved[3].resolved_home_name, fixture[0].away_team_name);
if (process.argv.includes("--sql") || process.argv.includes("--football-sql")) {
  const football = process.argv.includes("--football-sql");
  const cases = football ? [[8,"groups_playoff"],[12,"groups_playoff"],[16,"groups_placement"]] : [[4, "round_robin"], [8, "groups_playoff"], [12, "groups_playoff"], [16, "consolation"]];
  const commands = cases.map(([count, system]) => {
    const groupSizes = system === "round_robin" ? [count] : load("lib/tournament-groups.ts").suggestedGroupSizes(count);
    const tennis = { ...settings, system, groupSizes };
    const planInput = { ...input, gameSystem: system, teamCount: count, fieldCount: 8, matchMinutes: 5 };
    const plan = { ...(football ? load("lib/tournament-plan.ts").createTournamentPlan(planInput) : createTennisPlan(planInput, tennis)), format_settings: football ? {} : { tennis }, preferred_end: "20:00" };
    return `created_slug := public.create_tournament_with_location(p_name:='Tennis transaction test',p_sport:='${football ? "Futbal" : "Tenis"}',p_category:='U12',p_event_date:=current_date+1,p_place:='Senec',p_capacity:=${count},p_playing_fields:=8,p_match_duration:=5,p_fee:=0,p_tournament_type:='public',p_team_visibility:='all',p_club_ids:=array[]::text[],p_custom_teams:=array[]::text[],p_start_time:='08:00',p_turnover_minutes:=3,p_schedule_slot_minutes:=10,p_has_lunch_break:=false,p_lunch_break_start:=null,p_lunch_break_duration:=null,p_game_system:='${football ? system : system === "groups_playoff" ? "groups_playoff" : "round_robin"}',p_qualifiers_per_group:=${system === "groups_playoff" ? 2 : "null"},p_third_place_match:=false,p_plan:=$plan$${JSON.stringify(plan)}$plan$::jsonb,p_country:='Slovensko',p_region:='Bratislavský kraj',p_surface:='Antuka'); select count(*) into match_count from public.tournament_matches m join public.tournaments t on t.id=m.tournament_id where t.slug=created_slug; if match_count <> ${plan.matches.length} then raise exception 'TEST_CREATE_COUNT_FAILED'; end if;`;
  });
  console.log(`begin; do $$ declare uid uuid; created_slug text; match_count integer; begin select organizer_id into uid from public.tournaments limit 1; perform set_config('request.jwt.claim.sub',uid::text,true); ${commands.join("\n")} end $$; rollback; select 'PASS: ${football ? "football" : "tennis"} creation RPC cases; fixtures rolled back' as tests;`);
} else console.log("PASS: tennis formats, counts, byes, consolation, scoring, standings, sport isolation, and progression");
