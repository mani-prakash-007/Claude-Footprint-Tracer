# claude-atrace

**Chrome DevTools for AI agents — in your terminal.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org)

A local-first, open-source terminal UI (TUI) for debugging and observing AI agent execution. Trace tool calls, monitor token usage, and visualize agent workflows — all from your terminal.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [1] Console  [2] Timeline  [3] Tokens  [4] Agents  [5] Context  [6] Files    │
│ [7] Trends                                                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│ tools: 12 │ errors: 1 (8%) │ pending: 0 │ top tool: Bash │ redundant: 0      │
│                                                                              │
│ ▌● [00:00.120] → User: "find all TODO comments"                              │
│  ● [00:01.200] → Tool: Grep "TODO" — ●ok 41ms 12 hits ~120 tok               │
│  ● [00:02.100] → Tool: Read src/main.ts — ●ok 88ms ~1.4k tok                 │
│  ● [00:02.800] → Agent: refactor module — ◌pending                            │
│  ●   └ Read src/main.ts — ●ok 66ms ~1.2k tok                                  │
│  ●   └ Edit src/main.ts — ●ok 220ms ~0.4k tok                                 │
│  ● [00:05.500] ← LLM sonnet-4-7 (180 tok, $0.012)                            │
├──────────────────────────────────────────────────────────────────────────────┤
│ Session: a3f2c1d8 │ sonnet-4-7 │ Events: 12 (3 LLM) │ Ctx: 4% │ Cache: 78%    │
│ Time: 5.5s │ Cost: $0.012 │ ?:help  Tab/←→:switch  jk↑↓:scroll  q:quit       │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Why claude-atrace?

| Problem | Solution |
|---------|----------|
| Can't see what your AI agent is doing in real-time | Live console stream of all tool calls with status pills + selector |
| No idea where tokens are being spent | Per-tool token attribution + Tool Cost Breakdown pane (heuristic, ~chars/3.5) |
| Surprise bill at end of session | Burn-rate $/min + projected 60-min cost in Tokens insights banner |
| Agent keeps repeating the same commands | Smart loop detection flags stuck patterns (not normal dev activity) |
| Don't know which file is being read 10× | File heatmap with redundancy score + wasted-on-reads $ estimate |
| Sub-agent calls are invisible | Agents tab with rolled-up cost per delegate + delegated-share % |
| Auto-compaction silently shrinks context | Context tab with sparkline + ▼ markers + before/after token counts |
| Cache hit rate breaks mid-session | Cache hit-rate gauge with breakage alert (recent drop >50%) |
| Want to inspect a specific tool call | Detail overlay: press Enter on any span for full I/O JSON |
| Existing tools require cloud accounts | 100% local, SQLite-backed, zero infra |
| Nothing integrates with Claude Code | Native hook integration, zero config |

### 7 tabs, every one an insight

| Tab | Insight |
|-----|---------|
| Console | Live tool stream + loop warnings + selectable rows |
| Timeline | Waterfall of spans with sub-agent indentation |
| Tokens | Cost / cache / thinking dashboard + Tool Cost Breakdown |
| Agents | Sub-agent tree with rolled-up tokens, cost, errors |
| Context | Context-window timeline with compaction markers |
| Files | File-access heatmap with redundancy + heat bars |
| Trends | Last 20 sessions sparklines + side-by-side compare |

### Keyboard + mouse

`?` help · `1`–`7` jump to tab · `Tab`/`←→` next/prev tab · `↑↓`/`jk` scroll · `PgUp`/`PgDn` page · `Home`/`End`/`g`/`G` top/bottom · `Enter` detail · `Esc` close · `q` quit

Mouse wheel scrolls the active list (3 rows/tick). Click a tab label to switch. Touchpad scroll works on macOS, Linux, and tmux (with `set -g mouse on`).

---

## Quick Start

### Install

```bash
npm install -g claude-atrace
```

That's it. The npm `postinstall` script registers Claude Code hooks in `~/.claude/settings.json` automatically. Audit the result:

```bash
atrace doctor      # confirms install is healthy
atrace             # opens the TUI
```

If your environment skips lifecycle scripts (CI sandboxes, `--ignore-scripts`, some pnpm setups), finish setup manually:

```bash
atrace setup       # idempotent — safe to re-run
```

### Mode 1: Observe Claude Code Sessions

After install, just use Claude Code normally — every tool call is traced. Then in any other terminal:

```bash
atrace             # open the TUI on the latest session
```

### Mode 2: Instrument Your Own Agent

```typescript
import { trace } from 'claude-atrace';
import Anthropic from '@anthropic-ai/sdk';

const client = trace(new Anthropic());

// All API calls are now auto-traced to ~/.agent-trace/traces.db
const response = await client.messages.create({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello' }],
});

// Manual instrumentation for custom steps
await trace.step('process_results', async (span) => {
  span.input({ query: 'find TODOs' });
  const results = await processResults();
  span.output({ count: results.length });
  return results;
});
```

Then view in TUI:
```bash
atrace
```

---

## TUI Views

### Console (Tab 1)
Live stream of all events — user messages, tool calls, LLM responses.

### Timeline (Tab 2)
Waterfall visualization showing execution timing:
```
User Query  ████████████████████████████████████ 3.5s
  LLM Call   ████████████░░░░░░░░░░░░░░░░░░░░ 1.2s
  Tool:Grep  ░░░░░░░░░░░████████░░░░░░░░░░░░ 0.9s
  Tool:Read  ░░░░░░░░░░░░░░░░░░░█████████░░░ 0.7s
```

### Tokens (Tab 3)
Per-call token usage and cost:
```
Step         │  In Tok │ Out Tok │    Cost │ Model
─────────────┼─────────┼─────────┼─────────┼──────────
LLM Call #1  │   2,450 │     180 │  $0.012 │ claude-sonnet-4-5
LLM Call #2  │   3,100 │     420 │  $0.018 │ claude-sonnet-4-5
─────────────┼─────────┼─────────┼─────────┼──────────
TOTAL        │   5,550 │     600 │  $0.030 │
```

### Sessions (Tab 4)
Browse and switch between recorded sessions.

---

## Key Bindings

| Key | Action |
|-----|--------|
| `1` `2` `3` `4` | Switch tabs |
| `Tab` | Next tab |
| `j` / `↓` | Scroll down |
| `k` / `↑` | Scroll up |
| `Enter` | Open span detail overlay / select session |
| `Esc` | Close detail overlay |
| `q` | Quit / close detail overlay |

---

## CLI Commands

| Command | Purpose |
|---------|---------|
| `atrace` | Open the TUI (auto-detects latest session) |
| `atrace setup [--user\|--project] [--yes] [--dry-run] [--force]` | Register Claude Code hooks (auto-run on install) |
| `atrace install` | Alias of `setup` (back-compat) |
| `atrace uninstall [--yes] [--purge]` | Remove hooks; `--purge` also wipes traces DB |
| `atrace doctor [--fix]` | Diagnose stale state, optionally repair |
| `atrace sessions` | List recorded sessions |
| `atrace --session <id>` | Open TUI for a specific session |
| `atrace --db <path>` | Use a custom database file |
| `atrace --poll-interval <ms>` | Custom TUI poll rate (default 100) |
| `atrace hook` | (internal) hook handler subprocess |

### Uninstalling

```bash
atrace uninstall              # remove hooks, keep ~/.agent-trace traces
atrace uninstall --purge      # remove hooks AND wipe ~/.agent-trace
npm uninstall -g claude-atrace  # also fine — handler self-cleans on next Claude run
```

If you forgot `atrace uninstall` and ran `npm uninstall -g` first, the standalone hook handler at `~/.agent-trace/bin/hook-handler.cjs` self-heals on the next Claude tool call: it detects the package is gone, strips its own entries from `settings.json`, and removes the leftover state directory. No manual cleanup needed. Run `atrace doctor --fix` from any subsequent install to verify.

### Troubleshooting

| Symptom | Fix |
|---------|------|
| `npm install -g` shows no hook setup output | Postinstall was skipped (CI, `--ignore-scripts`, no TTY). Run `atrace setup`. |
| Postinstall ran under `sudo` and hooks landed in root's home | Reinstall without sudo (use `nvm`/`volta`), or copy `~/.claude/settings.json` into your real user's home and re-run `atrace setup`. |
| `~/.claude/settings.json` is corrupt | `atrace doctor --fix` restores from the latest backup at `~/.agent-trace/state/settings.backup.*`. |
| Claude Code reports a missing hook handler | Run `atrace doctor --fix` (or `atrace setup --force` if the package is still installed). |
| Permission denied writing settings.json | Fix `~/.claude/` ownership; do not run `atrace setup` with sudo. |
| Want to confirm what's installed | `atrace doctor` prints every check + status. |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_TRACE_DB` | `~/.agent-trace/traces.db` | Custom database path |
| `AGENT_TRACE_HOME` | `~/.agent-trace/` | Override the data + bin + state directory |
| `AGENT_TRACE_DEBUG` | unset | Enable debug logging to `~/.agent-trace/debug.log` |
| `AGENT_TRACE_SKIP_POSTINSTALL` | unset | Set to `1` to disable npm postinstall auto-setup |

---

## How It Works

```
Claude Code CLI                    Your Agent Code
     │                                    │
     ├─ PreToolUse hook ──┐               ├─ trace(client) ──┐
     ├─ PostToolUse hook ─┤               │                  │
     ├─ UserPromptSubmit ─┤               └──────────────────┘
     └────────────────────┘                        │
               │                                   │
               ▼                                   ▼
         ┌─────────────────────────────────────────────┐
         │        SQLite DB (~/.agent-trace/traces.db) │
         └────────────────────────┬────────────────────┘
                                  │ polls every 100ms
                                  ▼
         ┌─────────────────────────────────────────────┐
         │              TUI: atrace                     │
         └─────────────────────────────────────────────┘
```

Both collection modes write to the same SQLite database. The TUI polls it on a 100ms interval with full-refresh queries. Sessions are auto-created on the first span (Claude Code doesn't fire a SessionStart event). Sub-agent tool calls are automatically nested under their parent Agent span via `parent_id`.

---

## Recently Shipped

### Real-time Cost Tracking
Parses Claude Code's transcript JSONL file for live cost/token data. StatusBar shows cost (turns red >$1, bold >$0.50), model name, and LLM turn count. Supports claude-opus-4-6, claude-sonnet-4-6, claude-opus-4-5, claude-sonnet-4-5, claude-haiku-4-5, and older models. Real example: one session tracked $108.55 across 474 LLM turns with 39.9M cache read tokens.

### Smart Loop Detection
Flags genuinely wasteful patterns at the top of Console view -- same file read 4+ times without edit, same command retried 3+ times, same error repeated 2+ times. Ignores normal dev activity like iterative edits. Warning (yellow) and critical (red) severity levels.

### Detail Overlay
Press Enter on any span in Console view for a full detail panel showing ID, kind, status, duration, model, tokens, cost, error, parent_id, and formatted input/output JSON. Press Esc or q to close.

## What's Next

The remaining v0.2.0 features focus on deeper insights:

- **Context window meter** -- Estimate how full the context window is from transcript data.
- **Session comparison** -- `atrace diff <session1> <session2>` CLI command.
- **Search/filter** -- `/` to filter spans by tool name or content.
- **Config file** -- `~/.agent-trace/config.json` for poll interval, DB path, theme.

See [docs/roadmap.md](docs/roadmap.md) for the full roadmap and [docs/user-pain-points-research.md](docs/user-pain-points-research.md) for the research behind these priorities.

---

## Docker Development

```bash
# Run dev mode with SQLite in a Docker volume
docker compose up dev

# Run tests in container
docker compose up test
```

---

## Architecture

See [docs/architecture.md](docs/architecture.md) for full system design.

See [docs/lifecycle.md](docs/lifecycle.md) for install/uninstall/self-heal internals.

See [docs/research.md](docs/research.md) for market research and competitive analysis.

See [docs/decisions.md](docs/decisions.md) for Architecture Decision Records.

---

## Contributing

```bash
git clone <repo>
cd Claude-Footprint-Tracer
npm install
npm test           # Run tests
npm run build      # Build with tsup
npm run atrace     # Run TUI in dev mode (tsx)
```

---

## License

MIT
