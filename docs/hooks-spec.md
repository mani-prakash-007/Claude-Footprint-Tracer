# Claude Code Hooks Specification

## Overview

Claude Code hooks are subprocess commands that execute in response to specific events during a Claude Code session. agent-trace uses hooks to passively observe tool execution without interfering with normal operation.

---

## Hook Events Used

### PreToolUse

**Fires**: Before any tool is executed
**Purpose**: Create a pending span for the tool call
**Timing**: Before Claude Code executes the tool

**Input JSON (stdin)**:
```json
{
  "session_id": "uuid-string",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "permission_mode": "default|allowedTools|plan",
  "hook_event_name": "PreToolUse",
  "tool_name": "Grep",
  "tool_input": {
    "pattern": "TODO",
    "path": "/project/src",
    "output_mode": "content"
  }
}
```

**Common tool names observed**:
- `Bash` — Shell command execution
- `Read` — File reading
- `Write` — File creation
- `Edit` — File modification
- `Grep` — Content search
- `Glob` — File pattern matching
- `Agent` — Subagent dispatch
- `WebFetch` — HTTP requests
- `AskUserQuestion` — User interaction

**Our response (stdout)**:
```json
{}
```
(Empty object = allow tool to proceed normally)

---

### PostToolUse

**Fires**: After a tool completes successfully
**Purpose**: Complete the pending span with output and timing
**Timing**: After tool execution, before result is shown to Claude

**Input JSON (stdin)**:
```json
{
  "session_id": "uuid-string",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "permission_mode": "default",
  "hook_event_name": "PostToolUse",
  "tool_name": "Grep",
  "tool_response": "Found 15 matches in 3 files:\n  src/main.ts:12: // TODO: fix this\n  ..."
}
```

**Note**: `tool_response` can be:
- A string (most common)
- A JSON object (for structured tool outputs)
- Very large (file contents from Read tool — hence our 10KB truncation)

---

### UserPromptSubmit

**Fires**: When the user sends a message
**Purpose**: Record user messages in the trace
**Timing**: After user hits Enter, before Claude processes

**Input JSON (stdin)**:
```json
{
  "session_id": "uuid-string",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "permission_mode": "default",
  "hook_event_name": "UserPromptSubmit",
  "user_prompt": "find all TODO comments in the project"
}
```

---

### Stop

**Fires**: When a Claude Code session ends
**Purpose**: Mark session as ended
**Timing**: After Claude's final response

**Input JSON (stdin)**:
```json
{
  "session_id": "uuid-string",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "permission_mode": "default",
  "hook_event_name": "Stop"
}
```

---

## Hook Handler Contract

### Requirements
1. Read JSON from stdin (may be empty)
2. Complete within timeout (default 5000ms)
3. Write valid JSON to stdout (at minimum `{}`)
4. Exit with code 0 (even on error)
5. Never block Claude Code operation

### Non-Functional Requirements
- Cold start: < 200ms
- Total execution time: < 500ms
- Memory usage: < 50MB
- No network calls
- No user interaction (no stdin prompts)

### Error Behavior
```
Any error → stderr (for debugging) + stdout '{}' + exit 0
```

Claude Code will:
- Show stderr content in transcript (non-blocking)
- Continue normal operation if hook times out
- Continue if hook exits with non-zero (but may show warning)

---

## Hook Configuration Format

### settings.json Structure

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node /path/to/hook-handler.js",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

### Matcher Patterns
- `"*"` — Match all tools
- `"Bash"` — Match only Bash tool
- `"Bash|Write"` — Match Bash OR Write
- Can have multiple hook configs per event (all run)

### Timeout Behavior
- Default: 5000ms
- If hook exceeds timeout: killed, Claude Code continues
- Recommended: set to 5000 (our handler completes in <500ms)

---

## Installation Locations

| Scope | Path | Effect |
|-------|------|--------|
| User | `~/.claude/settings.json` | Active for ALL Claude Code sessions |
| Project | `.claude/settings.json` (in project root) | Active only in that project |

`atrace install --user` modifies the user scope.
`atrace install` (no flag) modifies the project scope.

---

## Session Lifecycle

### No SessionStart Event

Claude Code does **not** fire a `SessionStart` hook event. The first hook event for a session is typically `UserPromptSubmit` or `PreToolUse`.

### Auto-Session Creation

The hook handler auto-creates a session row on the first span received for a given `session_id`:

```
First span arrives with session_id = "abc-123"
  → SELECT session_id FROM sessions WHERE session_id = "abc-123"
  → Not found → INSERT INTO sessions (session_id, started_at, cwd, source='hook')
  → Then INSERT the span as normal
```

This is necessary because without `SessionStart`, there is no other reliable trigger to create the session row. All subsequent spans for the same session skip session creation.

---

## Transcript Path as Data Source

Every hook event includes a `transcript_path` field pointing to a JSONL file that Claude Code maintains. This file contains the full conversation transcript including:

- **LLM responses** (Claude's generated text)
- **Token usage per message** (input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens)
- **Model used** per message
- **System prompt**
- **Full conversation context**

### Implementation (Shipped)

The `transcript_path` is now actively used by agent-trace:

1. **Hook handler** stores `transcript_path` in session metadata on the first span received for a session. This is written to the `metadata` JSON column of the `sessions` table.
2. **TUI** reads session metadata via `EventReader.getSessionMetadata()` to retrieve the `transcript_path`.
3. **Transcript parser** (`src/collector/claude-code/transcript-parser.ts`) reads the JSONL file directly from disk every 2 seconds.
4. **useTranscriptCost hook** (`src/tui/hooks/useTranscriptCost.ts`) drives the polling and provides cost/token data to StatusBar and TokenView.

This design keeps expensive file parsing in the TUI process rather than the hook handler subprocess, preserving the hook's <200ms budget. See ADR-013.

### Capabilities (via transcript parsing)
| Feature | Status | Data Source |
|---------|--------|-------------|
| Real-time cost/token tracking in hook mode | Shipped | Token counts per message in transcript |
| Model attribution | Shipped | Model field per message |
| LLM turn counting | Shipped | Count of assistant messages with usage |
| Context window meter | Planned | Cumulative token counts |
| Session cost comparison | Planned | Aggregated token costs |

### Transcript Format
The file is JSONL (one JSON object per line). Each line represents a conversation turn or event. The exact schema is not yet formally documented by Anthropic but includes `role`, `content`, `usage`, and `model` fields.

---

## Sub-Agent Hook Behavior

When Claude Code dispatches a sub-agent (tool_name `Agent`), hooks fire in this order:

1. `PreToolUse` with `tool_name: "Agent"` -- creates parent span
2. Sub-agent's tool calls fire as normal `PreToolUse`/`PostToolUse` pairs
3. `PostToolUse` with `tool_name: "Agent"` -- closes parent span

The hook handler auto-detects pending Agent spans and sets `parent_id` on child spans. See [architecture.md](architecture.md#sub-agent-nesting) for details.

---

## Data Not Available via Hooks

These are things we CANNOT observe through the hook system alone (but may be available via transcript parsing):

| Data | Hook Status | Transcript Status |
|------|-------------|-------------------|
| Claude's response text | Not in hook data | Available in transcript |
| Token usage per message | Not in hook data | Available in transcript |
| Model used | Not in hook data | Available in transcript |
| Extended thinking blocks | Not in hook data | May be in transcript |
| System prompt | Not in hook data | Available in transcript |
| Previous conversation context | Not in hook data | Full context in transcript |
| Tool execution errors (some) | PostToolUse doesn't always fire | May be in transcript |
| Permission decisions | PermissionRequest hook exists but we don't use it | N/A |

### Implications for agent-trace (current state)
- Token/cost tracking now works in both hook mode (via transcript parsing) and SDK wrapper mode
- Console view in hook mode shows tool calls but NOT LLM responses
- Model attribution now available in hook mode via transcript parsing
- Cost is now shown for hook-collected sessions in StatusBar and TokenView

---

## Correlation Strategy

### Problem
PreToolUse and PostToolUse are separate subprocess invocations. No shared state.

### Solution: Pending Span Lookup

```
PreToolUse(Grep):
  → INSERT spans (id='abc', name='Grep', status='pending', started_at=1000)

PostToolUse(Grep):
  → SELECT id FROM spans WHERE session_id=? AND name='Grep' AND status='pending'
    ORDER BY started_at DESC LIMIT 1
  → Returns 'abc'
  → UPDATE spans SET status='ok', ended_at=1500, duration_ms=500 WHERE id='abc'
```

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| Same tool called twice rapidly | Second PreToolUse creates new span. PostToolUse finds the LATEST pending one. Works correctly if completions arrive in order. |
| PostToolUse fires without PreToolUse | findPendingSpan returns null. Event is lost. Logged to debug.log. |
| Hook times out (no PostToolUse) | Span stays as 'pending' forever. TUI shows it as "in progress". |
| Claude Code killed (no Stop hook) | Session has no ended_at. TUI shows as "active". |

---

## Testing Hooks

### Manual Testing

```bash
# Simulate PreToolUse
echo '{"session_id":"test","hook_event_name":"PreToolUse","tool_name":"Grep","tool_input":{"pattern":"TODO"},"cwd":"/tmp","transcript_path":"/tmp/t","permission_mode":"default"}' | node dist/collector/claude-code/hook-handler.js

# Check DB
sqlite3 ~/.agent-trace/traces.db "SELECT * FROM spans WHERE session_id='test';"
```

### Automated Testing (vitest)

```typescript
import { execSync } from 'child_process';

it('hook handler processes PreToolUse', () => {
  const input = JSON.stringify({ session_id: 'test', hook_event_name: 'PreToolUse', ... });
  const result = execSync(`echo '${input}' | node dist/collector/claude-code/hook-handler.js`);
  expect(result.toString()).toBe('{}');
  // Verify DB state...
});
```
