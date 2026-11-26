// Run: node test/model.test.js
// Model.js is a QML library; strip its pragma and load it as CommonJS.
const fs = require("fs"), path = require("path"), Module = require("module");
const src = fs.readFileSync(path.join(__dirname, "..", "Model.js"), "utf8").replace(/^\.pragma library\s*$/m, "");
const mod = new Module("Model.js"); mod._compile(src, "Model.js");
const M = mod.exports;
const assert = require("assert");
const now = Date.parse("2026-11-26T12:00:00Z");
// Google-shaped record: windows with no reset time
const g = M.parseProvider(JSON.stringify({name:"Antigravity",limits:[{label:"Session (5-hour)",percent:0,resetsAt:""},{label:"Weekly (7-day)",percent:0,resetsAt:""}]}), "gemini", now);
assert(g.ok);
assert.strictEqual(M.started(g.provider.weekly), false);
assert.strictEqual(M.resetText(g.provider.weekly, now), "window not started");
assert.strictEqual(M.paceText(g.provider.weekly, now), "Window not started");
assert.strictEqual(M.expectedText(g.provider.weekly, now), "Expected —");
assert.strictEqual(M.behindPace(g.provider.weekly, now), false);
assert.strictEqual(M.percent(g.provider.weekly.used), "0%");
// Claude-shaped record keeps old behaviour
const c = M.parseProvider(JSON.stringify({limits:[{label:"Weekly (7-day)",percent:0.5,resetsAt:"2026-11-29T12:00:00Z"}]}), "claude", now);
assert.strictEqual(M.resetText(c.provider.weekly, now), "resets in 3d 0h");
assert.strictEqual(M.expectedText(c.provider.weekly, now), "Expected 57% used");
assert.strictEqual(M.behindPace(c.provider.weekly, now), false);
// Lapsed sign-in: status carries the help text
const l = M.parseProvider(JSON.stringify({usageStatusText:"Limits paused",authHelpText:"Start `agy` to refresh it.",limits:[]}), "gemini", now);
assert.strictEqual(l.provider.status, "Limits paused · Start `agy` to refresh it.");
assert.strictEqual(l.provider.weekly, null);
console.log("all Model.js checks passed");
// Gemini record from bin/gemini-usage: headline is the primary 5-hour pool
const gem = M.parseProvider(JSON.stringify({
  limits:[{label:"Gemini (5-hour)",title:"Gemini",percent:0.0248,resetsAt:"2026-11-26T16:49:55Z",primary:true},{label:"Claude/GPT weekly",percent:0,resetsAt:""}],
  quotaPools:[{name:"Gemini",used:0.0248,resetsAt:"2026-11-26T16:49:55Z",models:["gemini-3-flash","<img src=x>","gemini-4-hydrogen-sonar"]},{name:"Claude (in Antigravity)",used:0,resetsAt:"2026-11-26T17:00:00Z",models:["claude-opus-5-5-high"]}],
  todayTokensByModel:{"gemini-4-neon-high":286318,"bad model!":5,"zero":0}}), "gemini", now);
assert.strictEqual(gem.provider.weekly, null);
assert.strictEqual(gem.provider.headline.rawLabel, "Gemini (5-hour)");
assert.strictEqual(M.percent(gem.provider.headline.used), "2%");
assert.strictEqual(M.windowName(gem.provider.headline), "5-hour");
assert.strictEqual(M.behindPace(gem.provider.weekly, now), false);
assert.deepStrictEqual(gem.provider.pools[0].models, ["gemini-3-flash","gemini-4-hydrogen-sonar"]); // markup dropped
assert.strictEqual(M.poolText(gem.provider.pools[0], now), "2% used · 4h 49m");
assert.strictEqual(M.poolText(gem.provider.pools[1], now), "unused");
assert.deepStrictEqual(gem.provider.todayModels, [{model:"gemini-4-neon-high",tokens:286318}]);
// Claude keeps weekly as headline
assert.strictEqual(c.provider.headline, c.provider.weekly);
assert.strictEqual(M.windowName(c.provider.headline), "weekly");
assert.deepStrictEqual(gem.provider.warnings, []);
// Contract warnings
assert.deepStrictEqual(g.provider.warnings, ["Google reported no Gemini pool"]);
assert.deepStrictEqual(l.provider.warnings, ["limits array is empty", "no headline limit for the bar", "Google reported no Gemini pool", "sign-in: Start `agy` to refresh it."]);
assert.deepStrictEqual(c.provider.warnings, []);
console.log("gemini + per-model checks passed");
