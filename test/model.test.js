// Run: node test/model.test.js
// Model.js is a QML library; strip its pragma and load it as CommonJS.
const fs = require("fs"), path = require("path"), Module = require("module");
const src = fs.readFileSync(path.join(__dirname, "..", "Model.js"), "utf8").replace(/^\.pragma library\s*$/m, "");
const mod = new Module("Model.js"); mod._compile(src, "Model.js");
const M = mod.exports;
const assert = require("assert");

const now = Date.parse("2026-11-26T12:00:00Z");
const HOUR = 3600000;
const failing = (provider) => provider.checks.filter((c) => c.state !== "pass" && c.state !== "skipped").map((c) => c.name);
const skippedNames = (provider) => provider.checks.filter((c) => c.state === "skipped").map((c) => c.name);
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
  assert.deepStrictEqual(failing(l.provider), ["Has a limit for the bar", "Signed in"]);
  assert.deepStrictEqual(skippedNames(l.provider), ["Google reports a Gemini pool"]);
  assert.strictEqual(l.provider.live, false);
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

// A Suno record as bin/suno-usage prints it (made-up account values).
function sunoRecord(over) {
  return Object.assign({
    name: "Suno", plan: "Pro Plan", tierLabel: "Pro", signInRequired: false, usageStatusText: "", authHelpText: "",
    limits: [
      { label: "Monthly (credits)", title: "Credits", percent: 0.2, resetsAt: "2026-11-30T05:00:00Z",
        windowStartsAt: "2026-10-30T05:00:00Z", primary: true, detail: "2,000 of 2,500 credits left" },
      { label: "Visual credits", title: "Visual credits", percent: 0, resetsAt: "2026-11-30T05:00:00Z" }],
    credits: { monthlyLimit: 2500, monthlyUsage: 500, left: 2000, extra: 0 },
    planModels: ["v6", "v6-wild", "<b>x</b>"],
    sourceFields: { billing: ["monthly_limit", "monthly_usage"] },
  }, over || {});
}

test("Suno: the billing month is the headline and is paced over its own length", () => {
  const p = M.parseProvider(JSON.stringify(sunoRecord()), "suno", now, null).provider;
  assert.strictEqual(p.weekly, null);
  assert.strictEqual(p.pace, p.headline);
  assert.strictEqual(p.headline.windowMs, 31 * 24 * HOUR);
  assert.strictEqual(p.headline.detail, "2,000 of 2,500 credits left");
  assert.strictEqual(M.headlineText(p.headline, now), "20% used · resets in 3d 17h");
  // 3d 17h of 31 days left: an even pace would have used 88%.
  assert.strictEqual(M.expectedText(p.pace, now), "Expected 88% used");
  assert.deepStrictEqual(p.planModels, ["v6", "v6-wild"]);
  assert.strictEqual(p.tracksTokens, false);
  assert.deepStrictEqual(failing(p), []);
});

test("Suno: paced like the others; only running ahead of the month turns red", () => {
  const light = M.parseProvider(JSON.stringify(sunoRecord()), "suno", now, null).provider;
  assert.strictEqual(M.paceAlarm(light, now, 0.05), false);
  assert.strictEqual(M.paceText(light.pace, now, 0.05), "68% ahead of pace");
  const busy = sunoRecord();
  busy.limits[0].percent = 0.95;
  const b = M.parseProvider(JSON.stringify(busy), "suno", now, null).provider;
  assert.strictEqual(M.paceAlarm(b, now, 0.05), true);
  assert.strictEqual(M.paceText(b.pace, now, 0.05), "7% behind pace");
});

test("Suno: a lapsed sign-in asks for Sign in and fails the sign-in check", () => {
  const out = sunoRecord({ limits: [], credits: {}, signInRequired: true, authHelpText: "Not signed in to Suno. Choose Sign in in the panel." });
  const p = M.parseProvider(JSON.stringify(out), "suno", now, null).provider;
  assert.strictEqual(p.signInNeeded, true);
  assert.deepStrictEqual(failing(p), ["Has a limit for the bar", "Signed in"]);
  assert.deepStrictEqual(skippedNames(p), ["Billing period reported"]);
});

test("Suno: credits that stop adding up fail a check", () => {
  const p = M.parseProvider(JSON.stringify(sunoRecord({ credits: { monthlyLimit: 2500, monthlyUsage: 2500, left: 50, extra: 0 } })), "suno", now, null).provider;
  assert.deepStrictEqual(failing(p), ["Credits add up"]);
});

test("Suno: source fields compare against the baseline", () => {
  const base = { fields: Object.keys(sunoRecord()).sort(), sourceFields: { billing: ["monthly_limit"] } };
  const p = M.parseProvider(JSON.stringify(sunoRecord()), "suno", now, base).provider;
  const c = p.checks.find((x) => x.name === "Suno's fields unchanged");
  assert.strictEqual(c.state, "changed");
  assert.strictEqual(c.detail, "billing new: monthly_usage");
  assert.deepStrictEqual(M.baselineOf(JSON.stringify(sunoRecord()), "suno").sourceFields, { billing: ["monthly_limit", "monthly_usage"] });
});

test("provider table: commands, placeholders, defaults", () => {
  assert.deepStrictEqual(M.PROVIDERS.map((p) => p.id), ["claude", "codex", "gemini", "suno"]);
  assert.deepStrictEqual(M.commandOf(M.providerConfig("gemini"), "/x/bin"), ["/x/bin/gemini-usage"]);
  assert.deepStrictEqual(M.commandOf(M.providerConfig("claude"), "/x/bin"), ["omarchy-agent-usage-claude", "--limits-only"]);
  assert.strictEqual(M.providerConfig("suno").defaultOn, false);
  assert.strictEqual(M.placeholder(M.providerConfig("codex")).status, "Loading…");
  assert.strictEqual(M.providerConfig("nope"), null);
  // Claude/Codex: a week is paced as a cap.
  const c = M.parseProvider(JSON.stringify({ limits: [{ label: "Weekly (7-day)", percent: 0.9, resetsAt: "2026-11-29T12:00:00Z" }] }), "claude", now, null).provider;
  assert.strictEqual(c.pace, c.weekly);
  assert.strictEqual(M.paceAlarm(c, now, 0.05), true);
});

test("a lapsed sign-in skips the baseline comparisons instead of failing them", () => {
  // Gemini's collector after the agy token lapsed: old limits, no pools or Google fields.
  const baseline = { fields: ["authHelpText", "googleFields", "limits", "limitsStale", "quotaPools"], models: ["gemini-3-flash"], googleFields: { quota: ["buckets"] } };
  const stale = { limits: [{ label: "Session", percent: 0, resetsAt: "" }], limitsStale: true,
    authHelpText: "The Antigravity access token `agy` keeps has lapsed. Start `agy` to refresh it." };
  const p = M.parseProvider(JSON.stringify(stale), "gemini", now, baseline).provider;
  assert.deepStrictEqual(failing(p), ["Data is fresh", "Signed in"]);
  assert.deepStrictEqual(skippedNames(p), ["Google reports a Gemini pool", "Record fields unchanged", "Model list unchanged", "Google's fields unchanged"]);
  assert.ok(p.warnings.every((w) => !/unchanged|pool/.test(w)));
  assert.strictEqual(p.recentUnit, "tokens");
});

test("Suno charts credits, not tokens", () => {
  const p = M.parseProvider(JSON.stringify(sunoRecord({ recentUnit: "credits", recentDays: [{ date: "2026-11-26", messageCount: 40 }] })), "suno", now, null).provider;
  assert.strictEqual(p.recentUnit, "credits");
  assert.strictEqual(M.recentTotal(p.recentDays), 40);
  assert.strictEqual(M.parseProvider(JSON.stringify(sunoRecord({ recentUnit: "<b>" })), "suno", now, null).provider.recentUnit, "tokens");
});

test("Gemini: which sign-in answered, and the omp setup hint", () => {
  const live = { limits: [{ label: "Gemini (5-hour)", percent: 0.03, resetsAt: "2026-11-26T16:00:00Z", primary: true }],
    quotaPools: [{ family: "gemini", name: "Gemini", used: 0.03, resetsAt: "2026-11-26T16:00:00Z", models: ["gemini-3-flash"] }],
    tokenSource: "omp", setupNeeded: false };
  const p = M.parseProvider(JSON.stringify(live), "gemini", now, null).provider;
  assert.strictEqual(p.tokenSource, "omp");
  assert.ok(p.checks.some((c) => c.name === "Signed in (omp)" && c.state === "pass"));
  const lapsed = M.parseProvider(JSON.stringify({ limits: [], limitsStale: true, setupNeeded: true, tokenSource: "<x>",
    authHelpText: "The Antigravity access token `agy` keeps has lapsed." }), "gemini", now, null).provider;
  assert.strictEqual(lapsed.setupNeeded, true);
  assert.strictEqual(lapsed.tokenSource, "");
  assert.strictEqual(lapsed.live, false);
  assert.strictEqual(M.providerConfig("gemini").setup.command, "omp login antigravity-cli");
});

console.log(`model tests: ${count} passed`);

test("pool model text accepts array-like lists from QML", () => {
  const listLike = { length: 2, 0: "gemini-3-flash", 1: "gemini-2.5-flash" };
  assert.strictEqual(M.poolModelsText({ family: "gemini", models: listLike }), "3 Flash, 2.5 Flash");
  console.log(`model tests: ${count} passed (incl. array-like)`);
});
