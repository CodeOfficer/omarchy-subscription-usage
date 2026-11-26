# Subscription Usage: notes for anyone developing this plugin

An Omarchy bar widget showing the share of each AI **subscription** used (Claude, Codex, Gemini,
Suno):
plan quota, not API billing. Users install it with `omarchy plugin add <repo>`; everything here must
work on any Omarchy machine. No personal paths or accounts in committed files; keep those in
`CLAUDE.local.md` (git-ignored).

## Layout

| File | Role |
|---|---|
| `manifest.json` | Plugin id `codeofficer.subscription-usage`, bar-widget settings: `defaults` + `schema` |
| `Model.js` | `PROVIDERS` table, all parsing, checks, pace and text. Plain JS (QML `.pragma library`), unit-tested in Node |
| `Service.qml` | Runs one collector per enabled provider (an `Instantiator` over `PROVIDERS`), keeps records by id |
| `Panel.qml` | Bar chips and the panel: Overview / Models / Debug views |
| `bin/gemini-usage` | Our Gemini collector (Python); wraps Omarchy's `omarchy-agent-usage-agy` |
| `bin/suno-usage` | Our Suno collector (Python) |
| `bin/browser_session.py` | Shared: reads a sign-in from the plugin's own Chromium profile; Clerk token exchange |
| `bin/browser-signin` | Opens that profile's window for a provider (`browser-signin <id> <url>`) |
| `test/model.test.js` | Unit tests, no network |
| `test/suno_usage_test.py` | Unit tests for the Suno collector and cookie reading, no network |
| `test/gemini_usage_test.py` | Unit tests for the Gemini collector's omp fallback, no network |
| `test/integration.test.js` | Runs the real collectors on this machine; same checks as Debug view |

## Where the numbers come from (checked Nov 2026; providers change these)

- **Claude, Codex**: Omarchy's collectors `omarchy-agent-usage-claude` / `-codex --limits-only`
  (on PATH). Weekly + 5-hour windows. A Codex week starts at the first use after a reset.
- **Gemini**: `bin/gemini-usage` runs Omarchy's Antigravity record, then asks Google's
  `v1internal:retrieveUserQuota` (per model) and `retrieveUserQuotaSummary`, using Omarchy's
  collector code for the sign-in. On AI Pro, the summary lists only the "Claude and GPT models"
  group; the Gemini pool appears only in the per-model call, and has a **5-hour window only, no
  weekly**. Gemini 4 Neon is not listed by name there yet. agy's access token lasts 60 minutes and
  only a running agy renews it; when it has lapsed, `bin/gemini-usage` uses `omp token
  antigravity-cli` (omp renews its own; `google-antigravity` is paused in omp ≥ 19, and Omarchy's
  collector still only knows that name). omp is called only if `~/.omp/agent/agent.db` holds an
  `antigravity-cli` sign-in: on Omarchy `omp` is a lazy shim that would download ~300 MB.
- **Suno**: `GET https://suno.com/a/api/billing/info/` with `Authorization: Bearer <JWT>` (the old
  `studio-api.suno.ai` host answers 503). The JWT lasts 60 minutes; Suno's sign-in is Clerk at
  `auth.suno.com`: `GET /v1/client` (cookie `__client`, header `Origin: https://suno.com`) gives
  `last_active_session_id`, `POST /v1/client/sessions/{sid}/tokens` gives `{jwt}`. `__client` lasts
  about a year and lives only in the plugin's browser profile. The month runs to `period_end`
  (paced like a week, via `windowStartsAt`). The answer also has account/payment ids; never print them.
- **Not available anywhere**: ChatGPT chat usage, Gemini app (web) usage.
- These are internal vendor services, not public APIs. Treat missing data as unknown, never 0%.

## Development loop

```bash
# edit in your dev clone, then:
node test/model.test.js
python3 -I test/suno_usage_test.py
python3 -I test/gemini_usage_test.py
omarchy plugin validate "$PWD"
git commit && git push                         # the installed copy pulls from origin
omarchy plugin update codeofficer.subscription-usage --yes
omarchy restart shell                          # plugin update does not reload running QML
node test/integration.test.js --live           # collectors + the running widget agree
```

- Never edit the installed copy in `~/.config/omarchy/plugins/codeofficer.subscription-usage/`;
  `omarchy plugin update` fast-forwards it and can reset local changes.
- Drive the running widget: `omarchy-shell codeofficer.subscription-usage open|close|refresh|status|view <1-3>|debug|signin <id>|setup <id>`.
- See it: `grim` a screenshot after `open`.

## Adding a provider

1. A row in `Model.PROVIDERS` (id, name, setting, defaultOn, `command` or `bin`, icon, tint,
   optional `signIn: { url }`).
2. A collector printing the shared record (`limits[]` with `label`/`percent`/`resetsAt`, optional
   `windowStartsAt`, `primary`, `detail`; `plan`, `tierLabel`, `usageStatusText`, `authHelpText`,
   `signInRequired`). Same keys every run, signed in or not. Exit 0 with help text when signed out.
3. Web-only sign-in: use `browser_session.py` (profile cookie, token cache, `clerk_token`).
4. The icon, a manifest `defaults` + `schema` entry, a README row, checks in `recordChecks`, tests,
   then `--update-baseline` once it runs.

## Checks and the baseline

`Model.recordChecks` is shared by the Debug view and the integration test. States:
`pass`; `fail` (the widget may show something wrong); `changed` (the provider sent new or dropped
fields or models compared with `BASELINE` in `Model.js`). A `changed` is the signal to look: review
what's new, adapt the code if needed, then `node test/integration.test.js --update-baseline` and
commit the `Model.js` diff. The integration test exits 1 on `fail` or `changed`.

**Never spend quota in tests.** Tests only read usage. Burning tokens to move a meter is a manual
experiment, only when the person explicitly asks.

## QML / Omarchy pitfalls (each one bit us)

- Lists that pass through a Repeater's `modelData` become QML list types that fail `Array.isArray`,
  and objects lose identity. Repeat over indexes and look records up (`providerAt`), use
  `Model.toArray`, compare by flags (`primary`, `scoped`), not `===`.
- `normalizeLimit` keeps `label` (short title) and `rawLabel` (full label with the window name).
- Text from collectors or Google: `textFormat: Text.PlainText`; validate and bound in `Model.js`
  and `bin/gemini-usage` (ids match `MODEL_ID`, list sizes capped).
- Keys: Tab is Omarchy's (moves between bar panels). Arrows and h/j/k/l arrive as
  `moveRequested`; letters as `textKey`.
- Animations: `Style.duration(ms)`; follow Omarchy's motion rules.
- Settings: read through `service.setting/intSetting/boolSetting`; every new setting needs a
  manifest `defaults` entry and a `schema` entry, and a row in the README table.

## Conventions

- Bar stays compact (percent by default); detail belongs in Models or Debug, not Overview.
- Every fix gets a unit test; every provider-shape assumption gets a check in `recordChecks`.
- Secrets: cookies stay in the browser profile; only short-lived tokens are cached (mode 600, in
  `~/.local/state/subscription-usage`). Never log or print a token or cookie.
- Upstream: `upstream` remote is robzolkos/omarchy-agent-usage; merge its fixes with
  `git fetch upstream && git merge upstream/master`.
