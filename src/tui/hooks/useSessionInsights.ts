import { useMemo } from 'react';
import type { SpanEvent } from '../../types/events.js';
import type {
  TranscriptTurn,
  TranscriptSummary,
} from '../../collector/claude-code/transcript-parser.js';

export interface SessionInsights {
  // Cost
  total_cost_usd: number;
  burn_rate_per_min: number;
  projected_60min_cost: number;
  duration_ms: number;
  cost_per_turn_avg: number;
  most_expensive_turn?: { index: number; cost_usd: number; model: string | null };

  // Cache
  cache_hit_rate: number;
  recent_cache_hit_rate: number;
  cache_savings_usd: number;
  cache_breakage_alert: boolean;

  // Context
  context_current: number;
  context_peak: number;
  context_pct: number;
  context_limit: number;
  compaction_count: number;
  turns_since_compaction: number;

  // Tools
  total_tool_calls: number;
  error_tool_calls: number;
  error_rate: number;
  most_called_tool: string | null;
  most_expensive_tool: { name: string; tokens: number } | null;

  // Files / efficiency
  read_edit_ratio: number;
  redundant_files: number;
  wasted_read_tokens: number;
  wasted_read_usd: number;

  // Sub-agents
  agent_count: number;
  delegated_share: number;
  delegated_cost_usd: number;

  // Quality
  thinking_redaction_rate: number;
  pending_count: number;
}

// Standard Claude window is 200K. Some plans get 1M (extended-context tier).
// If we observe per-turn tokens above 200K we infer the user is on the
// extended-context plan and adopt the next tier ceiling so the % display
// stays sensible.
const STANDARD_CONTEXT_LIMIT = 200_000;
const EXTENDED_CONTEXT_LIMIT = 1_000_000;
function effectiveContextLimit(observedPeak: number): number {
  if (observedPeak > STANDARD_CONTEXT_LIMIT) return EXTENDED_CONTEXT_LIMIT;
  return STANDARD_CONTEXT_LIMIT;
}
// Rough avg cost per input token across major models for "wasted-on-reads"
// approximation. Heuristic; over/under by family but order-of-magnitude OK.
const AVG_INPUT_USD_PER_TOKEN = 5 / 1_000_000;
const AVG_CACHE_READ_USD_PER_TOKEN = 0.5 / 1_000_000;

interface UseSessionInsightsArgs {
  events: SpanEvent[];
  turns: TranscriptTurn[];
  summary: TranscriptSummary | null;
}

export function computeSessionInsights({ events, turns, summary }: UseSessionInsightsArgs): SessionInsights {
    // ---- duration / cost ----
    const startedAt = events.length > 0 ? events[0].started_at : 0;
    const endedAt =
      events.length > 0
        ? Math.max(...events.map((e) => e.ended_at ?? e.started_at))
        : 0;
    const duration_ms = Math.max(1, endedAt - startedAt);
    const minutes = duration_ms / 60_000;

    const total_cost_usd = summary?.total_cost_usd ?? 0;
    const burn_rate_per_min = minutes > 0 ? total_cost_usd / minutes : 0;
    const projected_60min_cost = burn_rate_per_min * 60;

    const assistantTurns = turns.filter((t) => t.type === 'assistant');
    const cost_per_turn_avg =
      assistantTurns.length > 0 ? total_cost_usd / assistantTurns.length : 0;

    let mostExpensiveTurn: SessionInsights['most_expensive_turn'];
    let peakCost = 0;
    assistantTurns.forEach((turn, i) => {
      if (turn.cost_usd > peakCost) {
        peakCost = turn.cost_usd;
        mostExpensiveTurn = { index: i, cost_usd: turn.cost_usd, model: turn.model ?? null };
      }
    });

    // ---- cache ----
    const totalCacheRead = summary?.total_cache_read_tokens ?? 0;
    const totalInput = summary?.total_input_tokens ?? 0;
    const cacheDenom = totalCacheRead + totalInput;
    const cache_hit_rate = cacheDenom > 0 ? totalCacheRead / cacheDenom : 0;

    const recentTurns = assistantTurns.slice(-10);
    const recentRead = recentTurns.reduce((s, t) => s + t.cache_read_tokens, 0);
    const recentInput = recentTurns.reduce((s, t) => s + t.input_tokens, 0);
    const recentDenom = recentRead + recentInput;
    const recent_cache_hit_rate = recentDenom > 0 ? recentRead / recentDenom : 0;

    const cache_breakage_alert =
      assistantTurns.length >= 10 &&
      cache_hit_rate > 0.2 &&
      recent_cache_hit_rate < cache_hit_rate * 0.5;

    // Cache savings: would-have-paid - actually-paid. Cache reads cost ~10%
    // of full input price; so savings ≈ cache_read × (full - cached) rate.
    const cache_savings_usd =
      totalCacheRead * (AVG_INPUT_USD_PER_TOKEN - AVG_CACHE_READ_USD_PER_TOKEN);

    // ---- context ----
    const context_current =
      assistantTurns.length > 0
        ? assistantTurns[assistantTurns.length - 1].context_tokens
        : 0;
    const context_peak = assistantTurns.reduce(
      (max, t) => Math.max(max, t.context_tokens),
      0
    );
    const ctxLimit = effectiveContextLimit(context_peak);
    const context_pct = (context_current / ctxLimit) * 100;
    const compaction_count = summary?.compaction_count ?? 0;
    // crude: turns since last compaction = trailing run of non-compacted turns
    const turns_since_compaction = assistantTurns.length;

    // ---- tools / errors ----
    const toolSpans = events.filter(
      (e) => e.kind === 'tool_use' || e.kind === 'custom_step'
    );
    const total_tool_calls = toolSpans.length;
    const error_tool_calls = toolSpans.filter((s) => s.status === 'error').length;
    const error_rate = total_tool_calls > 0 ? error_tool_calls / total_tool_calls : 0;
    const pending_count = events.filter((e) => e.status === 'pending').length;

    const toolCounts = new Map<string, number>();
    const toolTokens = new Map<string, number>();
    for (const t of toolSpans) {
      toolCounts.set(t.name, (toolCounts.get(t.name) ?? 0) + 1);
      const tk = (t.input_token_attribution ?? 0) + (t.output_token_attribution ?? 0);
      toolTokens.set(t.name, (toolTokens.get(t.name) ?? 0) + tk);
    }
    const most_called_tool =
      [...toolCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    let most_expensive_tool: SessionInsights['most_expensive_tool'] = null;
    let topToolTokens = 0;
    for (const [name, tokens] of toolTokens) {
      if (tokens > topToolTokens) {
        topToolTokens = tokens;
        most_expensive_tool = { name, tokens };
      }
    }

    // ---- file efficiency ----
    const fileReads = new Map<string, number>();
    const fileEdits = new Map<string, number>();
    for (const ev of events) {
      if (ev.kind !== 'tool_use') continue;
      const input = ev.input as Record<string, unknown> | null;
      const fp = typeof input?.file_path === 'string' ? input.file_path : null;
      if (!fp) continue;
      if (ev.name === 'Read') fileReads.set(fp, (fileReads.get(fp) ?? 0) + 1);
      else if (ev.name === 'Edit' || ev.name === 'MultiEdit' || ev.name === 'Write') {
        fileEdits.set(fp, (fileEdits.get(fp) ?? 0) + 1);
      }
    }
    const totalReads = [...fileReads.values()].reduce((a, b) => a + b, 0);
    const totalEdits = [...fileEdits.values()].reduce((a, b) => a + b, 0);
    const read_edit_ratio = totalEdits > 0 ? totalReads / totalEdits : totalReads;
    let redundant_files = 0;
    let wasted_read_tokens = 0;
    for (const [fp, reads] of fileReads) {
      const edits = fileEdits.get(fp) ?? 0;
      if (reads >= 3 && edits === 0) {
        redundant_files += 1;
        // Sum input attribution across reads of this file
        const wastedSpans = events.filter(
          (e) =>
            e.kind === 'tool_use' &&
            e.name === 'Read' &&
            (e.input as Record<string, unknown> | null)?.file_path === fp
        );
        wasted_read_tokens += wastedSpans.reduce(
          (s, e) =>
            s + (e.input_token_attribution ?? 0) + (e.output_token_attribution ?? 0),
          0
        );
      }
    }
    const wasted_read_usd = wasted_read_tokens * AVG_INPUT_USD_PER_TOKEN;

    // ---- sub-agents ----
    const agentSpans = events.filter(
      (e) => e.name === 'Agent' || e.name === 'Task'
    );
    const agent_count = agentSpans.length;
    const delegatedSpanIds = new Set<string>();
    for (const a of agentSpans) {
      // any span with parent_id chain leading to an agent
      delegatedSpanIds.add(a.id);
    }
    for (const e of events) {
      if (e.parent_id && delegatedSpanIds.has(e.parent_id)) delegatedSpanIds.add(e.id);
    }
    const delegated_cost_usd = events
      .filter((e) => delegatedSpanIds.has(e.id))
      .reduce((s, e) => s + (e.cost_usd ?? 0), 0);
    const delegated_share = total_cost_usd > 0 ? delegated_cost_usd / total_cost_usd : 0;

    // ---- quality ----
    const thinking_redaction_rate =
      assistantTurns.length > 0
        ? assistantTurns.filter((t) => t.thinking_redacted).length / assistantTurns.length
        : 0;

    return {
      total_cost_usd,
      burn_rate_per_min,
      projected_60min_cost,
      duration_ms,
      cost_per_turn_avg,
      most_expensive_turn: mostExpensiveTurn,

      cache_hit_rate,
      recent_cache_hit_rate,
      cache_savings_usd,
      cache_breakage_alert,

      context_current,
      context_peak,
      context_pct,
      context_limit: ctxLimit,
      compaction_count,
      turns_since_compaction,

      total_tool_calls,
      error_tool_calls,
      error_rate,
      most_called_tool,
      most_expensive_tool,

      read_edit_ratio,
      redundant_files,
      wasted_read_tokens,
      wasted_read_usd,

      agent_count,
      delegated_share,
      delegated_cost_usd,

      thinking_redaction_rate,
      pending_count,
    };
}

export function useSessionInsights(args: UseSessionInsightsArgs): SessionInsights {
  return useMemo(() => computeSessionInsights(args), [args.events, args.turns, args.summary]);
}
