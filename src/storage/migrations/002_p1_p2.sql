-- 002_p1_p2.sql — schema for P1 + remaining P2 features.
-- Adds: thinking-depth tracking, context window timeline, compaction events,
-- and an aggregated file-access table for the Files heatmap view.

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
