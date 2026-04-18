# agent-trace — Project Instructions

## Project Overview

**agent-trace** is a local-first, open-source TUI (Terminal UI) debugging tool for AI agents. It provides real-time observability for AI agent execution — tool calls, token usage, timing, and costs — directly in the terminal.

**Binary name**: `atrace`
**npm package**: `agent-trace`
**License**: MIT

## Architecture Summary

Two collection modes feed into a shared SQLite database:
1. **Claude Code Hook Collector** — Subprocess hooks (PreToolUse/PostToolUse) write tool call events to SQLite
2. **SDK Wrapper** — JS Proxy wraps Anthropic SDK, auto-traces API calls to SQLite

A TUI (Ink/React) polls the database every 100ms and renders 4 views: Console, Timeline, Tokens, Sessions.

## Tech Stack

- **Language**: TypeScript (ES2022, ESM-only)
- **TUI Framework**: Ink 5 (React for CLI)
- **Database**: SQLite via better-sqlite3 (WAL mode)
- **Build**: tsup (3 entry points: lib, cli, hook-handler)
- **Test**: vitest
- **Runtime**: Node.js >= 18

## Directory Structure

```
src/
├── index.ts                    # Public API: trace(), trace.step()
├── cli.tsx                     # CLI entry point (meow)
├── types/                      # TypeScript interfaces
│   ├── events.ts               # SpanEvent (core type), SpanKind, SpanStatus
│   ├── hook-io.ts              # Claude Code hook stdin/stdout JSON
│   ├── session.ts              # Session type
│   └── database.ts             # SQLite row types
├── storage/                    # SQLite layer
│   ├── database.ts             # Init, WAL config, migrations
│   ├── writer.ts               # EventWriter (insert/update spans)
│   ├── reader.ts               # EventReader (poll with watermark)
│   ├── paths.ts                # ~/.agent-trace/ path resolution
│   └── migrations/             # SQL migration files
├── collector/
│   ├── claude-code/            # Hook system
│   │   ├── hook-handler.ts     # Main subprocess script (stdin → DB)
│   │   ├── event-mapper.ts     # HookInput → SpanEvent translation
│   │   └── install.ts          # atrace install/uninstall
│   └── sdk-wrapper/            # Anthropic SDK instrumentation
│       ├── trace.ts            # trace() function + trace.step()
│       ├── span.ts             # Span class
│       ├── context.ts          # AsyncLocalStorage propagation
│       └── anthropic-proxy.ts  # Proxy handler
├── tui/                        # Terminal UI
│   ├── App.tsx                 # Root, tab routing, input handling
│   ├── theme.ts                # Colors, symbols
│   ├── hooks/                  # React hooks (useEvents, useSession, etc.)
│   ├── views/                  # Tab views (Console, Timeline, Tokens, Sessions)
│   └── components/             # Reusable components
└── util/                       # Shared utilities
    ├── cost.ts                 # Token → USD calculator
    ├── time.ts                 # Duration/timestamp formatting
    ├── id.ts                   # nanoid generation
    ├── json.ts                 # Safe parse, truncation
    └── logger.ts               # File-based debug logger
```

## Key Design Patterns

### SpanEvent is the universal type
Everything flows through `SpanEvent`. Both collectors produce them. The TUI consumes them. SQLite stores them.

### Full-refresh polling
TUI uses `SELECT * FROM spans WHERE session_id = ? ORDER BY started_at` every 100ms. Full refresh (not rowid watermark) is necessary to catch PostToolUse updates to existing pending spans. See ADR-011.

### Auto-session creation
Claude Code does not fire a `SessionStart` event. The hook handler auto-creates a session row on first span via `INSERT OR IGNORE`. See ADR-012.

### Sub-agent nesting via parent_id
When an `Agent` tool call is pending, child tool calls are automatically linked via `parent_id`. The hook handler queries for pending Agent spans and sets the parent. The TUI renders children with `└` indentation in Console view and indented swim lanes in Timeline view.

### PreToolUse/PostToolUse correlation
Hooks are subprocess invocations with no shared state. PostToolUse correlates with PreToolUse by finding the most recent pending span for that tool:
```sql
SELECT id FROM spans WHERE session_id = ? AND name = ? AND status = 'pending'
ORDER BY started_at DESC LIMIT 1
```

### Output truncation
Tool outputs are truncated to 10KB at write time to prevent DB bloat.

### Hook handler must be fast
The hook subprocess has a budget of ~200ms. It reads stdin, opens SQLite, writes 1 row, exits. Built as a single bundled ESM file.

## Development Commands

```bash
npm test              # vitest
npm run build         # tsup (3 entry points)
npm run atrace        # Run TUI via tsx (dev mode)
npm run typecheck     # tsc --noEmit
docker compose up dev # Docker with SQLite volume
```

## Testing Conventions

- Storage tests use in-memory SQLite (`:memory:`)
- Event mapper tests are pure functions with fixture JSON
- TUI component tests use ink-testing-library
- Integration tests spawn hook handler as subprocess

## Important Constraints

- Hooks CANNOT stream events (subprocess model, 100-500ms latency per invocation)
- Hooks CANNOT access Claude's internal reasoning (only tool inputs/outputs)
- TUI polls (not push) — SQLite WAL handles concurrent reads/writes
- Hook handler exits 0 even on error (never block Claude Code)
- `@anthropic-ai/sdk` is optional peer dep (only needed for SDK wrapper mode)

## Build Outputs

tsup produces 3 entry points:
1. `dist/index.js` + `dist/index.d.ts` — Library (SDK wrapper API)
2. `dist/cli.js` — CLI + TUI
3. `dist/collector/claude-code/hook-handler.js` — Hook subprocess

## Environment Variables

- `AGENT_TRACE_DB` — Override database path (default: `~/.agent-trace/traces.db`)
- `AGENT_TRACE_DEBUG` — Enable debug logging to `~/.agent-trace/debug.log`
