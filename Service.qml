import QtQuick
import Quickshell
import Quickshell.Io
import "Model.js" as Model

Item {
  id: root

  property var settings: ({})
  property var claude: ({ id: "claude", name: "Claude", weekly: null, limits: [], recentDays: [], status: "Loading…" })
  property var codex: ({ id: "codex", name: "Codex", weekly: null, limits: [], recentDays: [], status: "Loading…" })
  property var gemini: ({ id: "gemini", name: "Gemini", weekly: null, limits: [], recentDays: [], status: "Loading…" })
  property bool refreshing: false
  property string lastError: ""
  property date lastUpdated: new Date(0)
  property int _pending: 0
  property string _claudeOutput: ""
  property string _claudeError: ""
  property string _codexOutput: ""
  property string _codexError: ""
  property string _geminiOutput: ""
  property string _geminiError: ""

  readonly property string geminiCollector: String(Qt.resolvedUrl("bin/gemini-usage")).replace(/^file:\/\//, "")
  readonly property int refreshIntervalSec: intSetting("refreshIntervalSec", 300, 60, 3600)

  function setting(name, fallback) {
    var value = settings ? settings[name] : undefined
    return value === undefined || value === null ? fallback : value
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

  function refresh() {
    if (refreshing || claudeProcess.running || codexProcess.running || geminiProcess.running) return
    refreshing = true
    lastError = ""
    _pending = 3
    _claudeOutput = ""
    _claudeError = ""
    _codexOutput = ""
    _codexError = ""
    _geminiOutput = ""
    _geminiError = ""
    claudeProcess.command = ["omarchy-agent-usage-claude", "--limits-only"]
    codexProcess.command = ["omarchy-agent-usage-codex", "--limits-only"]
    // Gemini usage comes from this plugin's own collector: Omarchy's
    // Antigravity record plus Google's per-model quota (see bin/gemini-usage).
    geminiProcess.command = [root.geminiCollector]
    claudeProcess.running = true
    codexProcess.running = true
    geminiProcess.running = true
  }

  function finishOne() {
    _pending = Math.max(0, _pending - 1)
    if (_pending === 0) {
      refreshing = false
      lastUpdated = new Date()
    }
  }

  // Turns one collector run into the provider record the panel draws. A
  // collector that exits cleanly but has no limits to show (a lapsed sign-in)
  // keeps its help text as the status, so the panel can say what to do.
  function collected(current, providerId, name, exitCode, stdout, stderr) {
    if (exitCode !== 0) {
      var failure = conciseError(stderr || stdout, "Could not load " + name + " usage")
      lastError = failure
      return Object.assign({}, current, { status: failure })
    }
    var parsed = Model.parseProvider(stdout, providerId, Date.now())
    if (!parsed.ok) {
      lastError = parsed.error
      return Object.assign({}, current, { status: parsed.error })
    }
    return Object.assign({}, parsed.provider, { id: providerId, name: name })
  }

  Timer {
    interval: root.refreshIntervalSec * 1000
    repeat: true
    running: true
    triggeredOnStart: true
    onTriggered: root.refresh()
  }

  Process {
    id: claudeProcess
    running: false
    command: []
    stdout: StdioCollector {
      id: claudeStdout
      waitForEnd: true
      onStreamFinished: root._claudeOutput = text
    }
    stderr: StdioCollector {
      id: claudeStderr
      waitForEnd: true
      onStreamFinished: root._claudeError = text
    }
    onExited: function(exitCode) {
      root.claude = root.collected(root.claude, "claude", "Claude", exitCode,
        String(claudeStdout.text || root._claudeOutput || ""),
        String(claudeStderr.text || root._claudeError || ""))
      root.finishOne()
    }
  }

  Process {
    id: codexProcess
    running: false
    command: []
    stdout: StdioCollector {
      id: codexStdout
      waitForEnd: true
      onStreamFinished: root._codexOutput = text
    }
    stderr: StdioCollector {
      id: codexStderr
      waitForEnd: true
      onStreamFinished: root._codexError = text
    }
    onExited: function(exitCode) {
      root.codex = root.collected(root.codex, "codex", "Codex", exitCode,
        String(codexStdout.text || root._codexOutput || ""),
        String(codexStderr.text || root._codexError || ""))
      root.finishOne()
    }
  }

  Process {
    id: geminiProcess
    running: false
    command: []
    stdout: StdioCollector {
      id: geminiStdout
      waitForEnd: true
      onStreamFinished: root._geminiOutput = text
    }
    stderr: StdioCollector {
      id: geminiStderr
      waitForEnd: true
      onStreamFinished: root._geminiError = text
    }
    onExited: function(exitCode) {
      root.gemini = root.collected(root.gemini, "gemini", "Gemini", exitCode,
        String(geminiStdout.text || root._geminiOutput || ""),
        String(geminiStderr.text || root._geminiError || ""))
      root.finishOne()
    }
  }
}
