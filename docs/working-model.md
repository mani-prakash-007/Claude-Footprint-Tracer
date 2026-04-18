# Working Model: End-to-End Flow

This document explains exactly how agent-trace works at every level — from raw bytes to rendered pixels.

---

## Mode 1: Claude Code Hook Observer

### Step-by-Step Execution Flow

#### 1. Installation (`atrace install --user`)

```
User runs: atrace install --user
                │
                ▼
Reads: ~/.claude/settings.json
                │
                ▼
Adds hook entries for: PreToolUse, PostToolUse, UserPromptSubmit, Stop
                │
                ▼
Each entry points to: node /path/to/dist/collector/claude-code/hook-handler.js
                │
                ▼
Writes back: ~/.claude/settings.json
```

**Result in settings.json**:
```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "node /usr/local/lib/node_modules/agent-trace/dist/collector/claude-code/hook-handler.js",
        "timeout": 5000
      }]
    }],
    "PostToolUse": [{ /* same pattern */ }],
    "UserPromptSubmit": [{ /* same pattern */ }],
    "Stop": [{ /* same pattern */ }]
  }
}
```

#### 2. Claude Code Session Starts

```
User starts Claude Code session
        │
        ▼
Claude Code detects hooks in settings.json
        │
        ▼
(No SessionStart hook in current implementation — session created on first event)
```

#### 3. User Sends a Message

```
User types: "find all TODO comments"
        │
        ▼
Claude Code fires: UserPromptSubmit hook
        │
        ▼
Spawns subprocess: node hook-handler.js
        │
        ├── stdin receives JSON:
        │   {
        │     "session_id": "abc123",
        │     "hook_event_name": "UserPromptSubmit",
        │     "user_prompt": "find all TODO comments",
        │     "cwd": "/home/user/project",
        │     "transcript_path": "/tmp/transcript.jsonl"
        │   }
        │
        ▼
hook-handler.ts: main()
        │
        ├── 1. Read stdin (Buffer.concat chunks)
        ├── 2. JSON.parse → HookInput
        ├── 3. mapHookToSpan(input) → { type: 'insert_span', span: {...} }
        ├── 4. createDatabase() → opens ~/.agent-trace/traces.db
        │      └── Runs migrations if needed
        │      └── Sets WAL mode, busy_timeout
        ├── 5. new EventWriter(db)
        ├── 6. Check if session exists, create if not
        ├── 7. writer.insertSpan(span)
        │      └── INSERT INTO spans (id, session_id, kind='user_message', ...)
        ├── 8. db.close()
        └── 9. process.stdout.write('{}')
             └── exit 0
```

#### 4. Claude Decides to Use a Tool

```
Claude decides: use Grep tool with pattern "TODO"
        │
        ▼
Claude Code fires: PreToolUse hook
        │
        ▼
Spawns subprocess: node hook-handler.js
        │
        ├── stdin:
        │   {
        │     "session_id": "abc123",
        │     "hook_event_name": "PreToolUse",
        │     "tool_name": "Grep",
        │     "tool_input": { "pattern": "TODO", "path": "/home/user/project" }
        │   }
        │
        ▼
hook-handler.ts processes:
        │
        ├── mapHookToSpan → { type: 'insert_span', span: { kind: 'tool_use', status: 'pending', ... } }
        ├── writer.insertSpan(span)
        │      └── INSERT INTO spans (..., status='pending', name='Grep', input='{"pattern":"TODO"}')
        └── stdout: '{}'
```

#### 5. Tool Executes and Completes

```
Grep tool runs... finds 15 matches
        │
        ▼
Claude Code fires: PostToolUse hook
        │
        ▼
Spawns subprocess: node hook-handler.js
        │
        ├── stdin:
        │   {
        │     "session_id": "abc123",
        │     "hook_event_name": "PostToolUse",
        │     "tool_name": "Grep",
        │     "tool_response": "Found 15 matches in 3 files..."
        │   }
        │
        ▼
hook-handler.ts processes:
        │
        ├── mapHookToSpan → { type: 'update_span', sessionId: 'abc123', toolName: 'Grep', updates: {...} }
        ├── writer.findPendingSpan('abc123', 'Grep')
        │      └── SELECT id FROM spans WHERE session_id='abc123' AND name='Grep' AND status='pending'
        │          ORDER BY started_at DESC LIMIT 1
        │      └── Returns: 'span-xyz'
        ├── writer.updateSpan('span-xyz', { status: 'ok', ended_at: now, output: {...} })
        │      └── UPDATE spans SET status='ok', ended_at=1713000000, output='{"response":"Found 15..."}' WHERE id='span-xyz'
        └── stdout: '{}'
```

#### 6. Session Ends

```
Claude Code session ends
        │
        ▼
Fires: Stop hook
        │
        ▼
hook-handler: writer.endSession('abc123', Date.now())
        └── UPDATE sessions SET ended_at=... WHERE session_id='abc123'
```

---

### TUI Polling Loop

Running simultaneously in another terminal:

```
User runs: atrace
        │
        ▼
cli.tsx: main()
        │
        ├── No command → open TUI
        ├── Dynamic import('./tui/App.js')
        ├── render(<App />)
        │
        ▼
App.tsx: Component Mount
        │
        ├── useLatestSession() → SELECT latest session from DB
        ├── Sets currentSessionId state
        │
        ▼
useEvents(currentSessionId, 100):
        │
        ├── Initial: reader.getSessionSpans(sessionId)
        │      └── SELECT *, rowid FROM spans WHERE session_id=? ORDER BY started_at ASC
        │      └── Returns all existing spans
        │
        ├── setEvents(initial)
        │
        └── setInterval(100ms):
               │
               ├── reader.getSpansSince(sessionId, lastRowId)
               │      └── SELECT *, rowid FROM spans WHERE session_id=? AND rowid > ? ORDER BY rowid ASC
               │
               ├── if newSpans.length > 0:
               │      ├── mergeSpans(existing, new) → updates existing + appends new
               │      ├── setEvents(merged)
               │      └── lastRowId = newLastRowId
               │
               └── React re-renders affected views
```

---

## Mode 2: SDK Wrapper

### Step-by-Step Execution Flow

#### 1. User Wraps Client

```typescript
import { trace } from 'agent-trace';
import Anthropic from '@anthropic-ai/sdk';

const client = trace(new Anthropic());
```

**What happens inside `trace()`**:
```
trace(client):
        │
        ├── createDatabase() → opens ~/.agent-trace/traces.db
        ├── new EventWriter(db)
        ├── sessionId = generateId() → nanoid(21)
        ├── new TraceContext(writer, sessionId)
        ├── writer.createSession({ session_id, source: 'sdk_wrapper', started_at: Date.now() })
        │      └── INSERT INTO sessions (...)
        ├── ctx.run(() => createAnthropicProxy(client, ctx))
        │      └── AsyncLocalStorage.run(ctx, fn)
        │      └── Returns Proxy(client)
        └── Return: Proxy<Anthropic> (same type as original)
```

#### 2. User Makes API Call

```typescript
const response = await client.messages.create({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello' }],
});
```

**What happens inside the Proxy**:
```
client.messages → Proxy trap (get 'messages')
        │
        ├── Returns createMessagesProxy(target.messages, ctx)
        │
        ▼
.create(params) → Proxy trap (get 'create')
        │
        ├── Returns tracedCreate function
        │
        ▼
tracedCreate(params):
        │
        ├── 1. ctx.startSpan('llm:claude-sonnet-4-5-20250929', 'llm_call')
        │      └── new Span(writer, sessionId, name, kind, parentId)
        │      └── INSERT INTO spans (id, kind='llm_call', status='pending', name='llm:claude-sonnet-4-5-20250929')
        │
        ├── 2. span.setInput({ model, max_tokens, message_count, tools, has_system })
        │
        ├── 3. await original.create(params)  ← Actual API call to Claude
        │      └── Network request to api.anthropic.com
        │      └── Waits for response...
        │
        ├── 4. span.setModel(response.model)
        │      └── UPDATE spans SET model='claude-sonnet-4-5-20250929' WHERE id=...
        │
        ├── 5. span.setOutput({ stop_reason, content_types })
        │      └── UPDATE spans SET output='{"stop_reason":"end_turn",...}' WHERE id=...
        │
        ├── 6. span.setTokens(input_tokens, output_tokens, cache_read, cache_write)
        │      └── Calculates cost via calculateCost()
        │      └── UPDATE spans SET input_tokens=150, output_tokens=200, cost_usd=0.0045 WHERE id=...
        │
        ├── 7. span.end('ok')
        │      └── UPDATE spans SET status='ok', ended_at=now, duration_ms=1250 WHERE id=...
        │
        └── 8. Return original response to caller
```

#### 3. Manual Instrumentation

```typescript
await trace.step('process_results', async (span) => {
  span.input({ query: 'find TODOs' });
  const results = await processResults();
  span.output({ count: results.length });
  return results;
});
```

**What happens**:
```
trace.step('process_results', fn):
        │
        ├── TraceContext.current() → get from AsyncLocalStorage
        ├── ctx.startSpan('process_results', 'custom_step')
        │      └── INSERT INTO spans (kind='custom_step', status='pending', name='process_results')
        │
        ├── Execute fn(span)
        │      ├── span.input({...}) → UPDATE spans SET input=... (Note: simplified in current impl)
        │      ├── await processResults() ← User code runs
        │      └── span.output({...}) → UPDATE spans SET output=...
        │
        ├── span.end('ok')
        │      └── UPDATE spans SET status='ok', ended_at=..., duration_ms=...
        │
        └── Return result to caller
```

---

## SQLite Internal Operations

### WAL (Write-Ahead Logging) Mode Explained

```
┌──────────────────────────────────────────────────────────────┐
│                    SQLite WAL Architecture                     │
│                                                                │
│  traces.db (main database file)                               │
│  traces.db-wal (write-ahead log)                              │
│  traces.db-shm (shared memory for coordination)              │
│                                                                │
│  WRITER (hook process):                                        │
│    1. Writes to WAL file (append-only)                        │
│    2. Does NOT modify main DB file                            │
│    3. WAL file checkpointed periodically                     │
│                                                                │
│  READER (TUI process):                                         │
│    1. Reads from main DB + WAL                                │
│    2. Never blocks writer                                      │
│    3. Sees consistent snapshot (MVCC)                         │
│                                                                │
│  CONTENTION:                                                    │
│    - Multiple writers: only one at a time (busy_timeout=5s)   │
│    - Writer + reader: concurrent (WAL magic)                  │
│    - Multiple readers: unlimited concurrent                   │
└──────────────────────────────────────────────────────────────┘
```

### Query Performance

| Query | When | Expected Time |
|-------|------|---------------|
| `INSERT INTO spans` | Every hook invocation | 1-3ms |
| `UPDATE spans WHERE id=?` | PostToolUse | 1-2ms |
| `SELECT WHERE rowid > ?` (0 rows) | TUI poll, no new data | 0.1-0.5ms |
| `SELECT WHERE rowid > ?` (10 rows) | TUI poll, new data | 1-3ms |
| `SELECT WHERE session_id=?` (100 rows) | TUI initial load | 3-5ms |
| `SELECT sessions GROUP BY` | Session list | 2-5ms |

---

## TUI Rendering Pipeline

```
SQLite (data source)
        │
        ▼ useEvents hook (polls every 100ms)
        │
SpanEvent[] (React state)
        │
        ▼ React reconciliation
        │
┌───────────────────────────────────────────────┐
│ Ink render pipeline:                           │
│                                                │
│ 1. React components → Virtual DOM              │
│ 2. Ink layout engine → Flex calculations       │
│ 3. Terminal output → ANSI escape sequences     │
│ 4. Write to stdout                             │
└───────────────────────────────────────────────┘
        │
        ▼
Terminal displays updated UI
```

### View-Specific Rendering

**ConsoleView**: Maps each `SpanEvent` to an `EventRow` component. Scrollable window controlled by `selectedIndex`. Shows timestamp (relative to session start), direction arrow, label, and summary.

**TimelineView**: Filters to tool_use + llm_call spans. Calculates proportional position/width based on `(started_at - timelineStart) / totalDuration`. Renders using Unicode block characters (`█` for active, `░` for idle).

**TokenView**: Filters to llm_call spans. Aggregates input_tokens, output_tokens, cost_usd. Renders table with box-drawing characters.

---

## Error Handling Flow

```
Hook receives malformed JSON:
        │
        ├── JSON.parse throws
        ├── Catch → debug('Failed to parse hook stdin', raw)
        ├── process.stdout.write('{}')
        └── return (exit 0, Claude Code unaffected)

Hook can't open database (disk full, permissions):
        │
        ├── createDatabase() throws
        ├── Catch → process.stderr.write(err.message)
        ├── process.stdout.write('{}')
        └── process.exit(0) (Claude Code unaffected)

TUI can't open database:
        │
        ├── createDatabase() throws
        └── Display error in UI: "Cannot open database at path..."

PostToolUse can't find pending span:
        │
        ├── findPendingSpan returns null
        ├── debug('No pending span found for', toolName)
        └── Event is lost (graceful degradation)
```

---

## Cost Calculation Pipeline

```
API response received:
        │
        ├── Extract: model, input_tokens, output_tokens, cache_read, cache_write
        │
        ▼
calculateCost(model, inTok, outTok, cacheRead, cacheWrite):
        │
        ├── findPricing(model):
        │      ├── Direct lookup: MODEL_PRICING['claude-sonnet-4-5-20250929'] → match
        │      ├── If not: strip date suffix → MODEL_PRICING['claude-sonnet-4-5'] → match
        │      └── If not: prefix match → iterate entries
        │
        ├── Calculate:
        │      cost = (inTok / 1M) × pricing.input
        │           + (outTok / 1M) × pricing.output
        │           + (cacheRead / 1M) × pricing.cacheRead
        │           + (cacheWrite / 1M) × pricing.cacheWrite
        │
        └── Return: cost in USD (e.g., 0.0045)
```

**Current Pricing Table** (updated as of April 2026):

| Model | Input $/M | Output $/M | Cache Read $/M | Cache Write $/M |
|-------|-----------|-----------|----------------|-----------------|
| claude-sonnet-4-5 | 3.00 | 15.00 | 0.30 | 3.75 |
| claude-opus-4 | 15.00 | 75.00 | 1.50 | 18.75 |
| claude-haiku-3-5 | 0.80 | 4.00 | 0.08 | 1.00 |
| gpt-4o | 2.50 | 10.00 | — | — |
| gpt-4o-mini | 0.15 | 0.60 | — | — |
