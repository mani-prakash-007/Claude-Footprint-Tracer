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
