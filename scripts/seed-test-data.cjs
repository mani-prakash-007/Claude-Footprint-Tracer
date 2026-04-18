#!/usr/bin/env node

/**
 * Seed test data for agent-trace development/verification.
 * Creates a realistic demo session with various span types.
 */

const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');

const dbDir = path.join(os.homedir(), '.agent-trace');
const dbPath = path.join(dbDir, 'traces.db');

// Ensure directory exists
const fs = require('fs');
fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);

// Configure SQLite
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');

// Create schema
db.exec(`
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  cwd TEXT,
  metadata TEXT
);

CREATE TABLE IF NOT EXISTS spans (
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  session_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  source TEXT NOT NULL,
  name TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  duration_ms INTEGER,
  input TEXT,
  output TEXT,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cache_read_tokens INTEGER DEFAULT 0,
  cache_write_tokens INTEGER DEFAULT 0,
  cost_usd REAL,
  error TEXT,
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_spans_session_ts ON spans(session_id, started_at);
CREATE INDEX IF NOT EXISTS idx_spans_parent ON spans(parent_id);
CREATE INDEX IF NOT EXISTS idx_spans_status ON spans(session_id, name, status);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at DESC);

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO schema_version VALUES (1, ${Date.now()});
`);

// --- Session 1: Code search and refactoring ---
const now = Date.now();
const session1Id = 'demo-session-001';

db.prepare('INSERT OR REPLACE INTO sessions VALUES (?, ?, ?, ?, ?, ?)').run(
  session1Id, 'claude_code_hook', now - 60000, now, '/Users/dev/my-project', null
);

const session1Spans = [
  {
    id: 'span-001',
    kind: 'user_message',
    status: 'ok',
    name: 'User Message',
    offset: 0,
    dur: 0,
    input: JSON.stringify({ message: 'find all TODO comments in the project and create a summary' }),
  },
  {
    id: 'span-002',
    kind: 'tool_use',
    status: 'ok',
    name: 'Grep',
    offset: 1200,
    dur: 900,
    input: JSON.stringify({ pattern: 'TODO', path: '/Users/dev/my-project/src', output_mode: 'content' }),
    output: JSON.stringify({ response: 'Found 15 matches in 5 files:\n  src/main.ts:12: // TODO: implement caching\n  src/api.ts:45: // TODO: rate limiting\n  src/auth.ts:23: // TODO: token refresh' }),
  },
  {
    id: 'span-003',
    kind: 'tool_use',
    status: 'ok',
    name: 'Read',
    offset: 2500,
    dur: 400,
    input: JSON.stringify({ file_path: '/Users/dev/my-project/src/main.ts', limit: 50 }),
    output: JSON.stringify({ response: '// Main application entry\nimport { app } from "./app";\n\n// TODO: implement caching layer\n// TODO: add error handling for startup\n\napp.listen(3000);' }),
  },
  {
    id: 'span-004',
    kind: 'tool_use',
    status: 'ok',
    name: 'Read',
    offset: 3200,
    dur: 350,
    input: JSON.stringify({ file_path: '/Users/dev/my-project/src/api.ts' }),
    output: JSON.stringify({ response: 'export class ApiController {\n  // TODO: rate limiting\n  // TODO: input validation\n  async handle(req: Request) { ... }' }),
  },
  {
    id: 'span-005',
    kind: 'tool_use',
    status: 'ok',
    name: 'Grep',
    offset: 4000,
    dur: 600,
    input: JSON.stringify({ pattern: 'FIXME|HACK|XXX', path: '/Users/dev/my-project/src' }),
    output: JSON.stringify({ response: 'Found 3 matches:\n  src/db.ts:67: // FIXME: connection leak\n  src/utils.ts:12: // HACK: workaround for node bug\n  src/auth.ts:89: // XXX: security review needed' }),
  },
  {
    id: 'span-006',
    kind: 'tool_use',
    status: 'error',
    name: 'Bash',
    offset: 5000,
    dur: 5200,
    input: JSON.stringify({ command: 'grep -rn "deprecated" ./node_modules/' }),
    error: 'Command timed out after 5000ms',
  },
  {
    id: 'span-007',
    kind: 'tool_use',
    status: 'ok',
    name: 'Write',
    offset: 11000,
    dur: 180,
    input: JSON.stringify({ file_path: '/Users/dev/my-project/TODO.md', content: '# Project TODOs\n\n## High Priority\n- [ ] Implement caching layer (main.ts)\n- [ ] Fix connection leak (db.ts)\n...' }),
    output: JSON.stringify({ response: 'File written successfully (247 bytes)' }),
  },
  {
    id: 'span-008',
    kind: 'tool_use',
    status: 'ok',
    name: 'Bash',
    offset: 12000,
    dur: 320,
    input: JSON.stringify({ command: 'wc -l src/**/*.ts' }),
    output: JSON.stringify({ response: '  45 src/main.ts\n  120 src/api.ts\n  89 src/auth.ts\n  67 src/db.ts\n  321 total' }),
  },
];

// --- Session 2: SDK wrapper session with token data ---
const session2Id = 'demo-session-002';

db.prepare('INSERT OR REPLACE INTO sessions VALUES (?, ?, ?, ?, ?, ?)').run(
  session2Id, 'sdk_wrapper', now - 120000, now - 90000, '/Users/dev/agent-app', null
);

const session2Spans = [
  {
    id: 'span-101',
    kind: 'llm_call',
    status: 'ok',
    name: 'llm:claude-sonnet-4-5',
    offset: 0,
    dur: 2400,
    input: JSON.stringify({ model: 'claude-sonnet-4-5-20250929', max_tokens: 4096, message_count: 3, has_system: true, tools: ['search', 'calculate'] }),
    output: JSON.stringify({ stop_reason: 'tool_use', content_types: ['text', 'tool_use'] }),
    model: 'claude-sonnet-4-5-20250929',
    input_tokens: 2450,
    output_tokens: 180,
    cache_read: 1200,
    cost: 0.012,
  },
  {
    id: 'span-102',
    kind: 'custom_step',
    status: 'ok',
    name: 'vector_search',
    offset: 2500,
    dur: 800,
    input: JSON.stringify({ query: 'authentication best practices', top_k: 5 }),
    output: JSON.stringify({ doc_count: 5, total_chars: 12400 }),
  },
  {
    id: 'span-103',
    kind: 'llm_call',
    status: 'ok',
    name: 'llm:claude-sonnet-4-5',
    offset: 3500,
    dur: 3200,
    input: JSON.stringify({ model: 'claude-sonnet-4-5-20250929', max_tokens: 4096, message_count: 5, has_system: true }),
    output: JSON.stringify({ stop_reason: 'end_turn', content_types: ['text'] }),
    model: 'claude-sonnet-4-5-20250929',
    input_tokens: 4800,
    output_tokens: 920,
    cache_read: 2450,
    cost: 0.028,
  },
  {
    id: 'span-104',
    kind: 'llm_call',
    status: 'error',
    name: 'llm:claude-sonnet-4-5',
    offset: 7000,
    dur: 450,
    input: JSON.stringify({ model: 'claude-sonnet-4-5-20250929', max_tokens: 4096, message_count: 7 }),
    error: 'rate_limit_error: Too many requests',
    model: 'claude-sonnet-4-5-20250929',
    input_tokens: null,
    output_tokens: null,
    cache_read: 0,
    cost: null,
  },
  {
    id: 'span-105',
    kind: 'llm_call',
    status: 'ok',
    name: 'llm:claude-sonnet-4-5',
    offset: 10000,
    dur: 1800,
    input: JSON.stringify({ model: 'claude-sonnet-4-5-20250929', max_tokens: 4096, message_count: 7 }),
    output: JSON.stringify({ stop_reason: 'end_turn', content_types: ['text'] }),
    model: 'claude-sonnet-4-5-20250929',
    input_tokens: 5200,
    output_tokens: 340,
    cache_read: 4800,
    cost: 0.018,
  },
];

// --- Insert spans ---
const insertSpan = db.prepare(`
  INSERT OR REPLACE INTO spans
  (id, parent_id, session_id, kind, status, source, name, started_at, ended_at, duration_ms, input, output, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, error, metadata)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertMany = db.transaction((spans, sessionId, source, baseTime) => {
  for (const s of spans) {
    const startedAt = baseTime + s.offset;
    const endedAt = s.dur ? startedAt + s.dur : null;
    insertSpan.run(
      s.id,
      null,
      sessionId,
      s.kind,
      s.status,
      source,
      s.name,
      startedAt,
      endedAt,
      s.dur || null,
      s.input || null,
      s.output || null,
      s.model || null,
      s.input_tokens || null,
      s.output_tokens || null,
      s.cache_read || 0,
      0,
      s.cost || null,
      s.error || null,
      null
    );
  }
});

insertMany(session1Spans, session1Id, 'claude_code_hook', now - 60000);
insertMany(session2Spans, session2Id, 'sdk_wrapper', now - 120000);

db.close();

console.log('Test data seeded successfully:');
console.log(`  Sessions: 2`);
console.log(`  Session 1: ${session1Id} (hook mode, 8 spans)`);
console.log(`  Session 2: ${session2Id} (SDK wrapper, 5 spans with tokens)`);
console.log(`  Database: ${dbPath}`);
