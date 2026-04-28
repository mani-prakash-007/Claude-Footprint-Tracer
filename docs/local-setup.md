# Local Setup Guide

Complete guide to installing and running agent-trace on your machine.

---

## Prerequisites

| Requirement | Minimum | Check Command |
|-------------|---------|---------------|
| Node.js | v18.0.0 | `node -v` |
| npm | v8.0.0 | `npm -v` |
| Python3 | Any (for native addon compilation) | `python3 --version` |
| Terminal | 80x24, Unicode + ANSI color support | — |

**Supported OS**: macOS, Linux, Windows (WSL recommended)

**Optional**: Docker (for containerized development)

---

## One-Command Setup

```bash
git clone <repo-url> agent-trace
cd agent-trace
chmod +x setup.sh && ./setup.sh
```

This single command:
1. Verifies Node.js >= 18 and npm are installed
2. Runs `npm install`
3. Builds all 3 entry points via tsup
4. Runs TypeScript type checking
5. Runs the test suite (16 tests)
6. Creates `~/.agent-trace/` data directory
7. Installs Claude Code hooks into `~/.claude/settings.json` (preserves existing hooks)
8. Seeds demo data (2 sessions, 13 spans)
9. Links the `atrace` binary globally via `npm link`

**Note**: The setup script handles paths with spaces (hook commands are quoted). It also preserves any existing hooks in your Claude Code settings.

After setup completes, run:

```bash
atrace
```

---

## Manual Setup (Step-by-Step)

If you prefer manual control or the one-command setup fails:

### 1. Install Dependencies

```bash
npm install
```

### 2. Build

```bash
./node_modules/.bin/tsup
```

Produces 3 bundled entry points:
- `dist/index.js` — Library (SDK wrapper API)
- `dist/cli.js` — CLI + TUI
- `dist/collector/claude-code/hook-handler.js` — Hook subprocess

### 3. Create Data Directory

```bash
mkdir -p ~/.agent-trace
```

### 4. Seed Test Data (Optional)

```bash
node scripts/seed-test-data.cjs
```

Creates 2 demo sessions with realistic span data for testing the TUI.

### 5. Install Claude Code Hooks

```bash
node dist/cli.js install --user
```

This modifies `~/.claude/settings.json` to register agent-trace hooks on PreToolUse, PostToolUse, UserPromptSubmit, and Stop events.

### 6. Link Binary (Optional)

```bash
npm link
```

Makes `atrace` available globally. Alternative: use `node dist/cli.js` directly.

---

## Docker Development

For isolated development without touching your system:

```bash
docker compose up dev
```

This starts a container with:
- Node.js 20
- All dependencies installed
- SQLite database in a Docker volume
- Source mounted for hot-reload

Run tests in Docker:

```bash
docker compose run test
```

---

## Usage

### Open TUI (Default)

```bash
atrace                     # Latest session
atrace --session <id>      # Specific session
```

### CLI Commands

```bash
atrace sessions            # List all recorded sessions
atrace install             # Install hooks (project scope)
atrace install --user      # Install hooks (user scope, all projects)
atrace uninstall           # Remove hooks
```

### TUI Key Bindings

| Key | Action |
|-----|--------|
| `1` | Console view (live event stream) |
| `2` | Timeline view (waterfall bars) |
| `3` | Token view (cost breakdown -- now works in hook mode via transcript parsing) |
| `4` | Sessions view (session picker) |
| `Tab` | Next tab |
| `j` / `↓` | Scroll down |
| `k` / `↑` | Scroll up |
| `Enter` | Open span detail / select session |
| `Esc` | Close detail overlay |
| `q` | Quit |

### SDK Wrapper (For Custom Agents)

```typescript
import { trace } from 'agent-trace';
import Anthropic from '@anthropic-ai/sdk';

const client = trace(new Anthropic());

// All API calls automatically traced
const response = await client.messages.create({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello' }]
});

// Manual instrumentation
await trace.step('my-step', async (span) => {
  span.input({ query: 'test' });
  const result = await doSomething();
  span.output({ count: result.length });
  return result;
});
```

---

## How It Works

### Hook Mode (Claude Code)

```
Claude Code → first hook event → auto-create session (no SessionStart event)
Claude Code → PreToolUse hook → agent-trace writes pending span to SQLite
Claude Code → PostToolUse hook → agent-trace completes span with output/timing
Claude Code → PreToolUse: Agent → child tools auto-linked via parent_id
TUI polls SQLite every 100ms (full refresh) → renders live with nesting
```

No modification to Claude Code needed. Hooks are passive observers. Paths with spaces are handled correctly in hook commands.

**Token/Cost Data in Hook Mode**: The Tokens tab (Tab 3) now shows full cost and token data for hook mode sessions. The TUI parses Claude Code's transcript JSONL file (path stored in session metadata) every 2 seconds to extract per-turn token usage and calculate costs. The StatusBar also shows live cost, model name, and LLM turn count.

### SDK Wrapper Mode (Custom Agents)

```
Your code → trace(client) returns Proxy → API calls intercepted
Proxy records: model, tokens, cost, timing, input metadata
Data written to same SQLite database
TUI shows both hook and SDK data together
```

---

## File Locations

| File | Purpose |
|------|---------|
| `~/.agent-trace/traces.db` | SQLite database (all trace data) |
| `~/.agent-trace/debug.log` | Debug log (when `AGENT_TRACE_DEBUG=1`) |
| `~/.claude/settings.json` | Claude Code hooks config (user scope) |
| `.claude/settings.json` | Claude Code hooks config (project scope) |

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `AGENT_TRACE_DB` | `~/.agent-trace/traces.db` | Override database path |
| `AGENT_TRACE_DEBUG` | unset | Enable debug logging |

---

## Verification

After setup, verify everything works:

```bash
# 1. Check binary
atrace sessions
# Should show: demo-session-001 and demo-session-002

# 2. Check hooks installed
grep "agent-trace" ~/.claude/settings.json
# Should show hook commands

# 3. Test hook handler directly
echo '{"session_id":"verify","hook_event_name":"PreToolUse","tool_name":"Test","tool_input":{},"cwd":"/tmp","transcript_path":"/tmp/t","permission_mode":"default"}' | node dist/collector/claude-code/hook-handler.js
# Should output: {}

# 4. Verify span written
sqlite3 ~/.agent-trace/traces.db "SELECT name, status FROM spans WHERE session_id='verify';"
# Should show: Test|pending

# 5. Open TUI
atrace
# Should render 4-tab interface with demo data
```

---

## Troubleshooting

### `better-sqlite3` fails to install

Native addon compilation issue. Solutions:
1. Install Python 3 + build tools: `xcode-select --install` (macOS) or `sudo apt install build-essential` (Linux)
2. Try: `npm rebuild better-sqlite3`
3. Use Docker: `docker compose up dev`

### Hook handler not firing

1. Check hooks installed: `cat ~/.claude/settings.json | grep agent-trace`
2. Verify path in settings.json points to correct `dist/collector/claude-code/hook-handler.js`
3. Test manually: `echo '{}' | node dist/collector/claude-code/hook-handler.js`

### TUI shows no data

1. Seed test data: `node scripts/seed-test-data.cjs`
2. Check DB exists: `ls ~/.agent-trace/traces.db`
3. Query directly: `sqlite3 ~/.agent-trace/traces.db "SELECT count(*) FROM spans;"`

### `atrace` command not found

Binary not linked. Either:
- Run `npm link` again
- Use `node dist/cli.js` directly
- Add to PATH: `export PATH="$PATH:$(pwd)/node_modules/.bin"`

---

## Uninstalling

```bash
# Remove hooks from Claude Code
atrace uninstall

# Or manually remove from settings
# Edit ~/.claude/settings.json and remove agent-trace entries

# Remove data
rm -rf ~/.agent-trace

# Unlink binary
npm unlink -g agent-trace
```
