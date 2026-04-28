# TUI Specification

## Overview

The agent-trace TUI is a fullscreen terminal application built with Ink (React for CLI). It provides four tabbed views for inspecting AI agent execution traces stored in SQLite.

---

## Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ [1] Console  [2] Timeline  [3] Tokens  [4] Sessions  ← TabBar      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                                                                      │
│                     Active View Content                               │
│                     (fills remaining height)                          │
│                                                                      │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│ Session: a3f2c1d8 | Events: 47 | Time: 1m23s | $0.042 | opus-4-6 | 12 turns │
│ q:quit Tab:switch j/k:scroll Enter:detail              ← StatusBar    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Component Hierarchy

```
<App>
│
├── Props: { sessionId?: string, pollInterval?: number }
│
├── State:
│   ├── activeTab: number (0-3)
│   ├── selectedIndex: number (scroll position)
│   ├── currentSessionId: string | null
│   └── (events from useEvents hook)
│
├── <TabBar tabs={TABS} activeTab={activeTab} />
│
├── <Box flexGrow={1}>  ← Main content area
│   ├── if activeTab === 0: <ConsoleView events selectedIndex visibleCount loopWarnings />
│   ├── if activeTab === 1: <TimelineView events width />
│   ├── if activeTab === 2: <TokenView events sessionId transcriptCost />
│   └── if activeTab === 3: <SessionListView sessions selectedIndex onSelect />
│
├── if showDetail: <SpanDetail span={selectedSpan} onClose />  (overlay)
│
└── <StatusBar sessionId eventCount startedAt totalCost model turnCount />
```

---

## Views

### ConsoleView (Tab 1)

**Purpose**: Live stream of all events, most recent at bottom. Supports nested sub-agent indentation. Shows loop detection warnings at the top when wasteful patterns are detected.

**Loop Detection Warnings** (top of view, max 3 shown):
- Yellow warnings: same file Read 4+ times without Edit, same Bash/Grep 3+ times
- Red critical warnings: same Bash command errored 2+ times (with alert indicator)
- Smart display: shows last 2 path segments, strips `cd "project-path" && ...` prefixes
- Normal dev patterns are ignored (multiple Edits, read-then-edit)

**Layout**:
```
[!] Read: .../hooks/useEvents.ts read 4x without edit    (loop warning)
[00:00.120] → User: { message: "find all TODO comments" }
[00:01.200] → Tool: Grep { pattern: "TODO" }
[00:02.100] ← Tool: Grep ✓ (0.9s)
[00:02.800] → Tool: Agent { task: "refactor module" }
[00:03.000]   └ → Tool: Read { file: "src/main.ts" }
[00:03.500]   └ ← Tool: Read ✓ (0.5s)
[00:04.000]   └ → Tool: Edit { file: "src/main.ts" }
[00:04.800]   └ ← Tool: Edit ✓ (0.8s)
[00:05.200] ← Tool: Agent ✓ (2.4s)
[00:05.500] ← LLM claude-sonnet-4-5 (180 tok, $0.0120)
```

**Event Row Formatting**:

| SpanKind | Direction | Color | Format |
|----------|-----------|-------|--------|
| `user_message` | `→` | Purple | `User: {input summary}` |
| `tool_use` (pending) | `→` | Green | `Tool: {name} {input summary}` |
| `tool_use` (complete) | `←` | Green | `Tool: {name} ✓ ({duration})` |
| `tool_use` (error) | `←` | Red | `Tool: {name} ✗ ({error})` |
| `llm_call` | `←` | Blue | `LLM {model} ({tokens} tok, ${cost})` |
| `custom_step` | `•` | Yellow | `{name} ({duration})` |

**Sub-Agent Indentation**: Spans with a `parent_id` are rendered with a `└` prefix and indented under their parent Agent span. Nesting depth is computed by walking the `parent_id` chain. Each depth level adds 2 spaces of indentation.

**Scrolling**: Window scrolls to keep `selectedIndex` centered. Auto-follows bottom when new events arrive.

**Props**:
- `events: SpanEvent[]` — All events for current session
- `selectedIndex: number` — Currently highlighted row
- `visibleCount: number` — How many rows fit on screen (termHeight - 6)

---

### TimelineView (Tab 2)

**Purpose**: Waterfall chart showing execution timing.

**Layout**:
```
Timeline (waterfall)
──────────────────────────────────────────────────────────
Grep           ░░░████████░░░░░░░░░░░░░░░░░░░░ 0.9s
Read           ░░░░░░░░░░░░░████████░░░░░░░░░░ 0.7s
Agent          ░░░░░░░░░░░░░░░░░░██████████████ 2.4s
  └ Read       ░░░░░░░░░░░░░░░░░░░░████░░░░░░░ 0.5s
  └ Edit       ░░░░░░░░░░░░░░░░░░░░░░░░████████ 0.8s
llm:claude-so  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░██ 0.3s
```

**Sub-Agent Swim Lanes**: Spans with a `parent_id` are shown indented with a `└` prefix in the label column. They are visually nested under their parent Agent span to show the execution hierarchy.

**Bar Calculation**:
```
barWidth = terminalWidth - labelWidth - durationWidth
startOffset = floor((span.started_at - timelineStart) / totalDuration * barWidth)
spanWidth = max(1, floor((span.duration_ms) / totalDuration * barWidth))
```

**Characters Used**:
- `█` (U+2588) — Active execution
- `░` (U+2591) — Idle time

**Colors**: Tool spans green, LLM spans blue, errors red, custom yellow.

**Filters**: Only shows `tool_use`, `llm_call`, and `custom_step` spans. Excludes `session` and `user_message`.

---

### TokenView (Tab 3)

**Purpose**: Per-call token usage and cost breakdown.

**Layout**:
```
Token Usage | Session: a3f2c1d8 | Duration: 1m23s | Total: $0.042

Step                  In Tok    Out Tok       Cost          Model
─────────────────────────────────────────────────────────────────────
llm:claude-son...      2,450        180     $0.012   claude-sonnet-4-5
llm:claude-son...      3,100        420     $0.018   claude-sonnet-4-5
llm:claude-son...      1,800        200     $0.012   claude-sonnet-4-5
─────────────────────────────────────────────────────────────────────
TOTAL                  7,350        800     $0.042
```

**Data Source**: Filters events to `kind === 'llm_call'` and aggregates token counts. In hook mode, transcript parsing provides a full session summary.

**Transcript Summary (Hook Mode)**: When `transcript_path` is available in session metadata, the `useTranscriptCost` hook parses the JSONL file every 2 seconds and provides:
- Total cost (calculated from model-specific pricing)
- Total input/output/cache tokens
- LLM turn count
- Model name
- Per-turn breakdown

This means the Tokens tab now shows data for hook mode sessions, not just SDK wrapper sessions. Example: a real session showed $108.55 cost, 474 LLM turns, 39.9M cache read tokens.

---

### SessionListView (Tab 4)

**Purpose**: Browse and switch between recorded sessions.

**Layout**:
```
Sessions
──────────────────────────────────────────────────────────────────
> a3f2c1d8 | 2026-04-18 12:30 PM | 47 events | 1m23s | $0.042
  b7e9f4a2 | 2026-04-18 11:15 AM | 23 events | 45s   | $0.018
  c1d8e5f3 | 2026-04-17 04:20 PM | 112 events | 5m12s | $0.156
```

**Interaction**:
- `j/k` to navigate
- `Enter` to switch to selected session (jumps to Console tab)

---

### Detail Overlay

**Purpose**: Full detail panel for any span. Opens as an overlay on top of the current view.

**Trigger**: Press `Enter` on any span in Console view.

**Layout**:
```
┌─────────────── Span Detail ────────────────────────────────────────┐
│ ID:        span-abc-123                                             │
│ Kind:      tool_use                                                 │
│ Name:      Grep                                                     │
│ Status:    ok                                                       │
│ Duration:  0.9s                                                     │
│ Model:     —                                                        │
│ Tokens:    —                                                        │
│ Cost:      —                                                        │
│ Error:     —                                                        │
│ Parent ID: agent-xyz-789                                            │
│                                                                     │
│ ── Input ──                                                         │
│ { "pattern": "TODO", "path": "/project/src" }                      │
│                                                                     │
│ ── Output ──                                                        │
│ "Found 15 matches in 3 files:\n  src/main.ts:12..."                │
│                                                                     │
│                                        Esc/q: close                 │
└─────────────────────────────────────────────────────────────────────┘
```

**Fields Shown**: ID, kind, name, status, duration, model, tokens, cost, error, parent_id, full input JSON, full output JSON.

**Behavior**:
- Input/output JSON is formatted and truncated to fit screen height
- Press `Esc` or `q` to close the overlay and return to the previous view
- Works on any span type: `tool_use`, `llm_call`, `custom_step`, `user_message`

**Component**: `src/tui/components/SpanDetail.tsx`

---

## Input Handling

### Global Key Bindings

```typescript
useInput((input, key) => {
  // Tab switching
  if (input === '1') setActiveTab(0);
  if (input === '2') setActiveTab(1);
  if (input === '3') setActiveTab(2);
  if (input === '4') setActiveTab(3);
  if (key.tab) setActiveTab((prev + 1) % 4);

  // Scrolling
  if (input === 'j' || key.downArrow) setSelectedIndex(prev + 1);
  if (input === 'k' || key.upArrow) setSelectedIndex(prev - 1);

  // Actions
  if (key.return) { /* select session / open detail */ }
  if (input === 'q') process.exit(0);
});
```

### Key Map

| Key | Action | Context |
|-----|--------|---------|
| `1` | Switch to Console | Global |
| `2` | Switch to Timeline | Global |
| `3` | Switch to Tokens | Global |
| `4` | Switch to Sessions | Global |
| `Tab` | Next tab | Global |
| `j` / `↓` | Scroll down | Console, Sessions |
| `k` / `↑` | Scroll up | Console, Sessions |
| `Enter` | Open detail overlay / Select session | Console (detail), Sessions (switches session) |
| `Esc` | Close detail overlay | Detail overlay |
| `q` | Quit application / Close detail overlay | Global / Detail overlay |
| `r` | Force refresh | Global (planned) |
| `/` | Search/filter | Global (planned) |
| `f` | Toggle auto-follow | Console (planned) |

---

## Data Hooks

### useEvents(sessionId, pollInterval)

**Purpose**: Poll SQLite for new/updated spans.

**Mechanism** (Full Refresh):
1. Every poll cycle: `SELECT * FROM spans WHERE session_id = ? ORDER BY started_at`
2. Replace entire local state with fresh query results

**Why full refresh instead of rowid watermark**: The original rowid watermark approach (`SELECT ... WHERE rowid > ?`) missed PostToolUse updates to existing spans. When PostToolUse fires, it UPDATEs the existing pending span (same row, same rowid) with status, output, and ended_at. A rowid watermark poll would never see this update because the rowid didn't change. Full refresh catches all updates reliably.

**State**: Returns `SpanEvent[]` sorted by `started_at`.

**Performance**: Full refresh is slightly more expensive than watermark polling but still well within the 5ms target for typical sessions (< 500 spans). The simplicity and correctness tradeoff is worth it. See ADR-011.

### useLatestSession()

**Purpose**: Auto-detect the most recent session on mount.

### useSessions(limit)

**Purpose**: List all sessions for the Sessions tab.

### useTokenStats(events)

**Purpose**: Compute aggregated token/cost stats from events array.

**Memoized**: Only recomputes when events array reference changes.

### useTranscriptCost(sessionId)

**Purpose**: Parse Claude Code's transcript JSONL file for real-time cost/token tracking in hook mode.

**Mechanism**:
1. Read `transcript_path` from session metadata (stored on first span by hook handler)
2. Every 2 seconds, re-read the JSONL file from disk
3. Extract per-turn: model, input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens
4. Calculate cost using model-specific pricing from `src/util/cost.ts`

**Returns**: `{ totalCost, model, turnCount, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens }`

**Polling**: Separate 2-second interval (independent from the 100ms span polling) to avoid excessive file I/O.

### useLoopDetection(events)

**Purpose**: Detect genuinely wasteful agent patterns and surface warnings in Console view.

**What it flags**:
- Same file Read 4+ times without an Edit between reads (agent confused/stuck)
- Same Bash command 3+ times (stuck retrying)
- Same Bash command errored 2+ times (repeating broken command -- critical severity)
- Same Grep pattern 3+ times (can't find what looking for)

**What it ignores** (normal dev patterns):
- Multiple Edits to same file (iterative development)
- `cd "project-path" && ...` prefix (stripped before comparison)
- Read then Edit same file (read-before-edit pattern)

**Returns**: Array of `{ severity: 'warning' | 'critical', message: string }` (max 3 shown).

---

## Color Theme

```typescript
const colors = {
  primary: '#61afef',     // Headers, active tab, selected items
  secondary: '#98c379',   // Success, tool calls
  warning: '#e5c07b',     // Cost values, pending
  error: '#e06c75',       // Error spans, failures
  muted: '#5c6370',       // Timestamps, separators, help text
  text: '#abb2bf',        // Default text
  bg: '#282c34',          // Background (if supported)
  border: '#3e4451',      // Borders, dividers

  // Span kind specific
  user_message: '#c678dd', // Purple
  llm_call: '#61afef',     // Blue
  tool_use: '#98c379',     // Green
  custom_step: '#e5c07b',  // Yellow
  session: '#5c6370',      // Gray
};
```

Based on One Dark theme (popular in terminals). Works well on both dark and light terminal backgrounds.

---

## Terminal Compatibility

### Supported Terminals
- iTerm2 (macOS)
- Terminal.app (macOS)
- Windows Terminal
- GNOME Terminal (Linux)
- Alacritty
- Kitty
- WezTerm
- VS Code integrated terminal

### Requirements
- Unicode support (for `█`, `░`, `→`, `←`, `✓`, `✗` characters)
- ANSI 256 color support (for hex colors via Chalk)
- Minimum 80 columns × 24 rows

### Graceful Degradation
- If terminal doesn't support Unicode: bars rendered as `#` and `-`
- If terminal doesn't support colors: plain text (Chalk auto-detects)
- If terminal too narrow: labels truncated, bars shortened

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Time to first paint | < 500ms |
| Poll cycle overhead | < 5ms |
| Re-render time (100 events) | < 16ms (60fps) |
| Memory usage (1000 events) | < 50MB |
| Memory usage (empty) | < 30MB |

### Optimization Strategies
- `React.memo` on EventRow/WaterfallBar (only re-render if span data changes)
- Windowed rendering (only render visible rows)
- Polling returns early if no new data (0 allocation)
- SQLite prepared statements (compiled once, reused)

---

## Updated TUI (post-Phase 0–6)

### Tabs (7)

| Key | Tab | Purpose |
|-----|-----|---------|
| 1 | Console | Live event stream + loop warnings + selectable rows |
| 2 | Timeline | Waterfall of spans, indented sub-agents |
| 3 | Tokens | Cost / cache / thinking dashboard, Tool Cost Breakdown |
| 4 | Agents | Sub-agent tree with rolled-up tokens, cost, errors |
| 5 | Context | Context-window timeline + ▼ compaction markers |
| 6 | Files | File-access heatmap + redundancy + heat bars |
| 7 | Trends | Last 20 sessions sparklines + side-by-side compare |

Every tab opens with an `InsightsBanner` (chips + threshold alerts).

### Keybinds

| Key | Action |
|-----|--------|
| `1`–`7` | Switch tab |
| `Tab` / `Shift-Tab` | Next / prev tab |
| `←` / `→` | Prev / next tab |
| `↑` / `↓` / `j` / `k` | Scroll list |
| `PgUp` / `PgDn` | Page scroll |
| `Home` / `End` / `g` / `G` | Top / bottom |
| `Enter` | Open detail drawer (Console) / load session (Trends) |
| `Esc` | Close drawer / overlay |
| `?` | Help overlay |
| `q` | Close overlay or quit |
| `Space` | Mark for compare (Trends) |
| `.` | Toggle Console tail |

### Mouse + touchpad

- Wheel / two-finger scroll: list scroll (3 rows/tick)
- Click on tab label: switch tab
- Click outside overlay: close it

Requires SGR mouse mode (auto-enabled by `useMouse`). tmux: `set -g mouse on`. Mosh strips mouse events; keyboard fallback works.

### Insights banners

`useSessionInsights` (pure `computeSessionInsights` for testability) computes:
- Cost: total / burn $/min / projected 60min / most-expensive turn
- Cache: hit rate / recent rate / savings $ / breakage alert
- Context: current / peak / % / compactions
- Tools: total calls / errors / error rate / most-called / most-expensive
- Files: read:edit ratio / redundant files / wasted tokens / wasted $
- Sub-agents: count / delegated cost / delegated share %
- Quality: thinking redaction rate / pending count

`InsightsBanner` exposes per-tab variants with chip + alert sets.

### Per-tool token attribution (Phase 6)

- Hook propagates `tool_use_id` (Anthropic content-block id) onto every tool span via PreToolUse.
- `useTokenAttribution` polls transcript every 2 s, walks `tool_use` ↔ `tool_result` block pairs, estimates tokens via `heuristicEstimator` (chars/3.5).
- Persists `input_token_attribution`, `output_token_attribution`, `attribution_method` columns on spans.
- `EventRow` shows `~Nk tok` per tool span; `TokenView` adds Tool Cost Breakdown pane with per-tool sort + % bar.
