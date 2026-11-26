// Live integration check: runs each collector the widget runs, on this
// machine, and checks its record the way the panel's Debug view does.
//
//   node test/integration.test.js                    check
//   node test/integration.test.js --live             also compare with the running widget
//   node test/integration.test.js --update-baseline  accept today's fields and models
//
// Exit 0: every check passes. Exit 1: something failed or changed. A change
// (a new field from Google, a new model such as Neon) is not a bug, but it is
// the signal to look; after reviewing it, --update-baseline accepts it.
// It reads usage only and never spends quota.
const { execFile } = require("child_process");
const fs = require("fs"), path = require("path"), Module = require("module");

const root = path.join(__dirname, "..");
const modelPath = path.join(root, "Model.js");
const src = fs.readFileSync(modelPath, "utf8").replace(/^\.pragma library\s*$/m, "");
const mod = new Module("Model.js"); mod._compile(src, "Model.js");
const M = mod.exports;

const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

// The widget's settings as the shell sees them: manifest defaults, then this
// machine's bar entry in ~/.config/omarchy/shell.json. Providers switched off
// there (showGemini: false, say) are skipped here too; Suno only when on.
function widgetSettings() {
  const settings = Object.assign({}, manifest.barWidget.defaults);
  try {
    const home = process.env.XDG_CONFIG_HOME || path.join(require("os").homedir(), ".config");
    const shell = JSON.parse(fs.readFileSync(path.join(home, "omarchy", "shell.json"), "utf8"));
    for (const entries of Object.values((shell.bar && shell.bar.layout) || {}))
      for (const entry of entries || []) if (entry && entry.id === manifest.id) Object.assign(settings, entry);
  } catch { /* no shell.json: defaults */ }
  return settings;
}

const settings = widgetSettings();
// The widget's own provider table; a provider is checked when it is shown.
const providers = M.PROVIDERS
  .filter((p) => { const v = settings[p.setting] ?? p.defaultOn; return v === true || v === "true"; })
  .map((p) => ({ id: p.id, command: M.commandOf(p, path.join(root, "bin")) }));

function run(command) {
  return new Promise((resolve) => {
    const started = Date.now();
    execFile(command[0], command.slice(1), { timeout: 90000, maxBuffer: 4 << 20 }, (error, stdout, stderr) => {
      resolve({ code: error ? (error.code ?? 1) : 0, stdout, stderr, ms: Date.now() - started });
    });
  });
}

function liveStatus() {
  return new Promise((resolve) => {
    execFile("omarchy-shell", [manifest.id, "status"], { timeout: 15000 }, (error, stdout) => {
      try { resolve(error ? null : JSON.parse(stdout)); } catch { resolve(null); }
    });
  });
}

function writeBaseline(results) {
  const baseline = {};
  // Providers skipped on this machine keep their existing baseline.
  Object.assign(baseline, M.BASELINE || {});
  providers.forEach((p, i) => { baseline[p.id] = M.baselineOf(results[i].stdout, p.id); });
  const text = fs.readFileSync(modelPath, "utf8");
  const block = "// BASELINE-START\nvar BASELINE = " + JSON.stringify(baseline, null, 2) + "\n// BASELINE-END";
  fs.writeFileSync(modelPath, text.replace(/\/\/ BASELINE-START[\s\S]*?\/\/ BASELINE-END/, block));
  console.log("baseline written to Model.js — review the diff, then commit");
}

const mark = { pass: "✓", changed: "◆", fail: "✗" };

(async () => {
  const live = process.argv.includes("--live");
  const results = await Promise.all(providers.map((p) => run(p.command)));
  if (process.argv.includes("--update-baseline")) return writeBaseline(results);
  const status = live ? await liveStatus() : null;
  let bad = 0;

  providers.forEach((p, i) => {
    const result = results[i];
    const checks = [{ name: `Collector ran · ${(result.ms / 1000).toFixed(1)} s`, state: result.code === 0 ? "pass" : "fail",
      detail: result.code === 0 ? "" : `exit ${result.code}: ${String(result.stderr).trim().slice(0, 200)}` }];
    const parsed = M.parseProvider(result.stdout, p.id, Date.now());
    if (!parsed.ok) checks.push({ name: "Output is valid JSON", state: "fail", detail: parsed.error });
    else checks.push(...parsed.provider.checks);
    if (live && parsed.ok) {
      const shown = status && status[p.id];
      const head = parsed.provider.headline;
      const agrees = shown && (!head || shown.remaining === null || Math.abs(shown.remaining - head.remaining) <= 0.02);
      checks.push({ name: "Running widget agrees", state: agrees ? "pass" : "fail",
        detail: !shown ? "no answer from the widget (is the shell up?)"
          : `widget ${M.percent(1 - shown.remaining)}, collector ${M.percent(head.used)} (refresh pending?)` });
    }
    const head = parsed.ok && parsed.provider.headline;
    console.log(`\n${p.id.toUpperCase()}  ${head ? M.headlineText(head, Date.now()) : "no headline"}`);
    for (const c of checks) {
      console.log(`  ${mark[c.state]} ${c.name}${c.state !== "pass" && c.detail ? `\n      ${c.detail}` : ""}`);
      if (c.state !== "pass") bad++;
    }
  });
  console.log(bad ? `\n${bad} check(s) failed or changed` : "\nall checks pass");
  process.exit(bad ? 1 : 0);
})();
