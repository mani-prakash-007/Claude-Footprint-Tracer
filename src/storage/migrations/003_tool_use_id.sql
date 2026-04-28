-- 003_tool_use_id.sql — propagate Anthropic tool_use_id onto every tool span
-- so token attribution (Phase 6) can match transcript blocks to spans.

ALTER TABLE spans ADD COLUMN tool_use_id TEXT;

CREATE INDEX IF NOT EXISTS idx_spans_tool_use_id ON spans(tool_use_id);
