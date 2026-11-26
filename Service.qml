import QtQuick
import QtQml
import Quickshell
import Quickshell.Io
import "Model.js" as Model

// Runs one collector per enabled provider (Model.PROVIDERS) and keeps the
// provider records the panel draws, keyed by provider id.
Item {
  id: root

  property var settings: ({})
  property var records: initialRecords()
  property bool refreshing: false
  property string lastError: ""
  property double _startedAt: 0
  property int _pending: 0

  readonly property var providers: Model.PROVIDERS
  readonly property string binDir: String(Qt.resolvedUrl("bin")).replace(/^file:\/\//, "")
  // Ids of the providers to show, in bar order (settings showClaude, showSuno, …).
  // A hidden provider's collector never runs.
  readonly property var shown: providers.filter(function(p) { return boolSetting(p.setting, p.defaultOn) })
    .map(function(p) { return p.id })
  readonly property int refreshIntervalSec: intSetting("refreshIntervalSec", 300, 60, 3600)
  readonly property bool signingIn: signInProcess.running

  function initialRecords() {
    var map = {}
    Model.PROVIDERS.forEach(function(p) { map[p.id] = Model.placeholder(p) })
    return map
  }

  function record(id) { return records[id] || null }
  function config(id) { return Model.providerConfig(id) }
  function iconOf(id) { var c = config(id); return c ? Qt.resolvedUrl(c.icon) : "" }
  function tinted(id) { var c = config(id); return !!c && c.tint === true }
  function canSignIn(id) { var c = config(id); return !!c && !!c.signIn }
  function canSetUp(id) { var c = config(id); return !!c && !!c.setup }

  // Runs a provider's one-time setup command (Gemini: `omp login
  // antigravity-cli`) in Omarchy's floating terminal. It returns at once;
  // the next refresh (or R in the panel) picks up the result.
  function setUp(id) {
    var c = config(id)
    if (!c || !c.setup) return false
    Quickshell.execDetached(["omarchy-launch-floating-terminal-with-presentation", c.setup.command])
    return true
  }

  function setRecord(id, value) {
    var next = Object.assign({}, records)
    next[id] = value
    records = next
  }

  function setting(name, fallback) {
    var value = settings ? settings[name] : undefined
    return value === undefined || value === null ? fallback : value
  }

  function boolSetting(name, fallback) {
    var value = setting(name, fallback)
    return value === true || value === "true"
  }

  function intSetting(name, fallback, minimum, maximum) {
    var value = parseInt(String(setting(name, fallback)), 10)
    if (!isFinite(value)) value = fallback
    return Math.max(minimum, Math.min(maximum, value))
  }

  function conciseError(value, fallback) {
    var text = String(value || fallback || "Usage request failed").replace(/\s+/g, " ").trim()
    return text.length > 180 ? text.substring(0, 177) + "…" : text
  }

  function runnerFor(id) {
    for (var i = 0; i < providers.length; i++) if (providers[i].id === id) return runners.objectAt(i)
    return null
  }

  function refresh() {
    if (refreshing) return
    var runs = shown.map(runnerFor).filter(function(r) { return r && !r.running })
    if (runs.length === 0) return
    refreshing = true
    _startedAt = Date.now()
    lastError = ""
    _pending = runs.length
    runs.forEach(function(r) {
      r.out = ""
      r.err = ""
      r.command = Model.commandOf(r.provider, root.binDir)
      r.running = true
    })
  }

  function finishOne() {
    _pending = Math.max(0, _pending - 1)
    if (_pending === 0) refreshing = false
  }

  // Opens the provider's sign-in window (bin/browser-signin); refreshes when
  // it closes, so the panel shows the new sign-in at once.
  function signIn(id) {
    var c = config(id)
    if (!c || !c.signIn || signInProcess.running) return false
    signInProcess.command = [binDir + "/browser-signin", c.id, c.signIn.url]
    signInProcess.running = true
    return true
  }

  // Turns one collector run into the provider record the panel draws. A
  // collector that exits cleanly but has no limits to show (a lapsed sign-in)
  // keeps its help text as the status, so the panel can say what to do.
  function collected(current, providerId, name, command, exitCode, stdout, stderr) {
    // What the D debug view shows: how this run went, apart from what it said.
    var debug = {
      command: command.join(" "),
      exitCode: exitCode,
      ms: Math.max(0, Date.now() - _startedAt),
      bytes: stdout.length,
      stderr: stderr ? conciseError(stderr, "") : "",
      at: new Date().toISOString()
    }
    if (exitCode !== 0) {
      var failure = conciseError(stderr || stdout, "Could not load " + name + " usage")
      lastError = failure
      return Object.assign({}, current, { status: failure, debug: debug, warnings: ["collector exited with code " + exitCode] })
    }
    var parsed = Model.parseProvider(stdout, providerId, Date.now())
    if (!parsed.ok) {
      lastError = parsed.error
      return Object.assign({}, current, { status: parsed.error, debug: debug, warnings: ["collector output is not valid JSON"] })
    }
    return Object.assign({}, parsed.provider, { id: providerId, name: name, debug: debug })
  }

  Timer {
    interval: root.refreshIntervalSec * 1000
    repeat: true
    running: true
    triggeredOnStart: true
    onTriggered: root.refresh()
  }

  // One collector process per provider in the table.
  Instantiator {
    id: runners
    model: root.providers.length

    delegate: Process {
      id: runner
      readonly property var provider: root.providers[index]
      property string out: ""
      property string err: ""
      running: false
      command: []
      stdout: StdioCollector {
        id: runnerStdout
        waitForEnd: true
        onStreamFinished: runner.out = text
      }
      stderr: StdioCollector {
        id: runnerStderr
        waitForEnd: true
        onStreamFinished: runner.err = text
      }
      onExited: function(exitCode) {
        root.setRecord(runner.provider.id, root.collected(root.record(runner.provider.id), runner.provider.id, runner.provider.name,
          runner.command, exitCode, String(runnerStdout.text || runner.out || ""), String(runnerStderr.text || runner.err || "")))
        root.finishOne()
      }
    }
  }

  Process {
    id: signInProcess
    running: false
    command: []
    onExited: root.refresh()
  }
}
