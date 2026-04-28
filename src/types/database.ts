export interface SpanRow {
  id: string;
  parent_id: string | null;
  session_id: string;
  kind: string;
  status: string;
  source: string;
  name: string;
  started_at: number;
  ended_at: number | null;
  duration_ms: number | null;
  input: string | null;
  output: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  cost_usd: number | null;
  error: string | null;
  metadata: string | null;
  thinking_tokens: number | null;
  thinking_redacted: number | null;
  context_tokens: number | null;
  tool_use_id: string | null;
  input_token_attribution: number | null;
  output_token_attribution: number | null;
  attribution_method: string | null;
  rowid?: number;
}

export interface CompactionRow {
  id: string;
  session_id: string;
  occurred_at: number;
  before_tokens: number | null;
  after_tokens: number | null;
  trigger: string | null;
  metadata: string | null;
}

export interface FileAccessCountRow {
  session_id: string;
  file_path: string;
  tool_name: string;
  access_count: number;
  last_seen_at: number;
}

export interface SessionRow {
  session_id: string;
  source: string;
  started_at: number;
  ended_at: number | null;
  cwd: string | null;
  metadata: string | null;
}
