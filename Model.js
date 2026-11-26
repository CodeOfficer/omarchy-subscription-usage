.pragma library

var HOUR_MS = 60 * 60 * 1000
var DAY_MS = 24 * HOUR_MS
var WEEK_MS = 7 * DAY_MS

// How far use can run ahead of the time gone before it turns red. Without
// it, a week that starts with your first prompt (Codex) would be red at
// once: almost none of the week has gone, so any use is ahead of it.
var PACE_TOLERANCE = 0.05

// Every provider the widget knows, in bar order. Adding one is a row here, a
// collector that prints the shared record shape, an icon, and a manifest
// setting (`setting`, default `defaultOn`).
//   command  an Omarchy collector on PATH;  bin  one of this plugin's bin/ scripts
//   signIn   { url }: no CLI keeps a sign-in, so the panel offers a Sign in
//            button that opens `url` in a browser profile of the plugin's own
//   setup    { label, command }: a one-time terminal step the panel offers
//            while the provider has no live answer and says setupNeeded
var PROVIDERS = [
  { id: "claude", name: "Claude", setting: "showClaude", defaultOn: true, command: ["omarchy-agent-usage-claude", "--limits-only"], icon: "claude.svg", tint: false },
  { id: "codex", name: "Codex", setting: "showCodex", defaultOn: true, command: ["omarchy-agent-usage-codex", "--limits-only"], icon: "codex.svg", tint: true },
  { id: "gemini", name: "Gemini", setting: "showGemini", defaultOn: true, bin: "gemini-usage", icon: "gemini.svg", tint: false,
    setup: { label: "Set up Gemini auto-refresh", command: "omp login antigravity-cli" } },
  { id: "suno", name: "Suno", setting: "showSuno", defaultOn: false, bin: "suno-usage", icon: "suno.svg", tint: true, signIn: { url: "https://suno.com" } }
]

function providerConfig(id) {
  for (var i = 0; i < PROVIDERS.length; i++) if (PROVIDERS[i].id === id) return PROVIDERS[i]
  return null
}

// The command that collects a provider's record; binDir is this plugin's bin/.
function commandOf(config, binDir) {
  return config.bin ? [String(binDir) + "/" + config.bin] : config.command.slice()
}

// What the panel shows before a provider's first answer.
function placeholder(config) {
  return { id: config.id, name: config.name, weekly: null, pace: null, headline: null, limits: [], pools: [], recentDays: [], live: true, status: "Loading…" }
}

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
      "setupNeeded",
      "sourceFields",
      "tierLabel",
      "todayPrompts",
      "todaySessions",
      "todayTokensByModel",
      "todayTotalTokens",
      "tokenSource",
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
    "sourceFields": {
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
  },
  "suno": {
    "fields": [
      "authHelpText",
      "credits",
      "id",
      "limits",
      "limitsFetchedAt",
      "name",
      "plan",
      "planModels",
      "schemaVersion",
      "signInRequired",
      "sourceFields",
      "tierLabel",
      "updatedAt",
      "usageStatusText"
    ],
    "sourceFields": {
      "billing": [
        "accessible_features",
        "agentic_limits",
        "audio_upload_limits",
        "can_upgrade_immediately",
        "country_code",
        "credit_packs",
        "credits",
        "day0_boost",
        "default_currency",
        "download_credit_packs",
        "download_usage",
        "eligible_currencies",
        "free_cover_clips_remaining",
        "free_mobile_remasters_remaining",
        "free_mobile_v4_gens_remaining",
        "free_persona_clips_remaining",
        "free_remasters_remaining",
        "free_vox_gens_remaining",
        "free_web_v4_gens_remaining",
        "has_been_student_subscriber_before",
        "has_been_subscriber_before",
        "has_valid_school_email",
        "is_active",
        "is_gifted",
        "is_past_due",
        "is_pause_scheduled",
        "is_paused",
        "last_subscription_period_end",
        "max_active_custom_models",
        "max_custom_model_clips",
        "models",
        "monthly_limit",
        "monthly_usage",
        "payment_method_type",
        "period",
        "period_end",
        "plan",
        "plan_currency",
        "plan_currency_price",
        "plan_price",
        "plans",
        "promotions",
        "remaster_model_types",
        "renews_on",
        "revcat_subscriptions_offering_id",
        "subscription_anchor",
        "subscription_id",
        "subscription_platform",
        "subscription_type",
        "total_credits_left",
        "visual_credit_packs",
        "visuals_credits_left",
        "voice_record_limits",
        "voice_upload_limits"
      ],
      "plan": [
        "annual_price_usd",
        "features",
        "id",
        "level",
        "monthly_price_usd",
        "name",
        "plan_key",
        "prices",
        "usage_plan_features",
        "visuals_credits"
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
  // How long the window runs, for pace: a weekly label means 7 days; a
  // billing period says when it began (windowStartsAt).
  var startMs = Date.parse(String(limit.windowStartsAt || ""))
  var windowMs = isFinite(startMs) && resetMs > startMs ? resetMs - startMs
    : String(limit.label || "").toLowerCase().indexOf("weekly") === 0 ? WEEK_MS : 0
  return {
    windowMs: windowMs,
    // A line of plain detail from the collector ("2,500 of 2,500 credits left").
    detail: String(limit.detail || "").substring(0, 80),
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

// A check that could not run: it needs a live answer, and the provider's
// failure is already reported once (by "Signed in" or "Data is fresh").
function skipped(name, why) {
  return { name: name, state: "skipped", detail: why }
}

// Whether the record is a fresh answer from the provider, signed in: only
// then do checks on what the provider sent (pools, fields, models) mean
// anything. Otherwise one lapsed sign-in would fail half the list.
function isLive(raw) {
  return raw.limitsStale !== true && raw.signInRequired !== true && !aboutSignIn(raw)
}

function aboutSignIn(raw) {
  var notice = String(raw.authHelpText || "").substring(0, 160)
  return /sign|log ?in|auth|token|expired|lapsed/i.test(notice) && !/rate limit/i.test(notice)
}

function recordChecks(raw, provider, providerId, baseline) {
  var base = baseline || {}
  var checks = []
  var live = isLive(raw)
  var waiting = "needs a live answer from the provider; see Signed in / Data is fresh"
  checks.push(check("Has a limit for the bar", !!provider.headline, "no usable limit in the record"))
  if (!live) {
    var names = providerId === "gemini" ? ["Google reports a Gemini pool"]
      : providerId === "suno" ? ["Billing period reported"] : ["Weekly window reported"]
    names.forEach(function(n) { checks.push(skipped(n, waiting)) })
  } else if (providerId === "gemini") {
    var hasGemini = provider.pools.some(function(p) { return p.family === "gemini" })
    checks.push(check("Google reports a Gemini pool", hasGemini, "no Gemini models in Google's per-model quota"))
  } else if (providerId === "suno") {
    checks.push(check("Billing period reported", !!provider.pace, "no period end, so no pace"))
    // Suno sends the balance and its parts separately; if they stop adding
    // up, its credits work differently now (daily credits after a used-up
    // month, say) and the percent may mislead.
    var c = raw.credits && typeof raw.credits === "object" ? raw.credits : null
    if (c && number(c.monthlyLimit, 0) > 0) {
      var expected = number(c.monthlyLimit, 0) - number(c.monthlyUsage, 0) + number(c.extra, 0)
      checks.push(check("Credits add up", number(c.left, -1) === expected,
        "left " + c.left + ", expected " + expected + " (limit − used + extra)"))
    }
  } else {
    checks.push(check("Weekly window reported", !!provider.weekly, "no weekly limit, so no pace"))
  }
  var inRange = provider.limits.every(function(l) { return l.used >= 0 && l.used <= 1 })
  checks.push(check("Percentages in range", inRange, "a limit is outside 0–100%"))
  var timed = provider.limits.filter(function(l) { return l.used > 0 && !started(l) }).map(function(l) { return l.label })
  checks.push(check("Used windows have reset times", timed.length === 0, timed.join(", ")))
  checks.push(check("Data is fresh", raw.limitsStale !== true, "the last good answer is being reused"))
  // Collectors put every notice in authHelpText; only some are about the sign-in.
  var notice = String(raw.authHelpText || "").substring(0, 160)
  var signInNotice = aboutSignIn(raw)
  var source = /^[a-z]{1,12}$/.test(String(raw.tokenSource || "")) ? " (" + raw.tokenSource + ")" : ""
  checks.push(check("Signed in" + source, !signInNotice && raw.signInRequired !== true, notice || "not signed in"))
  checks.push(check("Provider answered normally", !notice || signInNotice, notice))

  // Baseline comparisons: only against a live answer.
  var compare = []
  var fields = changeCheck("Record fields unchanged", Object.keys(raw).slice(0, 64).sort(), base.fields)
  if (fields) compare.push(fields)
  if (providerId === "gemini") {
    var models = []
    provider.pools.forEach(function(p) { models = models.concat(p.models) })
    var modelCheck = changeCheck("Model list unchanged", models.sort(), base.models)
    if (modelCheck) compare.push(modelCheck)
  }
  var sourceCheck = sourceFieldsCheck(raw, providerId, base)
  if (sourceCheck) compare.push(sourceCheck)
  compare.forEach(function(c) { checks.push(live ? c : skipped(c.name, waiting)) })
  return checks
}

// The field names the vendor's own service answered with (sourceFields),
// compared with the baseline.
function sourceFieldsCheck(raw, providerId, base) {
  var now = raw.sourceFields && typeof raw.sourceFields === "object" ? raw.sourceFields : {}
  var before = base.sourceFields || {}
  if (Object.keys(before).length === 0) return null
  var changes = []
  Object.keys(before).forEach(function(part) {
    var diff = setDiff(Array.isArray(now[part]) ? now[part] : [], before[part])
    if (diff.added.length || diff.removed.length) changes.push(part + " " + diffText(diff))
  })
  var owner = providerId === "gemini" ? "Google" : (providerConfig(providerId) || { name: providerId }).name
  return check(owner + "'s fields unchanged", changes.length === 0, changes.join("; "), true)
}

// The checks that didn't pass, as short sentences (IPC status, tests).
function problems(checks) {
  return (Array.isArray(checks) ? checks : []).filter(function(c) { return c.state !== "pass" && c.state !== "skipped" })
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
    var headline = weekly || primary || normalized[0] || null
    var config = providerConfig(providerId)
    var planModels = Array.isArray(raw.planModels) ? raw.planModels.slice(0, 16).map(String).filter(function(m) { return MODEL_ID.test(m) }) : []
    var provider = {
      id: String(providerId || raw.id || ""),
      name: String(raw.name || providerId || ""),
      plan: String(raw.plan || ""),
      status: [String(raw.usageStatusText || ""), String(raw.authHelpText || "")]
        .filter(function(part) { return part !== "" }).join(" · "),
      weekly: weekly,
      // The number the bar shows: the weekly window when there is one,
      // else the limit the collector marks as the plan's own.
      headline: headline,
      // The window pace is measured against: the week, else the headline
      // when it says how long it runs (Suno's billing month).
      pace: weekly || (headline && headline.windowMs > 0 ? headline : null),
      // The collector found no usable sign-in; the panel offers Sign in.
      signInNeeded: raw.signInRequired === true,
      // A one-time setup step would keep this provider live (Gemini: omp).
      setupNeeded: raw.setupNeeded === true,
      // Which sign-in answered, when the collector can use more than one.
      tokenSource: /^[a-z]{1,12}$/.test(String(raw.tokenSource || "")) ? String(raw.tokenSource) : "",
      limits: normalized,
      pools: parsePools(raw.quotaPools, nowMs),
      planModels: planModels,
      // Only agent CLIs count tokens; others have no "today by model".
      tracksTokens: !!raw.todayTokensByModel && typeof raw.todayTokensByModel === "object",
      todayModels: parseModelTokens(raw.todayTokensByModel),
      recentDays: Array.isArray(raw.recentDays) ? raw.recentDays : [],
      // A fresh, signed-in answer (else the numbers shown are old or absent).
      live: isLive(raw),
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
  }
  if (raw.sourceFields && typeof raw.sourceFields === "object") entry.sourceFields = raw.sourceFields
  return entry
}

// ---- Pace ---------------------------------------------------------------

// The share of the window still to come: what would be left at an even pace.
// `weekly` is any paced window; its length is windowMs (a week by default).
function expectedRemaining(weekly, nowMs) {
  if (!weekly || weekly.resetMs <= 0) return 0
  var length = weekly.windowMs > 0 ? weekly.windowMs : WEEK_MS
  return clamp((weekly.resetMs - nowMs) / length, 0, 1)
}

function paceDifference(weekly, nowMs) {
  if (!weekly) return 0
  return weekly.remaining - expectedRemaining(weekly, nowMs)
}

// tolerance: fraction of the week (0.05 = 5 points); the panel passes the
// user's paceTolerancePercent setting.
function behindPace(weekly, nowMs, tolerance) {
  if (!weekly || weekly.resetMs <= 0) return false
  var allowed = tolerance === undefined ? PACE_TOLERANCE : clamp(number(tolerance, PACE_TOLERANCE), 0, 1)
  return paceDifference(weekly, nowMs) < -allowed
}

// Whether a provider should turn red: its paced window is running ahead.
function paceAlarm(provider, nowMs, tolerance) {
  return !!provider && behindPace(provider.pace, nowMs, tolerance)
}

// The period a limit runs over, as a word people use: week, month, day.
function periodWord(limit) {
  var window = windowName(limit)
  if (window === "weekly") return "week"
  if (window === "monthly") return "month"
  return /^daily/i.test(String(limit ? (limit.rawLabel || limit.label) : "")) ? "day" : "window"
}

// The share of the period that has gone by: what the panel sets use against.
function timeGone(limit, nowMs) {
  return started(limit) ? 1 - expectedRemaining(limit, nowMs) : 0
}

// Where you are in the period, counted the way people count it: "Day 7 of
// 7" for a week, "Day 28 of 31" for a billing month, "Hour 3 of 24" for a
// day. Shown beside the percent used; red when use runs ahead of time.
function periodText(limit, nowMs) {
  if (!limit) return ""
  if (!started(limit)) {
    var word = periodWord(limit)
    return word.charAt(0).toUpperCase() + word.substring(1) + " not started"
  }
  var length = limit.windowMs > 0 ? limit.windowMs : WEEK_MS
  var unit = length >= 2 * DAY_MS ? DAY_MS : HOUR_MS
  var total = Math.max(1, Math.round(length / unit))
  var elapsed = clamp(length - (limit.resetMs - nowMs), 0, length)
  return (unit === DAY_MS ? "Day " : "Hour ") + Math.min(total, Math.floor(elapsed / unit) + 1) + " of " + total
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
  if (full.toLowerCase().indexOf("monthly") === 0) return "monthly"
  var match = /\(([^)]+)\)/.exec(full)
  return match ? match[1] : ""
}

function headlineText(limit, nowMs) {
  if (!limit) return ""
  var window = windowName(limit)
  // Same shape for every provider; a window that isn't the plan's week or
  // month (Gemini's 5 hours) is named after the percent.
  return percent(limit.used) + " used" + (window && window !== "weekly" && window !== "monthly" ? " · " + window + " window" : "") + " · " + resetText(limit, nowMs)
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
  BASELINE: BASELINE,
  PROVIDERS: PROVIDERS,
  providerConfig: providerConfig,
  commandOf: commandOf,
  placeholder: placeholder,
  paceAlarm: paceAlarm,
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
  periodWord: periodWord,
  timeGone: timeGone,
  periodText: periodText,
  percent: percent,
  countdown: countdown,
  started: started,
  resetText: resetText,
  shortResetText: shortResetText,
  poolText: poolText,
  windowName: windowName,
  headlineText: headlineText,
  dayTokens: dayTokens,
  recentTotal: recentTotal,
  recentPeak: recentPeak,
  tokenCount: tokenCount,
  dayLabel: dayLabel
}

if (typeof module !== "undefined" && module.exports) module.exports = exportsObject
