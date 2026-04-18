import { useMemo } from 'react';
import type { SpanEvent, TokenBreakdown } from '../../types/events.js';

export interface TokenStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  breakdown: TokenBreakdown[];
}

export function useTokenStats(events: SpanEvent[]): TokenStats {
  return useMemo(() => {
    const llmCalls = events.filter((e) => e.kind === 'llm_call');

    const breakdown: TokenBreakdown[] = llmCalls.map((e) => ({
      span_id: e.id,
      name: e.name,
      model: e.model ?? 'unknown',
      input_tokens: e.input_tokens ?? 0,
      output_tokens: e.output_tokens ?? 0,
      cache_read_tokens: e.cache_read_tokens ?? 0,
      cache_write_tokens: e.cache_write_tokens ?? 0,
      cost_usd: e.cost_usd ?? 0,
    }));

    return {
      totalInputTokens: breakdown.reduce((sum, b) => sum + b.input_tokens, 0),
      totalOutputTokens: breakdown.reduce((sum, b) => sum + b.output_tokens, 0),
      totalCost: breakdown.reduce((sum, b) => sum + b.cost_usd, 0),
      breakdown,
    };
  }, [events]);
}
