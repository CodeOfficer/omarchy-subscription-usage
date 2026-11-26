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

- Left-click the bar display to open or close details.
- Right-click or middle-click to refresh.
- Press `R` while the panel is open to refresh.
- Press `D` while the panel is open to show debug info: each collector's exit code, timing, plan,
  data age, and any way its record no longer matches what the widget expects (shown in red).
- Press Escape to close the panel.

The plugin refreshes every five minutes by default. Change the interval with:

```bash
omarchy bar set codeofficer.agent-usage refreshIntervalSec 600 --json
```

## Tests

```bash
node test/model.test.js              # parsing and display logic, no network
node test/integration.test.js        # runs every collector on this machine and checks its record
node test/integration.test.js --live # also checks the running widget agrees
```

The integration test only reads usage; it never spends quota. A `FAIL` line names what changed.

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
