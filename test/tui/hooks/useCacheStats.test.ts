import { describe, it, expect } from 'vitest';
import { computeCacheStats } from '../../../src/tui/hooks/useCacheStats.js';
import type { TranscriptTurn } from '../../../src/collector/claude-code/transcript-parser.js';

function turn(input_tokens: number, cache_read_tokens: number, cache_write_tokens = 0): TranscriptTurn {
  return {
    type: 'assistant',
    input_tokens,
    output_tokens: 0,
    cache_read_tokens,
    cache_write_tokens,
    thinking_tokens: 0,
    thinking_redacted: false,
    cost_usd: 0,
    timestamp: 0,
    content_types: ['text'],
    stop_reason: 'end_turn',
    uuid: '',
    context_tokens: input_tokens + cache_read_tokens,
  };
}

describe('computeCacheStats', () => {
  it('computes overall hit rate', () => {
    const turns = [turn(100, 900), turn(100, 900), turn(100, 900)];
    const stats = computeCacheStats(turns);
    expect(stats.hit_rate).toBeCloseTo(0.9, 2);
    expect(stats.breakage_alert).toBe(false);
  });

  it('detects cache breakage when recent rate collapses', () => {
    const healthy = Array.from({ length: 20 }, () => turn(100, 900));
    const broken = Array.from({ length: 12 }, () => turn(900, 100));
    const stats = computeCacheStats([...healthy, ...broken]);
    expect(stats.hit_rate).toBeGreaterThan(0.5);
    expect(stats.recent_hit_rate).toBeLessThan(0.5);
    expect(stats.breakage_alert).toBe(true);
  });

  it('returns zero hit rate with no turns', () => {
    expect(computeCacheStats([]).hit_rate).toBe(0);
  });
});
