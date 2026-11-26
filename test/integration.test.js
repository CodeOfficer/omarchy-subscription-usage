// Live integration check: runs each collector the widget runs, on this
// machine, and checks its record against what the widget expects.
//
//   node test/integration.test.js          collectors only
//   node test/integration.test.js --live   also compare with the running widget
//
// Exits 1 when a provider breaks the contract, so it can run from cron or a
// hook as an early signal that a provider changed something. It reads usage
// only; it never spends quota.
const { execFile } = require("child_process");
const fs = require("fs"), path = require("path"), Module = require("module");

const root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(root, "Model.js"), "utf8").replace(/^\.pragma library\s*$/m, "");
const mod = new Module("Model.js"); mod._compile(src, "Model.js");
const M = mod.exports;

const providers = [
  { id: "claude", command: ["omarchy-agent-usage-claude", "--limits-only"] },
  { id: "codex", command: ["omarchy-agent-usage-codex", "--limits-only"] },
  { id: "gemini", command: [path.join(root, "bin", "gemini-usage")] },
];

function run(command) {
  return new Promise((resolve) => {
    const started = Date.now();
    execFile(command[0], command.slice(1), { timeout: 90000, maxBuffer: 4 << 20 }, (error, stdout, stderr) => {
      resolve({ code: error ? (error.code ?? 1) : 0, stdout, stderr, ms: Date.now() - started });
    });
  });
}

function check(id, result) {
  const problems = [];
  if (result.code !== 0) problems.push(`exited with ${result.code}: ${String(result.stderr).trim().slice(0, 200)}`);
  const parsed = M.parseProvider(result.stdout, id, Date.now());
  if (!parsed.ok) return { problems: problems.concat(["output is not valid JSON"]) };
  const p = parsed.provider;
  for (const limit of p.limits) {
    if (!(limit.used >= 0 && limit.used <= 1)) problems.push(`${limit.label}: percent ${limit.used} out of range`);
  }
  problems.push(...p.warnings);
  return { problems, provider: p };
}

function liveStatus() {
  return new Promise((resolve) => {
    execFile("omarchy-shell", ["codeofficer.agent-usage", "status"], { timeout: 15000 }, (error, stdout) => {
      try { resolve(error ? null : JSON.parse(stdout)); } catch { resolve(null); }
    });
  });
}

(async () => {
  const live = process.argv.includes("--live");
  const results = await Promise.all(providers.map((p) => run(p.command)));
  const status = live ? await liveStatus() : null;
  let failed = 0;
  providers.forEach((p, i) => {
    const { problems, provider } = check(p.id, results[i]);
    const head = provider && provider.headline;
    const summary = head ? `${M.percent(head.used)} of ${M.windowName(head) || head.label}` : "no headline";
    if (live) {
      const shown = status && status[p.id];
      if (!shown) problems.push("running widget did not answer (is the shell up?)");
      else if (head && shown.remaining !== null && Math.abs(shown.remaining - head.remaining) > 0.02)
        problems.push(`widget shows ${M.percent(1 - shown.remaining)}, collector says ${M.percent(head.used)} (stale until next refresh?)`);
    }
    const mark = problems.length ? "FAIL" : "ok  ";
    console.log(`${mark} ${p.id.padEnd(7)} ${summary.padEnd(22)} ${results[i].ms} ms`);
    for (const problem of problems) console.log(`       ! ${problem}`);
    if (problems.length) failed++;
  });
  process.exit(failed ? 1 : 0);
})();
