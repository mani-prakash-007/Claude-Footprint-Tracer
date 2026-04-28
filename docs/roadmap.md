# Roadmap

## Current State (v0.1.0)

### Shipped Features
- [x] Claude Code hook collector (PreToolUse, PostToolUse, UserPromptSubmit, Stop)
- [x] SDK wrapper with Anthropic Proxy (messages.create, messages.stream)
- [x] Manual instrumentation API (trace.step)
- [x] SQLite storage with WAL mode
- [x] TUI: Console view (live event stream)
- [x] TUI: Timeline view (waterfall bars)
- [x] TUI: Token view (per-call cost table)
- [x] TUI: Sessions list
- [x] CLI: install/uninstall hooks
- [x] CLI: sessions list
- [x] Cost calculation (Claude, GPT-4o)
- [x] Docker development setup
- [x] TypeScript types exported
- [x] Sub-agent nesting: `parent_id` linking for Agent spans and child tool calls
- [x] Console view shows `└` indented children under Agent spans
- [x] Timeline view shows indented swim lanes for nested spans
- [x] Hook handler auto-detects active Agent spans and links children via `parent_id`
- [x] Auto-session creation: hook handler creates session on first span (Claude Code does not fire SessionStart)
- [x] Full-refresh polling: TUI does full query refresh (not just rowid watermark) to catch PostToolUse updates
- [x] Setup handles paths with spaces (quoted hook commands)
- [x] Setup auto-installs hooks preserving existing hooks
- [x] Seed script is `.cjs` (ESM package compatibility)
- [x] `npm link` for `atrace` binary
- [x] Real-time cost tracking via transcript JSONL parsing (hook mode now has full cost/token data)
- [x] Smart loop detection (flags repeated reads without edits, stuck retries, repeated errors)
- [x] Detail overlay (Enter on any span for full input/output JSON, Esc to close)
- [x] Transcript parser: `src/collector/claude-code/transcript-parser.ts` (extracts per-turn model, tokens, cache tokens)
- [x] StatusBar shows live cost (color-coded), model name, LLM turn count
- [x] TokenView shows full session summary from transcript even in hook mode
- [x] Loop detection hook: `src/tui/hooks/useLoopDetection.ts` (warning + critical severity)
- [x] Detail overlay component: `src/tui/components/SpanDetail.tsx`
- [x] Updated model pricing: claude-opus-4-6, claude-sonnet-4-6, claude-opus-4-5, claude-sonnet-4-5, claude-haiku-4-5
- [x] Session metadata: `transcript_path` stored on first span, used by TUI for cost tracking
- [x] 16 tests (all passing), including 5 new transcript parser tests

### Known Limitations
- No context diff between steps
- No replay/scrubbing mode
- No export formats (JSON, OTLP)
- No configuration file
- No health check command
- Token view only shows LLM calls (not tool token contribution)
- Extended thinking blocks not captured (only available via SDK wrapper, not hooks)

---

## v0.2.0 — Insights & Usability

**Theme**: Extract actionable insights from traces; address top user pain points

### P0 — High Priority (all shipped in v0.1.0)
- [x] **Transcript JSONL parsing**: Parse `transcript_path` for real-time cost/token tracking in hook mode
- [x] **Loop detection**: Smart detection of wasteful patterns (repeated reads, stuck retries, repeated errors)
- [x] **Detail overlay**: Press Enter on any span to see full input/output JSON (Esc/q to close)
- [ ] **Context window meter**: Estimate context window usage from transcript data

### P1 — Important
- [ ] **Session comparison**: `atrace diff <session1> <session2>` CLI command
- [ ] **Read:Edit ratio**: Efficiency score (high reads with no edits = wasted tokens)
- [ ] **Search/filter**: `/` to filter spans by tool name or content
- [ ] **Auto-follow mode**: Lock scroll to bottom (toggle with `f`)
- [ ] **Config file**: `~/.agent-trace/config.json` for poll interval, DB path, theme
- [ ] **`atrace status`**: Health check — verify hooks installed, DB accessible, recent events

### P2 — Nice to Have
- [ ] **Color themes**: Light/dark terminal detection
- [ ] **Session auto-cleanup**: Delete sessions older than N days
- [ ] **Extended thinking capture**: Via SDK wrapper, display thinking blocks in console view

---

## v0.3.0 — Export & Integration

**Theme**: Get data out for external analysis

### Planned Features
- [ ] **JSON export**: `atrace export --session <id> --format json`
- [ ] **OpenTelemetry export**: `atrace export --format otlp` (OTLP JSON)
- [ ] **CSV export**: For spreadsheet analysis
- [ ] **Pipe mode**: `atrace --pipe` outputs JSONL to stdout (for downstream tools)
- [ ] **Langfuse import**: Push traces to Langfuse instance
- [ ] **Webhook notifications**: POST to URL on session end (cost alerts)

---

## v0.4.0 — Replay Mode

**Theme**: Time-travel debugging for agent execution

### Planned Features
- [ ] **Replay view**: New tab — scrub through session timeline
- [ ] **Step forward/backward**: Arrow keys to step through spans one at a time
- [ ] **State reconstruction**: Show cumulative context at each point in time
- [ ] **Context diff**: Highlight what changed between consecutive LLM calls
- [ ] **Bookmarks**: Mark interesting points in session for quick navigation
- [ ] **Replay speed**: 1x, 2x, 4x playback of live session recording

### Architecture Notes
- All data already stored in SQLite — replay is "just" a UI mode
- Need to store full message context per LLM call (currently only metadata)
- Consider separate `context_snapshots` table for full conversation state

---

## v0.5.0 — Multi-Provider Support

**Theme**: Not just Claude — any LLM

### Planned Features
- [ ] **OpenAI Proxy**: `trace(new OpenAI())` — same API, different proxy handler
- [ ] **Google GenAI Proxy**: `trace(new GoogleGenerativeAI())`
- [ ] **Generic HTTP Proxy**: Intercept any LLM API via base URL override
- [ ] **Provider detection**: Auto-detect SDK type from client object shape
- [ ] **Unified cost calculator**: Support all major provider pricing

### Architecture
```
src/collector/sdk-wrapper/
├── anthropic-proxy.ts   (existing)
├── openai-proxy.ts      (new)
├── google-proxy.ts      (new)
├── generic-proxy.ts     (new — HTTP-level interception)
└── provider-detect.ts   (new — auto-detect from client shape)
```

---

## v0.6.0 — Advanced Multi-Agent Visualization

**Theme**: See how agents coordinate at scale

**Note**: Basic sub-agent nesting shipped in v0.1.0 (`parent_id` linking, indented console/timeline views). This milestone covers advanced multi-agent features.

### Planned Features
- [ ] **Message passing**: Show inter-agent communication
- [ ] **Subagent filtering**: Focus on single agent's execution, collapse others
- [ ] **Agent SDK integration**: Hook into Claude Agent SDK's dispatching
- [ ] **Agent cost attribution**: Roll up child span costs to parent Agent span
- [ ] **Parallel agent detection**: Visualize concurrent sub-agent execution

---

## v1.0.0 — Stable Release

**Theme**: Production-ready, documented, battle-tested

### Requirements for 1.0
- [ ] Comprehensive test suite (>80% coverage)
- [ ] All documented features working
- [ ] Performance benchmarks published
- [ ] Migration system for schema changes
- [ ] Backwards compatibility guarantee for stored data
- [ ] Published npm package with prebuilt binaries
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Complete documentation site

---

## Future Ideas (Unscheduled)

These are ideas worth exploring but not yet committed to a version:

| Idea | Complexity | Value |
|------|-----------|-------|
| **VS Code extension** | High | See TUI as VS Code sidebar panel |
| **Web UI option** | Medium | localhost:3939 as alternative to TUI |
| **MCP server mode** | Medium | Expose traces as MCP tools/resources |
| **Cost alerts** | Low | Notify when session exceeds $X |
| **Pattern detection** | High | Advanced pattern detection beyond current loop detection (e.g., anti-patterns, optimization suggestions) |
| **Prompt diff** | Medium | Show system prompt changes between calls |
| **Custom evaluations** | High | Run assertions on tool outputs |
| **Team sharing** | High | Push sessions to shared Langfuse/Opik instance |
| **Browser extension** | High | Trace claude.ai web sessions |
| **Model comparison** | Medium | Same input to different models, compare traces |
| **Token optimization** | Medium | Suggest where to reduce token usage |
| **SQLite → DuckDB** | Medium | Better analytics queries on large datasets |
| **WASM build** | High | Run in browser without Node.js |

---

## Non-Goals (Explicitly NOT building)

| Feature | Reason |
|---------|--------|
| Cloud hosting | Stay local-first. Use Langfuse for cloud needs. |
| User auth/login | Single-user tool. No multi-tenant. |
| Prompt management | Out of scope. Use dedicated tools (Langfuse, Braintrust). |
| LLM evaluation/scoring | Out of scope. Focus is debugging/observability. |
| Custom model hosting | We observe, not serve. |
| Automated testing | Not a test framework. Just traces. |
| Internal model probing | API doesn't expose logits/attention. Cannot build. |
