# Agent Usage for Omarchy

An Omarchy bar plugin that keeps weekly Claude, Codex and Gemini usage visible without opening a panel.

> Fork of [robzolkos/omarchy-agent-usage](https://github.com/robzolkos/omarchy-agent-usage) that adds
> Gemini (Google AI Pro, through Antigravity) and keeps the bar compact: percentages only, with reset
> times in the panel.

![Agent Usage panel for Omarchy](preview.png)

## What it shows

Each provider displays its weekly allowance used directly in the bar:

```text
Claude 31%  Codex 18%  Gemini 4%
```

Reset countdowns, pace and the 7-day token chart are in the panel. A window that has no reset time
yet (Google starts the clock at your first use) shows as *window not started*.

A provider turns red when its usage exceeds the prorated portion of its seven-day window. For example, with 70% of the week elapsed, 76% used is behind pace while 58% used is ahead.

Click the bar display for detailed meters, expected remaining allowance, pace difference, a seven-day token chart, and additional limit windows. Right-click or middle-click to refresh immediately.

## Requirements

- Omarchy with Quickshell plugin support.
- Authenticated Claude Code and Codex CLIs, and the Antigravity CLI (`agy`) signed in to your Google account.
- Omarchy's `omarchy-agent-usage-claude`, `omarchy-agent-usage-codex` and `omarchy-agent-usage-agy` collectors.
- If Gemini shows *Limits paused*, start `agy` once to refresh its sign-in.

The plugin runs each collector with `--limits-only`. It uses the credentials already managed by the provider CLIs and does not read or store credentials.

## Installation

```bash
omarchy plugin add https://github.com/CodeOfficer/omarchy-agent-usage.git --enable
```

For a local checkout:

```bash
omarchy plugin add ~/code/codeofficer/omarchy-agent-usage --enable
```

Disable Omarchy's built-in Agents display if both widgets appear:

```bash
omarchy plugin disable omarchy.agents
```

## Usage

- Left-click the bar display to open or close the panel; right-click or middle-click to refresh.
- In the panel, `←` `→` (or `1` `2` `3`, or click a tab) switch between three views:
  1. **Overview**: each plan at a glance (headline limit, pace, 7-day tokens, other windows).
  2. **Models**: per-model quota where the provider reports it (Google), model-scoped allowances,
     and today's tokens per model.
  3. **Debug**: checks on each provider's data. ✓ pass, ✗ fail (the widget may be wrong),
     ◆ changed since the baseline (a new field or model from the provider: look, then accept).
- `↑` `↓` scroll, `R` or Enter refresh, `D` jumps to Debug and back, Escape closes.
- Pace turns red only when a weekly window is more than 5 points over its prorated share, so a
  week that starts with your first prompt (Codex) doesn't read as behind at once.

The plugin refreshes every five minutes by default. Change the interval with:

```bash
omarchy bar set codeofficer.agent-usage refreshIntervalSec 600 --json
```

## Tests

```bash
node test/model.test.js              # parsing and display logic, no network
node test/integration.test.js        # runs every collector on this machine and checks its record
node test/integration.test.js --live # also checks the running widget agrees
node test/integration.test.js --update-baseline   # accept new fields/models after review
```

The integration test runs the same checks as the Debug view and only reads usage; it never spends
quota. It exits 1 when a check fails or the provider's data changed since the baseline in `Model.js`.

## Removal

Remove the plugin with:

```bash
omarchy plugin remove codeofficer.agent-usage
```

Restore Omarchy's built-in Agents display if desired:

```bash
omarchy plugin enable omarchy.agents
```

## License

MIT
