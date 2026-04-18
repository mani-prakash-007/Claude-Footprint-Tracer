# agent-trace

**Chrome DevTools for AI agents — in your terminal.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org)

A local-first, open-source terminal UI (TUI) for debugging and observing AI agent execution. Trace tool calls, monitor token usage, and visualize agent workflows — all from your terminal.

```
┌─────────────────────────────────────────────────────────────────────┐
│ [1] Console  [2] Timeline  [3] Tokens  [4] Sessions                 │
├─────────────────────────────────────────────────────────────────────┤
│ [00:00.120] → User: "find all TODO comments"                        │
│ [00:01.200] → Tool: Grep { pattern: "TODO" }                        │
│ [00:02.100] ← Tool: Grep ✓ (15 matches, 0.9s)                      │
│ [00:02.800] → Tool: Agent { task: "refactor module" }               │
│ [00:03.000]   └ → Tool: Read { file: "src/main.ts" }               │
│ [00:03.500]   └ ← Tool: Read ✓ (0.5s)                              │
│ [00:04.000]   └ → Tool: Edit { file: "src/main.ts" }               │
│ [00:04.800]   └ ← Tool: Edit ✓ (0.8s)                              │
│ [00:05.200] ← Tool: Agent ✓ (2.4s)                                  │
│ [00:05.500] ← LLM claude-sonnet-4-5 (180 tok, $0.012)                  │
├─────────────────────────────────────────────────────────────────────┤
│ Session: a3f2c1d8 | Events: 10 | Time: 5.5s | Cost: $0.012         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Why agent-trace?

| Problem | Solution |
|---------|----------|
| Can't see what your AI agent is doing in real-time | Live console stream of all tool calls |
| No idea where tokens are being spent | Per-call token/cost breakdown |
| Agent debugging requires log-diving | TUI with timeline waterfall view |
| Existing tools require cloud accounts | 100% local, SQLite-backed, zero infra |
| Nothing integrates with Claude Code | Native hook integration, zero config |
| Sub-agent calls are invisible | Nested tree view with `parent_id` linking |

---

## Quick Start

### Install

```bash
npm install -g agent-trace
```

### Mode 1: Observe Claude Code Sessions

```bash
# Install hooks into Claude Code
atrace install --user

# Use Claude Code normally in any terminal...
# Then open the TUI in another terminal:
atrace
```

### Mode 2: Instrument Your Own Agent

```typescript
import { trace } from 'agent-trace';
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
| `Enter` | Open detail / select session |
| `q` | Quit |

---

## CLI Commands

```bash
atrace                      # Open TUI (auto-detects latest session)
atrace --session <id>       # View specific session
atrace --db /path/to.db     # Use custom database
atrace --poll-interval 200  # Custom poll rate (ms)
atrace install              # Install hooks (project scope)
atrace install --user       # Install hooks (user scope)
atrace uninstall            # Remove hooks
atrace sessions             # List all recorded sessions
atrace hook                 # (internal) hook handler subprocess
```

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

## What's Next

The next release (v0.2.0) focuses on extracting actionable insights from traces. Key planned features:

- **Transcript JSONL parsing** -- Claude Code writes a transcript file with full token/cost data. Parsing it unlocks real-time cost tracking in hook mode (currently only available in SDK wrapper mode).
- **Loop detection** -- Automatically detect when an agent is stuck repeating the same tool calls.
- **Detail overlay** -- Press Enter on any span to see full input/output JSON.
- **Context window meter** -- Estimate how full the context window is from transcript data.

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

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_TRACE_DB` | `~/.agent-trace/traces.db` | Custom database path |
| `AGENT_TRACE_DEBUG` | unset | Enable debug logging to `~/.agent-trace/debug.log` |

---

## Architecture

See [docs/architecture.md](docs/architecture.md) for full system design.

See [docs/research.md](docs/research.md) for market research and competitive analysis.

See [docs/decisions.md](docs/decisions.md) for Architecture Decision Records.

---

## Contributing

```bash
git clone <repo>
cd agent-trace
npm install
npm test           # Run tests
npm run build      # Build with tsup
npm run atrace     # Run TUI in dev mode (tsx)
```

---

## License

MIT
