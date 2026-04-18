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
  rowid?: number;
}

export interface SessionRow {
  session_id: string;
  source: string;
  started_at: number;
  ended_at: number | null;
  cwd: string | null;
  metadata: string | null;
}
