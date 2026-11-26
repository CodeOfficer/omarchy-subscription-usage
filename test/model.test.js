// Run: node test/model.test.js
// Model.js is a QML library; strip its pragma and load it as CommonJS.
const fs = require("fs"), path = require("path"), Module = require("module");
const src = fs.readFileSync(path.join(__dirname, "..", "Model.js"), "utf8").replace(/^\.pragma library\s*$/m, "");
const mod = new Module("Model.js"); mod._compile(src, "Model.js");
const M = mod.exports;
const assert = require("assert");

const now = Date.parse("2026-11-26T12:00:00Z");
const HOUR = 3600000;
const failing = (provider) => provider.checks.filter((c) => c.state !== "pass").map((c) => c.name);
let count = 0;
function test(name, fn) { fn(); count++; }

test("window without a reset time reads as not started", () => {
  const g = M.parseProvider(JSON.stringify({ limits: [{ label: "Weekly (7-day)", percent: 0, resetsAt: "" }] }), "codex", now, null);
  assert.strictEqual(M.started(g.provider.weekly), false);
  assert.strictEqual(M.resetText(g.provider.weekly, now), "window not started");
  assert.strictEqual(M.paceText(g.provider.weekly, now), "Window not started");
  assert.strictEqual(M.expectedText(g.provider.weekly, now), "Expected —");
  assert.strictEqual(M.behindPace(g.provider.weekly, now), false);
});

test("Claude keeps the weekly window as its headline", () => {
  const c = M.parseProvider(JSON.stringify({ limits: [{ label: "Weekly (7-day)", percent: 0.5, resetsAt: "2026-11-29T12:00:00Z" }] }), "claude", now, null);
  assert.strictEqual(c.provider.headline, c.provider.weekly);
  assert.strictEqual(M.headlineText(c.provider.headline, now), "50% used · resets in 3d 0h");
  assert.strictEqual(M.expectedText(c.provider.weekly, now), "Expected 57% used");
  assert.deepStrictEqual(failing(c.provider), []);
});

test("pace tolerance: a week that just started is not behind for a little use", () => {
  const reset = new Date(now + 7 * 24 * HOUR - HOUR).toISOString(); // 1 hour into the week
  const record = (used) => M.parseProvider(JSON.stringify({ limits: [{ label: "Weekly (7-day)", percent: used, resetsAt: reset }] }), "codex", now, null).provider.weekly;
  assert.strictEqual(M.behindPace(record(0.01), now), false);
  assert.strictEqual(M.paceText(record(0.01), now), "On pace");
  assert.strictEqual(M.paceText(record(0.02), now), "Near pace · 1% over");
  assert.strictEqual(M.behindPace(record(0.04), now), false);
  assert.strictEqual(M.behindPace(record(0.07), now), true);
  assert.strictEqual(M.paceText(record(0.07), now), "6% behind pace");
});

test("pace tolerance follows the user's setting", () => {
  const reset = new Date(now + 7 * 24 * HOUR - HOUR).toISOString();
  const weekly = M.parseProvider(JSON.stringify({ limits: [{ label: "Weekly (7-day)", percent: 0.07, resetsAt: reset }] }), "codex", now, null).provider.weekly;
  assert.strictEqual(M.behindPace(weekly, now, 0.10), false);
  assert.strictEqual(M.paceText(weekly, now, 0.10), "Near pace · 6% over");
  assert.strictEqual(M.behindPace(weekly, now, 0), true);
});

test("Gemini: the primary 5-hour pool is the headline, with its window name", () => {
  const gem = M.parseProvider(JSON.stringify({
    limits: [
      { label: "Gemini (5-hour)", title: "Gemini", percent: 0.0248, resetsAt: "2026-11-26T16:49:55Z", primary: true },
      { label: "Claude/GPT weekly", title: "Claude/GPT weekly", percent: 0, resetsAt: "", scope: "models" }],
    quotaPools: [
      { family: "gemini", name: "Gemini", used: 0.0248, resetsAt: "2026-11-26T16:49:55Z", models: ["gemini-3-flash", "<img src=x>", "gemini-4-hydrogen-sonar"] },
      { family: "claude", name: "Claude (in Antigravity)", used: 0, resetsAt: "2026-11-26T17:00:00Z", models: ["claude-opus-5-5-high", "claude-opus-5-5-low"] }],
    todayTokensByModel: { "gemini-4-neon-high": 286318, "bad model!": 5, zero: 0 } }), "gemini", now, null);
  const p = gem.provider;
  assert.strictEqual(p.weekly, null);
  assert.strictEqual(p.headline.rawLabel, "Gemini (5-hour)");
  assert.strictEqual(M.headlineText(p.headline, now), "2% of 5-hour used · resets in 4h 49m");
  assert.strictEqual(p.limits[1].scoped, true);
  assert.deepStrictEqual(p.pools[0].models, ["gemini-3-flash", "gemini-4-hydrogen-sonar"]); // markup dropped
  assert.strictEqual(M.poolText(p.pools[0], now), "2% used · 4h 49m");
  assert.strictEqual(M.poolText(p.pools[1], now), "unused");
  assert.deepStrictEqual(p.todayModels, [{ model: "gemini-4-neon-high", tokens: 286318 }]);
  assert.deepStrictEqual(failing(p), []);
});

test("readable model names", () => {
  assert.strictEqual(M.modelName("claude-opus-5-5"), "Claude Opus 5.5");
  assert.strictEqual(M.modelName("claude-opus-5-5-high"), "Claude Opus 5.5 · high");
  assert.strictEqual(M.modelName("gemini-4-neon-high"), "Gemini 4 Neon · high");
  assert.strictEqual(M.modelName("gemini-2.5-flash-lite"), "Gemini 2.5 Flash Lite");
  assert.strictEqual(M.modelName("gpt-oss-120b-medium"), "GPT OSS 120B · medium");
  assert.strictEqual(M.modelName("gpt-6-astra"), "GPT 6 Astra");
  const pool = { family: "claude", models: ["claude-opus-5-5-high", "claude-opus-5-5-low", "claude-sonnet-5-5-medium"] };
  assert.strictEqual(M.poolModelsText(pool), "Opus 5.5 (high, low), Sonnet 5.5 (medium)");
  assert.strictEqual(M.poolModelsText({ family: "gemini", models: ["gemini-3-flash", "gemini-2.5-flash-lite"] }), "3 Flash, 2.5 Flash Lite");
});

test("checks: failures for a lapsed sign-in", () => {
  const l = M.parseProvider(JSON.stringify({ usageStatusText: "Limits paused", authHelpText: "The Antigravity access token `agy` keeps has lapsed. Start `agy` to refresh it.", limits: [] }), "gemini", now, null);
  assert.strictEqual(l.provider.status, "Limits paused · The Antigravity access token `agy` keeps has lapsed. Start `agy` to refresh it.");
  assert.deepStrictEqual(failing(l.provider), ["Has a limit for the bar", "Google reports a Gemini pool", "Signed in"]);
  assert.ok(l.provider.warnings.includes("Signed in: The Antigravity access token `agy` keeps has lapsed. Start `agy` to refresh it."));
});

test("checks: new fields and new models show as changed, not failed", () => {
  const baseline = { fields: ["limits", "quotaPools"], models: ["gemini-3-flash"], googleFields: { quotaBucket: ["modelId", "remainingFraction"] } };
  const record = {
    limits: [{ label: "Gemini (5-hour)", percent: 0.1, resetsAt: "2026-11-26T16:00:00Z", primary: true }],
    quotaPools: [{ family: "gemini", name: "Gemini", used: 0.1, resetsAt: "2026-11-26T16:00:00Z", models: ["gemini-3-flash", "gemini-4-neon"] }],
    googleFields: { quotaBucket: ["modelId", "remainingFraction", "tokenType"] },
    newThing: 1 };
  const p = M.parseProvider(JSON.stringify(record), "gemini", now, baseline).provider;
  const byName = Object.fromEntries(p.checks.map((c) => [c.name, c]));
  assert.strictEqual(byName["Record fields unchanged"].state, "changed");
  assert.strictEqual(byName["Record fields unchanged"].detail, "new: googleFields, newThing");
  assert.strictEqual(byName["Model list unchanged"].detail, "new: gemini-4-neon");
  assert.strictEqual(byName["Google's fields unchanged"].detail, "quotaBucket new: tokenType");
  assert.ok(p.checks.every((c) => c.state !== "fail"));
});

test("baselineOf captures what the checks compare against", () => {
  const out = JSON.stringify({ limits: [], quotaPools: [{ family: "gemini", models: ["gemini-3-flash"] }], googleFields: { quota: ["buckets"] } });
  assert.deepStrictEqual(M.baselineOf(out, "gemini"), { fields: ["googleFields", "limits", "quotaPools"], models: ["gemini-3-flash"], googleFields: { quota: ["buckets"] } });
});

test("a rate-limit notice is not a sign-in failure", () => {
  const r = M.parseProvider(JSON.stringify({ authHelpText: "Anthropic's usage endpoint is rate limiting checks right now (retry after 0s).",
    limits: [{ label: "Weekly (7-day)", percent: 0.05, resetsAt: "2026-11-27T00:00:00Z" }] }), "claude", now, null);
  assert.deepStrictEqual(failing(r.provider), ["Provider answered normally"]);
});

console.log(`model tests: ${count} passed`);

test("pool model text accepts array-like lists from QML", () => {
  const listLike = { length: 2, 0: "gemini-3-flash", 1: "gemini-2.5-flash" };
  assert.strictEqual(M.poolModelsText({ family: "gemini", models: listLike }), "3 Flash, 2.5 Flash");
  console.log(`model tests: ${count} passed (incl. array-like)`);
});
