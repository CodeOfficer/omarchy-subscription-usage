.pragma library

var WEEK_MS = 7 * 24 * 60 * 60 * 1000

function number(value, fallback) {
  var parsed = Number(value)
  return isFinite(parsed) ? parsed : fallback
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
    primary: limit.primary === true
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

// What a provider's record should look like for the widget to be right.
// Each warning is a short sentence; none means the record matches what the
// widget was built against. Used by the D debug view and the integration test.
function contractWarnings(raw, provider, providerId) {
  var warnings = []
  if (!raw || typeof raw !== "object") return ["record is not a JSON object"]
  if (!Array.isArray(raw.limits)) warnings.push("no limits array")
  else if (raw.limits.length === 0) warnings.push("limits array is empty")
  if (!provider.headline) warnings.push("no headline limit for the bar")
  if (providerId !== "gemini" && !provider.weekly) warnings.push("no weekly window, so no pace")
  if (providerId === "gemini") {
    var hasGemini = false
    for (var i = 0; i < provider.pools.length; i++) {
      if (String(provider.pools[i].label).toLowerCase().indexOf("gemini") === 0) hasGemini = true
    }
    if (!hasGemini) warnings.push("Google reported no Gemini pool")
  }
  if (raw.limitsStale === true) warnings.push("limits are stale (last good answer reused)")
  if (raw.authHelpText) warnings.push("sign-in: " + String(raw.authHelpText).substring(0, 160))
  for (var j = 0; j < provider.limits.length; j++) {
    var limit = provider.limits[j]
    if (limit.used > 0 && !started(limit)) warnings.push(limit.label + " is used but has no reset time")
  }
  return warnings
}

function parseProvider(stdout, providerId, nowMs) {
  try {
    var raw = JSON.parse(String(stdout || ""))
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
    provider.warnings = contractWarnings(raw, provider, providerId)
    return { ok: true, provider: provider }
  } catch (error) {
    return { ok: false, error: "Could not parse " + providerId + " usage" }
  }
}

function expectedRemaining(weekly, nowMs) {
  if (!weekly || weekly.resetMs <= 0) return 0
  return clamp((weekly.resetMs - nowMs) / WEEK_MS, 0, 1)
}

function behindPace(weekly, nowMs) {
  if (!weekly || weekly.resetMs <= 0) return false
  return weekly.remaining + 0.0005 < expectedRemaining(weekly, nowMs)
}

function paceDifference(weekly, nowMs) {
  if (!weekly) return 0
  return weekly.remaining - expectedRemaining(weekly, nowMs)
}

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

// A window Google (or anyone) reports without a reset time hasn't started:
// nothing has counted against it yet, so there is no clock to pace against.
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

function expectedText(weekly, nowMs) {
  if (!started(weekly)) return "Expected —"
  return "Expected " + percent(1 - expectedRemaining(weekly, nowMs)) + " used"
}

function paceText(weekly, nowMs) {
  if (!weekly) return "No weekly limit"
  if (!started(weekly)) return "Window not started"
  var points = Math.round(Math.abs(paceDifference(weekly, nowMs)) * 100)
  if (points === 0) return "On pace"
  return points + "% " + (behindPace(weekly, nowMs) ? "behind pace" : "ahead of pace")
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
  findWeekly: findWeekly,
  normalizeLimit: normalizeLimit,
  parseProvider: parseProvider,
  expectedRemaining: expectedRemaining,
  behindPace: behindPace,
  paceDifference: paceDifference,
  percent: percent,
  countdown: countdown,
  paceText: paceText,
  started: started,
  contractWarnings: contractWarnings,
  parsePools: parsePools,
  parseModelTokens: parseModelTokens,
  poolText: poolText,
  windowName: windowName,
  resetText: resetText,
  shortResetText: shortResetText,
  expectedText: expectedText,
  dayTokens: dayTokens,
  recentTotal: recentTotal,
  recentPeak: recentPeak,
  tokenCount: tokenCount,
  dayLabel: dayLabel
}

if (typeof module !== "undefined" && module.exports) module.exports = exportsObject
