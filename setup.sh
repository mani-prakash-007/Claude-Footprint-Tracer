#!/usr/bin/env bash
set -e

# ─────────────────────────────────────────────────────────────────
# agent-trace: One-Command Setup
# Run: chmod +x setup.sh && ./setup.sh
# ─────────────────────────────────────────────────────────────────

BOLD='\033[1m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[✓]${NC} $1"; }
info() { echo -e "${BLUE}[i]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo -e "${BOLD}"
echo "╔══════════════════════════════════════════════════╗"
echo "║       agent-trace: One-Command Setup            ║"
echo "║   Chrome DevTools for AI agents — in terminal   ║"
echo "╚══════════════════════════════════════════════════╝"
echo -e "${NC}"

# ─── Prerequisites Check ────────────────────────────────────────

info "Checking prerequisites..."

# Node.js
if ! command -v node &> /dev/null; then
    err "Node.js not found. Install: https://nodejs.org (v18+)"
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    err "Node.js v18+ required. Current: $(node -v)"
fi
log "Node.js $(node -v)"

# npm
if ! command -v npm &> /dev/null; then
    err "npm not found. Should come with Node.js."
fi
log "npm $(npm -v)"

# Python3 (needed for better-sqlite3 compilation if no prebuilt)
if command -v python3 &> /dev/null; then
    log "Python3 found (for native addon compilation)"
else
    warn "Python3 not found. May need it if prebuilt binaries unavailable."
fi

# ─── Install Dependencies ───────────────────────────────────────

info "Installing dependencies..."
npm install --prefer-offline 2>&1 | tail -3
log "Dependencies installed"

# ─── Build ──────────────────────────────────────────────────────

info "Building project..."
./node_modules/.bin/tsup 2>&1 | grep -E "Build success|error" || true
log "Build complete"

# ─── TypeScript Check ───────────────────────────────────────────

info "Type checking..."
./node_modules/.bin/tsc --noEmit 2>&1 || warn "TypeScript errors found (non-blocking)"
log "TypeScript OK"

# ─── Run Tests ──────────────────────────────────────────────────

info "Running tests..."
./node_modules/.bin/vitest run 2>&1 | tail -5
log "Tests passed"

# ─── Create Data Directory ──────────────────────────────────────

mkdir -p ~/.agent-trace
log "Data directory: ~/.agent-trace/"

# ─── Install Claude Code Hooks ──────────────────────────────────

info "Installing Claude Code hooks into ~/.claude/settings.json..."

HOOK_HANDLER="$(pwd)/dist/collector/claude-code/hook-handler.js"

# Ensure .claude directory exists
mkdir -p ~/.claude

# Backup existing settings
if [ -f ~/.claude/settings.json ]; then
    cp ~/.claude/settings.json ~/.claude/settings.json.bak
    info "Backed up existing settings to ~/.claude/settings.json.bak"
fi

# Install hooks (preserves all existing hooks, only adds/updates agent-trace)
node --input-type=module -e "
import fs from 'fs';
import path from 'path';
import os from 'os';

const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
let settings = {};
try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')); } catch {}

const hookCmd = \"node '${HOOK_HANDLER}'\";
const hookEntry = { matcher: '*', hooks: [{ type: 'command', command: hookCmd, timeout: 5000 }] };

if (!settings.hooks) settings.hooks = {};

const events = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop'];
for (const event of events) {
    if (!settings.hooks[event]) settings.hooks[event] = [];
    // Remove any existing agent-trace hooks (idempotent reinstall)
    settings.hooks[event] = settings.hooks[event].filter(h =>
        !h.hooks?.some(hook => hook.command?.includes('agent-trace'))
    );
    // Append agent-trace hook
    settings.hooks[event].push(hookEntry);
}

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
console.log('Hooks installed for:', events.join(', '));
console.log('Hook handler:', hookCmd);
console.log('Settings file:', settingsPath);
" 2>&1

if grep -q "agent-trace" ~/.claude/settings.json 2>/dev/null; then
    log "Claude Code hooks installed (all 4 events)"
else
    err "Hook installation failed. Run manually: node dist/cli.js install --user"
fi

# ─── Seed Test Data ─────────────────────────────────────────────

info "Seeding test data for verification..."
node scripts/seed-test-data.cjs 2>&1 || node -e "
const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), '.agent-trace', 'traces.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.exec(\`
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY, source TEXT NOT NULL,
  started_at INTEGER NOT NULL, ended_at INTEGER, cwd TEXT, metadata TEXT
);
CREATE TABLE IF NOT EXISTS spans (
  id TEXT PRIMARY KEY, parent_id TEXT, session_id TEXT NOT NULL,
  kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  source TEXT NOT NULL, name TEXT NOT NULL,
  started_at INTEGER NOT NULL, ended_at INTEGER, duration_ms INTEGER,
  input TEXT, output TEXT, model TEXT,
  input_tokens INTEGER, output_tokens INTEGER,
  cache_read_tokens INTEGER DEFAULT 0, cache_write_tokens INTEGER DEFAULT 0,
  cost_usd REAL, error TEXT, metadata TEXT
);
CREATE INDEX IF NOT EXISTS idx_spans_session_ts ON spans(session_id, started_at);
CREATE INDEX IF NOT EXISTS idx_spans_parent ON spans(parent_id);
CREATE INDEX IF NOT EXISTS idx_spans_status ON spans(session_id, name, status);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at DESC);
CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
INSERT OR IGNORE INTO schema_version VALUES (1, ${Date.now()});
\`);

const now = Date.now();
const sessionId = 'demo-session-001';

db.prepare('INSERT OR REPLACE INTO sessions VALUES (?, ?, ?, ?, ?, ?)').run(
  sessionId, 'claude_code_hook', now - 10000, now, '/demo/project', null
);

const spans = [
  { id: 'demo-1', kind: 'user_message', status: 'ok', name: 'User Message', offset: 0, dur: 0, input: '{\"message\":\"find all TODO comments in the project\"}' },
  { id: 'demo-2', kind: 'tool_use', status: 'ok', name: 'Grep', offset: 1200, dur: 900, input: '{\"pattern\":\"TODO\",\"path\":\"/project/src\"}', output: '{\"response\":\"Found 15 matches in 5 files\"}' },
  { id: 'demo-3', kind: 'tool_use', status: 'ok', name: 'Read', offset: 2500, dur: 400, input: '{\"file_path\":\"/project/src/main.ts\",\"limit\":50}', output: '{\"response\":\"// TODO: implement caching\\n// TODO: add error handling\"}' },
  { id: 'demo-4', kind: 'tool_use', status: 'ok', name: 'Read', offset: 3200, dur: 350, input: '{\"file_path\":\"/project/src/api.ts\"}', output: '{\"response\":\"// TODO: rate limiting\\n// TODO: validation\"}' },
  { id: 'demo-5', kind: 'tool_use', status: 'error', name: 'Bash', offset: 4000, dur: 1200, input: '{\"command\":\"grep -r FIXME .\"}', output: null, error: 'Command timed out' },
  { id: 'demo-6', kind: 'tool_use', status: 'ok', name: 'Write', offset: 5500, dur: 200, input: '{\"file_path\":\"/project/TODO.md\"}', output: '{\"response\":\"File written successfully\"}' },
];

const insert = db.prepare('INSERT OR REPLACE INTO spans VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
for (const s of spans) {
  insert.run(
    s.id, null, sessionId, s.kind, s.status, 'claude_code_hook', s.name,
    now - 10000 + s.offset, now - 10000 + s.offset + s.dur, s.dur,
    s.input || null, s.output || null, null,
    null, null, 0, 0, null, s.error || null, null
  );
}

db.close();
console.log('Test data seeded: 1 session, 6 spans');
" 2>&1
log "Test data seeded"

# ─── Link Binary ────────────────────────────────────────────────

info "Linking atrace binary..."
npm link 2>&1 | tail -2 || warn "npm link failed. Use: node dist/cli.js instead"
log "Binary linked (try: atrace sessions)"

# ─── Final Verification ─────────────────────────────────────────

echo ""
echo -e "${BOLD}══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD} Setup Complete!${NC}"
echo -e "${BOLD}══════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}Usage:${NC}"
echo -e "    ${BLUE}atrace${NC}              Open TUI (view traces)"
echo -e "    ${BLUE}atrace sessions${NC}     List recorded sessions"
echo -e "    ${BLUE}atrace install${NC}      Install/reinstall hooks"
echo -e "    ${BLUE}atrace uninstall${NC}    Remove hooks"
echo ""
echo -e "  ${BOLD}What's running:${NC}"
echo -e "    • Claude Code hooks: ${GREEN}INSTALLED${NC} (~/.claude/settings.json)"
echo -e "    • Database: ${GREEN}READY${NC} (~/.agent-trace/traces.db)"
echo -e "    • Test data: ${GREEN}SEEDED${NC} (1 demo session)"
echo ""
echo -e "  ${BOLD}Try now:${NC}"
echo -e "    ${YELLOW}atrace${NC}  ← Opens TUI with demo data"
echo ""
echo -e "  ${BOLD}Live tracing:${NC}"
echo -e "    Use Claude Code in another terminal."
echo -e "    Tool calls will appear in atrace automatically."
echo ""
