# Agent Usage for Omarchy

An Omarchy bar widget that shows how much of each AI subscription you've used: Claude, Codex
(ChatGPT plans) and Gemini (Google AI plans). It reads your **plan's** limits, the allowance your
subscription includes, not API billing.

```text
✳ Claude 4%  │  ◉ Codex 1%  │  ⋀ Gemini 2%
```

Click it for detail in three views, switched with `←` `→` or `1` `2` `3`:

1. **Overview**: each plan's limit, when it resets, pace against the week, and tokens over the last
   seven days.
2. **Models**: per-model quota where the provider reports it, and today's tokens per model.
3. **Debug**: checks on each provider's data, so you can tell when a provider changes what it
   reports (✓ pass, ✗ fail, ◆ changed).

![Agent Usage: the Overview and Models views](preview.png)

> Started as a fork of [robzolkos/omarchy-agent-usage](https://github.com/robzolkos/omarchy-agent-usage),
> which covers Claude and Codex.

## What each provider reports

| Provider | Plans | The bar shows | Updated by | Not included |
|---|---|---|---|---|
| Claude | Pro, Max | Weekly limit | Claude Code and claude.ai (one shared limit) | — |
| Codex | ChatGPT Plus, Pro | Weekly Codex limit | Codex CLI, IDE and web | ChatGPT chat messages (not reported) |
| Gemini | Google AI Pro, Ultra | Gemini 5-hour pool | Antigravity and Gemini CLI | The Gemini app on the web (not reported) |

Google reports only a rolling 5-hour window for Gemini models, so Gemini has no weekly pace. Claude
and GPT models used inside Antigravity have their own allowances, listed on the Models view.

## Requirements

- Omarchy with shell plugin support. The collectors this widget runs ship with Omarchy.
- For each provider you show, its CLI signed in to your account:
  - Claude: `claude` (Claude Code)
  - Codex: `codex`
  - Gemini: `agy` (Antigravity CLI). If Gemini says *Limits paused*, start `agy` once to refresh
    its sign-in.

The widget reads the sign-ins those CLIs already keep. It never stores credentials.

## Install

```bash
omarchy plugin add https://github.com/CodeOfficer/omarchy-agent-usage.git --enable
```

If Omarchy's own Agents widget also shows, you can turn it off with
`omarchy plugin disable omarchy.agents`.

## Settings

Change these in **Setup › Plugins**, or from a terminal:

| Setting | Default | What it does |
|---|---|---|
| `showClaude`, `showCodex`, `showGemini` | `true` | Show or hide a provider. A hidden provider is never queried. |
| `barDetail` | `Percent` | `Percent and reset` adds the time until reset to the bar. |
| `paceTolerancePercent` | `5` | How many points over its prorated share a week can run before it turns red. |
| `refreshIntervalSec` | `300` | How often to refresh (60–3600). |

```bash
omarchy bar set codeofficer.agent-usage showGemini false --json
omarchy bar set codeofficer.agent-usage barDetail "Percent and reset"
```

## Use

- Click the widget to open the panel; right-click or middle-click to refresh.
- In the panel: `←` `→` or `1` `2` `3` switch views, `↑` `↓` scroll, `R` or Enter refreshes, `D` jumps
  to Debug and back, Escape closes.
- A provider turns red when its weekly use runs more than the tolerance ahead of the week. For
  example, with 70% of the week gone, 76% used is behind pace; 58% is ahead.

## Checking it yourself

```bash
node test/integration.test.js
```

This runs every collector the widget uses for the providers you show and prints the same checks as
the Debug view. It only reads usage; it never spends any of your quota.

## Remove

```bash
omarchy plugin remove codeofficer.agent-usage
```

## Contributing

See [AGENTS.md](AGENTS.md) for how the code is laid out, the development loop and the tests.

## License

MIT. See [LICENSE](LICENSE).
