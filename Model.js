.pragma library

var WEEK_MS = 7 * 24 * 60 * 60 * 1000

// How far over the prorated pace a week can run before it counts as behind.
// Without it, a week that starts with your first prompt (Codex) reads as
// behind pace at once: almost none of the week has passed, so any use is over.
var PACE_TOLERANCE = 0.05

// What each provider's record looked like when the widget was last checked
// against it. The debug view and the integration test compare live records
// with this to spot new or dropped fields and models. Rewrite it with
// `node test/integration.test.js --update-baseline` after reviewing a change.
// BASELINE-START
var BASELINE = {
  "claude": {
    "fields": [
      "activeDates",
      "activeDays",
      "authHelpText",
      "hasLocalStats",
      "hasPromptStats",
      "id",
      "limits",
      "limitsFetchedAt",
      "limitsStale",
      "modelUsage",
      "name",
      "ready",
      "recentDays",
      "schemaVersion",
      "tierLabel",
      "todayPrompts",
      "todaySessions",
      "todayTokensByModel",
      "todayTotalTokens",
      "totalPrompts",
      "totalSessions",
      "updatedAt",
      "usageStatusText"
    ]
  },
  "codex": {
    "fields": [
      "activeDates",
      "activeDays",
      "authHelpText",
      "hasLocalStats",
      "hasPromptStats",
      "id",
      "limits",
      "limitsFetchedAt",
      "limitsStale",
      "modelUsage",
      "name",
      "ready",
      "recentDays",
      "resetCredits",
      "schemaVersion",
      "tierLabel",
      "todayPrompts",
      "todaySessions",
      "todayTokensByModel",
      "todayTotalTokens",
      "totalPrompts",
      "totalSessions",
      "updatedAt",
      "usageStatusText"
    ]
  },
  "gemini": {
    "fields": [
      "activeDates",
      "activeDays",
      "authHelpText",
      "googleFields",
      "hasLocalStats",
      "hasPromptStats",
      "id",
      "limits",
      "limitsFetchedAt",
      "limitsStale",
      "modelUsage",
      "name",
      "quotaPools",
      "ready",
      "recentDays",
      "retryAdvised",
      "schemaVersion",
      "tierLabel",
      "todayPrompts",
      "todaySessions",
      "todayTokensByModel",
      "todayTotalTokens",
      "totalPrompts",
      "totalSessions",
      "updatedAt",
      "usageStatusText"
    ],
    "models": [
      "claude-opus-5-5-high",
      "claude-opus-5-5-low",
      "claude-opus-5-5-medium",
      "claude-sonnet-5-5-high",
      "claude-sonnet-5-5-low",
      "claude-sonnet-5-5-medium",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-2.5-flash-thinking",
      "gemini-3-flash",
      "gemini-3.1-flash-image",
      "gemini-3.1-flash-lite",
      "gemini-3.5-flash-lite",
      "gemini-3.8-flash-tiered",
      "gemini-4-hydrogen-sonar",
      "gpt-oss-120b-medium",
      "tab_flash_lite_preview",
      "tab_jump_flash_lite_preview"
    ],
    "googleFields": {
      "quota": [
        "buckets"
      ],
      "quotaBucket": [
        "modelId",
        "remainingFraction",
        "resetTime",
        "tokenType"
      ],
      "summary": [
        "description",
        "groups"
      ],
      "summaryGroup": [
        "buckets",
        "description",
        "displayName"
      ],
      "summaryBucket": [
        "bucketId",
        "displayName",
        "remainingFraction",
        "window"
      ]
    }
  }
}
// BASELINE-END

function number(value, fallback) {
  var parsed = Number(value)
  return isFinite(parsed) ? parsed : fallback
}

// QML hands lists through Repeater delegates as list types that fail
// Array.isArray; accept anything array-like.
function toArray(value) {
  if (Array.isArray(value)) return value
  if (value && typeof value === "object" && typeof value.length === "number") return Array.prototype.slice.call(value)
  return []
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value))
}

function findWeekly(limits) {
  var list = Array.isArray(limits) ? limits : []
  for (var i = 0; i < list.length; i++) {
    var label = String(list[i].label || "").toLowerCase()
    if (label.indexOf("weekly") === 0 && label.indexOf("7-day") >= 0) return list[i]
  }
  for (var j = 0; j < list.length; j++) {
    var fallbackLabel = String(list[j].label || "").toLowerCase()
    if (fallbackLabel.indexOf("weekly") === 0) return list[j]
  }
  return null
}

function normalizeLimit(limit, nowMs) {
  if (!limit) return null
  var used = clamp(number(limit.percent, 0), 0, 1)
  var resetMs = Date.parse(String(limit.resetsAt || ""))
  if (!isFinite(resetMs)) resetMs = 0
  var remaining = 1 - used
  var timeRemaining = resetMs > 0 ? Math.max(0, resetMs - nowMs) : 0
  return {
    label: String(limit.title || limit.label || "Limit"),
    used: used,
    remaining: remaining,
    resetMs: resetMs,
    timeRemainingMs: timeRemaining,
    // The collector's full label ("Gemini (5-hour)") keeps the window name
    // that the short title drops.
    rawLabel: String(limit.label || ""),
    primary: limit.primary === true,
    // "models": an allowance for some models only, listed on the Models view.
    scoped: limit.scope === "models"
  }
}

var MODEL_ID = /^[A-Za-z0-9._-]{1,80}$/

// Groups of models that share one quota (Google reports these per model).
// Bounded and validated: the values come from a network service.
function parsePools(raw, nowMs) {
  var list = Array.isArray(raw) ? raw.slice(0, 16) : []
  var pools = []
  for (var i = 0; i < list.length; i++) {
    var pool = list[i] || {}
    var models = Array.isArray(pool.models) ? pool.models.slice(0, 32) : []
    var names = []
    for (var j = 0; j < models.length; j++) {
      var id = String(models[j] || "")
      if (MODEL_ID.test(id)) names.push(id)
    }
    if (names.length === 0) continue
    var limit = normalizeLimit({ title: String(pool.name || "Models").substring(0, 40), percent: pool.used, resetsAt: pool.resetsAt }, nowMs)
    limit.family = String(pool.family || "").substring(0, 16)
    limit.models = names
    pools.push(limit)
  }
  return pools
}

// Today's tokens per model, largest first.
function parseModelTokens(raw) {
  var rows = []
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return rows
  var keys = Object.keys(raw).slice(0, 32)
  for (var i = 0; i < keys.length; i++) {
    var tokens = Math.max(0, number(raw[keys[i]], 0))
    if (MODEL_ID.test(keys[i]) && tokens > 0) rows.push({ model: keys[i], tokens: tokens })
  }
  rows.sort(function(a, b) { return b.tokens - a.tokens })
  return rows
}

// ---- Model names people read -------------------------------------------

var EFFORTS = ["low", "medium", "high", "xhigh", "max", "minimal"]
var WORDS = { gpt: "GPT", oss: "OSS", ai: "AI" }

// "claude-opus-5-5-high" -> { name: "Claude Opus 5.5", effort: "high" }
function modelParts(id) {
  var tokens = String(id || "").split(/[-_]/).filter(function(t) { return t !== "" })
  var effort = ""
  if (tokens.length > 1 && EFFORTS.indexOf(tokens[tokens.length - 1].toLowerCase()) >= 0) effort = tokens.pop().toLowerCase()
  var words = []
  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i]
    // Anthropic writes versions as "5-5": join neighbouring short numbers.
    if (/^\d{1,2}$/.test(t) && words.length > 0 && /^\d{1,2}$/.test(words[words.length - 1])) {
      words[words.length - 1] += "." + t
      continue
    }
    var lower = t.toLowerCase()
    if (WORDS[lower]) words.push(WORDS[lower])
    else if (/^\d+[a-z]$/i.test(t)) words.push(t.toUpperCase())
    else if (/^[\d.]+$/.test(t)) words.push(t)
    else words.push(lower.charAt(0).toUpperCase() + lower.substring(1))
  }
  return { name: words.join(" "), effort: effort }
}

function modelName(id) {
  var parts = modelParts(id)
  return parts.effort ? parts.name + " · " + parts.effort : parts.name
}

// A pool's models, short: family word dropped and efforts folded together,
// "Opus 5.5 (low, medium, high), Sonnet 5.5 (low, medium, high)".
function poolModelsText(pool) {
  var models = toArray(pool ? pool.models : null)
  var order = []
  var efforts = {}
  for (var i = 0; i < models.length; i++) {
    var parts = modelParts(models[i])
    var words = parts.name.split(" ")
    if (words.length > 1 && pool.family && words[0].toLowerCase() === String(pool.family).toLowerCase()) words.shift()
    var name = words.join(" ")
    if (!efforts[name]) { efforts[name] = []; order.push(name) }
    if (parts.effort) efforts[name].push(parts.effort)
  }
  return order.map(function(name) {
    return efforts[name].length ? name + " (" + efforts[name].join(", ") + ")" : name
  }).join(", ")
}

// ---- Checks for the debug view and the integration test -----------------

function setDiff(now, before) {
  var added = [], removed = []
  for (var i = 0; i < now.length; i++) if (before.indexOf(now[i]) < 0) added.push(now[i])
  for (var j = 0; j < before.length; j++) if (now.indexOf(before[j]) < 0) removed.push(before[j])
  return { added: added, removed: removed }
}

function diffText(diff) {
  var parts = []
  if (diff.added.length) parts.push("new: " + diff.added.join(", "))
  if (diff.removed.length) parts.push("gone: " + diff.removed.join(", "))
  return parts.join(" · ")
}

// One check: state is "pass", "fail" (the widget may be wrong) or "changed"
// (the provider sent something new; the widget still works, but look).
function check(name, ok, detail, changed) {
  return { name: name, state: ok ? "pass" : (changed ? "changed" : "fail"), detail: ok ? "" : String(detail || "") }
}

function changeCheck(name, now, before) {
  if (!before) return null
  var diff = setDiff(now, before)
  return check(name, diff.added.length === 0 && diff.removed.length === 0, diffText(diff), true)
}

function recordChecks(raw, provider, providerId, baseline) {
  var base = baseline || {}
  var checks = []
  checks.push(check("Has a limit for the bar", !!provider.headline, "no usable limit in the record"))
  if (providerId === "gemini") {
    var hasGemini = provider.pools.some(function(p) { return p.family === "gemini" })
    checks.push(check("Google reports a Gemini pool", hasGemini, "no Gemini models in Google's per-model quota"))
  } else {
    checks.push(check("Weekly window reported", !!provider.weekly, "no weekly limit, so no pace"))
  }
  var inRange = provider.limits.every(function(l) { return l.used >= 0 && l.used <= 1 })
  checks.push(check("Percentages in range", inRange, "a limit is outside 0–100%"))
  var timed = provider.limits.filter(function(l) { return l.used > 0 && !started(l) }).map(function(l) { return l.label })
  checks.push(check("Used windows have reset times", timed.length === 0, timed.join(", ")))
  checks.push(check("Data is fresh", raw.limitsStale !== true, "the last good answer is being reused"))
  checks.push(check("Signed in", !raw.authHelpText, String(raw.authHelpText || "").substring(0, 160)))

  var fields = changeCheck("Record fields unchanged", Object.keys(raw).slice(0, 64).sort(), base.fields)
  if (fields) checks.push(fields)
  if (providerId === "gemini") {
    var models = []
    provider.pools.forEach(function(p) { models = models.concat(p.models) })
    var modelCheck = changeCheck("Model list unchanged", models.sort(), base.models)
    if (modelCheck) checks.push(modelCheck)
    var google = raw.googleFields || {}
    var before = base.googleFields || {}
    var googleChanges = []
    Object.keys(before).forEach(function(key) {
      var diff = setDiff(Array.isArray(google[key]) ? google[key] : [], before[key])
      if (diff.added.length || diff.removed.length) googleChanges.push(key + " " + diffText(diff))
    })
    if (Object.keys(before).length) checks.push(check("Google's fields unchanged", googleChanges.length === 0, googleChanges.join("; "), true))
  }
  return checks
}

// The checks that didn't pass, as short sentences (IPC status, tests).
function problems(checks) {
  return (Array.isArray(checks) ? checks : []).filter(function(c) { return c.state !== "pass" })
    .map(function(c) { return c.name + (c.detail ? ": " + c.detail : "") })
}

// ---- Parsing ------------------------------------------------------------

function parseProvider(stdout, providerId, nowMs, baseline) {
  try {
    var raw = JSON.parse(String(stdout || ""))
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("not an object")
    var limits = Array.isArray(raw.limits) ? raw.limits : []
    var weekly = normalizeLimit(findWeekly(limits), nowMs)
    var normalized = []
    var primary = null
    for (var i = 0; i < limits.length; i++) {
      var item = normalizeLimit(limits[i], nowMs)
      if (!item) continue
      normalized.push(item)
      if (item.primary && !primary) primary = item
    }
    var provider = {
      id: String(providerId || raw.id || ""),
      name: String(raw.name || providerId || ""),
      plan: String(raw.plan || ""),
      status: [String(raw.usageStatusText || ""), String(raw.authHelpText || "")]
        .filter(function(part) { return part !== "" }).join(" · "),
      weekly: weekly,
      // The number the bar shows: the weekly window when there is one,
      // else the limit the collector marks as the plan's own.
      headline: weekly || primary || normalized[0] || null,
      limits: normalized,
      pools: parsePools(raw.quotaPools, nowMs),
      todayModels: parseModelTokens(raw.todayTokensByModel),
      recentDays: Array.isArray(raw.recentDays) ? raw.recentDays : [],
      updatedAt: String(raw.updatedAt || ""),
      tier: String(raw.tierLabel || ""),
      fetchedAtMs: number(raw.limitsFetchedAt, 0),
      stale: raw.limitsStale === true
    }
    var base = baseline === undefined ? BASELINE[providerId] : baseline
    provider.checks = recordChecks(raw, provider, providerId, base)
    provider.warnings = problems(provider.checks)
    return { ok: true, provider: provider }
  } catch (error) {
    return { ok: false, error: "Could not parse " + providerId + " usage" }
  }
}

// The live values a baseline is written from (integration test).
function baselineOf(stdout, providerId) {
  var raw = JSON.parse(String(stdout || ""))
  var entry = { fields: Object.keys(raw).slice(0, 64).sort() }
  if (providerId === "gemini") {
    var models = []
    parsePools(raw.quotaPools, Date.now()).forEach(function(p) { models = models.concat(p.models) })
    entry.models = models.sort()
    entry.googleFields = raw.googleFields || {}
  }
  return entry
}

// ---- Pace ---------------------------------------------------------------

function expectedRemaining(weekly, nowMs) {
  if (!weekly || weekly.resetMs <= 0) return 0
  return clamp((weekly.resetMs - nowMs) / WEEK_MS, 0, 1)
}

function paceDifference(weekly, nowMs) {
  if (!weekly) return 0
  return weekly.remaining - expectedRemaining(weekly, nowMs)
}

function behindPace(weekly, nowMs) {
  if (!weekly || weekly.resetMs <= 0) return false
  return paceDifference(weekly, nowMs) < -PACE_TOLERANCE
}

function paceText(weekly, nowMs) {
  if (!weekly) return "No weekly limit"
  if (!started(weekly)) return "Window not started"
  var difference = paceDifference(weekly, nowMs)
  var points = Math.round(Math.abs(difference) * 100)
  if (points === 0) return "On pace"
  if (difference > 0) return points + "% ahead of pace"
  return behindPace(weekly, nowMs) ? points + "% behind pace" : "Near pace · " + points + "% over"
}

// ---- Text ---------------------------------------------------------------

function percent(value) {
  return Math.round(clamp(number(value, 0), 0, 1) * 100) + "%"
}

function countdown(resetMs, nowMs) {
  if (!resetMs || resetMs <= nowMs) return "now"
  var minutes = Math.max(0, Math.floor((resetMs - nowMs) / 60000))
  var days = Math.floor(minutes / 1440)
  var hours = Math.floor((minutes % 1440) / 60)
  var mins = minutes % 60
  if (days > 0) return days + "d " + hours + "h"
  if (hours > 0) return hours + "h " + mins + "m"
  return mins + "m"
}

// A window reported without a reset time hasn't started: nothing has counted
// against it yet, so there is no clock to pace against.
function started(limit) {
  return !!limit && limit.resetMs > 0
}

function resetText(limit, nowMs) {
  if (!limit) return ""
  return started(limit) ? "resets in " + countdown(limit.resetMs, nowMs) : "window not started"
}

function shortResetText(limit, nowMs) {
  if (!limit) return ""
  return started(limit) ? countdown(limit.resetMs, nowMs) : "not started"
}

// An untouched pool's reset keeps rolling forward, so it says nothing yet.
function poolText(pool, nowMs) {
  if (!pool) return ""
  if (pool.used <= 0) return "unused"
  return percent(pool.used) + " used · " + shortResetText(pool, nowMs)
}

function windowName(limit) {
  var full = String(limit ? (limit.rawLabel || limit.label) : "")
  if (full.toLowerCase().indexOf("weekly") === 0) return "weekly"
  var match = /\(([^)]+)\)/.exec(full)
  return match ? match[1] : ""
}

function headlineText(limit, nowMs) {
  if (!limit) return ""
  var window = windowName(limit)
  return percent(limit.used) + (window && window !== "weekly" ? " of " + window : "") + " used · " + resetText(limit, nowMs)
}

function expectedText(weekly, nowMs) {
  if (!started(weekly)) return "Expected —"
  return "Expected " + percent(1 - expectedRemaining(weekly, nowMs)) + " used"
}

function dayTokens(day) {
  return Math.max(0, number(day ? day.messageCount : 0, 0))
}

function recentTotal(days) {
  var list = Array.isArray(days) ? days : []
  var total = 0
  for (var i = 0; i < list.length; i++) total += dayTokens(list[i])
  return total
}

function recentPeak(days) {
  var list = Array.isArray(days) ? days : []
  var peak = 0
  for (var i = 0; i < list.length; i++) peak = Math.max(peak, dayTokens(list[i]))
  return peak
}

function tokenCount(value) {
  var amount = Math.max(0, number(value, 0))
  if (amount >= 1000000000) return (amount / 1000000000).toFixed(amount >= 10000000000 ? 0 : 1).replace(/\.0$/, "") + "B"
  if (amount >= 1000000) return (amount / 1000000).toFixed(amount >= 100000000 ? 0 : 1).replace(/\.0$/, "") + "M"
  if (amount >= 1000) return (amount / 1000).toFixed(amount >= 100000 ? 0 : 1).replace(/\.0$/, "") + "K"
  return String(Math.round(amount))
}

function dayLabel(value) {
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""))
  if (!match) return "—"
  var date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()]
}

var exportsObject = {
  WEEK_MS: WEEK_MS,
  PACE_TOLERANCE: PACE_TOLERANCE,
  toArray: toArray,
  findWeekly: findWeekly,
  normalizeLimit: normalizeLimit,
  parseProvider: parseProvider,
  parsePools: parsePools,
  parseModelTokens: parseModelTokens,
  recordChecks: recordChecks,
  problems: problems,
  baselineOf: baselineOf,
  modelName: modelName,
  poolModelsText: poolModelsText,
  expectedRemaining: expectedRemaining,
  behindPace: behindPace,
  paceDifference: paceDifference,
  paceText: paceText,
  percent: percent,
  countdown: countdown,
  started: started,
  resetText: resetText,
  shortResetText: shortResetText,
  poolText: poolText,
  windowName: windowName,
  headlineText: headlineText,
  expectedText: expectedText,
  dayTokens: dayTokens,
  recentTotal: recentTotal,
  recentPeak: recentPeak,
  tokenCount: tokenCount,
  dayLabel: dayLabel
}

if (typeof module !== "undefined" && module.exports) module.exports = exportsObject
