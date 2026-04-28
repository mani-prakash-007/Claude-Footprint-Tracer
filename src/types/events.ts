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
  /** Heuristic estimate from chars/4 — NOT billed tokens. */
  thinking_tokens?: number | null;
  thinking_redacted?: number | null;
  context_tokens?: number | null;
  /** Anthropic content-block id (e.g. "toolu_01abc..."). Set on tool_use spans. */
  tool_use_id?: string | null;
  /** Estimated tokens contributed by this tool span's input block. */
  input_token_attribution?: number | null;
  /** Estimated tokens contributed by this tool span's output block. */
  output_token_attribution?: number | null;
  attribution_method?: 'heuristic' | 'count_tokens' | null;
}

export interface CompactionEvent {
  id: string;
  session_id: string;
  occurred_at: number;
  before_tokens: number | null;
  after_tokens: number | null;
  trigger: 'auto' | 'manual' | 'unknown' | null;
  metadata: Record<string, unknown> | null;
}

export interface FileAccessRow {
  file_path: string;
  tool_name: string;
  access_count: number;
  last_seen_at: number;
}

export interface AgentNode {
  span: SpanEvent;
  depth: number;
  children: AgentNode[];
  rolled_up: {
    cost_usd: number;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
    duration_ms: number;
    span_count: number;
    error_count: number;
  };
}

export interface SessionMetrics {
  session_id: string;
  started_at: number;
  ended_at: number | null;
  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_read_tokens: number;
  total_cache_write_tokens: number;
  span_count: number;
  llm_call_count: number;
  thinking_tokens: number;
  redaction_rate: number;
  cache_hit_rate: number;
  loop_warning_count: number;
  compaction_count: number;
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
