# Architecture Decision Records (ADRs)

Each decision documents: **Context → Decision → Consequences → Alternatives Rejected**

---

## ADR-001: TypeScript as Implementation Language

**Date**: 2026-04-18
**Status**: Accepted

### Context
Need to choose a language for an open-source TUI tool that integrates with Claude Code (Node.js ecosystem) and the Anthropic SDK (TypeScript/Python).

### Decision
TypeScript with ESM (ES2022 target).

### Consequences
- ✅ Same ecosystem as Claude Code hooks (Node.js subprocess)
- ✅ Same language as Anthropic TypeScript SDK (Proxy-based wrapping natural)
- ✅ Ink (React for CLI) provides mature TUI framework
- ✅ Large contributor pool (TypeScript is widely known)
- ✅ npm distribution (easy install)
- ⚠️ Node.js cold start adds ~50-100ms to hook handler
- ⚠️ `better-sqlite3` requires native compilation (prebuilt binaries available)

### Alternatives Rejected
| Language | Why Rejected |
|----------|-------------|
| **Rust (ratatui)** | Best performance, but steep learning curve limits contributors. No native Anthropic SDK. Would need IPC bridge for hook integration. |
| **Go (bubbletea)** | Good choice (single binary, fast). Rejected because JS Proxy pattern for SDK wrapping is TypeScript-native. Go would need code generation for SDK wrapping. |
| **Python (textual)** | Fastest prototyping. Rejected because requires Python runtime on user machines, startup slower than Node.js, and two-language problem (hooks are Node subprocess). |

---

## ADR-002: Ink (React for CLI) as TUI Framework

**Date**: 2026-04-18
**Status**: Accepted

### Context
Need a TUI framework that supports complex layouts, real-time updates, and component-based architecture.

### Decision
Ink v5 with React 18.

### Consequences
- ✅ Component-based (familiar React mental model)
- ✅ Hooks for state management (useState, useEffect)
- ✅ Flexbox layout model
- ✅ Active maintenance and ecosystem (@inkjs/ui)
- ✅ Easy to test (ink-testing-library)
- ⚠️ Less control over raw terminal escape codes than blessed/ncurses
- ⚠️ React overhead (acceptable for 100ms poll cycle)
- ⚠️ No built-in scrollable list (must implement)

### Alternatives Rejected
| Framework | Why Rejected |
|-----------|-------------|
| **blessed** | Powerful but unmaintained since 2017. API is imperative, not declarative. |
| **blessed-contrib** | Dashboard widgets, but also unmaintained. Depends on blessed. |
| **terminal-kit** | Lower-level. Would need to build component system from scratch. |
| **Raw ANSI escape codes** | Maximum control but massive implementation effort. Not worth it for this use case. |

---

## ADR-003: SQLite with WAL Mode as Storage

**Date**: 2026-04-18
**Status**: Accepted

### Context
Need storage that handles concurrent writes (multiple hook processes) and concurrent reads (TUI polling) without infrastructure.

### Decision
SQLite with WAL (Write-Ahead Logging) mode via `better-sqlite3`.

### Consequences
- ✅ Zero infrastructure (single file)
- ✅ WAL allows concurrent readers + single writer
- ✅ `busy_timeout` handles writer contention gracefully
- ✅ Persistent (sessions survive restarts)
- ✅ SQL queries for flexible data access
- ✅ Fast (prepared statements, <5ms per operation)
- ✅ Works on every OS
- ⚠️ Single-writer limit (but hook writes are sequential per session)
- ⚠️ `better-sqlite3` native addon requires compilation or prebuilt binary
- ⚠️ No built-in replication or remote access

### Alternatives Rejected
| Storage | Why Rejected |
|---------|-------------|
| **JSON files** | No concurrent access safety. No query capability. Grows unbounded. |
| **JSONL append log** | Good for writes, terrible for reads (must parse entire file). No indexes. |
| **LevelDB/RocksDB** | Overkill for this use case. More complex API. Still single-file but harder to query. |
| **DuckDB** | Better for OLAP queries but overkill. Larger binary. Less mature in Node.js. |
| **Redis** | Requires running server. Not local-first. Not persistent by default. |
| **Named pipes + in-memory** | Fast but no persistence. Complex to implement correctly. |

---

## ADR-004: Polling (not Push) for TUI Updates

**Date**: 2026-04-18
**Status**: Accepted (polling mechanism updated by ADR-011: full refresh instead of rowid watermark)

### Context
Hook handlers are separate subprocess invocations. They cannot push events to the TUI directly. Need a communication pattern between hook writes and TUI reads.

### Decision
TUI polls SQLite every 100ms. Originally used a rowid watermark; now uses full refresh (see ADR-011).

### Consequences
- ✅ Simple implementation (setInterval + SELECT)
- ✅ Works without any IPC mechanism
- ✅ Handles TUI starting before/after hooks naturally
- ✅ O(new data) per poll (not O(total data))
- ✅ 100ms latency is acceptable for debugging UI
- ⚠️ Not true real-time (100ms delay)
- ⚠️ CPU cost of polling (negligible: <1ms per empty poll)

### Watermark Implementation
```sql
-- Store last seen rowid in TUI state
SELECT *, rowid FROM spans WHERE session_id = ? AND rowid > ? ORDER BY rowid ASC
```

### Alternatives Rejected
| Pattern | Why Rejected |
|---------|-------------|
| **WebSocket server** | Would require running a server process. Hooks would need to connect to it. Over-engineering. |
| **Unix domain socket** | Hooks would need to send to socket. TUI would need to listen. More complex than SQLite polling. |
| **Named pipe (FIFO)** | Ordering issues with multiple writers. No persistence. Complex error handling. |
| **File watcher (fs.watch)** | Unreliable across OSes. Doesn't tell you WHAT changed. Still need to read DB. |
| **Shared memory** | Platform-specific. Complex. No persistence. |

---

## ADR-005: JS Proxy for SDK Wrapping

**Date**: 2026-04-18
**Status**: Accepted

### Context
Need to instrument the Anthropic SDK without requiring users to change their code (beyond wrapping the client).

### Decision
Use JavaScript `Proxy` to intercept `client.messages.create()` and `client.messages.stream()` calls.

### Consequences
- ✅ Transparent: `trace(client)` returns same type, no API changes
- ✅ Type-safe: TypeScript preserves original client types
- ✅ No monkey-patching (doesn't modify global prototypes)
- ✅ Per-instance (multiple clients can have different tracing configs)
- ✅ Intercepting both sync and async methods naturally
- ⚠️ Proxy has slight performance overhead (negligible vs network call)
- ⚠️ Edge cases with `instanceof` checks (Proxy wraps, doesn't extend)
- ⚠️ Must handle both `.create()` and `.stream()` differently

### Alternatives Rejected
| Approach | Why Rejected |
|----------|-------------|
| **Monkey-patching SDK** | Modifies shared prototypes. Fragile across SDK versions. Not isolated. |
| **Subclass Anthropic** | Would need to override every method. Breaks when SDK adds new methods. |
| **Middleware/plugin system** | Anthropic SDK doesn't have a plugin API. Would need custom client class. |
| **Network proxy (like Helicone)** | Requires changing base URL. Adds network hop. More latency. |

---

## ADR-006: AsyncLocalStorage for Context Propagation

**Date**: 2026-04-18
**Status**: Accepted

### Context
SDK wrapper needs to maintain a trace context (session ID, current span ID) across async boundaries without requiring users to pass context manually.

### Decision
Use Node.js `AsyncLocalStorage` from `node:async_hooks`.

### Consequences
- ✅ Invisible to users (no context passing)
- ✅ Works across await boundaries
- ✅ Handles concurrent requests correctly (each gets own context)
- ✅ Standard Node.js API (stable since Node 16)
- ⚠️ Small performance overhead (~5% for async operations)
- ⚠️ Context lost if user uses raw callbacks (rare with modern async/await)

### Alternatives Rejected
| Pattern | Why Rejected |
|---------|-------------|
| **Global singleton** | Breaks with concurrent traces. Not async-safe. |
| **Explicit context passing** | Bad DX. Users must thread context through every function. |
| **Thread-local (like Java)** | JavaScript is single-threaded. Not applicable. |
| **Zone.js** | Deprecated pattern. Heavy. Angular-specific. |

---

## ADR-007: PreToolUse/PostToolUse Correlation via DB Lookup

**Date**: 2026-04-18
**Status**: Accepted

### Context
Claude Code hooks are separate subprocess invocations with NO shared in-process state. PreToolUse creates a pending span, PostToolUse needs to find and update it. Cannot share memory between invocations.

### Decision
PostToolUse queries the database for the most recent pending span matching the session and tool name.

### Consequences
- ✅ Works without any shared state
- ✅ Simple SQL query
- ✅ Handles most cases correctly (tools rarely called with same name simultaneously)
- ⚠️ Race condition if same tool called rapidly back-to-back (rare in practice)
- ⚠️ Extra SELECT before UPDATE in PostToolUse handler

### Correlation Query
```sql
SELECT id FROM spans
WHERE session_id = ? AND name = ? AND status = 'pending'
ORDER BY started_at DESC LIMIT 1
```

### Future Improvement
If rapid same-tool correlation becomes an issue, add a sequence counter stored in the DB per session.

### Alternatives Rejected
| Approach | Why Rejected |
|----------|-------------|
| **Deterministic ID from inputs** | Same tool + same input = collision. Not reliable. |
| **Shared temp file with counter** | Race conditions between processes. Complex. |
| **Session-level sequence in temp file** | File locking needed. Cross-platform issues. |
| **UUIDs passed through Claude Code** | Claude Code doesn't expose a span/call ID in hook data. |

---

## ADR-008: Output Truncation at 10KB

**Date**: 2026-04-18
**Status**: Accepted

### Context
Tool outputs (e.g., file reads, grep results) can be megabytes. Storing full outputs would bloat the database and potentially capture sensitive data.

### Decision
Truncate output to 10KB at write time. Store a preview and size indicator for truncated outputs.

### Consequences
- ✅ Bounded database growth
- ✅ Prevents accidental secret storage (large outputs often contain full file contents)
- ✅ TUI still shows useful preview
- ⚠️ Cannot reconstruct full output for replay (would need separate storage)
- ⚠️ 10KB is arbitrary (may be too small for some debugging scenarios)

### Truncation Format
```json
{
  "_truncated": true,
  "_size": 145000,
  "_preview": "first 1000 characters..."
}
```

---

## ADR-009: Hook Handler Exits 0 on Error

**Date**: 2026-04-18
**Status**: Accepted

### Context
Claude Code hook subprocess errors should NEVER block the user's workflow. A broken hook must not prevent tool execution.

### Decision
Hook handler always exits with code 0 and outputs `{}` to stdout, even on errors. Errors are logged to stderr and debug.log.

### Consequences
- ✅ Claude Code never blocks on hook failure
- ✅ User experience unaffected by tracing failures
- ✅ Graceful degradation (missed events, not crashes)
- ⚠️ Silent failures (user might not notice tracing stopped working)
- ⚠️ Need explicit health check command (`atrace status` future feature)

---

## ADR-010: Three tsup Entry Points

**Date**: 2026-04-18
**Status**: Accepted

### Context
The project has three distinct consumers with different bundling needs:
1. Library users (import SDK wrapper)
2. CLI users (run TUI)
3. Claude Code (invoke hook handler)

### Decision
Three separate tsup entry points with different external/bundling configs.

### Entry Points
| Entry | External | Reason |
|-------|----------|--------|
| `src/index.ts` | SDK, sqlite3, react, ink | Library: users install their own deps |
| `src/cli.tsx` | sqlite3, react, ink, meow | CLI: most deps are direct |
| `src/collector/claude-code/hook-handler.ts` | sqlite3 only | Hook: minimal deps for fast startup |

### Consequences
- ✅ Hook handler starts fast (minimal imports)
- ✅ Library doesn't bundle React/Ink (only SDK wrapper code)
- ✅ CLI gets proper TUI bundle
- ⚠️ Three build outputs to maintain
- ⚠️ Must verify no circular dependencies between entry points

---

## ADR-011: Full Refresh Polling Instead of Rowid Watermark

**Date**: 2026-04-19
**Status**: Accepted (supersedes part of ADR-004)

### Context
The original polling strategy (ADR-004) used a rowid watermark: `SELECT * FROM spans WHERE session_id = ? AND rowid > ?`. This efficiently fetches only new rows. However, PostToolUse updates existing spans in-place (same row, same rowid) — changing `status` from `pending` to `ok`, adding `output`, `ended_at`, and `duration_ms`. The watermark approach never re-fetches these updated rows because the rowid hasn't changed.

This caused a bug where spans stayed visually "pending" in the TUI even after PostToolUse had completed them.

### Decision
Switch TUI polling from rowid watermark to full refresh: `SELECT * FROM spans WHERE session_id = ? ORDER BY started_at` on every poll cycle. Replace local state entirely with fresh results.

### Consequences
- ✅ PostToolUse updates are always visible immediately
- ✅ Simpler implementation (no watermark state to track)
- ✅ No merge logic needed (replace, don't merge)
- ✅ Correct by construction (always shows current DB state)
- ⚠️ Slightly more data transferred per poll cycle (O(total) instead of O(new))
- ⚠️ Acceptable performance: typical sessions have <500 spans; full query completes in <5ms

### Why Not Fix the Watermark Approach?
We considered alternatives:
- **Dual query** (watermark for new rows + separate query for updated rows): more complex, two queries per poll, still needs merge logic.
- **Trigger-based change tracking** (SQLite triggers writing to a changes table): adds write overhead to every hook, more schema complexity.
- **Modified rowid on update** (DELETE + INSERT instead of UPDATE): breaks referential integrity, more write overhead.

Full refresh is the simplest correct solution and performs well within our 100ms poll budget.

---

## ADR-012: Auto-Session Creation on First Span

**Date**: 2026-04-19
**Status**: Accepted

### Context
Claude Code does not fire a `SessionStart` hook event. The original design (see hooks-spec.md) assumed a `SessionStart` event would create the session row before any spans arrived. In practice, the first event for a session is `UserPromptSubmit` or `PreToolUse`.

Without a session row, foreign key constraints fail and the TUI cannot display spans grouped by session.

### Decision
The hook handler auto-creates a session row the first time it encounters an unknown `session_id`. Before inserting any span, it checks if the session exists and creates it if missing:

```sql
INSERT OR IGNORE INTO sessions (session_id, source, started_at, cwd)
VALUES (?, 'hook', ?, ?)
```

### Consequences
- ✅ Sessions always exist before spans reference them
- ✅ Works without any special event from Claude Code
- ✅ `INSERT OR IGNORE` is idempotent (safe for concurrent hook processes)
- ✅ Session `started_at` reflects the first observed span, which is close enough to actual start time
- ⚠️ Session `cwd` comes from the first span's `cwd` field (may change if Claude Code changes directories mid-session, but this is rare)
- ⚠️ Cannot distinguish between "session just started" and "session resumed after TUI restart" (acceptable for debugging tool)

### Alternatives Rejected
| Approach | Why Rejected |
|----------|-------------|
| **Require SessionStart event** | Claude Code doesn't fire it. Cannot change Claude Code behavior. |
| **Pre-create session on TUI launch** | TUI doesn't know about sessions until spans arrive. |
| **Lazy session in TUI** | Would need to handle missing session in every view. Simpler to guarantee session exists at write time. |

---

## ADR-013: Transcript Parsing in TUI Not Hook Handler

**Date**: 2026-04-19
**Status**: Accepted

### Context
Claude Code's transcript JSONL file contains rich per-turn data (model, tokens, cache tokens, cost) that enables real-time cost tracking in hook mode. The question is where to parse this file: in the hook handler subprocess or in the TUI process.

The hook handler has a strict performance budget: <200ms cold start, <500ms total. It runs as a subprocess spawned by Claude Code on every tool call. Any slowdown directly impacts the user's Claude Code experience.

The transcript file grows throughout a session and can become large (thousands of JSONL lines for long sessions). Parsing it requires reading the entire file, parsing each JSON line, and aggregating token counts across all turns.

### Decision
Parse the transcript JSONL file in the TUI process, not in the hook handler. The hook handler only stores the `transcript_path` in session metadata on the first span. The TUI reads the file directly from disk on a 2-second polling interval via the `useTranscriptCost` hook.

### Implementation
1. **Hook handler** (`hook-handler.ts`): On first span for a session, stores `transcript_path` from hook stdin into `sessions.metadata` JSON column via `updateSessionMetadata()`.
2. **Transcript parser** (`transcript-parser.ts`): Pure function that reads JSONL file, extracts per-turn token usage, calculates cost using model-specific pricing.
3. **TUI hook** (`useTranscriptCost.ts`): Reads session metadata to get path, polls transcript file every 2 seconds, provides cost/token/model data to components.

### Consequences
- ✅ Hook handler stays fast (<200ms) -- only one extra metadata write on first span
- ✅ TUI has plenty of time between renders to parse transcript (2s interval vs 100ms render cycle)
- ✅ Cost data is always fresh (2s max staleness, acceptable for a debugging tool)
- ✅ No additional subprocess spawning or IPC needed
- ✅ Transcript parser is a pure function, easy to test (5 tests added)
- ⚠️ TUI must have filesystem access to the transcript file (same machine requirement, already true for SQLite)
- ⚠️ 2-second polling means cost display lags slightly behind actual usage
- ⚠️ Large transcripts (1000+ turns) may cause brief pauses during parsing (mitigated by doing it off the render cycle)

### Alternatives Rejected
| Approach | Why Rejected |
|----------|-------------|
| **Parse in hook handler, write to spans table** | Each hook invocation would need to parse the growing transcript file. A 500-turn session would mean parsing 500 JSONL lines on every tool call. Would blow the 200ms budget. |
| **Background daemon process** | Over-engineering. Would need process management, IPC, crash recovery. agent-trace is a simple local tool. |
| **Parse transcript on session end (Stop hook)** | No real-time cost display during session. Users want to see cost while the agent is running, not after. |
| **Store token data in hook handler from stdin fields** | Hook stdin does not include token/cost data. Only `transcript_path` is provided. The actual token data is only in the transcript file. |
