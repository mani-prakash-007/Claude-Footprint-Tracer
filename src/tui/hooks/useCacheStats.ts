import { useMemo } from 'react';
import type { TranscriptTurn } from '../../collector/claude-code/transcript-parser.js';

export interface CacheStats {
  total_input: number;
  total_cache_read: number;
  total_cache_write: number;
  hit_rate: number;
  recent_hit_rate: number;
  breakage_alert: boolean;
}

const RECENT_WINDOW = 10;
const BREAKAGE_DROP = 0.5;

/**
 * Cache hit-rate analytics. breakage_alert fires when the recent window's
 * hit rate dropped >50% versus the running rate — pattern users hit when
 * --resume / cache-prefix bugs invalidate cache.
 */
export function computeCacheStats(turns: TranscriptTurn[]): CacheStats {
  const assistantTurns = turns.filter((t) => t.type === 'assistant');
  const totals = assistantTurns.reduce(
    (acc, t) => {
      acc.input += t.input_tokens;
      acc.read += t.cache_read_tokens;
      acc.write += t.cache_write_tokens;
      return acc;
    },
    { input: 0, read: 0, write: 0 }
  );

  const denom = totals.input + totals.read;
  const hit_rate = denom > 0 ? totals.read / denom : 0;

  const recent = assistantTurns.slice(-RECENT_WINDOW);
  const recentTotals = recent.reduce(
    (acc, t) => {
      acc.input += t.input_tokens;
      acc.read += t.cache_read_tokens;
      return acc;
    },
    { input: 0, read: 0 }
  );
  const recent_denom = recentTotals.input + recentTotals.read;
  const recent_hit_rate = recent_denom > 0 ? recentTotals.read / recent_denom : 0;

  const breakage_alert =
    assistantTurns.length >= RECENT_WINDOW &&
    hit_rate > 0.2 &&
    recent_hit_rate < hit_rate * (1 - BREAKAGE_DROP);

  return {
    total_input: totals.input,
    total_cache_read: totals.read,
    total_cache_write: totals.write,
    hit_rate,
    recent_hit_rate,
    breakage_alert,
  };
}

export function useCacheStats(turns: TranscriptTurn[]): CacheStats {
  return useMemo(() => computeCacheStats(turns), [turns]);
}
