import type Database from 'better-sqlite3';

// Migrations are inlined as TS string constants so they bundle cleanly into
// dist/ via tsup — no .sql file-copy step needed at build time.

const M001 = `
CREATE TABLE IF NOT EXISTS sessions (
  session_id    TEXT PRIMARY KEY,
  source        TEXT NOT NULL,
  started_at    INTEGER NOT NULL,
  ended_at      INTEGER,
  cwd           TEXT,
  metadata      TEXT
);

CREATE TABLE IF NOT EXISTS spans (
  id            TEXT PRIMARY KEY,
  parent_id     TEXT,
  session_id    TEXT NOT NULL,
  kind          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  source        TEXT NOT NULL,
  name          TEXT NOT NULL,
  started_at    INTEGER NOT NULL,
  ended_at      INTEGER,
  duration_ms   INTEGER,
  input         TEXT,
  output        TEXT,
  model         TEXT,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  cache_read_tokens  INTEGER DEFAULT 0,
  cache_write_tokens INTEGER DEFAULT 0,
  cost_usd      REAL,
  error         TEXT,
  metadata      TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);

CREATE INDEX IF NOT EXISTS idx_spans_session_ts ON spans(session_id, started_at);
CREATE INDEX IF NOT EXISTS idx_spans_parent ON spans(parent_id);
CREATE INDEX IF NOT EXISTS idx_spans_status ON spans(session_id, name, status);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at DESC);

CREATE TABLE IF NOT EXISTS schema_version (
  version       INTEGER PRIMARY KEY,
  applied_at    INTEGER NOT NULL
);
`;

const M002 = `
ALTER TABLE spans ADD COLUMN thinking_tokens INTEGER DEFAULT 0;
ALTER TABLE spans ADD COLUMN thinking_redacted INTEGER DEFAULT 0;
ALTER TABLE spans ADD COLUMN context_tokens INTEGER;

CREATE TABLE IF NOT EXISTS compaction_events (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL,
  occurred_at   INTEGER NOT NULL,
  before_tokens INTEGER,
  after_tokens  INTEGER,
  trigger       TEXT,
  metadata      TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);

CREATE INDEX IF NOT EXISTS idx_compaction_session ON compaction_events(session_id, occurred_at);

CREATE TABLE IF NOT EXISTS file_access_counts (
  session_id   TEXT NOT NULL,
  file_path    TEXT NOT NULL,
  tool_name    TEXT NOT NULL,
  access_count INTEGER NOT NULL DEFAULT 0,
  last_seen_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, file_path, tool_name)
);

CREATE INDEX IF NOT EXISTS idx_file_access_session ON file_access_counts(session_id, access_count DESC);
`;

const M003 = `
ALTER TABLE spans ADD COLUMN tool_use_id TEXT;
CREATE INDEX IF NOT EXISTS idx_spans_tool_use_id ON spans(tool_use_id);
`;

const M004 = `
ALTER TABLE spans ADD COLUMN input_token_attribution INTEGER;
ALTER TABLE spans ADD COLUMN output_token_attribution INTEGER;
ALTER TABLE spans ADD COLUMN attribution_method TEXT;
`;

const MIGRATIONS: { version: number; sql: string }[] = [
  { version: 1, sql: M001 },
  { version: 2, sql: M002 },
  { version: 3, sql: M003 },
  { version: 4, sql: M004 },
];

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  for (const migration of MIGRATIONS) {
    const apply = db.transaction(() => {
      // Re-check inside transaction so concurrent processes (TUI + hook subprocess)
      // can't both apply the same migration.
      const already = db
        .prepare('SELECT 1 FROM schema_version WHERE version = ?')
        .get(migration.version);
      if (already) return;

      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(
        migration.version,
        Date.now()
      );
    });
    apply.immediate();
  }
}
