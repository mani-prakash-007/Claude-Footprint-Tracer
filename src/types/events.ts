export type SpanKind =
  | 'session'
  | 'user_message'
  | 'llm_call'
  | 'tool_use'
  | 'custom_step';

export type SpanStatus = 'pending' | 'ok' | 'error';

export type CollectorSource = 'claude_code_hook' | 'sdk_wrapper';

export interface SpanEvent {
  id: string;
  parent_id: string | null;
  session_id: string;
  kind: SpanKind;
  status: SpanStatus;
  source: CollectorSource;
  name: string;
  started_at: number;
  ended_at: number | null;
  duration_ms: number | null;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  cost_usd: number | null;
  error: string | null;
  metadata: Record<string, unknown> | null;
}

export interface SessionSummary {
  session_id: string;
  source: CollectorSource;
  started_at: number;
  ended_at: number | null;
  span_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  tool_names: string[];
}

export interface TokenBreakdown {
  span_id: string;
  name: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
}
